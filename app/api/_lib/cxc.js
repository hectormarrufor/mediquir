import db from '@/models';
import { recalcularCobro } from './retencionesVenta';
import { tasaDelDia, tasaVigente } from './tasaBcv';
import { fechaCaracas } from '@/app/constants/hora';

const { Abono, CuentaPorCobrar, MovimientoFinanciero, CategoriaFinanciera, Venta } = db;

export class ErrorCxc extends Error {
    constructor(mensaje, status = 400) { super(mensaje); this.status = status; }
}

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Todo cambio de la deuda de una cuenta por cobrar pasa por un ABONO (o un AJUSTE) registrado: con fecha, monto, método y referencia; nunca se sobrescribe el saldo.
//   monto > 0: el cliente pagó (baja la deuda) · monto < 0 (solo tipo AJUSTE): sube la deuda (cargo adicional o corrección)
export async function registrarAbonoCxc({ cuentaId, fecha, monto, metodo, referencia, notas, tipo = 'ABONO', transaction: t }) {
    const cuenta = await CuentaPorCobrar.findByPk(cuentaId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!cuenta) throw new ErrorCxc('Esa cuenta por cobrar ya no existe', 404);
    const venta = await Venta.findByPk(cuenta.ventaId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!venta) throw new ErrorCxc('La venta de esa cuenta ya no existe', 404);

    const fechaPago = fecha || fechaCaracas();
    if (!FECHA.test(fechaPago) || fechaPago > fechaCaracas()) throw new ErrorCxc('La fecha del abono no es válida (no puede ser futura)');
    const importe = r2(monto);
    if (!Number.isFinite(importe) || importe === 0) throw new ErrorCxc('El monto debe ser distinto de cero');
    if (importe < 0 && tipo !== 'AJUSTE') throw new ErrorCxc('Un abono no puede ser negativo: para subir la deuda registra un ajuste');
    if (importe > 0 && cuenta.moneda === 'USD' && importe > Number(cuenta.saldoPendiente) + 0.005) throw new ErrorCxc(`El abono (${importe.toFixed(2)}) supera el saldo de la cuenta (${Number(cuenta.saldoPendiente).toFixed(2)})`, 409);

    const tasa = (await tasaDelDia(fechaPago, { transaction: t })) || (await tasaVigente({ transaction: t })) || Number(venta.tasaCambio) || 1;
    const metodoPago = String(metodo || (tipo === 'AJUSTE' ? 'Ajuste de saldo' : 'Abono')).trim().slice(0, 60);
    const abono = await Abono.create({
        ventaId: venta.id, fechaPago, metodoPago, referencia: String(referencia || '').trim().slice(0, 100) || null,
        montoUsd: importe, tasaBcvAplicada: tasa, montoVes: r2(importe * tasa), montoBs: r2(importe * tasa), tasaCambio: tasa,
        notas: String(notas || '').trim().slice(0, 250) || null,
    }, { transaction: t });

    // Ingreso de caja: solo si la venta todavía no tiene su ingreso (las migradas del sistema anterior ya lo tienen asentado al emitirse: no se duplica).
    // Las retenciones, los ajustes y las notas de crédito no son dinero que entra.
    const noEsDinero = tipo === 'AJUSTE' || /retenci|nota de cr/i.test(metodoPago);
    if (!noEsDinero && importe > 0) {
        const yaTieneIngreso = await MovimientoFinanciero.count({ where: { ventaId: venta.id, tipo: 'INGRESO' }, transaction: t });
        if (!yaTieneIngreso) {
            let cat = await CategoriaFinanciera.findOne({ where: { nombre: 'Ingreso por Cobranza (CxC)' }, transaction: t });
            if (!cat) cat = await CategoriaFinanciera.create({ nombre: 'Ingreso por Cobranza (CxC)', tipo: 'INGRESO' }, { transaction: t });
            await MovimientoFinanciero.create({
                tipo: 'INGRESO', fecha: fechaPago, metodoPago, referencia: abono.referencia, montoUsd: importe, tasaBcvAplicada: tasa, montoVes: r2(importe * tasa),
                descripcion: `Cobranza ${venta.numeroDocumento}`, categoriaId: cat.id, ventaId: venta.id, abonoId: abono.id,
            }, { transaction: t });
        }
    }
    await recalcularCobro(venta, t);
    await cuenta.reload({ transaction: t });
    return { abono, cuenta };
}

// Cuenta por cobrar con sus abonos, en dólares, lista para la cuadrícula
export function aUsd(valor, moneda, tasa) {
    return moneda === 'BS' ? r2(Number(valor) / (Number(tasa) || 1)) : r2(valor);
}
