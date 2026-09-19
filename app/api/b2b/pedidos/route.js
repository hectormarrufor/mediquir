import { NextResponse } from 'next/server';
import { Cliente, Correlativo, CuentaPorCobrar, Producto, SalidaInventario, Venta, VentaDetalle, sequelize } from '@/models';
import { notificarCabezas, notificarTodos, notificarUsuario } from '@/app/handlers/notificar';
import { calcularFactura, precioMayor } from '@/app/constants/facturacion';
import { presentacionDe } from '@/app/constants/presentaciones';
import { requerirCliente } from '../../_lib/acceso';
import { crearRetencionPendiente } from '../../_lib/retencionesVenta';
import { tasaVigente } from '../../_lib/tasaBcv';
import { ESTADOS_ACTIVOS, Op, creditoDeCliente, hoyCaracas, resumenPedido, ventasDelCliente } from '../_lib';

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

        // Unifica renglones repetidos (mismo producto y misma presentación) y valida cantidades enteras (no se vende a granel).
        // `presentacion`: UNIDAD (o par/paquete, según el producto), CAJA o BULTO; `cantidad`: cuántas de ESA presentación.
        const solicitudes = new Map();
        for (const item of items) {
            const productoId = Number(item.productoId);
            const cantidad = Number(item.cantidad);
            const presentacion = ['UNIDAD', 'CAJA', 'BULTO'].includes(item.presentacion) ? item.presentacion : 'UNIDAD';
            if (!Number.isInteger(productoId) || productoId <= 0) throw new ErrorNegocio('Producto inválido en el pedido');
            if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > MAX_CANTIDAD) throw new ErrorNegocio('Las cantidades deben ser números enteros mayores a 0');
            const clave = `${productoId}:${presentacion}`;
            solicitudes.set(clave, { productoId, presentacion, cantidad: (solicitudes.get(clave)?.cantidad || 0) + cantidad });
        }
        const idsProductos = [...new Set([...solicitudes.values()].map((s) => s.productoId))];

        // Pedido a crédito: se comprueba el cupo con la fila del cliente bloqueada, para que dos pedidos simultáneos no superen el máximo
        const aCredito = body.condicionPago === 'Credito';
        let credito = null;
        if (aCredito) {
            const clienteCredito = await Cliente.findByPk(clienteId, { transaction: t, lock: t.LOCK.UPDATE });
            credito = await creditoDeCliente(clienteCredito, { transaction: t });
            if (credito.maxPedidos <= 0 || credito.diasCredito <= 0) throw new ErrorNegocio('Tu cuenta no tiene crédito habilitado. Puedes pagar de contado o hablar con administración.', 403);
            if (credito.disponibles <= 0) {
                throw new ErrorNegocio(`Ya tienes ${credito.activos} pedido(s) a crédito activos y el máximo aprobado para ti es ${credito.maxPedidos}. Cuando pagues alguno podrás pedir otro a crédito.`, 409);
            }
        }
        // El cliente elige el documento, sea de contado o a crédito: factura (con IVA) o nota de entrega (sin IVA)
        const tipoDocumento = body.tipoDocumento === 'FACTURA' ? 'FACTURA' : 'NOTA_ENTREGA';
        const prefijo = tipoDocumento === 'FACTURA' ? 'F' : 'NE';

        const productos = await Producto.findAll({ where: { id: { [Op.in]: idsProductos } }, transaction: t, lock: t.LOCK.UPDATE });
        if (productos.length !== idsProductos.length) throw new ErrorNegocio('Alguno de los productos ya no está disponible');
        const porId = new Map(productos.map((p) => [p.id, p]));

        // Cada renglón: la presentación pedida se traduce a UNIDADES con lo que dice la ficha del producto (el servidor manda, no el navegador).
        // `cantidad` queda en unidades (stock, precio e inventario no cambian); la presentación pedida se guarda aparte para el empaque.
        const lineas = [...solicitudes.values()].map((s) => {
            const producto = porId.get(s.productoId);
            const presentacion = presentacionDe(producto, s.presentacion);
            if (!presentacion) throw new ErrorNegocio(`"${producto.nombre}" ya no se ofrece en esa presentación. Actualiza tu carrito.`, 409);
            const unidades = s.cantidad * presentacion.unidades;
            if (unidades > MAX_CANTIDAD * 100) throw new ErrorNegocio(`La cantidad de "${producto.nombre}" es demasiado grande`);
            return { producto, presentacion, cantidadPresentacion: s.cantidad, cantidad: unidades };
        });

        // La existencia se comprueba por producto, sumando todas sus presentaciones (stock en unidades)
        const pedidoPorProducto = new Map();
        lineas.forEach((l) => pedidoPorProducto.set(l.producto.id, (pedidoPorProducto.get(l.producto.id) || 0) + l.cantidad));
        // NO se rechaza el pedido por falta de existencias: queda "en revisión" y administración confirma si consigue las cantidades
        // en 1 o pocos días, o ajusta los renglones. Hasta entonces no hay cuenta por cobrar ni retención (el cliente no paga nada aún).
        const faltantes = [...pedidoPorProducto].filter(([id, unidades]) => (Number(porId.get(id).stockAlmacen) || 0) < unidades).map(([id]) => porId.get(id));
        const enRevision = faltantes.length > 0;

        const sinPrecio = lineas.filter(({ producto }) => !(precioMayor(producto) > 0));
        if (sinPrecio.length) throw new ErrorNegocio(`Sin precio asignado: ${sinPrecio.map(({ producto }) => producto.nombre).join(', ')}`, 409);

        const factura = calcularFactura({
            renglones: lineas.map(({ producto, cantidad }) => {
                const porcentajeIva = Number(producto.porcentajeIva) || 0;
                return { precioUnitario: precioMayor(producto), cantidad, aplicaIva: tipoDocumento === 'FACTURA' && porcentajeIva > 0, porcentajeIva };
            }),
        });
        const tasaCambio = await tasaVigente({ transaction: t });

        // Correlativo del documento (F: factura · NE: nota de entrega)
        let corr = await Correlativo.findOne({ where: { prefijo }, transaction: t, lock: t.LOCK.UPDATE });
        if (!corr) corr = await Correlativo.create({ prefijo, siguienteNumero: 1, cerosRelleno: 5 }, { transaction: t });
        // Nunca por debajo del mayor número ya emitido (el POS también emite notas de entrega, a veces con número manual)
        const [{ maximo }] = await sequelize.query(
            `SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace("numeroDocumento", '\\D', '', 'g'), '') AS bigint)), 0) AS maximo
             FROM "Ventas" WHERE "numeroDocumento" LIKE :patron`,
            { replacements: { patron: `${prefijo}-%` }, type: sequelize.QueryTypes.SELECT, transaction: t }
        );
        const numeroSiguiente = Math.max(corr.siguienteNumero, Number(maximo) + 1);
        const numeroDocumento = `${prefijo}-${String(numeroSiguiente).padStart(corr.cerosRelleno || 5, '0')}`;
        corr.siguienteNumero = numeroSiguiente + 1;
        await corr.save({ transaction: t });

        const venta = await Venta.create({
            clienteId,
            tipoVenta: 'MAYOR',
            tipoDocumento,
            numeroDocumento,
            tipoEntrega,
            // Con envío, el cliente dice qué empresa de transporte pasa a buscar el pedido (administración lo puede corregir)
            quienRetira: tipoEntrega === 'flete' ? (String(body.transporte ?? '').trim().slice(0, 120) || null) : null,
            statusDespacho: 'Pendiente',
            condicionPago: aCredito ? 'Credito' : 'Contado',
            fechaVencimiento: aCredito ? new Date(Date.now() + credito.diasCredito * 86400000) : null,
            statusPago: 'Pendiente',
            revisionStock: enRevision ? 'PENDIENTE' : null,
            moneda: 'USD',
            tasaCambio,
            costoFlete: 0,
            subtotal: factura.subtotal,
            montoIva: factura.montoIva,
            totalDescuento: 0,
            totalFinal: factura.totalFinal,
        }, { transaction: t });

        // A crédito nace la cuenta por cobrar: cada Pago Móvil del cliente o abono de administración la va bajando
        if (aCredito && !enRevision) {
            await CuentaPorCobrar.create({
                clienteId, ventaId: venta.id, montoTotal: factura.totalFinal, saldoPendiente: factura.totalFinal,
                moneda: 'USD', tasaCambio, fechaVencimiento: venta.fechaVencimiento, estado: 'Pendiente',
            }, { transaction: t });
        }

        for (let i = 0; i < lineas.length; i++) {
            const { producto, presentacion, cantidadPresentacion } = lineas[i];
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
                // Lo que pidió el cliente (p. ej. 2 cajas de 100); `cantidad` ya está en unidades
                presentacionPedida: presentacion.clave,
                cantidadPresentacion,
                unidadesPorPresentacion: presentacion.unidades,
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

        // Factura a un contribuyente especial: la retención de IVA queda calculada (falta el comprobante del cliente) y se descuenta del saldo
        // (en revisión de existencias se calcula al confirmar el pedido, con los renglones ya ajustados)
        if (!enRevision) await crearRetencionPendiente({ venta, transaction: t });

        await t.commit();

        if (enRevision) {
            try {
                const cliente = await Cliente.findByPk(clienteId, { attributes: ['nombre'] });
                await notificarCabezas({
                    title: 'Pedido B2B por revisar: faltan existencias ⚠️',
                    body: `${cliente?.nombre || 'Un cliente'} pidió ${numeroDocumento} y no alcanza: ${faltantes.map((p) => p.nombre).slice(0, 3).join(', ')}${faltantes.length > 3 ? ` y ${faltantes.length - 3} más` : ''}. Confirma si se consigue en 1 o pocos días, o ajusta los renglones.`,
                    url: `/superuser/ventas/${venta.id}`, tipo: 'Alerta',
                });
                await notificarUsuario(sesion.id, {
                    title: '¡Felicidades! Tu pedido está en revisión 🎉',
                    body: `Recibimos tu pedido ${numeroDocumento}. Estamos confirmando las existencias de algunos productos y te avisaremos en breve.`,
                    url: `/b2b/pedidos/${venta.id}`, tipo: 'Info',
                });
            } catch (e) {
                console.error('B2B: no se pudo avisar la revisión de existencias:', e.message);
            }
            return NextResponse.json({ success: true, id: venta.id, numero: numeroDocumento, total: factura.totalFinal, aCredito, enRevision: true, vence: null }, { status: 201 });
        }

        try {
            const cliente = await Cliente.findByPk(clienteId, { attributes: ['nombre'] });
            await notificarTodos({
                title: aCredito ? 'Nuevo pedido B2B a crédito 📦' : 'Nuevo pedido B2B 📦',
                body: aCredito
                    ? `${cliente?.nombre || 'Un cliente'} hizo ${tipoDocumento === 'FACTURA' ? 'la factura' : 'la nota de entrega'} ${numeroDocumento} a crédito por $${factura.totalFinal.toFixed(2)} (${credito.diasCredito} días; crédito activo ${credito.activos + 1} de ${credito.maxPedidos}).${tipoDocumento === 'FACTURA' ? ' Su número de control se asigna al imprimirla.' : ''}`
                    : `${cliente?.nombre || 'Un cliente'} hizo ${tipoDocumento === 'FACTURA' ? 'la factura' : 'el pedido'} ${numeroDocumento} por $${factura.totalFinal.toFixed(2)}.${tipoDocumento === 'FACTURA' ? ' Su número de control se asigna al imprimirla.' : ''}`,
                url: `/superuser/ventas/${venta.id}`,
                tipo: 'Info',
            });
        } catch (e) {
            console.error('B2B: no se pudo notificar al personal:', e.message);
        }

        return NextResponse.json({ success: true, id: venta.id, numero: numeroDocumento, total: factura.totalFinal, aCredito, vence: aCredito ? venta.fechaVencimiento : null }, { status: 201 });
    } catch (error) {
        if (!t.finished) await t.rollback();
        if (error instanceof ErrorNegocio) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('B2B pedidos POST:', error);
        return NextResponse.json({ error: 'No se pudo crear el pedido' }, { status: 500 });
    }
}
