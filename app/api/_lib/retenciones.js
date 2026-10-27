import { Correlativo, FacturaCompra, Proveedor, RetencionIva, CuentaPorPagar } from '@/models';
import { ErrorNumeracion, ultimoUsado } from './numeracion.js';
import { aBolivares } from '@/app/constants/facturacion';
import { CONFIG_FISCAL } from '@/app/constants/empresa';
import { fechaCaracas } from '@/app/constants/hora';

const PREFIJO_COMPRAS = 'RET-COMPRA';
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export class ErrorRetencion extends Error {
    constructor(mensaje, status = 400) { super(mensaje); this.status = status; }
}

// Número de comprobante de retención que EMITE la empresa (retenciones de compras): año (4) + mes (2) + correlativo de 8 dígitos,
// como en el libro de compras de ejemplo (20260900000734). El correlativo continúa de un mes a otro; su valor inicial se ajusta
// en la tabla `correlativos` (prefijo RET-COMPRA) para empatar con el último comprobante que ya emitiste.
// OJO: el formato se copió de tu libro de ejemplo; confírmalo con tu contador.
export async function siguienteComprobante(fecha, transaction) {
    const corr = await Correlativo.findOne({ where: { prefijo: PREFIJO_COMPRAS }, transaction, lock: transaction.LOCK.UPDATE });
    // Ya se emitieron comprobantes antes del sistema: no se puede empezar en 1 sin preguntar (repetiría un número que existe)
    if (!corr || !corr.configurado) {
        throw new ErrorNumeracion('Antes de emitir retenciones indica con qué número empieza tu numeración de comprobantes de retención de IVA', 409, 'RETENCION_PENDIENTE');
    }
    // Nunca por debajo del mayor ya emitido
    const ultimo = await ultimoUsado(PREFIJO_COMPRAS, transaction);
    const numero = Math.max(corr.siguienteNumero, (ultimo || 0) + 1);
    corr.siguienteNumero = numero + 1;
    await corr.save({ transaction });
    const [anio, mes] = String(fecha).slice(0, 7).split('-');
    return `${anio}${mes}${String(numero).padStart(8, '0')}`;
}

/** El número que le tocaría al próximo comprobante fechado en `fecha` (sin tomarlo). */
export async function proximoComprobante(fecha) {
    const corr = await Correlativo.findOne({ where: { prefijo: PREFIJO_COMPRAS } });
    const ultimo = await ultimoUsado(PREFIJO_COMPRAS);
    const periodo = String(fecha).slice(0, 7).replace('-', '');
    const numero = Math.max(Number(corr?.siguienteNumero) || 1, (ultimo || 0) + 1);
    return {
        configurado: Boolean(corr?.configurado),
        siguiente: `${periodo}${String(numero).padStart(8, '0')}`,
        ultimo: ultimo === null ? null : String(ultimo).padStart(8, '0'),
    };
}

export const periodoDe = (fecha) => String(fecha).slice(0, 7);

// Montos de la factura en bolívares (el comprobante y el libro van en Bs): si la factura es en dólares, con SU tasa
const enBs = (factura, v) => (factura.moneda === 'BS' ? r2(v) : aBolivares(Number(v) || 0, Number(factura.tasaCambio) || 1));

/** % a retener: el elegido si es 75 o 100; si no, el del proveedor; si no, el de la empresa. */
export const porcentajeDe = (elegido, proveedor) => {
    if ([75, 100].includes(Number(elegido))) return Number(elegido);
    if ([75, 100].includes(Number(proveedor?.retencionIvaPorDefecto))) return Number(proveedor.retencionIvaPorDefecto);
    return CONFIG_FISCAL.porcentajeRetencionCompras;
};

/**
 * Retención de una factura (misma regla que WR): IVA en bolívares × %, redondeada a 2 decimales. Un comprobante de varias
 * facturas suma esas retenciones ya redondeadas, así cada columna cuadra al céntimo. `enMoneda`: lo retenido en la moneda de la factura.
 */
