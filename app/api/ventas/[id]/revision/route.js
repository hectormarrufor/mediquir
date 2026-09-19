import { NextResponse } from 'next/server';
import { requerirNoVendedor } from '@/app/api/_lib/acceso';
import { crearRetencionPendiente } from '@/app/api/_lib/retencionesVenta';
import { notificarUsuario } from '@/app/handlers/notificar';
import { calcularFactura } from '@/app/constants/facturacion';
import db from '@/models/index';

const { sequelize, Venta, VentaDetalle, Producto, SalidaInventario, CuentaPorCobrar, User } = db;

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class ErrorRevision extends Error {
    constructor(mensaje, status = 400) { super(mensaje); this.status = status; }
}

// Vuelve a calcular el pedido con los renglones que quedan (subtotal, IVA, total) y rehace sus salidas de inventario pendientes.
// Mientras el pedido está en revisión NO existen aún cuenta por cobrar ni retención, así que no hay nada más que ajustar.
async function recalcular(venta, t) {
    const detalles = await VentaDetalle.findAll({
        where: { ventaId: venta.id }, order: [['id', 'ASC']], transaction: t,
        include: [{ model: Producto, as: 'producto', attributes: ['id', 'porcentajeIva', 'costoUsd'] }],
    });
    if (!detalles.length) throw new ErrorRevision('El pedido se quedaría sin productos: si ya no se puede atender, cancélalo');
    const f = calcularFactura({
        renglones: detalles.map((d) => ({
            precioUnitario: Number(d.precioUnitario), cantidad: Number(d.cantidad), aplicaIva: d.aplicaIva, porcentajeIva: Number(d.producto?.porcentajeIva) || 0,
        })),
        costoFlete: Number(venta.costoFlete) || 0,
    });
    for (let i = 0; i < detalles.length; i++) {
        detalles[i].subtotal = f.renglones[i].monto;
        await detalles[i].save({ transaction: t });
    }
    venta.subtotal = f.subtotal;
    venta.montoIva = f.montoIva;
    venta.totalFinal = f.totalFinal;

    const previas = await SalidaInventario.findAll({ where: { ventaId: venta.id }, transaction: t });
    if (previas.some((s) => s.estado !== 'Pendiente')) throw new ErrorRevision('Este pedido ya tiene salidas de inventario procesadas: no se puede modificar', 409);
    const solicitadoPorId = previas[0]?.solicitadoPorId || null;
    await SalidaInventario.destroy({ where: { ventaId: venta.id }, transaction: t });
    for (const d of detalles) {
        await SalidaInventario.create({
            ventaId: venta.id, productoId: d.productoId, cantidad: d.cantidad, costoAlMomento: Number(d.producto?.costoUsd) || 0,
            justificacion: `Pedido B2B ${venta.numeroDocumento}`, estado: 'Pendiente', solicitadoPorId,
        }, { transaction: t });
    }
    return f;
}

const anotar = (venta, texto) => { venta.revisionNota = [venta.revisionNota, texto].filter(Boolean).join('\n'); };

