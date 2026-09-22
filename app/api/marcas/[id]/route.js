import { NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { Marca } from '@/models';
import { requerirStaff } from '@/app/api/inventario/_lib';

const BLOB = process.env.NEXT_PUBLIC_BLOB_BASE_URL;

export async function PUT(req, { params }) {
    // Antes esta ruta no validaba sesión: cualquiera podía modificar datos.
    const { error: sinAcceso } = await requerirStaff();
    if (sinAcceso) return sinAcceso;

    try {
        const { id } = await params; // Next.js 15+ requiere await en params
        const { nombre, imagen } = await req.json();

        const marca = await Marca.findByPk(id);
        if (!marca) throw new Error('Marca no encontrada');
        const imagenAnterior = marca.imagen;

        // Actualizamos. Si no envían imagen nueva, mantenemos la que ya tenía.
        await marca.update({
            nombre: nombre.trim().toUpperCase(),
            imagen: imagen || marca.imagen
        });

        // El nombre del archivo es único: si se reemplazó, la foto anterior queda huérfana en el Blob si no se borra.
        if (imagen && imagenAnterior && imagenAnterior !== imagen) {
            try { await del(`${BLOB}/${imagenAnterior}`); } catch { /* ya no estaba */ }
        }

        return NextResponse.json({ message: 'Marca actualizada', marca }, { status: 200 });
    } catch (error) {
        console.error("Error al actualizar marca:", error);
        return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
    }
}

export async function DELETE(req, { params }) {
    // Antes esta ruta no validaba sesión: cualquiera podía modificar datos.
    const { error: sinAcceso } = await requerirStaff();
    if (sinAcceso) return sinAcceso;

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