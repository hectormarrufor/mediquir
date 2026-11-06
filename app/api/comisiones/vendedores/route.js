import { NextResponse } from 'next/server';
import db from '@/models';
import { requerirNoVendedor } from '../../_lib/acceso';

export const dynamic = 'force-dynamic';
const { VendedorComision } = db;

// Alta de un vendedor a comisión (no es nómina ni tiene acceso al sistema): { nombre, porcentaje }
export async function POST(request) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    try {
        const b = await request.json();
        const nombre = String(b.nombre || '').trim().slice(0, 120);
        if (nombre.length < 2) return NextResponse.json({ error: 'Escribe el nombre del vendedor' }, { status: 400 });
        const porcentaje = Number(b.porcentaje);
        if (!(porcentaje >= 0 && porcentaje <= 100)) return NextResponse.json({ error: 'El porcentaje debe estar entre 0 y 100' }, { status: 400 });
        if (await VendedorComision.findOne({ where: { nombre } })) return NextResponse.json({ error: 'Ya existe un vendedor con ese nombre' }, { status: 409 });
        const v = await VendedorComision.create({ nombre, porcentaje, notas: String(b.notas || '').trim() || null });
        return NextResponse.json({ ok: true, vendedor: v }, { status: 201 });
    } catch (error) {
        console.error('Alta de vendedor a comisión:', error);
        return NextResponse.json({ error: 'No se pudo registrar el vendedor' }, { status: 500 });
    }
}

// Cambia nombre, porcentaje por defecto, notas o si está activo: { id, ...campos }
export async function PATCH(request) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    try {
        const b = await request.json();
        const v = await VendedorComision.findByPk(Number(b.id));
        if (!v) return NextResponse.json({ error: 'Ese vendedor ya no existe' }, { status: 404 });
        const c = {};
        if (b.nombre !== undefined) { const n = String(b.nombre).trim().slice(0, 120); if (n.length < 2) return NextResponse.json({ error: 'Escribe el nombre del vendedor' }, { status: 400 }); c.nombre = n; }
        if (b.porcentaje !== undefined) { const p = Number(b.porcentaje); if (!(p >= 0 && p <= 100)) return NextResponse.json({ error: 'El porcentaje debe estar entre 0 y 100' }, { status: 400 }); c.porcentaje = p; }
        if (b.activo !== undefined) c.activo = Boolean(b.activo);
        if (b.notas !== undefined) c.notas = String(b.notas || '').trim() || null;
        await v.update(c);
        return NextResponse.json({ ok: true, vendedor: v });
    } catch (error) {
        if (error?.name === 'SequelizeUniqueConstraintError') return NextResponse.json({ error: 'Ya existe un vendedor con ese nombre' }, { status: 409 });
        console.error('Editar vendedor a comisión:', error);
        return NextResponse.json({ error: 'No se pudo guardar el cambio' }, { status: 500 });
    }
}
