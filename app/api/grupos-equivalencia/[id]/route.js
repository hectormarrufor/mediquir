import { NextResponse } from 'next/server';
import { Categoria, GrupoEquivalencia, Producto, sequelize } from '@/models';
import { requerirEditorInventario } from '@/app/api/inventario/_lib';
import { nombreRepetido } from '@/app/api/_lib/nombreRepetido';
import { borrarBlob, borrarSiReemplazado } from '@/app/lib/blob';

// PUT /api/grupos-equivalencia/:id   { nombre, stockMinimoGlobal, categoriaId, imagen? }
export async function PUT(req, { params }) {
    const { error: sinAcceso } = await requerirEditorInventario();
    if (sinAcceso) return sinAcceso;

    try {
        const { id } = await params;
        const { nombre, stockMinimoGlobal, categoriaId, imagen } = await req.json();
        const limpio = String(nombre || '').trim().replace(/\s+/g, ' ');
        if (limpio.length < 2) return NextResponse.json({ error: 'El nombre del grupo debe tener al menos 2 letras' }, { status: 400 });
        const minimo = Number(stockMinimoGlobal) || 0;
        if (minimo < 0 || !Number.isInteger(minimo)) return NextResponse.json({ error: 'El stock mínimo debe ser un número entero, 0 o más' }, { status: 400 });

        const grupo = await GrupoEquivalencia.findByPk(id);
        if (!grupo) return NextResponse.json({ error: 'Ese grupo ya no existe' }, { status: 404 });
        if (!(await Categoria.findByPk(Number(categoriaId), { attributes: ['id'] }))) {
            return NextResponse.json({ error: 'Elige la categoría del grupo' }, { status: 400 });
        }
        const otro = await nombreRepetido(GrupoEquivalencia, limpio, grupo.id);
        if (otro) return NextResponse.json({ error: `Ya existe el grupo "${otro.nombre}"` }, { status: 409 });
        const imagenAnterior = grupo.imagen;

        await grupo.update({ nombre: limpio, stockMinimoGlobal: minimo, categoriaId: Number(categoriaId), imagen: imagen || grupo.imagen });

        // El nombre del archivo es único: si se reemplazó, la foto anterior queda huérfana en el Blob si no se borra.
        await borrarSiReemplazado(imagenAnterior, imagen);

        return NextResponse.json({ message: 'Grupo actualizado', grupo }, { status: 200 });
    } catch (error) {
        console.error("Error al actualizar grupo:", error);
        return NextResponse.json({ error: 'No se pudo actualizar el grupo' }, { status: 500 });
    }
}

// DELETE /api/grupos-equivalencia/:id?moverA=ID   o   ?soltar=1
// Si el grupo tiene productos: se pasan a otro grupo (moverA) o quedan sueltos, sin grupo (soltar=1); luego se borra, todo junto.
export async function DELETE(req, { params }) {
    const { error: sinAcceso } = await requerirEditorInventario();
    if (sinAcceso) return sinAcceso;

    const { id } = await params;
    const sp = new URL(req.url).searchParams;
    const moverA = Number(sp.get('moverA')) || null;
    const soltar = sp.get('soltar') === '1';
    const t = await sequelize.transaction();
    try {
        const grupo = await GrupoEquivalencia.findByPk(id, { transaction: t });
        if (!grupo) { await t.rollback(); return NextResponse.json({ error: 'Ese grupo ya no existe' }, { status: 404 }); }
        if (moverA === grupo.id) { await t.rollback(); return NextResponse.json({ error: 'Elige un grupo distinto al que vas a borrar' }, { status: 400 }); }

        const nProductos = await Producto.count({ where: { grupoEquivalenciaId: grupo.id }, transaction: t });
        let destino = null;
        if (nProductos) {
            if (!moverA && !soltar) {
                await t.rollback();
                return NextResponse.json({ error: `"${grupo.nombre}" tiene ${nProductos} producto(s): elige si pasan a otro grupo o quedan sin grupo`, nProductos }, { status: 409 });
            }
            if (moverA) {
                destino = await GrupoEquivalencia.findByPk(moverA, { transaction: t });
                if (!destino) { await t.rollback(); return NextResponse.json({ error: 'El grupo al que quieres pasar los productos ya no existe' }, { status: 400 }); }
            }
            await Producto.update({ grupoEquivalenciaId: destino ? destino.id : null }, { where: { grupoEquivalenciaId: grupo.id }, transaction: t });
        }

        const imagenGrupo = grupo.imagen;
        await grupo.destroy({ transaction: t });
        await t.commit();
        await borrarBlob(imagenGrupo);
        return NextResponse.json({
            message: !nProductos ? `Grupo "${grupo.nombre}" borrado`
                : destino ? `Grupo "${grupo.nombre}" borrado: ${nProductos} producto(s) pasaron a "${destino.nombre}"`
                    : `Grupo "${grupo.nombre}" borrado: sus ${nProductos} producto(s) quedaron sin grupo`,
        }, { status: 200 });
    } catch (error) {
        await t.rollback().catch(() => {});
        console.error('Error al borrar grupo:', error);
        return NextResponse.json({ error: 'No se pudo borrar el grupo' }, { status: 500 });
    }
}
