import { NextResponse } from 'next/server';
import sequelize from '@/sequelize';
import { requerirNoVendedor } from '../../../../../../_lib/acceso';
import { guardarAbonosManual, leerManual, r2, validarFecha } from '../../../../../../_lib/cxcManual';
import { ErrorCxc } from '../../../../../../_lib/cxc';

export const dynamic = 'force-dynamic';

// Corrige un abono de una cuenta manual
export async function PUT(request, { params }) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    const t = await sequelize.transaction();
    try {
        const { id, abonoId } = await params;
        const b = await request.json();
        const cuenta = await leerManual(id, t);
        const i = cuenta.abonos.findIndex((a) => a.id === abonoId);
        if (i < 0) throw new ErrorCxc('Ese abono ya no existe', 404);
        const a = { ...cuenta.abonos[i] };
        if (b.fecha !== undefined) a.fecha = validarFecha(b.fecha);
        if (b.monto !== undefined) { const m = r2(b.monto); if (!Number.isFinite(m) || m === 0) throw new ErrorCxc('El monto debe ser distinto de cero'); a.monto = m; }
        if (b.metodo !== undefined) a.metodo = String(b.metodo || '').trim().slice(0, 60) || a.metodo;
        if (b.referencia !== undefined) a.referencia = String(b.referencia || '').trim().slice(0, 100) || null;
        if (b.notas !== undefined) a.notas = String(b.notas || '').trim().slice(0, 250) || null;
        const abonos = cuenta.abonos.map((x, k) => (k === i ? a : x));
        await guardarAbonosManual(id, abonos, t);
        await t.commit();
        return NextResponse.json({ ok: true });
    } catch (error) {
        if (!t.finished) await t.rollback();
        if (error instanceof ErrorCxc) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('Corregir abono manual:', error);
        return NextResponse.json({ error: 'No se pudo corregir el abono' }, { status: 500 });
    }
}

export async function DELETE(request, { params }) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    const t = await sequelize.transaction();
    try {
        const { id, abonoId } = await params;
        const cuenta = await leerManual(id, t);
        if (!cuenta.abonos.some((a) => a.id === abonoId)) throw new ErrorCxc('Ese abono ya no existe', 404);
        await guardarAbonosManual(id, cuenta.abonos.filter((a) => a.id !== abonoId), t);
        await t.commit();
        return NextResponse.json({ ok: true });
    } catch (error) {
        if (!t.finished) await t.rollback();
        if (error instanceof ErrorCxc) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('Borrar abono manual:', error);
        return NextResponse.json({ error: 'No se pudo borrar el abono' }, { status: 500 });
    }
}
