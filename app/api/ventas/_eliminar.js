// Eliminación completa de una venta y de TODO lo que cuelga de ella. Lo usa DELETE /api/ventas/[id].
// Imports relativos con extensión (sin alias "@/") para poder probarlo con un script de Node.
import { list, del } from '@vercel/blob';
import db from '../../../models/index.js';

const {
    Venta, VentaDetalle, VentaEmpaqueItem, EmpaqueError, Producto, SalidaInventario, MovimientoFinanciero, Abono, CuentaPorCobrar, RetencionIva,
    NotaFiscal, NotaFiscalDetalle, PagoSms, Correlativo, Notificacion, NotificacionLeida, Sequelize,
} = db;

const numeroDe = (texto) => Number(String(texto || '').replace(/\D/g, '')) || 0;

// Devuelve un correlativo al número que tenía ANTES de este documento, pero solo si era el último emitido de su serie
// (si ya se emitió otro después, el hueco se deja: no se reutilizan números intermedios).
async function rebobinar(documentos, transaction) {
    const ordenados = [...documentos].sort((a, b) => numeroDe(b.numeroDocumento) - numeroDe(a.numeroDocumento));
    for (const d of ordenados) {
        const prefijo = String(d.numeroDocumento || '').split('-')[0];
        const n = numeroDe(d.numeroDocumento);
        if (!prefijo || !n) continue;
        const corr = await Correlativo.findOne({ where: { prefijo }, transaction, lock: transaction.LOCK.UPDATE });
        if (corr && corr.siguienteNumero === n + 1) { corr.siguienteNumero = n; await corr.save({ transaction }); }
    }
}

/**
 * Borra la venta con todo su rastro dentro de la transacción del llamador:
 *  · inventario: devuelve lo que ya había salido (menos lo que una nota de crédito ya había reintegrado)
 *  · notas de crédito y de débito (con sus renglones), retenciones de IVA, abonos, cuenta por cobrar, movimientos de dinero,
 *    salidas de inventario, renglones, evidencia de empaque y notificaciones que la mencionan
 *  · pagos móviles enlazados: quedan libres para vincularse a otra venta (el dinero sí se recibió)
 *  · correlativos: retroceden si el documento era el último de su serie
 * Devuelve los archivos del Blob a borrar DESPUÉS de confirmar la transacción (`borrarArchivosDeVenta`) y un resumen.
 */