// Administración resuelve un pedido en revisión de existencias (solo mientras la factura no se haya impreso ni el pedido avanzado):
//   CAMBIAR_CANTIDAD { detalleId, cantidadPresentacion }  ·  QUITAR { detalleId }  ·  CONFIRMAR
// Al CONFIRMAR nacen la cuenta por cobrar (si es a crédito) y la retención de IVA (contribuyente especial), y se avisa al cliente
// para que ya pueda hacer la retención y el pago.
export async function POST(request, { params }) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;

    const t = await sequelize.transaction();
    let aviso = null;
    try {
        const { id } = await params;
        if (!UUID.test(id)) throw new ErrorRevision('Pedido no encontrado', 404);
        const { accion, detalleId, cantidadPresentacion } = await request.json();

        const venta = await Venta.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!venta) throw new ErrorRevision('Pedido no encontrado', 404);
        if (venta.revisionStock !== 'PENDIENTE') throw new ErrorRevision('Este pedido no está en revisión de existencias', 409);
        if (venta.statusDespacho !== 'Pendiente' || venta.numeroControl) throw new ErrorRevision('Este pedido ya avanzó o su factura ya se imprimió: para corregirlo usa notas de crédito o débito', 409);

        if (accion === 'CAMBIAR_CANTIDAD' || accion === 'QUITAR') {
            const detalle = await VentaDetalle.findOne({ where: { id: detalleId, ventaId: venta.id }, include: [{ model: Producto, as: 'producto', attributes: ['nombre'] }], transaction: t });
            if (!detalle) throw new ErrorRevision('Ese renglón no pertenece al pedido', 404);
            const nombre = detalle.producto?.nombre || 'Producto';
            const etiqueta = (d) => (d.presentacionPedida && d.presentacionPedida !== 'UNIDAD' ? `${d.cantidadPresentacion} × ${d.presentacionPedida === 'CAJA' ? 'caja' : 'bulto'}` : `${Number(d.cantidad)} und`);

            if (accion === 'QUITAR') {
                anotar(venta, `Se quitó "${nombre}" (${etiqueta(detalle)}): no había existencias.`);
                await detalle.destroy({ transaction: t });
            } else {
                const n = Number(cantidadPresentacion);
                if (!Number.isInteger(n) || n < 1) throw new ErrorRevision('La cantidad debe ser un entero mayor a 0');
                const antes = etiqueta(detalle);
                const porPres = Number(detalle.unidadesPorPresentacion) || 1;
                detalle.cantidadPresentacion = detalle.presentacionPedida ? n : null;
                detalle.cantidad = n * porPres;
                await detalle.save({ transaction: t });
                anotar(venta, `"${nombre}": de ${antes} a ${etiqueta(detalle)} por falta de existencias.`);
            }
            await recalcular(venta, t);
            await venta.save({ transaction: t });
            await t.commit();
            return NextResponse.json({ success: true, totalFinal: Number(venta.totalFinal) });
        }

        if (accion === 'CONFIRMAR') {
            await recalcular(venta, t);
            const totalUsd = Number(venta.totalFinal);
            // A crédito nace ahora la cuenta por cobrar (con el total ya ajustado)
            if (venta.condicionPago === 'Credito') {
                const existe = await CuentaPorCobrar.count({ where: { ventaId: venta.id }, transaction: t });
                if (!existe) {
                    await CuentaPorCobrar.create({
                        clienteId: venta.clienteId, ventaId: venta.id, montoTotal: totalUsd, saldoPendiente: totalUsd,
                        moneda: venta.moneda, tasaCambio: venta.tasaCambio, fechaVencimiento: venta.fechaVencimiento, estado: 'Pendiente',
                    }, { transaction: t });
                }
            }
            venta.revisionStock = 'RESUELTA';
            venta.revisionResueltaAt = new Date();
            await venta.save({ transaction: t });
            const retencion = await crearRetencionPendiente({ venta, transaction: t });
            const usuario = await User.findOne({ where: { clienteId: venta.clienteId }, attributes: ['id'], transaction: t });
            aviso = { usuarioId: usuario?.id, numero: venta.numeroDocumento, ventaId: venta.id, retencion: Boolean(retencion), nota: venta.revisionNota, total: totalUsd };
            await t.commit();
        } else {
            throw new ErrorRevision('Acción no válida');
        }

        if (aviso?.usuarioId) {
            try {
                await notificarUsuario(aviso.usuarioId, {
                    title: '¡Tu pedido fue confirmado! ✅',
                    body: `Pedido ${aviso.numero}: ya conseguimos tus productos${aviso.nota ? ' (con algunos ajustes; míralos en tu pedido)' : ''}.${aviso.retencion ? ' Ya puedes hacer la retención de IVA y subir el comprobante.' : ''} Total: $${aviso.total.toFixed(2)}.`,
                    url: `/b2b/pedidos/${aviso.ventaId}`, tipo: 'Info',
                });
            } catch (e) {
                console.error('No se pudo avisar la confirmación al cliente:', e.message);
            }
        }
        return NextResponse.json({ success: true });
    } catch (error) {
        if (!t.finished) await t.rollback();
        if (error instanceof ErrorRevision) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('Revisión de existencias:', error);
        return NextResponse.json({ error: 'No se pudo completar la acción' }, { status: 500 });
    }
}
