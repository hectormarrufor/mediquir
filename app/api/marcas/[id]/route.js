import { NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { Marca, Producto, sequelize } from '@/models';
import { requerirEditorInventario } from '@/app/api/inventario/_lib';
import { nombreRepetido } from '@/app/api/_lib/nombreRepetido';
import { borrarBlob } from '@/app/lib/blob';

const BLOB = process.env.NEXT_PUBLIC_BLOB_BASE_URL;

// PUT /api/marcas/:id   { nombre, imagen? }   (sin imagen nueva se queda el logo que tenía)
export async function PUT(req, { params }) {
    const { error: sinAcceso } = await requerirEditorInventario();
    if (sinAcceso) return sinAcceso;

    try {
        const { id } = await params; // Next.js 15+ requiere await en params
        const { nombre, imagen } = await req.json();
        const limpio = String(nombre || '').trim().replace(/\s+/g, ' ').toUpperCase();
        if (limpio.length < 2) return NextResponse.json({ error: 'El nombre de la marca debe tener al menos 2 letras' }, { status: 400 });

        const marca = await Marca.findByPk(id);
        if (!marca) return NextResponse.json({ error: 'Esa marca ya no existe' }, { status: 404 });
        const otra = await nombreRepetido(Marca, limpio, marca.id);
        if (otra) return NextResponse.json({ error: `Ya existe la marca "${otra.nombre}"` }, { status: 409 });
        const imagenAnterior = marca.imagen;

        await marca.update({ nombre: limpio, imagen: imagen || marca.imagen });

        // El nombre del archivo es único: si se reemplazó, la foto anterior queda huérfana en el Blob si no se borra.
        if (imagen && imagenAnterior && imagenAnterior !== imagen) {
            try { await del(`${BLOB}/${imagenAnterior}`); } catch { /* ya no estaba */ }
        }

        return NextResponse.json({ message: 'Marca actualizada', marca }, { status: 200 });
    } catch (error) {
        console.error("Error al actualizar marca:", error);
        return NextResponse.json({ error: 'No se pudo actualizar la marca' }, { status: 500 });
    }
}

// DELETE /api/marcas/:id?moverA=ID
// Si la marca la usan productos, hay que decir a qué marca pasarlos (sirve para unir marcas repetidas, p. ej. "3M" y "3 M"):
// se pasan y se borra, todo junto. Nunca quedan productos sin marca.
export async function DELETE(req, { params }) {
    const { error: sinAcceso } = await requerirEditorInventario();
    if (sinAcceso) return sinAcceso;

    const { id } = await params;
    const moverA = Number(new URL(req.url).searchParams.get('moverA')) || null;
    const t = await sequelize.transaction();
    try {
        const marca = await Marca.findByPk(id, { transaction: t });
        if (!marca) { await t.rollback(); return NextResponse.json({ error: 'Esa marca ya no existe' }, { status: 404 }); }
        if (moverA === marca.id) { await t.rollback(); return NextResponse.json({ error: 'Elige una marca distinta a la que vas a borrar' }, { status: 400 }); }

        const nProductos = await Producto.count({ where: { marcaId: marca.id }, transaction: t });
        let destino = null;
        if (nProductos) {
            if (!moverA) {
                await t.rollback();
                return NextResponse.json({ error: `"${marca.nombre}" la usan ${nProductos} producto(s): elige a qué marca pasarlos antes de borrarla`, nProductos }, { status: 409 });
            }
            destino = await Marca.findByPk(moverA, { transaction: t });
            if (!destino) { await t.rollback(); return NextResponse.json({ error: 'La marca a la que quieres pasar los productos ya no existe' }, { status: 400 }); }
            await Producto.update({ marcaId: destino.id }, { where: { marcaId: marca.id }, transaction: t });
        }

        const imagenMarca = marca.imagen;
        await marca.destroy({ transaction: t });
        await t.commit();
        await borrarBlob(imagenMarca);
        return NextResponse.json({
            message: destino ? `Marca "${marca.nombre}" borrada: ${nProductos} producto(s) pasaron a "${destino.nombre}"` : `Marca "${marca.nombre}" borrada`,
        }, { status: 200 });
    } catch (error) {
        await t.rollback().catch(() => {});
        console.error('Error al borrar marca:', error);
        return NextResponse.json({ error: 'No se pudo borrar la marca' }, { status: 500 });
    }
}
