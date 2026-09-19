import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import sequelize from '@/sequelize'; // 🔥 IMPORTACIÓN CORRECTA DE LA INSTANCIA DE DB
import db from '@/models';
const { Venta, VentaDetalle, Producto, Marca, Correlativo, CategoriaFinanciera, MovimientoFinanciero, Cliente, User, Empleado, SalidaInventario, CuentaPorCobrar } = db;
import { requerirStaff } from '../inventario/_lib';
import { tasaVigente } from '../_lib/tasaBcv';
import { calcularFactura, aBolivares, aDolares, REGLAS } from '@/app/constants/facturacion';

class ErrorNegocio extends Error {}
import { notificarTodos } from '@/app/handlers/notificar';

export async function GET(request) {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;
    try {
        const { searchParams } = new URL(request.url);
        const fechaInicio = searchParams.get('fechaInicio');
        const fechaFin = searchParams.get('fechaFin');

        let whereClause = {};

        if (fechaInicio && fechaFin) {
            whereClause.createdAt = {
                [Op.between]: [`${fechaInicio} 00:00:00`, `${fechaFin} 23:59:59`]
            };
        } else if (fechaInicio) {
            whereClause.createdAt = {
                [Op.between]: [`${fechaInicio} 00:00:00`, `${fechaInicio} 23:59:59`]
            };
        }

        const ventas = await Venta.findAll({
            where: whereClause,
            include: [
                {
                    model: VentaDetalle,
                    as: 'detalles',
                    include: [{
                        model: Producto,
                        as: 'producto',
                        attributes: ['nombre', 'codigo', 'imagen'],
                        include: [{ model: Marca, as: 'marca', attributes: ['nombre', 'imagen'] }]
                    }]
                },
                {
                    model: Cliente,
                    as: 'cliente',
                    attributes: ['nombre', 'identificacion']
                },
                {
                    model: User,
                    as: 'vendedor',
                    attributes: ['id', 'user'],
                    include: [{
                        model: Empleado,
                        as: 'empleado',
                        attributes: ['nombre', 'apellido']
                    }]
                },
                {
                    model: MovimientoFinanciero,
                    as: 'movimientos'
                }
            ],
            order: [['createdAt', 'DESC']]
        });

        return NextResponse.json(ventas);
    } catch (error) {
        console.error('Error obteniendo ventas:', error);
        return NextResponse.json({ error: 'Error al obtener el registro de ventas' }, { status: 500 });
    }
}