export function calcularRetencion(factura, pct) {
    const ivaBs = enBs(factura, factura.montoIva);
    const retenidoBs = r2(ivaBs * pct / 100);
    const tasa = Number(factura.tasaCambio) || 1;
    return {
        ivaBs, retenidoBs,
        baseBs: enBs(factura, Number(factura.subtotal) - Number(factura.montoExento || 0)),
        enMoneda: factura.moneda === 'BS' ? retenidoBs : r2(retenidoBs / tasa),
    };
}

// Fila de la retención de una factura (la misma forma para la que se emite y para la que queda pendiente)
function datosRetencion(factura, proveedor, pct, calc) {
    return {
        tipo: 'COMPRA', facturaAfectada: factura.numeroDocumento, numeroControlFactura: factura.numeroControl || null,
        contraparteRif: proveedor?.identificacion || null, contraparteNombre: proveedor?.nombre || null,
        baseImponible: calc.baseBs, alicuota: Number(factura.alicuotaIva) || 16, montoIva: calc.ivaBs,
        porcentajeRetencion: pct, ivaRetenido: calc.retenidoBs, tasaCambio: Number(factura.tasaCambio) || 1, facturaCompraId: factura.id,
    };
}

/**
 * Deja una factura de compra «Falta retener»: se guarda su retención calculada con el % del proveedor, SIN número de comprobante
 * (estado PENDIENTE, no entra al libro). Se completa con su número al pagarla o desde la lista de compras.
 */
export async function marcarRetencionPendiente(factura, proveedor, pct, registradoPorId, t) {
    const calc = calcularRetencion(factura, pct);
    const fecha = String(factura.fechaRecepcion || factura.fechaFactura).slice(0, 10);
    return RetencionIva.create({ ...datosRetencion(factura, proveedor, pct, calc), fecha, periodo: periodoDe(fecha), comprobante: null, estado: 'PENDIENTE', registradoPorId: registradoPorId || null }, { transaction: t });
}

/**
 * Retiene el IVA de una o varias facturas del MISMO proveedor en UN solo comprobante, con el siguiente número del correlativo.
 *  · Cada factura guarda su retención (una fila por factura con el mismo número: así sale en el libro de compras).
 *  · Lo que se le debe al proveedor baja en lo retenido: se le paga el total menos la retención.
 *  · fecha: la del comprobante (hoy por defecto, nunca futura); su año y mes encabezan el número.
 * Debe llamarse dentro de una transacción. Devuelve el comprobante, lo retenido y avisos para la persona.
 */
