// Retención de IVA que un cliente contribuyente especial le hace a la empresa sobre una factura de venta.
// (Las retenciones de COMPRAS, que emite la empresa, viven en retenciones.js)
// Imports relativos con extensión (sin alias "@/") para poder probarlo con un script de Node.
import db from '../../../models/index.js';
import { aBolivares, aDolares } from '../../constants/facturacion.js';

const { Abono, CuentaPorCobrar, RetencionIva, Cliente, VentaDetalle } = db;

export const hoyCaracas = () =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

// Deja el cobro de la venta coherente con sus abonos (incluida la retención): saldo de la cuenta por cobrar y estado de pago
export async function recalcularCobro(venta, t) {
    const abonos = await Abono.findAll({ where: { ventaId: venta.id }, attributes: ['montoUsd', 'montoVes'], transaction: t });
    const totalUsd = venta.moneda === 'BS' ? aDolares(Number(venta.totalFinal), Number(venta.tasaCambio)) : Number(venta.totalFinal);
    const abonadoUsd = abonos.reduce((a, x) => a + Number(x.montoUsd), 0);
    const pagada = abonadoUsd >= totalUsd - 0.005;

    const cxc = await CuentaPorCobrar.findOne({ where: { ventaId: venta.id }, transaction: t });
    if (cxc) {
        const abonado = cxc.moneda === 'USD' ? abonadoUsd : abonos.reduce((a, x) => a + Number(x.montoVes), 0);
        cxc.saldoPendiente = Math.max(0, Number((Number(cxc.montoTotal) - abonado).toFixed(2)));
        cxc.estado = cxc.saldoPendiente <= 0.005 ? 'Pagado' : 'Pendiente';
        await cxc.save({ transaction: t });
    }
    venta.statusPago = pagada ? 'Pagado' : 'Pendiente';
    await venta.save({ transaction: t });
}

// Montos de la retención de una factura. Los libros se llevan en bolívares: se convierte con la tasa que tenía la factura.
//   detalles: renglones de la factura ({ subtotal, aplicaIva }) · ivaRetenidoBs: monto que trae el comprobante, si difiere del calculado
export function calcularRetencion(venta, detalles, porcentaje, ivaRetenidoBs) {
    const pct = Number(porcentaje) === 100 ? 100 : 75;
    const tasa = Number(venta.tasaCambio) || 1;
    const aBs = (v) => (venta.moneda === 'BS' ? Number(Number(v).toFixed(2)) : aBolivares(Number(v), tasa));
    const ivaBs = aBs(venta.montoIva);
    const baseBs = aBs(detalles.filter((d) => d.aplicaIva).reduce((a, d) => a + Number(d.subtotal), 0));
    const retenidoBs = Number(ivaRetenidoBs) > 0 ? Number(Number(ivaRetenidoBs).toFixed(2)) : Math.round(ivaBs * pct) / 100;
    return { pct, tasa, ivaBs, baseBs, retenidoBs, retenidoUsd: aDolares(retenidoBs, tasa) };
}

/**
 * Al facturar a un contribuyente especial, deja calculada la retención: queda PENDIENTE de comprobante (lo emite el cliente,
 * se carga después) y ese IVA se descuenta del saldo desde ya, porque el cliente se lo paga al SENIAT y no a la empresa.
 * Llamar dentro de la transacción de la venta, DESPUÉS de crear sus renglones (y su cuenta por cobrar, si es a crédito).
 * Devuelve la retención, o null si no aplica (no es factura, no hay IVA, el cliente no es especial o ya tiene una).
 */
export async function crearRetencionPendiente({ venta, transaction: t }) {
    if (venta.tipoDocumento !== 'FACTURA' || venta.statusDespacho === 'Cancelado') return null;
    if (!(Number(venta.montoIva) > 0) || !venta.clienteId) return null;

    const cliente = await Cliente.findByPk(venta.clienteId, { attributes: ['identificacion', 'nombre', 'esContribuyenteEspecial', 'retencionIvaPorDefecto'], transaction: t });
    if (!cliente?.esContribuyenteEspecial) return null;
    if (await RetencionIva.findOne({ where: { ventaId: venta.id }, attributes: ['id'], transaction: t })) return null;

    const detalles = await VentaDetalle.findAll({ where: { ventaId: venta.id }, attributes: ['subtotal', 'aplicaIva'], transaction: t });
    const c = calcularRetencion(venta, detalles, cliente.retencionIvaPorDefecto);
    const fecha = hoyCaracas();

    const abono = await Abono.create({
        ventaId: venta.id, fechaPago: fecha, metodoPago: 'Retención IVA', referencia: 'PENDIENTE DE COMPROBANTE',
        montoUsd: c.retenidoUsd, montoVes: c.retenidoBs, montoBs: c.retenidoBs, tasaBcvAplicada: c.tasa, tasaCambio: c.tasa,
        notas: `Retención de IVA ${c.pct}% calculada al facturar; falta el comprobante del cliente`,
    }, { transaction: t });

    const retencion = await RetencionIva.create({
        tipo: 'VENTA', estado: 'PENDIENTE', fecha, periodo: fecha.slice(0, 7), comprobante: null,
        facturaAfectada: venta.numeroDocumento, numeroControlFactura: venta.numeroControl,
        contraparteRif: cliente.identificacion, contraparteNombre: cliente.nombre,
        baseImponible: c.baseBs, alicuota: 16, montoIva: c.ivaBs, porcentajeRetencion: c.pct, ivaRetenido: c.retenidoBs,
        tasaCambio: c.tasa, ventaId: venta.id, abonoId: abono.id,
    }, { transaction: t });

    await recalcularCobro(venta, t);
    return retencion;
}
