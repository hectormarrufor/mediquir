import { NextResponse } from 'next/server';
import { Categoria } from '@/models';

// GET: Obtener todas las categorías
export async function GET() {
    try {
        const categorias = await Categoria.findAll({ order: [['nombre', 'ASC']] });
        return NextResponse.json(categorias, { status: 200 });
    } catch (error) {
        return NextResponse.json({ error: 'Error al obtener categorías' }, { status: 500 });
    }
}

// POST: Crear una nueva categoría
export async function POST(req) {
    try {
        const body = await req.json();
        
        if (!body.nombre || body.nombre.trim() === '') {
            return NextResponse.json({ error: 'El nombre de la categoría es obligatorio' }, { status: 400 });
        }

        const nuevaCategoria = await Categoria.create({
            nombre: body.nombre.trim(),
            descripcion: body.descripcion || null
        });
        
        return NextResponse.json(nuevaCategoria, { status: 201 });
    } catch (error) {
        console.error("Error al crear categoría:", error);
        if (error.name === 'SequelizeUniqueConstraintError') {
            return NextResponse.json({ error: 'Ya existe una categoría con ese nombre' }, { status: 409 });
        }
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}