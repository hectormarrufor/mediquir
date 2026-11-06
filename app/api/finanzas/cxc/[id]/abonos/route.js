import { NextResponse } from 'next/server';
import db from '@/models';
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
            tipo: b.tipo === 'AJUSTE' ? 'AJUSTE' : 'ABONO', transaction: t,
        });
        await t.commit();
        return NextResponse.json({ ok: true, abono: r.abono, saldo: Number(r.cuenta.saldoPendiente), estado: r.cuenta.estado }, { status: 201 });
    } catch (error) {
        if (!t.finished) await t.rollback();
        if (error instanceof ErrorCxc) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('Registrar abono:', error);
        return NextResponse.json({ error: 'No se pudo registrar el abono' }, { status: 500 });
    }
}
