import { NextResponse } from 'next/server';
import { Producto, Categoria } from '@/models';

// GET: Obtener un producto específico
export async function GET(req, { params }) {
    try {
        const { id } = await params;
        const producto = await Producto.findByPk(id, {
            include: [{ model: Categoria, as: 'categoria', attributes: ['id', 'nombre'] }]
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

// PUT: Actualizar un producto existente
export async function PUT(req, { params }) {
    try {
        const { id } = await params;
        const body = await req.json();

        const producto = await Producto.findByPk(id);
        
        if (!producto) {
            return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
        }

        await producto.update(body);

        return NextResponse.json({ message: 'Producto actualizado exitosamente', producto }, { status: 200 });
    } catch (error) {
        console.error("Error al actualizar producto:", error);
        if (error.name === 'SequelizeUniqueConstraintError') {
            return NextResponse.json({ error: 'Ya existe un producto con este nombre' }, { status: 409 });
        }
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}

// DELETE: Eliminar un producto
export async function DELETE(req, { params }) {
    try {
        const { id } = await params;
        const producto = await Producto.findByPk(id);

        if (!producto) {
            return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
        }

        await producto.destroy();

        return NextResponse.json({ message: 'Producto eliminado exitosamente' }, { status: 200 });
    } catch (error) {
        console.error("Error al eliminar producto:", error);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}