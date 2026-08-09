import { NextResponse } from 'next/server';
import { Marca } from '@/models'; // Ajusta la ruta de importación si es necesario

// GET: Listar todas las marcas para el Select
export async function GET() {
    try {
        const marcas = await Marca.findAll({
            order: [['nombre', 'ASC']]
        });
        return NextResponse.json(marcas, { status: 200 });
    } catch (error) {
        console.error("Error al obtener marcas:", error);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}

// POST: Crear una marca al vuelo si no existe
export async function POST(req) {
    try {
        const { nombre, imagen } = await req.json();

        if (!nombre || nombre.trim() === '') {
            return NextResponse.json({ error: 'El nombre de la marca es obligatorio' }, { status: 400 });
        }

        // findOrCreate busca la marca; si no existe, la crea. Así evitamos errores de unicidad.
        const [marca, created] = await Marca.findOrCreate({
            where: { nombre: nombre.trim().toUpperCase() },
            defaults: { imagen: imagen || null } // Guardamos la imagen si es nueva
        });

        return NextResponse.json(marca, { status: created ? 201 : 200 });
    } catch (error) {
        console.error("Error al crear marca:", error);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}