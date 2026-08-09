import { NextResponse } from 'next/server';
import { GrupoEquivalencia, Categoria } from '@/models'; 

// GET: Listar todos los grupos con su categoría
export async function GET() {
    try {
        const grupos = await GrupoEquivalencia.findAll({
            include: [{ model: Categoria, as: 'categoria', attributes: ['id', 'nombre'] }],
            order: [['nombre', 'ASC']]
        });
        return NextResponse.json(grupos, { status: 200 });
    } catch (error) {
        console.error("Error al obtener grupos de equivalencia:", error);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}

// POST: Crear un nuevo grupo con imagen y categoría
export async function POST(req) {
    try {
        const { nombre, stockMinimoGlobal, categoriaId, imagen } = await req.json();
        
        if (!nombre || nombre.trim() === '') {
            return NextResponse.json({ error: 'El nombre del grupo es obligatorio' }, { status: 400 });
        }
        if (!categoriaId) {
            return NextResponse.json({ error: 'Debe heredar una categoría válida' }, { status: 400 });
        }

        const nuevoGrupo = await GrupoEquivalencia.create({
            nombre: nombre.trim(),
            stockMinimoGlobal: stockMinimoGlobal ? parseInt(stockMinimoGlobal) : 0,
            categoriaId: parseInt(categoriaId),
            imagen: imagen || null // Guardamos la url de la imagen si existe
        });

        return NextResponse.json(nuevoGrupo, { status: 201 });
    } catch (error) {
        console.error("Error al crear grupo de equivalencia:", error);
        return NextResponse.json({ error: error.message || 'Error interno del servidor' }, { status: 500 });
    }
}