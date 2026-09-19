import { NextResponse } from 'next/server';
import { Cliente, Correlativo, Producto, SalidaInventario, Venta, VentaDetalle, sequelize } from '@/models';
import { notificarTodos } from '@/app/handlers/notificar';
import { calcularFactura, precioMayor } from '@/app/constants/facturacion';
import { requerirCliente } from '../../_lib/acceso';
import { tasaVigente } from '../../_lib/tasaBcv';
import { ESTADOS_ACTIVOS, Op, hoyCaracas, resumenPedido, ventasDelCliente } from '../_lib';

export const dynamic = 'force-dynamic';

const MAX_RENGLONES = 150;
const MAX_CANTIDAD = 100000;
const TAMANO_PAGINA = 15;

class ErrorNegocio extends Error {
    constructor(mensaje, status = 400) { super(mensaje); this.status = status; }
}

// ---------------------------------------------------------------------------
// GET: pedidos del cliente (filtro por estado, paginado)
// ---------------------------------------------------------------------------
export async function GET(request) {
    const acceso = await requerirCliente();
    if (acceso.error) return acceso.error;

    try {
        const { searchParams } = new URL(request.url);
        const estado = searchParams.get('estado'); // activos | entregados | cancelados | por-pagar | (vacío = todos)
        const pagina = Number.isInteger(Number(searchParams.get('page'))) && Number(searchParams.get('page')) > 0 ? Number(searchParams.get('page')) : 1;

        const where = {};
        if (estado === 'activos') where.statusDespacho = { [Op.in]: ESTADOS_ACTIVOS };
        if (estado === 'entregados') where.statusDespacho = 'Completado';
        if (estado === 'cancelados') where.statusDespacho = 'Cancelado';

        const hoy = hoyCaracas();
        // "por-pagar" depende del saldo calculado, así que se filtra tras calcularlo (el cliente tiene pocos pedidos)
        const ventas = await ventasDelCliente(acceso.clienteId, { where });
        let pedidos = ventas.map((v) => resumenPedido(v, hoy));
        if (estado === 'por-pagar') pedidos = pedidos.filter((p) => p.cobro.saldo > 0);

        const total = pedidos.length;
        const pagina_ = pedidos.slice((pagina - 1) * TAMANO_PAGINA, pagina * TAMANO_PAGINA);
        return NextResponse.json({ pedidos: pagina_, total, pagina, paginas: Math.max(1, Math.ceil(total / TAMANO_PAGINA)) });
    } catch (error) {
        console.error('B2B pedidos GET:', error);
        return NextResponse.json({ error: 'No se pudieron cargar tus pedidos' }, { status: 500 });
    }
}

