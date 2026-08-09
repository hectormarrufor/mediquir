import { NextResponse } from 'next/server';
import { GrupoEquivalencia } from '@/models';

export async function PUT(req, { params }) {
    try {
        const { id } = await params;
        const { nombre, stockMinimoGlobal, categoriaId, imagen } = await req.json();

        const grupo = await GrupoEquivalencia.findByPk(id);
        if (!grupo) throw new Error('Grupo no encontrado');

        await grupo.update({
            nombre: nombre.trim(),
            stockMinimoGlobal: stockMinimoGlobal ? parseInt(stockMinimoGlobal) : 0,
            categoriaId: parseInt(categoriaId),
            imagen: imagen || grupo.imagen
        });

        return NextResponse.json({ message: 'Grupo actualizado', grupo }, { status: 200 });
    } catch (error) {
        console.error("Error al actualizar grupo:", error);
        return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
    }
}

export async function DELETE(req, { params }) {
    try {
        const { id } = await params;
        const grupo = await GrupoEquivalencia.findByPk(id);
        if (!grupo) throw new Error('Grupo no encontrado');

        await grupo.destroy();
        return NextResponse.json({ message: 'Grupo eliminado' }, { status: 200 });
    } catch (error) {
        return NextResponse.json({ error: 'No se puede eliminar porque tiene productos asociados' }, { status: 500 });
    }
}