export async function POST(request) {
    // Solo el personal registra ventas por esta vía (el POS)
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;

    const t = await sequelize.transaction();

    try {
        const body = await request.json();
        const {
            tipoVenta, tipoDocumento, clienteId, moneda, condicionPago, quienRetira, costoFlete,
            detalles, metodoPago, referencia, numeroDocumentoManual, vendedorId,
        } = body;

        if (!Array.isArray(detalles) || detalles.length === 0) {
            await t.rollback();
            return NextResponse.json({ error: 'El carrito está vacío' }, { status: 400 });
        }
        if (!['MAYOR', 'DETAL'].includes(tipoVenta)) throw new ErrorNegocio('Tipo de venta inválido');
        if (!['USD', 'BS'].includes(moneda)) throw new ErrorNegocio('Moneda inválida');
        if (condicionPago === 'Credito' && !clienteId) throw new ErrorNegocio('Una venta a crédito requiere un cliente');

        // La tasa la pone el servidor, no el navegador
        const tasaCambio = await tasaVigente({ transaction: t });

        // --- 1. CÁLCULO EXACTO DE RENGLONES Y TOTALES (mismas reglas que el POS) ---
        const productos = new Map();
        for (const item of detalles) {
            if (item.isFicticio) continue;
            const producto = await Producto.findByPk(item.productoId, { transaction: t, lock: t.LOCK.UPDATE });
            if (!producto) throw new ErrorNegocio(`Producto no encontrado (id ${item.productoId})`);
            productos.set(Number(item.productoId), producto);
        }

        const renglonesEntrada = detalles.map((item) => {
            if (!(Number(item.precioUnitario) > 0)) throw new ErrorNegocio('Todos los renglones deben tener un precio mayor a 0');
            const producto = item.isFicticio ? null : productos.get(Number(item.productoId));
            const alicuota = producto ? Number(producto.porcentajeIva) || 0 : REGLAS.alicuotaGeneral;
            // El POS decide si la venta lleva IVA; la alícuota de cada producto la fija su ficha
            const aplicaIva = Boolean(item.aplicaIva) && alicuota > 0;
            return { precioUnitario: item.precioUnitario, cantidad: item.cantidad, aplicaIva, porcentajeIva: alicuota };
        });
        let factura;
        try {
            factura = calcularFactura({ renglones: renglonesEntrada, costoFlete });
        } catch (e) {
            throw new ErrorNegocio(e.message);
        }

        // --- 2. CORRELATIVO ---
        const prefijo = tipoDocumento === 'FACTURA' ? 'F' : (tipoDocumento === 'NOTA_ENTREGA' ? 'NE' : 'V');
        let corr = await Correlativo.findOne({ where: { prefijo }, transaction: t, lock: t.LOCK.UPDATE });
        if (!corr) corr = await Correlativo.create({ prefijo, siguienteNumero: 1, cerosRelleno: 5 }, { transaction: t });

        const numeroExtraido = parseInt(String(numeroDocumentoManual || '').replace(/\D/g, ''), 10);
        const numeroBase = (!isNaN(numeroExtraido) && numeroExtraido > 0) ? numeroExtraido : corr.siguienteNumero;
        corr.siguienteNumero = numeroBase + 1;
        await corr.save({ transaction: t });
        const numeroDocumento = numeroDocumentoManual || `${prefijo}-${String(numeroBase).padStart(corr.cerosRelleno || 5, '0')}`;

        // --- 3. VENTA ---
        const fechaVencimiento = condicionPago === 'Credito' ? new Date(Date.now() + 15 * 86400000) : null;
        const nuevaVenta = await Venta.create({
            clienteId: clienteId || null,
            vendedorId: vendedorId || null,
            tipoVenta, tipoDocumento, numeroDocumento,
            statusDespacho: tipoVenta === 'DETAL' ? 'Completado' : 'Pendiente',
            moneda, tasaCambio,
            condicionPago, statusPago: condicionPago === 'Contado' ? 'Pagado' : 'Pendiente',
            fechaVencimiento, quienRetira: quienRetira || null,
            costoFlete: factura.flete,
            subtotal: factura.subtotal, montoIva: factura.montoIva, totalFinal: factura.totalFinal,
        }, { transaction: t });

        if (condicionPago === 'Credito') {
            await CuentaPorCobrar.create({
                clienteId,
                ventaId: nuevaVenta.id,
                montoTotal: factura.totalFinal,
                saldoPendiente: factura.totalFinal,
                moneda,
                tasaCambio,
                fechaVencimiento,
                estado: 'Pendiente',
            }, { transaction: t });
        }

        // --- 4. DETALLES E INVENTARIO ---
        for (let i = 0; i < detalles.length; i++) {
            const item = detalles[i];
            const renglon = factura.renglones[i];
            const afectaInventario = !item.isFicticio && item.afectaInventario !== false;

            await VentaDetalle.create({
                ventaId: nuevaVenta.id,
                productoId: item.isFicticio ? null : Number(item.productoId),
                isFicticio: item.isFicticio || false,
                nombreFicticio: item.isFicticio ? item.nombreFicticio : null,
                aplicaIva: renglon.aplicaIva,
                afectaInventario: item.isFicticio ? false : item.afectaInventario !== false,
                cantidad: renglon.cantidad,
                precioUnitario: renglon.precioUnitario,
                subtotal: renglon.monto,
            }, { transaction: t });

            if (!afectaInventario) continue;
            const productoDB = productos.get(Number(item.productoId));
            const stock = Number(productoDB.stockAlmacen) || 0;

            // Detal descuenta el stock de inmediato; el mayor lo descuenta al armar la caja
            if (tipoVenta === 'DETAL') {
                if (stock < renglon.cantidad) throw new ErrorNegocio(`Inventario insuficiente: ${productoDB.nombre} (disponible ${stock})`);
                productoDB.stockAlmacen = stock - renglon.cantidad;
            }
            productoDB.nroVentas = (Number(productoDB.nroVentas) || 0) + renglon.cantidad;
            await productoDB.save({ transaction: t });

            await SalidaInventario.create({
                ventaId: nuevaVenta.id,
                productoId: productoDB.id,
                cantidad: renglon.cantidad,
                costoAlMomento: Number(productoDB.costoUsd) || 0,
                justificacion: `Venta ${numeroDocumento}`,
                estado: tipoVenta === 'DETAL' ? 'Entregada' : 'Pendiente',
                solicitadoPorId: vendedorId || null,
            }, { transaction: t });
        }

        // --- 5. FINANZAS CONTADO (se separa el ingreso propio del IVA que se le debe al SENIAT) ---
        if (condicionPago === 'Contado') {
            const aUsd = (v) => (moneda === 'USD' ? v : aDolares(v, tasaCambio));
            const aBs = (v) => (moneda === 'BS' ? v : aBolivares(v, tasaCambio));

            let catVentas = await CategoriaFinanciera.findOne({ where: { nombre: 'Ingresos por Ventas' }, transaction: t });
            if (!catVentas) catVentas = await CategoriaFinanciera.create({ nombre: 'Ingresos por Ventas', tipo: 'INGRESO' }, { transaction: t });

            // El flete también lo cobra la empresa: forma parte del ingreso
            const ingreso = Number((factura.subtotal + factura.flete).toFixed(2));
            await MovimientoFinanciero.create({
                tipo: 'INGRESO', fecha: new Date(), metodoPago, referencia,
                montoUsd: aUsd(ingreso), tasaBcvAplicada: tasaCambio, montoVes: aBs(ingreso),
                descripcion: `Venta ${numeroDocumento} (Subtotal${factura.flete > 0 ? ' + flete' : ''})`, categoriaId: catVentas.id, ventaId: nuevaVenta.id,
            }, { transaction: t });

            if (factura.montoIva > 0) {
                let catIva = await CategoriaFinanciera.findOne({ where: { nombre: 'IVA Recaudado' }, transaction: t });
                if (!catIva) catIva = await CategoriaFinanciera.create({ nombre: 'IVA Recaudado', tipo: 'INGRESO' }, { transaction: t });

                await MovimientoFinanciero.create({
                    tipo: 'INGRESO', fecha: new Date(), metodoPago, referencia,
                    montoUsd: aUsd(factura.montoIva), tasaBcvAplicada: tasaCambio, montoVes: aBs(factura.montoIva),
                    descripcion: `IVA de Venta ${numeroDocumento} (Impuesto SENIAT)`, categoriaId: catIva.id, ventaId: nuevaVenta.id,
                }, { transaction: t });
            }
        }

        await t.commit();

        // --- 6. NOTIFICACIÓN PUSH AL MAYOR ---
        if (tipoVenta === 'MAYOR') {
            try {
                const clienteDB = await Cliente.findByPk(clienteId);
                const nombreCliente = clienteDB ? (clienteDB.nombre || clienteDB.identificacion) : 'Cliente Desconocido';

                let nombreVendedor = 'Administración';
                if (vendedorId) {
                    const usuarioVendedor = await User.findByPk(vendedorId, { include: [{ model: Empleado, as: 'empleado' }] });
                    if (usuarioVendedor?.empleado) {
                        nombreVendedor = `${usuarioVendedor.empleado.nombre} ${usuarioVendedor.empleado.apellido}`;
                    } else if (usuarioVendedor) {
                        nombreVendedor = usuarioVendedor.user;
                    }
                }

                await notificarTodos({
                    title: 'Nuevo Pedido Mayorista 📦',
                    body: `Se ha creado un nuevo pedido de ${nombreCliente} por ${nombreVendedor}.`,
                    url: `/superuser/ventas`,
                    tipo: 'Info'
                });
            } catch (notifError) {
                console.error('Error enviando notificación Push:', notifError);
            }
        }

        return NextResponse.json({ success: true, message: 'Venta registrada', numeroDocumento, ventaId: nuevaVenta.id }, { status: 201 });

    } catch (error) {
        if (!t.finished) await t.rollback();
        if (error instanceof ErrorNegocio) return NextResponse.json({ error: error.message }, { status: 400 });
        console.error('Error procesando venta:', error);
        return NextResponse.json({ error: 'Error interno al procesar la venta' }, { status: 500 });
    }
}