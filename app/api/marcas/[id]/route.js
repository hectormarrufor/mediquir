import { NextResponse } from 'next/server';
import { Marca } from '@/models';

export async function PUT(req, { params }) {
    try {
        const { id } = await params; // Next.js 15+ requiere await en params
        const { nombre, imagen } = await req.json();

        const marca = await Marca.findByPk(id);
        if (!marca) throw new Error('Marca no encontrada');

        // Actualizamos. Si no envían imagen nueva, mantenemos la que ya tenía.
        await marca.update({
            nombre: nombre.trim().toUpperCase(),
            imagen: imagen || marca.imagen 
        });

        return NextResponse.json({ message: 'Marca actualizada', marca }, { status: 200 });
    } catch (error) {
        console.error("Error al actualizar marca:", error);
        return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
    }
}

export async function DELETE(req, { params }) {
    try {
        const { id } = await params;
        const marca = await Marca.findByPk(id);
        if (!marca) throw new Error('Marca no encontrada');

        await marca.destroy();
        return NextResponse.json({ message: 'Marca eliminada' }, { status: 200 });
    } catch (error) {
        return NextResponse.json({ error: 'No se puede eliminar porque tiene productos asociados' }, { status: 500 });
    }
}