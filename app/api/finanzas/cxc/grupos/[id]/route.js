import { NextResponse } from 'next/server';
import sequelize from '@/sequelize';
import { requerirNoVendedor } from '../../../../_lib/acceso';
import { ErrorCxc } from '../../../../_lib/cxc';

export const dynamic = 'force-dynamic';

// Renombra un grupo del libro de cobranza ({ nombre }) o lo borra. Borrar un grupo NO borra a sus clientes ni sus cuentas: solo quita la pestaña (los clientes siguen en «Todos»).
const leerId = async (params) => { const id = Number((await params).id); if (!Number.isInteger(id) || id <= 0) throw new ErrorCxc('Grupo no encontrado', 404); return id; };

export async function PATCH(request, { params }) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    try {
        const id = await leerId(params);
        const b = await request.json();
        const nombre = String(b.nombre || '').trim().slice(0, 80);
        if (nombre.length < 2) throw new ErrorCxc('Escribe el nombre del grupo');
        const otro = await sequelize.query(`SELECT id FROM "GruposCobranza" WHERE lower(nombre) = lower(:nombre) AND id <> :id`, { replacements: { nombre, id }, type: sequelize.QueryTypes.SELECT });
        if (otro.length) throw new ErrorCxc('Ya hay un grupo con ese nombre', 409);
        const [, meta] = await sequelize.query(`UPDATE "GruposCobranza" SET nombre = :nombre, "updatedAt" = now() WHERE id = :id`, { replacements: { nombre, id } });
        if (!meta?.rowCount) throw new ErrorCxc('Grupo no encontrado', 404);
        return NextResponse.json({ ok: true });
    } catch (error) {
        if (error instanceof ErrorCxc) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('Renombrar grupo de cobranza:', error);
        return NextResponse.json({ error: 'No se pudo guardar el grupo' }, { status: 500 });
    }
}

export async function DELETE(request, { params }) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    try {
        const id = await leerId(params);
        const [, meta] = await sequelize.query(`DELETE FROM "GruposCobranza" WHERE id = :id`, { replacements: { id } });
        if (!meta?.rowCount) throw new ErrorCxc('Grupo no encontrado', 404);
        return NextResponse.json({ ok: true });
    } catch (error) {
        if (error instanceof ErrorCxc) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('Borrar grupo de cobranza:', error);
        return NextResponse.json({ error: 'No se pudo borrar el grupo' }, { status: 500 });
    }
}
