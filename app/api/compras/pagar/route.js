import { NextResponse } from 'next/server';
import db from '@/models';
import { requerirNoVendedor } from '../../_lib/acceso';
import { tasaVigente, tasaDelDia } from '../../_lib/tasaBcv';
import { retenerFacturas, ErrorRetencion } from '../../_lib/retenciones';
import { ErrorNumeracion } from '../../_lib/numeracion';
import { pagarCuenta, metodoValido, referenciaDePago, fechaDePago, ErrorPago } from '../../_lib/pagosCompra';
import { fechaCaracas } from '@/app/constants/hora';

export const dynamic = 'force-dynamic';

const { sequelize, FacturaCompra, CuentaPorPagar, RetencionIva } = db;
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * «Pagar y retener»: en un solo paso, para una o varias facturas de un MISMO proveedor,
 *  1. emite UN comprobante de retención (siguiente número) para las que tienen IVA y todavía no lo tienen (si retener = true), y
 *  2. paga completo lo que queda de cada una (total menos la retención), con el mismo método y referencia.
 * Todo o nada: si algo falla no queda ni el comprobante ni los pagos.
 * Body: { facturaIds, retener, porcentaje?, fecha? (del comprobante), metodoPago, referencia?, fechaPago?, sinComprobante? }
 * sinComprobante: ya se pagó pero quien pagó no entregó el comprobante; queda dicho en la referencia y quién lo marcó.
 */
export async function POST(request) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    const t = await sequelize.transaction();
    try {
        const body = await request.json();
        const ids = [...new Set((body.facturaIds || []).map(String))];
        const metodoPago = metodoValido(body.metodoPago);
        const referencia = referenciaDePago({ referencia: body.referencia, sinComprobante: body.sinComprobante, sesion: acceso.sesion });
        const fechaPago = fechaDePago(body.fechaPago);
        if (!ids.length) throw new ErrorPago('Elige al menos una factura');
        if (!metodoPago) throw new ErrorPago('Elige cómo se pagó');

        const facturas = await FacturaCompra.findAll({ where: { id: ids }, attributes: ['id', 'proveedorId', 'tipoDocumento', 'montoIva'], transaction: t });
        if (facturas.length !== ids.length) throw new ErrorPago('No se encontró alguna de las facturas', 404);
        if (new Set(facturas.map((f) => f.proveedorId)).size > 1) throw new ErrorPago('Se pagan juntas solo facturas de un mismo proveedor');

        // 1. Retención de las que todavía no tienen comprobante
        let retencion = null;
        if (body.retener) {
            const emitidas = new Set((await RetencionIva.findAll({ where: { facturaCompraId: ids, tipo: 'COMPRA' }, attributes: ['facturaCompraId', 'comprobante'], transaction: t }))
                .filter((r) => r.comprobante).map((r) => r.facturaCompraId));
            const porRetener = facturas.filter((f) => f.tipoDocumento === 'FACTURA' && Number(f.montoIva) > 0 && !emitidas.has(f.id)).map((f) => f.id);
            if (porRetener.length) retencion = await retenerFacturas({ facturaIds: porRetener, porcentaje: body.porcentaje, fecha: body.fecha, registradoPorId: Number(acceso.sesion?.id) || null }, t);
        }

        // 2. Pago completo de lo que queda de cada una, en la moneda de su cuenta
        const tasa = (fechaPago < fechaCaracas() ? await tasaDelDia(fechaPago, { transaction: t }) : null) || await tasaVigente({ transaction: t }).catch(() => null);
        const pagos = [];
        for (const id of ids) {
            const factura = await FacturaCompra.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
            const cxp = await CuentaPorPagar.findOne({ where: { facturaCompraId: id }, transaction: t, lock: t.LOCK.UPDATE });
            const saldo = Number(cxp?.saldoPendiente) || 0;
            if (!cxp || cxp.estado === 'Pagado' || !(saldo > 0.005)) continue;
            const r = await pagarCuenta({ factura, cxp, monto: saldo, moneda: cxp.moneda, metodoPago, referencia, tasa, fecha: fechaPago }, t);
            pagos.push({ numero: factura.numeroDocumento, moneda: cxp.moneda, monto: saldo, montoUsd: r.montoUsd, montoBs: r.montoBs });
        }
        if (!pagos.length && !retencion) throw new ErrorPago('Esas facturas ya están pagadas y no tienen nada que retener', 409);

        await t.commit();
        return NextResponse.json({
            success: true, retencion, pagos,
            totalUsd: r2(pagos.reduce((a, p) => a + p.montoUsd, 0)), totalBs: r2(pagos.reduce((a, p) => a + p.montoBs, 0)),
            avisos: retencion?.avisos || [],
        });
    } catch (error) {
        if (!t.finished) await t.rollback();
        if (error instanceof ErrorPago || error instanceof ErrorRetencion || error instanceof ErrorNumeracion) {
            return NextResponse.json({ error: error.message, codigo: error.codigo || null }, { status: error.status || 400 });
        }
        console.error('Pagar y retener:', error);
        return NextResponse.json({ error: 'No se pudo registrar el pago' }, { status: 500 });
    }
}
