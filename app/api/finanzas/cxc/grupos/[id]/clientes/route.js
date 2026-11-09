import { NextResponse } from 'next/server';
import sequelize from '@/sequelize';
import { requerirNoVendedor } from '../../../../../_lib/acceso';
import { ErrorCxc } from '../../../../../_lib/cxc';

export const dynamic = 'force-dynamic';

// Agrega o quita clientes de un grupo del libro de cobranza: { agregar: [clienteId], quitar: [clienteId] }. Un cliente puede estar en varios grupos; quitarlo de un grupo no toca sus cuentas.
export async function PUT(request, { params }) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    const t = await sequelize.transaction();
    try {
        const id = Number((await params).id);
        if (!Number.isInteger(id) || id <= 0) throw new ErrorCxc('Grupo no encontrado', 404);
        const b = await request.json();
        const ids = (v) => [...new Set((Array.isArray(v) ? v : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
        const agregar = ids(b.agregar), quitar = ids(b.quitar);
        const [g] = await sequelize.query(`SELECT id FROM "GruposCobranza" WHERE id = :id`, { replacements: { id }, type: sequelize.QueryTypes.SELECT, transaction: t });
        if (!g) throw new ErrorCxc('Grupo no encontrado', 404);
        if (agregar.length) {
            const validos = await sequelize.query(`SELECT id FROM "Clientes" WHERE id IN (:agregar)`, { replacements: { agregar }, type: sequelize.QueryTypes.SELECT, transaction: t });
            if (validos.length !== agregar.length) throw new ErrorCxc('Alguno de los clientes ya no existe');
            for (const clienteId of agregar) {
                await sequelize.query(`INSERT INTO "GrupoCobranzaClientes" ("grupoId", "clienteId", "createdAt") VALUES (:id, :clienteId, now()) ON CONFLICT DO NOTHING`, { replacements: { id, clienteId }, transaction: t });
            }
        }
        if (quitar.length) await sequelize.query(`DELETE FROM "GrupoCobranzaClientes" WHERE "grupoId" = :id AND "clienteId" IN (:quitar)`, { replacements: { id, quitar }, transaction: t });
        await t.commit();
        return NextResponse.json({ ok: true, agregados: agregar.length, quitados: quitar.length });
    } catch (error) {
        if (!t.finished) await t.rollback();
        if (error instanceof ErrorCxc) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('Clientes de un grupo de cobranza:', error);
        return NextResponse.json({ error: 'No se pudieron guardar los clientes del grupo' }, { status: 500 });
    }
}