// ---------------------------------------------------------------------------
// POST: crear un pedido. El navegador solo dice QUÉ y CUÁNTOS; precios, IVA, total y tasa los calcula el servidor.
// ---------------------------------------------------------------------------
export async function POST(request) {
    const acceso = await requerirCliente();
    if (acceso.error) return acceso.error;
    const { clienteId, sesion } = acceso;

    const t = await sequelize.transaction();
    try {
        const body = await request.json();
        const items = Array.isArray(body.items) ? body.items : [];
        const tipoEntrega = body.tipoEntrega === 'flete' ? 'flete' : 'pickup';

        if (items.length === 0) throw new ErrorNegocio('Tu pedido está vacío');
        if (items.length > MAX_RENGLONES) throw new ErrorNegocio(`Un pedido admite hasta ${MAX_RENGLONES} productos distintos`);

        // Unifica productos repetidos y valida cantidades enteras (no se vende a granel)
        const cantidades = new Map();
        for (const item of items) {
            const productoId = Number(item.productoId);
            const cantidad = Number(item.cantidad);
            if (!Number.isInteger(productoId) || productoId <= 0) throw new ErrorNegocio('Producto inválido en el pedido');
            if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > MAX_CANTIDAD) throw new ErrorNegocio('Las cantidades deben ser números enteros mayores a 0');
            cantidades.set(productoId, (cantidades.get(productoId) || 0) + cantidad);
        }

        const productos = await Producto.findAll({ where: { id: { [Op.in]: [...cantidades.keys()] } }, transaction: t, lock: t.LOCK.UPDATE });
        if (productos.length !== cantidades.size) throw new ErrorNegocio('Alguno de los productos ya no está disponible');

        const lineas = productos.map((p) => ({ producto: p, cantidad: cantidades.get(p.id) }));
        const faltantes = lineas.filter(({ producto, cantidad }) => (Number(producto.stockAlmacen) || 0) < cantidad);
        if (faltantes.length) {
            throw new ErrorNegocio(`Sin existencia suficiente: ${faltantes.map(({ producto }) => `${producto.nombre} (disponible ${Math.max(0, Math.floor(Number(producto.stockAlmacen) || 0))})`).join(', ')}`, 409);
        }

        const sinPrecio = lineas.filter(({ producto }) => !(precioMayor(producto) > 0));
        if (sinPrecio.length) throw new ErrorNegocio(`Sin precio asignado: ${sinPrecio.map(({ producto }) => producto.nombre).join(', ')}`, 409);

        const factura = calcularFactura({
            renglones: lineas.map(({ producto, cantidad }) => {
                const porcentajeIva = Number(producto.porcentajeIva) || 0;
                return { precioUnitario: precioMayor(producto), cantidad, aplicaIva: porcentajeIva > 0, porcentajeIva };
            }),
        });
        const tasaCambio = await tasaVigente({ transaction: t });

        // Correlativo de nota de entrega
        let corr = await Correlativo.findOne({ where: { prefijo: 'NE' }, transaction: t, lock: t.LOCK.UPDATE });
        if (!corr) corr = await Correlativo.create({ prefijo: 'NE', siguienteNumero: 1, cerosRelleno: 5 }, { transaction: t });
        // Nunca por debajo del mayor número ya emitido (el POS también emite notas de entrega, a veces con número manual)
        const [{ maximo }] = await sequelize.query(
            `SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace("numeroDocumento", '\\D', '', 'g'), '') AS bigint)), 0) AS maximo
             FROM "Ventas" WHERE "numeroDocumento" LIKE 'NE-%'`,
            { type: sequelize.QueryTypes.SELECT, transaction: t }
        );
        const numeroSiguiente = Math.max(corr.siguienteNumero, Number(maximo) + 1);
        const numeroDocumento = `NE-${String(numeroSiguiente).padStart(corr.cerosRelleno || 5, '0')}`;
        corr.siguienteNumero = numeroSiguiente + 1;
        await corr.save({ transaction: t });

        const venta = await Venta.create({
            clienteId,
            tipoVenta: 'MAYOR',
            tipoDocumento: 'NOTA_ENTREGA',
            numeroDocumento,
            tipoEntrega,
            statusDespacho: 'Pendiente',
            condicionPago: 'Contado',
            statusPago: 'Pendiente',
            moneda: 'USD',
            tasaCambio,
            costoFlete: 0,
            subtotal: factura.subtotal,
            montoIva: factura.montoIva,
            totalDescuento: 0,
            totalFinal: factura.totalFinal,
        }, { transaction: t });

        for (let i = 0; i < lineas.length; i++) {
            const { producto } = lineas[i];
            const renglon = factura.renglones[i];
            await VentaDetalle.create({
                ventaId: venta.id,
                productoId: producto.id,
                isFicticio: false,
                aplicaIva: renglon.aplicaIva,
                afectaInventario: true,
                cantidad: renglon.cantidad,
                precioUnitario: renglon.precioUnitario,
                subtotal: renglon.monto,
            }, { transaction: t });

            // El personal empaca desde estas salidas pendientes; el stock se descuenta al empacar (igual que el resto de pedidos al mayor)
            await SalidaInventario.create({
                ventaId: venta.id,
                productoId: producto.id,
                cantidad: renglon.cantidad,
                costoAlMomento: Number(producto.costoUsd) || 0,
                justificacion: `Pedido B2B ${numeroDocumento}`,
                estado: 'Pendiente',
                solicitadoPorId: sesion.id || null,
            }, { transaction: t });
        }

        await t.commit();

        try {
            const cliente = await Cliente.findByPk(clienteId, { attributes: ['nombre'] });
            await notificarTodos({
                title: 'Nuevo pedido B2B 📦',
                body: `${cliente?.nombre || 'Un cliente'} hizo el pedido ${numeroDocumento} por $${factura.totalFinal.toFixed(2)}.`,
                url: `/superuser/ventas/${venta.id}`,
                tipo: 'Info',
            });
        } catch (e) {
            console.error('B2B: no se pudo notificar al personal:', e.message);
        }

        return NextResponse.json({ success: true, id: venta.id, numero: numeroDocumento, total: factura.totalFinal }, { status: 201 });
    } catch (error) {
        if (!t.finished) await t.rollback();
        if (error instanceof ErrorNegocio) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('B2B pedidos POST:', error);
        return NextResponse.json({ error: 'No se pudo crear el pedido' }, { status: 500 });
    }
}
