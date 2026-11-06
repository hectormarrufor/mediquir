import { NextResponse } from 'next/server';
import sequelize from '@/sequelize';
import { requerirNoVendedor } from '../../../../../_lib/acceso';
import { guardarAbonosManual, leerManual, nuevoAbono, saldoManual } from '../../../../../_lib/cxcManual';
import { ErrorCxc } from '../../../../../_lib/cxc';

export const dynamic = 'force-dynamic';

// Registra un abono (baja la deuda) o un ajuste (la sube, monto negativo) de una cuenta manual: { fecha, monto, metodo, referencia, notas, tipo }
export async function POST(request, { params }) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    const t = await sequelize.transaction();
    try {
        const { id } = await params;
        const b = await request.json();
        const cuenta = await leerManual(id, t);
        const abono = nuevoAbono({ ...b, tipo: b.tipo === 'AJUSTE' ? 'AJUSTE' : 'ABONO' }, saldoManual(cuenta));
        const abonos = [...cuenta.abonos, abono].sort((a, c) => String(a.fecha).localeCompare(String(c.fecha)));
        await guardarAbonosManual(id, abonos, t);
        await t.commit();
        return NextResponse.json({ ok: true, abono, saldo: saldoManual({ ...cuenta, abonos }), estado: saldoManual({ ...cuenta, abonos }) <= 0.005 ? 'Pagado' : 'Pendiente' }, { status: 201 });
    } catch (error) {
        if (!t.finished) await t.rollback();
        if (error instanceof ErrorCxc) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('Abono de cuenta manual:', error);
        return NextResponse.json({ error: 'No se pudo registrar el abono' }, { status: 500 });
    }
}
