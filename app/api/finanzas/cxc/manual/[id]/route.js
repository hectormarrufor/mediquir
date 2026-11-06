import { NextResponse } from 'next/server';
import sequelize from '@/sequelize';
import { requerirNoVendedor } from '../../../../_lib/acceso';
import { leerManual, r2 } from '../../../../_lib/cxcManual';
import { ErrorCxc, FECHA } from '../../../../_lib/cxc';

export const dynamic = 'force-dynamic';

// Edita una cuenta manual: concepto, a quién, fecha, vencimiento, observación y, con su motivo, el monto (la deuda se baja o se sube con abonos y ajustes)
export async function PATCH(request, { params }) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    const t = await sequelize.transaction();
    try {
        const { id } = await params;
        const b = await request.json();
        const cuenta = await leerManual(id, t);
        const c = {};
        const tiene = (k) => Object.prototype.hasOwnProperty.call(b, k);
        if (tiene('fechaVencimiento') || tiene('vence')) {
            const v = b.fechaVencimiento ?? b.vence;
            if (!FECHA.test(String(v || ''))) throw new ErrorCxc('La fecha de vencimiento no es válida');
            c.vence = v;
        }
        if (tiene('fecha')) { if (!FECHA.test(String(b.fecha || ''))) throw new ErrorCxc('La fecha no es válida'); c.fecha = b.fecha; }
        if (tiene('observacion')) c.observacion = String(b.observacion || '').trim().slice(0, 500) || null;
        if (tiene('concepto')) c.concepto = String(b.concepto || '').trim().slice(0, 120) || 'DEUDA';
        if (tiene('clienteTexto')) { const n = String(b.clienteTexto || '').trim().slice(0, 200); if (n.length < 2) throw new ErrorCxc('Escribe a quién se le cobra'); c.clienteTexto = n; }
        const nuevoMonto = tiene('montoTotal') ? b.montoTotal : (tiene('montoUsd') ? b.montoUsd : undefined);
        if (nuevoMonto !== undefined) {
            const nuevo = r2(nuevoMonto);
            if (!(nuevo > 0)) throw new ErrorCxc('El monto debe ser mayor a 0');
            const motivo = String(b.motivo || '').trim();
            if (motivo.length < 5) throw new ErrorCxc('Explica por qué cambia el monto (mínimo 5 caracteres)');
            if (Math.abs(nuevo - Number(cuenta.montoUsd)) > 0.004) {
                c.montoUsd = nuevo;
                c.observacion = [c.observacion ?? cuenta.observacion, `[Monto corregido de ${Number(cuenta.montoUsd).toFixed(2)} a ${nuevo.toFixed(2)}: ${motivo}]`].filter(Boolean).join(' ').slice(0, 500);
            }
        }
        const llaves = Object.keys(c);
        if (llaves.length) {
            await sequelize.query(`UPDATE "CuentasManuales" SET ${llaves.map((k) => `"${k}" = :${k}`).join(', ')}, "updatedAt" = now() WHERE id = :id`, { replacements: { ...c, id: Number(id) }, transaction: t });
        }
        await t.commit();
        return NextResponse.json({ ok: true });
    } catch (error) {
        if (!t.finished) await t.rollback();
        if (error instanceof ErrorCxc) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('Editar cuenta manual:', error);
        return NextResponse.json({ error: 'No se pudo guardar el cambio' }, { status: 500 });
    }
}

// Borra una cuenta manual creada por error (solo si no tiene abonos: con abonos ya es historia de cobranza)
export async function DELETE(request, { params }) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    try {
        const { id } = await params;
        const cuenta = await leerManual(id);
        if (cuenta.abonos.length) throw new ErrorCxc('Esta cuenta ya tiene abonos: no se puede borrar', 409);
        await sequelize.query(`DELETE FROM "CuentasManuales" WHERE id = :id`, { replacements: { id: Number(id) } });
        return NextResponse.json({ ok: true });
    } catch (error) {
        if (error instanceof ErrorCxc) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('Borrar cuenta manual:', error);
        return NextResponse.json({ error: 'No se pudo borrar la cuenta' }, { status: 500 });
    }
}
