import { NextResponse } from 'next/server';
import { Producto, Categoria, Tag } from '@/models';

// GET: Listar todos los productos con su categoría y sus tags
export async function GET() {
    try {
        const productos = await Producto.findAll({
            include: [
                {
                    model: Categoria,
                    as: 'categoria',
                    attributes: ['id', 'nombre']
                },
                {
                    model: Tag,
                    as: 'tags',
                    attributes: ['id', 'nombre'],
                    through: { attributes: [] } // Oculta los campos de la tabla intermedia
                }
            ],
            order: [['createdAt', 'DESC']]
        });
        
        return NextResponse.json(productos, { status: 200 });
    } catch (error) {
        console.error("Error al obtener productos:", error);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}

// POST: Crear un nuevo producto y asociarle tags
export async function POST(req) {
    try {
        const body = await req.json();
        const { tags, ...productoData } = body; // Separamos los tags del resto de datos
        
        if (!productoData.nombre || !productoData.categoriaId || productoData.precio === undefined) {
            return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 });
        }

        // 1. Crear el producto
        const nuevoProducto = await Producto.create(productoData);

        // 2. Gestionar y asociar los tags si fueron enviados
        if (tags && Array.isArray(tags) && tags.length > 0) {
            const tagInstances = [];

            for (const tagInput of tags) {
                // Si el valor es numérico (ID existente) o texto (nuevo tag por crear)
                if (!isNaN(tagInput)) {
                    tagInstances.push(Number(tagInput));
                } else {
                    // Si el usuario escribió un tag nuevo que no estaba en la lista
                    const [tagCriado] = await Tag.findOrCreate({
                        where: { nombre: tagInput.trim() }
                    });
                    tagInstances.push(tagCriado.id);
                }
            }

            // Asociar los tags al producto usando Sequelize
            await nuevoProducto.setTags(tagInstances);
        }

        // Volver a consultar el producto con sus asociaciones para retornarlo completo
        const productoCompleto = await Producto.findByPk(nuevoProducto.id, {
            include: [
                { model: Categoria, as: 'categoria', attributes: ['id', 'nombre'] },
                { model: Tag, as: 'tags', attributes: ['id', 'nombre'], through: { attributes: [] } }
            ]
        });
        
        return NextResponse.json(productoCompleto, { status: 201 });
    } catch (error) {
        console.error("Error al crear producto:", error);
        if (error.name === 'SequelizeUniqueConstraintError') {
            return NextResponse.json({ error: 'Ya existe un producto con este nombre' }, { status: 409 });
        }
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}