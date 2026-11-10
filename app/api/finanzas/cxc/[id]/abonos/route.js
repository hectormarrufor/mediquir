import { NextResponse } from 'next/server';
import db from '@/models';
import { avisarCliente } from '../../../../_lib/avisosCliente';
import { requerirNoVendedor } from '../../../../_lib/acceso';
import { ErrorCxc, registrarAbonoCxc } from '../../../../_lib/cxc';

export const dynamic = 'force-dynamic';
const { sequelize } = db;

// Registra un abono (baja la deuda) o un ajuste (la sube, con monto negativo) de una cuenta por cobrar:
// { fecha, monto, metodo, referencia, notas, tipo: 'ABONO' | 'AJUSTE' }
export async function POST(request, { params }) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    const t = await sequelize.transaction();
    try {
        const { id } = await params;
        const b = await request.json();
        const r = await registrarAbonoCxc({
            cuentaId: Number(id), fecha: b.fecha, monto: b.monto, metodo: b.metodo, referencia: b.referencia, notas: b.notas,
            tipo: b.tipo === 'AJUSTE' ? 'AJUSTE' : 'ABONO', retencion: Boolean(b.retencion), cierraFactura: Boolean(b.cierraFactura), transaction: t,
        });
        await t.commit();
        if (b.tipo !== 'AJUSTE' && Number(b.monto) > 0 && !/retenci|nota de cr/i.test(String(b.metodo || ''))) {
            try {
                const venta = await db.Venta.findByPk(r.cuenta.ventaId);
                if (venta?.tipoVenta === 'MAYOR') await avisarCliente(venta, 'PAGO_RECIBIDO', { abonoUsd: Number(r.abono.montoUsd), liquidada: Number(r.cuenta.saldoPendiente) <= 0.005, saldoRestante: Number(r.cuenta.saldoPendiente), monedaCuenta: r.cuenta.moneda, tasa: Number(venta.tasaCambio) });
            } catch (e) { console.error('No se pudo avisar el pago al cliente:', e.message); }
        }
        return NextResponse.json({ ok: true, abono: r.abono, saldo: Number(r.cuenta.saldoPendiente), estado: r.cuenta.estado, retencion: Boolean(r.retencion), quedaDebiendo: Boolean(b.cierraFactura) && Number(r.cuenta.saldoPendiente) > 0.005 }, { status: 201 });
    } catch (error) {
        if (!t.finished) await t.rollback();
        if (error instanceof ErrorCxc) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('Registrar abono:', error);
        return NextResponse.json({ error: 'No se pudo registrar el abono' }, { status: 500 });
    }
}
