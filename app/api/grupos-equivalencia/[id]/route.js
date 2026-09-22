import { NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { GrupoEquivalencia } from '@/models';
import { requerirStaff } from '@/app/api/inventario/_lib';

const BLOB = process.env.NEXT_PUBLIC_BLOB_BASE_URL;

export async function PUT(req, { params }) {
    // Antes esta ruta no validaba sesión: cualquiera podía modificar datos.
    const { error: sinAcceso } = await requerirStaff();
    if (sinAcceso) return sinAcceso;

    try {
        const { id } = await params;
        const { nombre, stockMinimoGlobal, categoriaId, imagen } = await req.json();

        const grupo = await GrupoEquivalencia.findByPk(id);
        if (!grupo) throw new Error('Grupo no encontrado');
        const imagenAnterior = grupo.imagen;

        await grupo.update({
            nombre: nombre.trim(),
            stockMinimoGlobal: stockMinimoGlobal ? parseInt(stockMinimoGlobal) : 0,
            categoriaId: parseInt(categoriaId),
            imagen: imagen || grupo.imagen
        });

        // El nombre del archivo es único: si se reemplazó, la foto anterior queda huérfana en el Blob si no se borra.
        if (imagen && imagenAnterior && imagenAnterior !== imagen) {
            try { await del(`${BLOB}/${imagenAnterior}`); } catch { /* ya no estaba */ }
        }

        return NextResponse.json({ message: 'Grupo actualizado', grupo }, { status: 200 });
    } catch (error) {
        console.error("Error al actualizar grupo:", error);
        return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
    }
}

export async function DELETE(req, { params }) {
    // Antes esta ruta no validaba sesión: cualquiera podía modificar datos.
    const { error: sinAcceso } = await requerirStaff();
    if (sinAcceso) return sinAcceso;

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