import { NextResponse } from 'next/server';
import { Categoria, GrupoEquivalencia, Producto, sequelize } from '@/models';
import { requerirEditorInventario } from '@/app/api/inventario/_lib';
import { nombreRepetido } from '@/app/api/_lib/nombreRepetido';

// PUT /api/categorias/:id   { nombre, descripcion }
export async function PUT(req, { params }) {
    const { error: sinAcceso } = await requerirEditorInventario();
    if (sinAcceso) return sinAcceso;

    try {
        const { id } = await params;
        const { nombre, descripcion } = await req.json();
        const limpio = String(nombre || '').trim().replace(/\s+/g, ' ');
        if (limpio.length < 2) return NextResponse.json({ error: 'El nombre de la categoría debe tener al menos 2 letras' }, { status: 400 });

        const categoria = await Categoria.findByPk(id);
        if (!categoria) return NextResponse.json({ error: 'Esa categoría ya no existe' }, { status: 404 });

        const otra = await nombreRepetido(Categoria, limpio, categoria.id);
        if (otra) return NextResponse.json({ error: `Ya existe la categoría "${otra.nombre}"` }, { status: 409 });

        await categoria.update({ nombre: limpio, descripcion: String(descripcion || '').trim() || null });
        return NextResponse.json({ message: 'Categoría actualizada', categoria });
    } catch (error) {
        console.error('Error al actualizar categoría:', error);
        return NextResponse.json({ error: 'No se pudo actualizar la categoría' }, { status: 500 });
    }
}

// DELETE /api/categorias/:id?moverA=ID
// Si la categoría la usan productos o grupos de equivalencia, hay que decir a qué categoría pasarlos (moverA):
// se pasan y se borra, todo junto (si algo falla no cambia nada). Nunca quedan productos sin categoría.
export async function DELETE(req, { params }) {
    const { error: sinAcceso } = await requerirEditorInventario();
    if (sinAcceso) return sinAcceso;

    const { id } = await params;
    const moverA = Number(new URL(req.url).searchParams.get('moverA')) || null;
    const t = await sequelize.transaction();
    try {
        const categoria = await Categoria.findByPk(id, { transaction: t });
        if (!categoria) { await t.rollback(); return NextResponse.json({ error: 'Esa categoría ya no existe' }, { status: 404 }); }
        if (moverA === categoria.id) { await t.rollback(); return NextResponse.json({ error: 'Elige una categoría distinta a la que vas a borrar' }, { status: 400 }); }

        const nProductos = await Producto.count({ where: { categoriaId: categoria.id }, transaction: t });
        const nGrupos = await GrupoEquivalencia.count({ where: { categoriaId: categoria.id }, transaction: t });

        let destino = null;
        if (nProductos || nGrupos) {
            if (!moverA) {
                await t.rollback();
                return NextResponse.json({ error: `"${categoria.nombre}" la usan ${nProductos} producto(s) y ${nGrupos} grupo(s): elige a qué categoría pasarlos antes de borrarla`, nProductos, nGrupos }, { status: 409 });
            }
            destino = await Categoria.findByPk(moverA, { transaction: t });
            if (!destino) { await t.rollback(); return NextResponse.json({ error: 'La categoría a la que quieres pasar los productos ya no existe' }, { status: 400 }); }
            await Producto.update({ categoriaId: destino.id }, { where: { categoriaId: categoria.id }, transaction: t });
            await GrupoEquivalencia.update({ categoriaId: destino.id }, { where: { categoriaId: categoria.id }, transaction: t });
        }

        await categoria.destroy({ transaction: t });
        await t.commit();
        return NextResponse.json({
            message: destino
                ? `Categoría "${categoria.nombre}" borrada: ${nProductos} producto(s) y ${nGrupos} grupo(s) pasaron a "${destino.nombre}"`
                : `Categoría "${categoria.nombre}" borrada`,
        });
    } catch (error) {
        await t.rollback().catch(() => {});
        console.error('Error al borrar categoría:', error);
        return NextResponse.json({ error: 'No se pudo borrar la categoría' }, { status: 500 });
    }
}
