import { NextResponse } from 'next/server';
import sequelize from '@/sequelize';
import { requerirNoVendedor } from '../../../_lib/acceso';
import { ErrorCxc } from '../../../_lib/cxc';
import { listarGrupos } from '../../../_lib/cxcGrupos';

export const dynamic = 'force-dynamic';

// Grupos (pestañas) del libro de cobranza: cada uno con los clientes que la administradora le puso. Ver scripts/migraciones/cxc-grupos.cjs.
//   GET  → { grupos: [{ id, nombre, orden, clienteIds }], clientes: [{ id, nombre }] }   (clientes = los que tienen cuentas por cobrar: los que se pueden agregar a un grupo)
//   POST { nombre } → crea un grupo vacío al final

export async function GET() {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    try {
        const clientes = await sequelize.query(
            `SELECT DISTINCT c.id, c.nombre FROM "Clientes" c
              WHERE EXISTS (SELECT 1 FROM "CuentasPorCobrar" x WHERE x."clienteId" = c.id) OR EXISTS (SELECT 1 FROM "CuentasManuales" m WHERE m."clienteId" = c.id)
                 OR EXISTS (SELECT 1 FROM "GrupoCobranzaClientes" g WHERE g."clienteId" = c.id)
              ORDER BY c.nombre`,
            { type: sequelize.QueryTypes.SELECT },
        );
        return NextResponse.json({ grupos: await listarGrupos(), clientes });
    } catch (error) {
        console.error('Grupos de cobranza:', error);
        return NextResponse.json({ error: 'No se pudieron cargar los grupos' }, { status: 500 });
    }
}

export async function POST(request) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    try {
        const b = await request.json();
        const nombre = String(b.nombre || '').trim().slice(0, 80);
        if (nombre.length < 2) throw new ErrorCxc('Escribe el nombre del grupo');
        const existe = await sequelize.query(`SELECT id FROM "GruposCobranza" WHERE lower(nombre) = lower(:nombre)`, { replacements: { nombre }, type: sequelize.QueryTypes.SELECT });
        if (existe.length) throw new ErrorCxc('Ya hay un grupo con ese nombre', 409);
        const [[g]] = await sequelize.query(
            `INSERT INTO "GruposCobranza" (nombre, orden, "createdAt", "updatedAt") VALUES (:nombre, COALESCE((SELECT MAX(orden) FROM "GruposCobranza"), 0) + 1, now(), now()) RETURNING id`,
            { replacements: { nombre } },
        );
        return NextResponse.json({ ok: true, id: g.id }, { status: 201 });
    } catch (error) {
        if (error instanceof ErrorCxc) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('Crear grupo de cobranza:', error);
        return NextResponse.json({ error: 'No se pudo crear el grupo' }, { status: 500 });
    }
}
