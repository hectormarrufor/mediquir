import { NextResponse } from 'next/server';
import { Tag } from '@/models';

// GET: Listar todos los tags
export async function GET() {
    try {
        const tags = await Tag.findAll({ order: [['nombre', 'ASC']] });
        return NextResponse.json(tags, { status: 200 });
    } catch (error) {
        return NextResponse.json({ error: 'Error al obtener tags' }, { status: 500 });
    }
}

// POST: Crear un nuevo tag de manera independiente (opcional si lo manejas al vuelo)
export async function POST(req) {
    try {
        const body = await req.json();
        if (!body.nombre) {
            return NextResponse.json({ error: 'El nombre del tag es obligatorio' }, { status: 400 });
        }
        const [nuevoTag] = await Tag.findOrCreate({
            where: { nombre: body.nombre.trim() }
        });
        return NextResponse.json(nuevoTag, { status: 201 });
    } catch (error) {
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}