export async function retenerFacturas({ facturaIds, porcentaje, fecha, registradoPorId }, t) {
    const ids = [...new Set((facturaIds || []).map(String))];
    if (!ids.length) throw new ErrorRetencion('Elige al menos una factura');
    if (!CONFIG_FISCAL.agenteRetencionIva) throw new ErrorRetencion('La empresa no está configurada como agente de retención de IVA');
    const hoy = fechaCaracas();
    const fechaRet = fecha || hoy;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaRet)) throw new ErrorRetencion('Fecha del comprobante inválida');
    if (fechaRet > hoy) throw new ErrorRetencion('El comprobante no puede fecharse en el futuro');

    const facturas = await FacturaCompra.findAll({ where: { id: ids }, transaction: t, lock: t.LOCK.UPDATE });
    if (facturas.length !== ids.length) throw new ErrorRetencion('No se encontró alguna de las facturas', 404);
    if (new Set(facturas.map((f) => f.proveedorId)).size > 1) throw new ErrorRetencion('Un comprobante agrupa solo facturas de un mismo proveedor');
    const proveedor = await Proveedor.findByPk(facturas[0].proveedorId, { transaction: t });
    if (!String(proveedor?.identificacion || '').trim()) throw new ErrorRetencion('El proveedor no tiene RIF: complétalo en su ficha para poder emitir el comprobante');

    const previas = await RetencionIva.findAll({ where: { facturaCompraId: ids, tipo: 'COMPRA' }, transaction: t, lock: t.LOCK.UPDATE });
    for (const f of facturas) {
        if (f.tipoDocumento !== 'FACTURA') throw new ErrorRetencion(`${f.numeroDocumento} es una nota de entrega: no lleva retención`);
        if (!(Number(f.montoIva) > 0)) throw new ErrorRetencion(`La factura ${f.numeroDocumento} no tiene IVA: no hay nada que retener`);
        const emitida = previas.find((r) => r.facturaCompraId === f.id && r.comprobante);
        if (emitida) throw new ErrorRetencion(`La factura ${f.numeroDocumento} ya tiene su comprobante de retención (${emitida.comprobante})`, 409);
    }

    const pct = porcentajeDe(porcentaje, proveedor);
    const comprobante = await siguienteComprobante(fechaRet, t);
    const avisos = [];
    const detalle = [];
    // En el orden de las fechas de las facturas (así salen en el comprobante)
    facturas.sort((a, b) => String(a.fechaFactura).localeCompare(String(b.fechaFactura)) || String(a.numeroDocumento).localeCompare(String(b.numeroDocumento)));
    for (const f of facturas) {
        const calc = calcularRetencion(f, pct);
        const datos = { ...datosRetencion(f, proveedor, pct, calc), fecha: fechaRet, periodo: periodoDe(fechaRet), comprobante, estado: 'REGISTRADA', registradoPorId: registradoPorId || null };
        const pendiente = previas.find((r) => r.facturaCompraId === f.id && !r.comprobante);
        if (pendiente) await pendiente.update(datos, { transaction: t });
        else await RetencionIva.create(datos, { transaction: t });

        f.montoRetencion = calc.enMoneda;
        // Lo que se le debe al proveedor baja en lo retenido (en la moneda de su cuenta por pagar)
        const cxp = await CuentaPorPagar.findOne({ where: { facturaCompraId: f.id }, transaction: t, lock: t.LOCK.UPDATE });
        const saldo = Number(cxp?.saldoPendiente) || 0;
        if (cxp && saldo > 0.005) {
            const tasaCxp = Number(cxp.tasaCambio) || Number(f.tasaCambio) || 1;
            const rebaja = cxp.moneda === f.moneda ? calc.enMoneda : (cxp.moneda === 'BS' ? calc.retenidoBs : r2(calc.retenidoBs / tasaCxp));
            if (rebaja > saldo + 0.005) avisos.push(`A la factura ${f.numeroDocumento} solo le quedaban ${saldo.toFixed(2)} ${cxp.moneda} por pagar: el proveedor recibió de más ${r2(rebaja - saldo).toFixed(2)} ${cxp.moneda} de la retención. Descuéntalo del próximo pago o pídele el reintegro.`);
            cxp.montoTotal = r2(Number(cxp.montoTotal) - rebaja);
            cxp.saldoPendiente = Math.max(0, r2(saldo - rebaja));
            if (cxp.saldoPendiente <= 0.005) { cxp.saldoPendiente = 0; cxp.estado = 'Pagado'; f.statusPago = 'Pagado'; }
            await cxp.save({ transaction: t });
        } else {
            avisos.push(`La factura ${f.numeroDocumento} ya estaba pagada completa: el proveedor recibió también los Bs ${calc.retenidoBs.toFixed(2)} retenidos. Descuéntalos del próximo pago o pídele el reintegro.`);
        }
        await f.save({ transaction: t });
        detalle.push({ id: f.id, numero: f.numeroDocumento, retenidoBs: calc.retenidoBs });
    }
    return { comprobante, porcentaje: pct, fecha: fechaRet, totalBs: r2(detalle.reduce((a, d) => a + d.retenidoBs, 0)), facturas: detalle, avisos, proveedor: proveedor.nombre };
}