export async function eliminarVenta({ venta, transaction: t }) {
    const id = venta.id;
    const [detalles, notas, retenciones] = await Promise.all([
        VentaDetalle.findAll({ where: { ventaId: id }, transaction: t }),
        NotaFiscal.findAll({ where: { ventaId: id }, include: [{ model: NotaFiscalDetalle, as: 'detalles' }], transaction: t }),
        RetencionIva.findAll({ where: { ventaId: id }, attributes: ['id', 'comprobanteUrl'], transaction: t }),
    ]);

    // ---- Inventario: el detal y la tienda descuentan al vender; el mayor, al empacar
    const salioMercancia = ['DETAL', 'ONLINE'].includes(venta.tipoVenta) || ['Empacado', 'Completado'].includes(venta.statusDespacho) || Boolean(venta.empacadoAt);
    const yaDevuelto = new Map();
    for (const n of notas.filter((x) => x.estado === 'EMITIDA' && x.tipo === 'CREDITO' && x.devuelveInventario)) {
        for (const d of n.detalles) if (d.productoId) yaDevuelto.set(d.productoId, (yaDevuelto.get(d.productoId) || 0) + Number(d.cantidad));
    }
    let unidadesDevueltas = 0;
    if (salioMercancia) {
        for (const item of detalles) {
            if (item.isFicticio || item.afectaInventario === false || !item.productoId) continue;
            const reintegrado = Math.min(yaDevuelto.get(item.productoId) || 0, Number(item.cantidad));
            yaDevuelto.set(item.productoId, (yaDevuelto.get(item.productoId) || 0) - reintegrado);
            const aDevolver = Number(item.cantidad) - reintegrado;
            if (aDevolver <= 0) continue;
            const producto = await Producto.findByPk(item.productoId, { transaction: t, lock: t.LOCK.UPDATE });
            if (!producto) continue;
            producto.stockAlmacen = Number(producto.stockAlmacen) + aDevolver;
            producto.nroVentas = Math.max(0, (Number(producto.nroVentas) || 0) - aDevolver);
            await producto.save({ transaction: t });
            unidadesDevueltas += aDevolver;
        }
    }

    // ---- Archivos que hay que borrar del Blob (comprobantes de retención y fotos de empaque)
    const archivos = [...retenciones.map((r) => r.comprobanteUrl), venta.fotoCajaAbiertaUrl, venta.fotoCajaSelladaUrl].filter(Boolean);

    // ---- Notificaciones que apuntan a esta venta (quedarían con un enlace muerto)
    const notificaciones = await Notificacion.findAll({ where: { url: { [Sequelize.Op.like]: `%${id}%` } }, attributes: ['id'], transaction: t });
    const idsNotificacion = notificaciones.map((n) => n.id);
    if (idsNotificacion.length) {
        await NotificacionLeida.destroy({ where: { notificacionId: idsNotificacion }, transaction: t });
        await Notificacion.destroy({ where: { id: idsNotificacion }, transaction: t });
    }

    // ---- Lo que cuelga de la venta (el orden importa: las notas y la cuenta por cobrar no se borran en cascada)
    await PagoSms.update({ procesado: false, ventaId: null }, { where: { ventaId: id }, transaction: t });
    await NotaFiscal.destroy({ where: { ventaId: id }, transaction: t }); // sus renglones se borran en cascada
    await MovimientoFinanciero.destroy({ where: { ventaId: id }, transaction: t });
    await SalidaInventario.destroy({ where: { ventaId: id }, transaction: t });
    await RetencionIva.destroy({ where: { ventaId: id }, transaction: t });
    await Abono.destroy({ where: { ventaId: id }, transaction: t }); // incluye los "abonos" de retenciones y notas de crédito
    await CuentaPorCobrar.destroy({ where: { ventaId: id }, transaction: t });
    await VentaEmpaqueItem.destroy({ where: { ventaId: id }, transaction: t });
    await EmpaqueError.destroy({ where: { ventaId: id }, transaction: t }); // los errores de empaque de los empleados se van con el pedido
    await VentaDetalle.destroy({ where: { ventaId: id }, transaction: t });
    await venta.destroy({ transaction: t });

    // ---- Correlativos (factura y notas)
    await rebobinar([{ numeroDocumento: venta.numeroDocumento }, ...notas.filter((n) => n.origen === 'VENTA').map((n) => ({ numeroDocumento: n.numeroDocumento }))], t);

    // Los números de control ya asignados NO retroceden solos: la forma libre se pudo haber gastado
    const controles = [venta.numeroControl, ...notas.map((n) => n.numeroControl)].filter(Boolean);
    return { archivos, controles, resumen: { notas: notas.length, retenciones: retenciones.length, notificaciones: idsNotificacion.length, unidadesDevueltas } };
}

// Borra del Blob los archivos de la venta: los conocidos y cualquier otro guardado bajo su número (versiones que se subieron dos veces)
export async function borrarArchivosDeVenta(numeroDocumento, archivosConocidos = []) {
    const urls = new Set(archivosConocidos);
    // numeroDocumento puede ser una lista: el número actual y el V- anterior si el recibo se convirtió en factura
    for (const prefix of [].concat(numeroDocumento).filter(Boolean).flatMap((n) => [`retenciones/${n}/`, `empaques/${n}/`])) {
        let cursor;
        do {
            const pagina = await list({ prefix, cursor });
            pagina.blobs.forEach((b) => urls.add(b.url));
            cursor = pagina.hasMore ? pagina.cursor : undefined;
        } while (cursor);
    }
    if (urls.size) await del([...urls]);
    return urls.size;
}
