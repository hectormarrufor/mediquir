import { NextResponse } from 'next/server';
import sequelize from '@/sequelize';
import { requerirStaff } from '../../inventario/_lib';

export const dynamic = 'force-dynamic';

let tablaLista = false;
async function asegurarTablaChoferes(transaction) {
    if (tablaLista) return;
    await sequelize.query(
        `CREATE TABLE IF NOT EXISTS "Choferes" (
            "id" SERIAL PRIMARY KEY,
            "nombre" VARCHAR(120) NOT NULL,
            "cedula" VARCHAR(30) NOT NULL UNIQUE,
            "empresa" VARCHAR(120) NOT NULL,
            "telefono" VARCHAR(40),
            "entregas" INTEGER NOT NULL DEFAULT 1,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
        { transaction }
    );
    tablaLista = true;
}

export async function guardarChoferFrecuente({ nombre, cedula, empresa, telefono = null }, transaction) {
    await asegurarTablaChoferes(transaction);
    const n = String(nombre ?? '').trim().replace(/\s+/g, ' ').slice(0, 120);
    const c = String(cedula ?? '').trim().toUpperCase().replace(/\s+/g, '').slice(0, 30);
    const emp = String(empresa ?? '').trim().replace(/\s+/g, ' ').slice(0, 120);
    const tel = telefono ? String(telefono).trim().slice(0, 40) : null;
    if (n.length < 3 || c.length < 5 || emp.length < 2) return null;

    const [fila] = await sequelize.query(
        `INSERT INTO "Choferes" ("nombre", "cedula", "empresa", "telefono", "entregas", "createdAt", "updatedAt")
         VALUES (:nombre, :cedula, :empresa, :telefono, 1, NOW(), NOW())
         ON CONFLICT ("cedula") DO UPDATE SET
            "nombre" = EXCLUDED."nombre",
            "empresa" = EXCLUDED."empresa",
            "telefono" = COALESCE(EXCLUDED."telefono", "Choferes"."telefono"),
            "entregas" = "Choferes"."entregas" + 1,
            "updatedAt" = NOW()
         RETURNING "id", "nombre", "cedula", "empresa", "telefono", "entregas"`,
        {
            replacements: { nombre: n, cedula: c, empresa: emp, telefono: tel },
            type: sequelize.QueryTypes.SELECT,
            transaction,
        }
    );
    return fila || null;
}

export async function GET() {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;

    try {
        await asegurarTablaChoferes();
        const choferes = await sequelize.query(
            `SELECT "id", "nombre", "cedula", "empresa", "telefono", "entregas"
             FROM "Choferes"
             ORDER BY "entregas" DESC, "nombre" ASC
             LIMIT 200`,
            { type: sequelize.QueryTypes.SELECT }
        );
        return NextResponse.json({ choferes });
    } catch (error) {
        console.error('Listar choferes:', error);
        return NextResponse.json({ error: 'No se pudo cargar la lista de choferes' }, { status: 500 });
    }
}

export async function POST(request) {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;

    try {
        const body = await request.json();
        const chofer = await guardarChoferFrecuente(body);
        if (!chofer) {
            return NextResponse.json({ error: 'Completa nombre, cédula y empresa o agencia del chofer' }, { status: 400 });
        }
        return NextResponse.json({ chofer });
    } catch (error) {
        console.error('Guardar chofer:', error);
        return NextResponse.json({ error: 'No se pudo guardar el chofer' }, { status: 500 });
    }
}

export async function DELETE(request) {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;

    try {
        await asegurarTablaChoferes();
        const id = Number(new URL(request.url).searchParams.get('id')) || 0;
        if (!id) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
        await sequelize.query(`DELETE FROM "Choferes" WHERE "id" = :id`, { replacements: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Eliminar chofer:', error);
        return NextResponse.json({ error: 'No se pudo eliminar el chofer' }, { status: 500 });
    }
}
