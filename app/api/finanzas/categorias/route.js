import { NextResponse } from 'next/server';
import { CategoriaFinanciera } from '@/models';

// GET: Listar todas las categorías (útil para los Selects del frontend)
export async function GET() {
    try {
        const categorias = await CategoriaFinanciera.findAll({
            order: [['tipo', 'ASC'], ['nombre', 'ASC']]
        });
        return NextResponse.json(categorias, { status: 200 });
    } catch (error) {
        console.error("Error al obtener categorías financieras:", error);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}

// POST: Crear una nueva categoría (Ej: Nómina, Papelería)
export async function POST(req) {
    try {
        const body = await req.json();
        
        if (!body.nombre || !body.tipo) {
            return NextResponse.json({ error: 'Faltan datos obligatorios' }, { status: 400 });
        }

        const nuevaCategoria = await CategoriaFinanciera.create(body);
        return NextResponse.json(nuevaCategoria, { status: 201 });
    } catch (error) {
        console.error("Error al crear categoría financiera:", error);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}