// Registro de abonos a cuentas por cobrar. Lo usan el administrador (abono a mano), el vínculo manual de un pago móvil
// y el cliente B2B (pago móvil reportado por él), para que los tres asienten el dinero exactamente igual.
// Imports relativos con extensión (sin alias "@/") para poder probarlo con un script de Node.
import db from '../../../models/index.js';
import { aBolivares, aDolares } from '../../constants/facturacion.js';

const { Abono, CuentaPorCobrar, MovimientoFinanciero, CategoriaFinanciera, RetencionIva, NotaFiscal } = db;

export class ErrorAbono extends Error {
    constructor(mensaje, status = 400, codigo = null) { super(mensaje); this.status = status; this.codigo = codigo; }
}

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Fecha de hoy en Caracas (YYYY-MM-DD): los movimientos llevan fecha sin hora y de noche el servidor ya está en "mañana"
const hoyCaracas = () =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

async function categoria(nombre, transaction) {
    return (await CategoriaFinanciera.findOne({ where: { nombre }, transaction }))
        || CategoriaFinanciera.create({ nombre, tipo: 'INGRESO' }, { transaction });
}

/**
 * Registra un abono a la cuenta por cobrar de una venta, dentro de la transacción del llamador.
 *
 * - Baja el saldo de la cuenta (y la deja pagada, junto con la venta, si queda en cero).
 * - Asienta el ingreso repartido igual que una venta de contado: la parte de IVA va a "IVA Recaudado"
 *   (no es ingreso de la empresa) y el resto a "Ingreso por Cobranza (CxC)".
 * - Si viene de un pago móvil recibido (pagoSms), lo marca como usado y lo enlaza a la venta.
 *
 * @param {object}  p.venta          Venta ya cargada (necesita id, totalFinal, montoIva, numeroDocumento)
 * @param {number}  p.monto          Lo que pagó el cliente, en la moneda indicada
 * @param {'USD'|'BS'} p.moneda
 * @param {number}  p.tasa           Tasa BCV con la que se convierte entre dólares y bolívares
 * @param {number}  [p.toleranciaUsd] Si el pago supera el saldo por menos de esto (en dólares), se ajusta al saldo en vez de
 *                                   rechazarlo (la tasa cambia de un día para otro)
 */
