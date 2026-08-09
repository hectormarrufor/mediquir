import { NextResponse } from 'next/server';
import { Tag } from '@/models'; 

export async function GET() {
    try {
        const tags = await Tag.findAll({
            order: [['nombre', 'ASC']]
        });
        return NextResponse.json(tags, { status: 200 });
    } catch (error) {
        console.error("Error al obtener tags:", error);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        const { nombre } = await req.json();
        
        if (!nombre || nombre.trim() === '') {
            return NextResponse.json({ error: 'El nombre del tag es obligatorio' }, { status: 400 });
        }

        const [tag, created] = await Tag.findOrCreate({
            where: { nombre: nombre.trim().toLowerCase() } // Normalizamos a minúsculas para los tags (ej. "portátil")
        });

        return NextResponse.json(tag, { status: created ? 201 : 200 });
    } catch (error) {
        console.error("Error al crear tag:", error);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}