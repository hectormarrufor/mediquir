// Retención de IVA que un cliente contribuyente especial le hace a la empresa sobre una factura de venta.
// (Las retenciones de COMPRAS, que emite la empresa, viven en retenciones.js)
// Imports relativos con extensión (sin alias "@/") para poder probarlo con un script de Node.
import db from '../../../models/index.js';
import { aBolivares, aDolares } from '../../constants/facturacion.js';
import { generarComisionPorPago } from './comisionesPago.js';

const { Abono, CuentaPorCobrar, RetencionIva, Cliente, VentaDetalle, MovimientoFinanciero } = db;

export const hoyCaracas = () =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

// Deja el cobro de la venta coherente con sus abonos (incluida la retención): saldo de la cuenta por cobrar y estado de pago
export async function recalcularCobro(venta, t) {
    const abonos = await Abono.findAll({ where: { ventaId: venta.id }, attributes: ['montoUsd', 'montoVes'], transaction: t });
    const totalUsd = venta.moneda === 'BS' ? aDolares(Number(venta.totalFinal), Number(venta.tasaCambio)) : Number(venta.totalFinal);
    const abonadoUsd = abonos.reduce((a, x) => a + Number(x.montoUsd), 0);
    let pagada = abonadoUsd >= totalUsd - 0.005;

    const cxc = await CuentaPorCobrar.findOne({ where: { ventaId: venta.id }, transaction: t });
    if (!cxc) {
        // Sin cuenta por cobrar: venta de contado. Si se cobró en caja al registrarla, ese cobro son sus ingresos de caja (no abonos).
        // Se compara en la moneda de la venta para no perder céntimos al convertir.
        const enMoneda = (x) => Number(venta.moneda === 'BS' ? x.montoVes : x.montoUsd) || 0;
        const cobradoCaja = await MovimientoFinanciero.findAll({ where: { ventaId: venta.id, tipo: 'INGRESO', abonoId: null }, attributes: ['montoUsd', 'montoVes'], transaction: t });
        const cobrado = abonos.reduce((a, x) => a + enMoneda(x), 0) + cobradoCaja.reduce((a, x) => a + enMoneda(x), 0);
        pagada = cobrado >= Number(venta.totalFinal) - 0.005;
    }
    // La cuenta creada por una nota de débito sobre una factura ya cobrada solo tiene la deuda de la nota: sus pagos no son los de la factura
    if (cxc?.notaId) {
        venta.statusPago = cxc.estado === 'Pagado' ? 'Pagado' : 'Pendiente';
        await venta.save({ transaction: t });
        return;
    }
    if (cxc) {
        const abonado = cxc.moneda === 'USD' ? abonadoUsd : abonos.reduce((a, x) => a + Number(x.montoVes), 0);
        cxc.saldoPendiente = Math.max(0, Number((Number(cxc.montoTotal) - abonado).toFixed(2)));
        cxc.estado = cxc.saldoPendiente <= 0.005 ? 'Pagado' : 'Pendiente';
        await cxc.save({ transaction: t });
        pagada = cxc.estado === 'Pagado'; // con notas de débito la deuda es mayor que el total de la factura
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

// Marca que lleva el abono cuando el cliente dijo que con ese pago cerraba la factura (para la lista «dicen que pagaron completo y deben»)
export const MARCA_CIERRE = '[CIERRE DECLARADO]';
// Las retenciones se llevan desde la primera quincena de noviembre de 2026; antes de esa fecha no se piden ni se listan
export const RETENCIONES_DESDE = '2026-11-01';

/**
 * La administradora declara que el cliente retuvo el IVA de ESTA factura (casi siempre el 75 %). No depende de ningún dato del cliente.
 * Queda PENDIENTE de comprobante, y ese IVA baja la deuda desde ya (el cliente se lo paga al SENIAT). Los bolívares son a la tasa de la factura.
 * Devuelve la retención creada, o la que ya existía.
 */
export async function declararRetencion({ venta, porcentaje = 75, fecha = null, transaction: t }) {
    if (venta.tipoDocumento !== 'FACTURA' || venta.statusDespacho === 'Cancelado') throw new Error('Solo una factura admite retención de IVA');
    if (!(Number(venta.montoIva) > 0)) throw new Error('Esta factura no tiene IVA que retener');
    const existente = await RetencionIva.findOne({ where: { ventaId: venta.id }, transaction: t });
    if (existente) return existente;
    const cliente = await Cliente.findByPk(venta.clienteId, { attributes: ['identificacion', 'nombre'], transaction: t });
    const detalles = await VentaDetalle.findAll({ where: { ventaId: venta.id }, attributes: ['subtotal', 'aplicaIva'], transaction: t });
    const c = calcularRetencion(venta, detalles, porcentaje);
    const dia = fecha || hoyCaracas();
    const abono = await Abono.create({
        ventaId: venta.id, fechaPago: dia, metodoPago: 'Retención IVA', referencia: 'PENDIENTE DE COMPROBANTE',
        montoUsd: c.retenidoUsd, montoVes: c.retenidoBs, montoBs: c.retenidoBs, tasaBcvAplicada: c.tasa, tasaCambio: c.tasa,
        notas: `Retención de IVA ${c.pct}% declarada; falta el comprobante del cliente`,
    }, { transaction: t });
    await generarComisionPorPago({ abono, transaction: t });
    const retencion = await RetencionIva.create({
        tipo: 'VENTA', estado: 'PENDIENTE', fecha: dia, periodo: dia.slice(0, 7), comprobante: null,
        facturaAfectada: venta.numeroDocumento, numeroControlFactura: venta.numeroControl,
        contraparteRif: cliente?.identificacion || null, contraparteNombre: cliente?.nombre || null,
        baseImponible: c.baseBs, alicuota: 16, montoIva: c.ivaBs, porcentajeRetencion: c.pct, ivaRetenido: c.retenidoBs,
        tasaCambio: c.tasa, ventaId: venta.id, abonoId: abono.id,
    }, { transaction: t });
    await recalcularCobro(venta, t);
    return retencion;
}
