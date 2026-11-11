import { NextResponse } from 'next/server';
import sequelize from '@/sequelize';
import db from '@/models';
import { requerirAdmin } from '@/app/api/_lib/acceso';
import { ventasSinProducto, crearVariante, enlazarNombre, desenlazarNombre, ErrorVentasProducto } from '@/app/api/inventario/_ventasProducto';

export const dynamic = 'force-dynamic';
const { Marca } = db;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Renglones de venta escritos a mano (sin producto), agrupados por nombre con lo vendido: ?desde=2026-01-01&vista=enlazados
export async function GET(request) {
    const acceso = await requerirAdmin();
    if (acceso.error) return acceso.error;
    try {
        const p = new URL(request.url).searchParams;
        const desde = FECHA.test(p.get('desde') || '') ? p.get('desde') : null;
        const [filas, marcas] = await Promise.all([
            ventasSinProducto({ desde, enlazados: p.get('vista') === 'enlazados' }),
            Marca.findAll({ attributes: ['id', 'nombre'], order: [['nombre', 'ASC']], raw: true }),
        ]);
        return NextResponse.json({ desde, filas, marcas });
    } catch (error) {
        console.error('Ventas sin producto:', error);
        return NextResponse.json({ error: 'No se pudieron cargar los renglones sin producto' }, { status: 500 });
    }
}

// Enlaza un nombre a un producto: { nombre, productoId } o, creando la variante de otra marca, { nombre, crear: { baseId, marca } }
export async function POST(request) {
    const acceso = await requerirAdmin();
    if (acceso.error) return acceso.error;
    const t = await sequelize.transaction();
    try {
        const b = await request.json();
        const nombre = String(b.nombre || '').trim();
        if (!nombre) throw new ErrorVentasProducto('Falta el nombre del renglón');
        let productoId = Number(b.productoId) || null;
        let creado = null;
        if (b.crear) {
            creado = await crearVariante({ baseId: b.crear.baseId, marca: b.crear.marca, transaction: t });
            productoId = creado.id;
        }
        if (!productoId) throw new ErrorVentasProducto('Elige el producto');
        const r = await enlazarNombre({ nombre, productoId, transaction: t });
        await t.commit();
        return NextResponse.json({ ok: true, ...r, creado: creado ? { id: creado.id, codigo: creado.codigo } : null });
    } catch (error) {
        if (!t.finished) await t.rollback();
        if (error instanceof ErrorVentasProducto) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('Enlazar renglones sin producto:', error);
        return NextResponse.json({ error: 'No se pudo enlazar' }, { status: 500 });
    }
}

// Deshace un enlace: ?nombre=...&productoId=...
export async function DELETE(request) {
    const acceso = await requerirAdmin();
    if (acceso.error) return acceso.error;
    const t = await sequelize.transaction();
    try {
        const p = new URL(request.url).searchParams;
        const r = await desenlazarNombre({ nombre: String(p.get('nombre') || '').trim(), productoId: p.get('productoId'), transaction: t });
        await t.commit();
        return NextResponse.json({ ok: true, ...r });
    } catch (error) {
        if (!t.finished) await t.rollback();
        if (error instanceof ErrorVentasProducto) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('Desenlazar renglones:', error);
        return NextResponse.json({ error: 'No se pudo deshacer' }, { status: 500 });
    }
}
