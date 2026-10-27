// Pago a un proveedor de una compra a crédito: baja el saldo de su cuenta por pagar y asienta el egreso en caja.
// El gasto entra al balance el día que se paga (igual que una compra de contado), con la misma categoría que tendría de contado.
// Lo usan el pago de una compra (total o abono) y «Pagar y retener» (varias facturas de un proveedor de una vez).
import { CategoriaFinanciera, MovimientoFinanciero } from '@/models';
import { aBolivares, aDolares } from '@/app/constants/facturacion';
import { fechaCaracas } from '@/app/constants/hora';
import { METODOS_PAGO_PROVEEDOR } from '@/app/constants/metodosPago';

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export class ErrorPago extends Error {
    constructor(mensaje, status = 400) { super(mensaje); this.status = status; }
}

export const metodoValido = (m) => (METODOS_PAGO_PROVEEDOR.includes(m) ? m : null);

/**
 * Referencia con la que queda el pago en caja. Si quien pagó no entregó el comprobante (por ejemplo, pagó el dueño y no pasó el
 * capture), administración igual lo puede marcar como pagado: queda dicho que no hay comprobante y quién lo marcó.
 */
export const referenciaDePago = ({ referencia, sinComprobante, sesion }) => (sinComprobante
    ? `Sin comprobante de pago (lo marcó ${String(sesion?.nombre || 'administración').slice(0, 80)})`
    : String(referencia || '').trim().slice(0, 60) || null);

/** Fecha en que se pagó (puede ser de días antes de registrarlo, nunca futura). Sin fecha: hoy. */
export function fechaDePago(fecha) {
    const hoy = fechaCaracas();
    if (!fecha) return hoy;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha))) throw new ErrorPago('Fecha del pago inválida');
    if (fecha > hoy) throw new ErrorPago('La fecha del pago no puede ser futura');
    return fecha;
}

/**
 * @param factura FacturaCompra (bloqueada en la transacción) · cxp su CuentaPorPagar (bloqueada)
 * @param monto, moneda  lo que se paga ('USD' | 'BS'); si no es la moneda de la cuenta se convierte con `tasa` (la del día del pago)
 * @param fecha  día en que se pagó (el egreso se asienta en caja con esa fecha)
 * @returns { liquidada, saldoRestante, montoUsd, montoBs }
 */
export async function pagarCuenta({ factura, cxp, monto, moneda, metodoPago, referencia, tasa, fecha }, t) {
    const saldo = Number(cxp.saldoPendiente);
    if (cxp.estado === 'Pagado' || !(saldo > 0)) throw new ErrorPago(`La factura ${factura.numeroDocumento} ya está pagada`, 409);
    if (!tasa && moneda !== cxp.moneda) throw new ErrorPago('No hay tasa BCV registrada hoy para convertir el pago', 409);
    const tasaUsada = tasa || Number(cxp.tasaCambio) || 1;

    let montoUsd = moneda === 'USD' ? r2(monto) : aDolares(monto, tasaUsada);
    let montoBs = moneda === 'BS' ? r2(monto) : aBolivares(monto, tasaUsada);
    let enMonedaCuenta = cxp.moneda === 'USD' ? montoUsd : montoBs;

    // Pagar de más no se permite; una diferencia mínima por la conversión (hasta $0,50) liquida exactamente el saldo
    const exceso = r2(enMonedaCuenta - saldo);
    if (exceso > 0.01) {
        const tolerancia = moneda === cxp.moneda ? 0.01 : (cxp.moneda === 'USD' ? 0.5 : 0.5 * tasaUsada);
        if (exceso > tolerancia) throw new ErrorPago(`El pago (${enMonedaCuenta.toFixed(2)} ${cxp.moneda}) supera el saldo pendiente (${saldo.toFixed(2)} ${cxp.moneda})`, 409);
        enMonedaCuenta = saldo;
        if (cxp.moneda === 'USD') montoUsd = saldo; else montoBs = saldo;
    }

    cxp.saldoPendiente = Math.max(0, r2(saldo - enMonedaCuenta));
    const liquidada = cxp.saldoPendiente <= 0.005;
    if (liquidada) {
        cxp.saldoPendiente = 0;
        cxp.estado = 'Pagado';
        factura.statusPago = 'Pagado';
        await factura.save({ transaction: t });
    }
    await cxp.save({ transaction: t });

    // Misma categoría que una compra de contado: la del gasto, o "Compras de Mercancía"
    let categoria = factura.esGasto && factura.categoriaGastoId ? await CategoriaFinanciera.findByPk(factura.categoriaGastoId, { transaction: t }) : null;
    if (!categoria) categoria = await CategoriaFinanciera.findOne({ where: { nombre: 'Compras de Mercancía' }, transaction: t })
        || await CategoriaFinanciera.create({ nombre: 'Compras de Mercancía', tipo: 'GASTO' }, { transaction: t });

    await MovimientoFinanciero.create({
        tipo: 'GASTO', fecha: fecha || fechaCaracas(), metodoPago, referencia: referencia || `Pago ${factura.numeroDocumento}`,
        montoUsd, montoVes: montoBs, tasaBcvAplicada: tasaUsada,
        descripcion: `${liquidada ? 'Pago' : 'Abono'} a proveedor - ${factura.esGasto ? 'gasto' : 'compra'} ${factura.tipoDocumento === 'FACTURA' ? 'factura' : 'nota de entrega'} Nro: ${factura.numeroDocumento}`,
        categoriaId: categoria.id, facturaCompraId: factura.id,
    }, { transaction: t });

    return { liquidada, saldoRestante: Number(cxp.saldoPendiente), montoUsd, montoBs };
}
