import { NextResponse } from 'next/server';
import { requerirNoVendedor } from '@/app/api/_lib/acceso';
import { PagoSms, Venta, Cliente, CuentaPorCobrar, MovimientoFinanciero, CategoriaFinanciera, sequelize } from '@/models';
import { aBolivares, aDolares } from '@/app/constants/facturacion';
import { tasaVigente } from '@/app/api/_lib/tasaBcv';
import { registrarAbono, ErrorAbono } from '@/app/api/_lib/abonos';

export const dynamic = 'force-dynamic';

class ErrorNegocio extends Error {}

// Diferencia tolerada entre el pago y el total de la venta (Bs) antes de exigir confirmación
const TOLERANCIA_BS = 0.01;
// Un pago que supera el saldo de una cuenta por cobrar por menos de esto (USD) se toma como la liquidación (la tasa cambia)
const TOLERANCIA_SALDO_USD = 0.1;

const totalEnBs = (venta) => (venta.moneda === 'BS'
    ? Math.round(Number(venta.totalFinal) * 100) / 100
    : aBolivares(Number(venta.totalFinal), Number(venta.tasaCambio)));

// Lo que la venta espera en Bs: su total (contado) o su saldo pendiente (a crédito, donde un pago es un abono)
const esperadoEnBs = (venta, cxc, tasaHoy) => {
    if (!cxc) return totalEnBs(venta);
    const saldo = Number(cxc.saldoPendiente);
    return cxc.moneda === 'BS' ? saldo : aBolivares(saldo, tasaHoy);
};

// Ventas que siguen esperando su pago, para elegir a cuál pertenece el pago recibido
export async function GET(request, { params }) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    try {
        const { id } = await params;
        const pago = await PagoSms.findByPk(Number(id));
        if (!pago) return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 });

        const tasaHoy = await tasaVigente();
        const ventas = await Venta.findAll({
            where: { statusPago: 'Pendiente' },
            include: [
                { model: Cliente, as: 'cliente', attributes: ['nombre'], required: false },
                { model: CuentaPorCobrar, as: 'cuentaPorCobrar', attributes: ['saldoPendiente', 'moneda'], required: false },
            ],
            order: [['createdAt', 'DESC']],
            limit: 50,
        });
        const montoPago = Number(pago.monto);
        return NextResponse.json(ventas
            .filter((v) => v.statusDespacho !== 'Cancelado')
            .map((v) => {
                const cxc = v.cuentaPorCobrar?.[0] || null;
                const esperadoBs = esperadoEnBs(v, cxc, tasaHoy);
                // A crédito el pago suele ser un abono parcial: solo "coincide" si liquida el saldo (con margen por la tasa)
                const margen = cxc ? Math.max(TOLERANCIA_BS, esperadoBs * 0.01) : TOLERANCIA_BS;
                return {
                    id: v.id, numeroDocumento: v.numeroDocumento, cliente: v.cliente?.nombre || 'Cliente contado',
                    fecha: v.createdAt, totalUsd: Number(v.totalFinal), esperadoBs, esCredito: Boolean(cxc),
                    coincide: Math.abs(esperadoBs - montoPago) <= margen,
                };
            })
            // Primero las que coinciden en monto
            .sort((a, b) => Number(b.coincide) - Number(a.coincide)));
    } catch (error) {
        console.error('Error listando ventas para vincular pago:', error);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}

// Vincula a mano un pago recibido con una venta:
//  · venta de contado: queda pagada (igual que si el checkout lo hubiera conciliado)
//  · venta a crédito: el pago se registra como un abono a su cuenta por cobrar
export async function POST(request, { params }) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;

    const t = await sequelize.transaction();
    try {
        const { id } = await params;
        const { ventaId, confirmarDiferencia } = await request.json();

        const pago = await PagoSms.findByPk(Number(id), { transaction: t, lock: t.LOCK.UPDATE });
        if (!pago) throw new ErrorNegocio('Pago no encontrado');
        if (pago.procesado) throw new ErrorNegocio('Este pago ya está conciliado con una venta');

        const venta = await Venta.findByPk(String(ventaId), { transaction: t, lock: t.LOCK.UPDATE });
        if (!venta) throw new ErrorNegocio('Venta no encontrada');
        if (venta.statusPago !== 'Pendiente') throw new ErrorNegocio('Esa venta ya no está pendiente de pago');
        if (venta.statusDespacho === 'Cancelado') throw new ErrorNegocio('Esa venta está cancelada');

        const montoPago = Number(pago.monto);

        // ---- A crédito: el pago es un abono ----
        const cxc = await CuentaPorCobrar.findOne({ where: { ventaId: venta.id }, transaction: t });
        if (cxc) {
            const tasaHoy = await tasaVigente({ transaction: t });
            const r = await registrarAbono({
                venta, monto: montoPago, moneda: 'BS', tasa: tasaHoy, metodoPago: 'Pago Móvil', referencia: pago.referencia,
                pagoSms: pago, toleranciaUsd: TOLERANCIA_SALDO_USD, transaction: t,
            });
            await t.commit();
            return NextResponse.json({ success: true, numeroDocumento: venta.numeroDocumento, abono: true, saldoRestante: r.saldoRestante, liquidada: r.liquidada });
        }

        // ---- De contado: el pago debe cubrir el total ----
        const esperadoBs = totalEnBs(venta);
        const diferencia = Math.round((montoPago - esperadoBs) * 100) / 100;
        if (Math.abs(diferencia) > TOLERANCIA_BS && !confirmarDiferencia) {
            await t.rollback();
            return NextResponse.json({
                error: `El pago (Bs. ${montoPago.toFixed(2)}) no coincide con el total de la venta (Bs. ${esperadoBs.toFixed(2)})`,
                requiereConfirmacion: true, diferencia,
            }, { status: 409 });
        }

        pago.procesado = true;
        pago.ventaId = venta.id;
        await pago.save({ transaction: t });

        venta.statusPago = 'Pagado';
        await venta.save({ transaction: t });

        let cat = await CategoriaFinanciera.findOne({ where: { nombre: 'Ingresos por Ventas' }, transaction: t });
        if (!cat) cat = await CategoriaFinanciera.create({ nombre: 'Ingresos por Ventas', tipo: 'INGRESO' }, { transaction: t });

        await MovimientoFinanciero.create({
            tipo: 'INGRESO', fecha: new Date(), metodoPago: 'Pago Móvil', referencia: pago.referencia,
            montoUsd: aDolares(montoPago, Number(venta.tasaCambio)), tasaBcvAplicada: venta.tasaCambio, montoVes: montoPago,
            descripcion: `Ingreso por Venta ${venta.numeroDocumento} - Pago Móvil vinculado a mano (Banco: ${pago.banco || 'N/A'}, Ref: ${pago.referencia})`,
            categoriaId: cat.id, ventaId: venta.id, pagoSmsId: pago.id,
        }, { transaction: t });

        await t.commit();
        return NextResponse.json({ success: true, numeroDocumento: venta.numeroDocumento });
    } catch (error) {
        await t.rollback().catch(() => {});
        if (error instanceof ErrorNegocio) return NextResponse.json({ error: error.message }, { status: 400 });
        if (error instanceof ErrorAbono) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('Error vinculando pago con venta:', error);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}
