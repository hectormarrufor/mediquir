import { NextResponse } from 'next/server';
import { Producto, Categoria, Marca, GrupoEquivalencia, Tag } from '@/models';
import sequelize from '@/sequelize';

// =======================================================================
// GET: Obtener un producto específico con todas sus relaciones
// =======================================================================
export async function GET(req, { params }) {
    try {
        const { id } = await params;
        const producto = await Producto.findByPk(id, {
            include: [
                { model: Categoria, as: 'categoria', attributes: ['id', 'nombre'] },
                { model: Marca, as: 'marca', attributes: ['id', 'nombre', 'imagen'] },
                { model: GrupoEquivalencia, as: 'grupoEquivalencia', attributes: ['id', 'nombre', 'stockMinimoGlobal', 'imagen'] },
                { model: Tag, as: 'tags', attributes: ['id', 'nombre'], through: { attributes: [] } }
            ]
        });

        if (!producto) {
            return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
        }

        return NextResponse.json(producto, { status: 200 });
    } catch (error) {
        console.error("Error al obtener el producto:", error);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}



export async function PUT(req, { params }) {
    const t = await sequelize.transaction();
    try {
        const { id } = await params;
        const body = await req.json();
        const { tags, ...productData } = body;

        const producto = await Producto.findByPk(id, { transaction: t });
        if (!producto) throw new Error('Producto no encontrado');

        // 🔥 1. ACTUALIZACIÓN DINÁMICA (Tu idea brillante) 🔥
        // Sequelize es inteligente: si productData solo trae { stockAlmacen: 50 }, 
        // solo hará el UPDATE de esa columna y dejará el resto intacto.
        if (Object.keys(productData).length > 0) {
            await producto.update(productData, { transaction: t });
        }

        // 2. Sincronizamos las Etiquetas SÓLO si vienen explícitamente en el body
        if (tags !== undefined) {
            if (Array.isArray(tags) && tags.length > 0) {
                const tagInstances = await Promise.all(
                    tags.map(async (nombreTag) => {
                        const cleanName = nombreTag.trim().toLowerCase();
                        const [tag] = await Tag.findOrCreate({
                            where: { nombre: cleanName },
                            transaction: t
                        });
                        return tag;
                    })
                );
                await producto.setTags(tagInstances, { transaction: t });
            } else {
                // Solo si el frontend envía explícitamente un array vacío (tags: []) borramos todo
                await producto.setTags([], { transaction: t });
            }
        }

        await t.commit();
        return NextResponse.json({ message: 'Producto actualizado exitosamente', producto }, { status: 200 });

    } catch (error) {
        await t.rollback();
        if (error.name === 'SequelizeUniqueConstraintError') {
            return NextResponse.json({ error: 'Ya existe otro producto con ese Nombre o Código' }, { status: 400 });
        }
        console.error("Error al actualizar producto:", error);
        return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
    }
}

// =======================================================================
// DELETE: Eliminar el producto
// =======================================================================
export async function DELETE(req, { params }) {
    try {
        const { id } = await params;
        const producto = await Producto.findByPk(id);
        if (!producto) throw new Error('Producto no encontrado');

        await producto.destroy();
        return NextResponse.json({ message: 'Producto eliminado' }, { status: 200 });
    } catch (error) {
        console.error("Error al eliminar producto:", error);
        return NextResponse.json({ error: 'Error interno' }, { status: 500 });
    }
}