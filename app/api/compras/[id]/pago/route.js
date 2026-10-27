import { NextResponse } from 'next/server';
import db from '@/models';
import { requerirNoVendedor } from '../../../_lib/acceso';
import { tasaVigente } from '../../../_lib/tasaBcv';
import { pagarCuenta, metodoValido, ErrorPago } from '../../../_lib/pagosCompra';

const { sequelize, FacturaCompra, CuentaPorPagar } = db;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Pago (total o parcial) de una compra a crédito: baja el saldo de su cuenta por pagar y asienta el egreso en caja.
export async function POST(request, { params }) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;

    const { id } = await params;
    if (!UUID_REGEX.test(id)) return NextResponse.json({ error: 'Compra no encontrada' }, { status: 404 });

    const t = await sequelize.transaction();
    try {
        const body = await request.json();
        const monto = Number(body.monto);
        const moneda = body.moneda === 'BS' ? 'BS' : body.moneda === 'USD' ? 'USD' : null;
        const metodoPago = metodoValido(body.metodoPago);
        const referencia = String(body.referencia || '').trim().slice(0, 60) || null;
        if (!(monto > 0)) throw new ErrorPago('El monto del pago debe ser mayor a 0');
        if (!moneda) throw new ErrorPago('Moneda del pago inválida');
        if (!metodoPago) throw new ErrorPago('Elige el método de pago');

        const factura = await FacturaCompra.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!factura) throw new ErrorPago('Compra no encontrada', 404);
        const cxp = await CuentaPorPagar.findOne({ where: { facturaCompraId: factura.id }, transaction: t, lock: t.LOCK.UPDATE });
        if (!cxp) throw new ErrorPago('Esta compra no tiene cuenta por pagar: se registró de contado', 409);

        // La tasa la pone el servidor (la de hoy). Sin tasa registrada solo se acepta un pago en la moneda de la cuenta.
        const tasa = await tasaVigente({ transaction: t }).catch(() => null);
        const r = await pagarCuenta({ factura, cxp, monto, moneda, metodoPago, referencia, tasa }, t);

        await t.commit();
        return NextResponse.json({ success: true, liquidada: r.liquidada, saldoRestante: r.saldoRestante, moneda: cxp.moneda });
    } catch (error) {
        if (!t.finished) await t.rollback();
        if (error instanceof ErrorPago) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('Pago de cuenta por pagar:', error);
        return NextResponse.json({ error: 'No se pudo registrar el pago' }, { status: 500 });
    }
}