export async function registrarAbono({ venta, monto, moneda, tasa, metodoPago, referencia, pagoSms = null, toleranciaUsd = 0, transaction: t }) {
    const cxc = await CuentaPorCobrar.findOne({ where: { ventaId: venta.id }, transaction: t, lock: t.LOCK.UPDATE });
    if (!cxc) throw new ErrorAbono('Esta venta no tiene una Cuenta por Cobrar asociada', 404);
    if (cxc.estado === 'Pagado') throw new ErrorAbono('Esta cuenta ya está pagada en su totalidad', 400);

    const montoNum = Number(monto);
    const tasaNum = Number(tasa);
    if (!(montoNum > 0)) throw new ErrorAbono('El monto del abono debe ser mayor a 0');
    if (!['USD', 'BS'].includes(moneda)) throw new ErrorAbono('Moneda del abono inválida');
    if (!(tasaNum > 0)) throw new ErrorAbono('Tasa de cambio inválida');

    let abonoUsd = moneda === 'USD' ? r2(montoNum) : aDolares(montoNum, tasaNum);
    let abonoBs = moneda === 'BS' ? r2(montoNum) : aBolivares(montoNum, tasaNum);

    // En la moneda de la cuenta (la que se descuenta del saldo)
    const saldo = Number(cxc.saldoPendiente);
    let enMonedaCuenta = cxc.moneda === 'USD' ? abonoUsd : abonoBs;
    const exceso = r2(enMonedaCuenta - saldo);
    if (exceso > 0.01) {
        const tolerancia = cxc.moneda === 'USD' ? toleranciaUsd : toleranciaUsd * tasaNum;
        if (exceso > tolerancia) {
            throw new ErrorAbono(`El abono (${enMonedaCuenta.toFixed(2)} ${cxc.moneda}) supera el saldo pendiente (${saldo.toFixed(2)} ${cxc.moneda})`, 409, 'EXCEDE_SALDO');
        }
        // Diferencia mínima por la tasa: se liquida exactamente el saldo
        if (cxc.moneda === 'USD') abonoUsd = saldo; else abonoBs = saldo;
        enMonedaCuenta = saldo;
    }

    const fecha = hoyCaracas();
    const abono = await Abono.create({
        ventaId: venta.id, fechaPago: fecha, metodoPago: metodoPago || 'No especificado', referencia: referencia || null,
        montoUsd: abonoUsd, montoVes: abonoBs, montoBs: abonoBs, tasaBcvAplicada: tasaNum, tasaCambio: tasaNum,
    }, { transaction: t });

    cxc.saldoPendiente = Math.max(0, r2(saldo - enMonedaCuenta));
    const liquidada = cxc.saldoPendiente <= 0;
    if (liquidada) {
        cxc.estado = 'Pagado';
        venta.statusPago = 'Pagado';
        await venta.save({ transaction: t });
    }
    await cxc.save({ transaction: t });

    if (pagoSms) {
        pagoSms.procesado = true;
        pagoSms.ventaId = venta.id;
        await pagoSms.save({ transaction: t });
    }

    // Reparto del abono: el IVA es la misma proporción de lo que se cobra (la factura incluye subtotal + flete + IVA).
    // Si el cliente retuvo IVA, esa parte se la paga al SENIAT: lo que queda por cobrar tiene menos IVA.
    const retenciones = await RetencionIva.findAll({ where: { ventaId: venta.id }, attributes: ['ivaRetenido'], transaction: t });
    const retenidoBs = retenciones.reduce((a, r) => a + Number(r.ivaRetenido), 0);
    const retenido = venta.moneda === 'BS' ? retenidoBs : (retenidoBs > 0 ? aDolares(retenidoBs, Number(venta.tasaCambio) || 1) : 0);
    // Las notas de crédito restan (total e IVA) y las de débito suman; si la cuenta es solo de notas de débito (factura ya cobrada),
    // lo que se debe es únicamente lo de esas notas.
    const notas = await NotaFiscal.findAll({ where: { ventaId: venta.id, origen: 'VENTA', estado: 'EMITIDA' }, attributes: ['tipo', 'montoIva', 'totalFinal'], transaction: t });
    const suma = (tipoNota, campo) => notas.filter((n) => n.tipo === tipoNota).reduce((a, n) => a + Number(n[campo]), 0);
    const total = cxc.notaId
        ? suma('DEBITO', 'totalFinal')
        : Number(venta.totalFinal) + suma('DEBITO', 'totalFinal') - suma('CREDITO', 'totalFinal') - retenido;
    const ivaPorCobrar = cxc.notaId
        ? suma('DEBITO', 'montoIva')
        : (Number(venta.montoIva) || 0) + suma('DEBITO', 'montoIva') - suma('CREDITO', 'montoIva') - retenido;
    const proporcionIva = total > 0 ? Math.max(0, ivaPorCobrar) / total : 0;
    const ivaUsd = r2(abonoUsd * proporcionIva);
    const ivaBs = r2(abonoBs * proporcionIva);
    const comun = {
        tipo: 'INGRESO', fecha, metodoPago: metodoPago || 'No especificado',
        referencia: referencia || `Abono CxC - Doc: ${venta.numeroDocumento}`,
        tasaBcvAplicada: tasaNum, ventaId: venta.id, abonoId: abono.id, pagoSmsId: pagoSms?.id ?? null,
    };

    const catCobranza = await categoria('Ingreso por Cobranza (CxC)', t);
    await MovimientoFinanciero.create({
        ...comun, montoUsd: r2(abonoUsd - ivaUsd), montoVes: r2(abonoBs - ivaBs),
        descripcion: `Abono a Cuenta por Cobrar - Venta ${venta.numeroDocumento}`, categoriaId: catCobranza.id,
    }, { transaction: t });

    if (ivaUsd > 0 || ivaBs > 0) {
        const catIva = await categoria('IVA Recaudado', t);
        await MovimientoFinanciero.create({
            ...comun, montoUsd: ivaUsd, montoVes: ivaBs,
            descripcion: `IVA del abono a Venta ${venta.numeroDocumento} (Impuesto SENIAT)`, categoriaId: catIva.id,
        }, { transaction: t });
    }

    return { abono, abonoUsd, abonoBs, saldoRestante: cxc.saldoPendiente, monedaCuenta: cxc.moneda, liquidada };
}
