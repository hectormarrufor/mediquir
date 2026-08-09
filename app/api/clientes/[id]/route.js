import { NextResponse } from 'next/server';
import { Cliente , Pedido} from '@/models';

// GET: Obtener un cliente específico
export async function GET(req, { params }) {
    try {
        const { id } = await params;
        const cliente = await Cliente.findByPk(id, {
            include: [
                { 
                    model: Pedido, 
                    as: 'pedidos', 
                    order: [['createdAt', 'DESC']], // Los más recientes primero
                    limit: 5 // Limitar a los últimos 5 pedidos
                }
            ]
        });

        if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });

        return NextResponse.json(cliente, { status: 200 });
    } catch (error) {
        console.log("Error al obtener cliente:", error.message);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}

// PUT: Actualizar un cliente existente
export async function PUT(req, { params }) {
    try {
        const { id } = await params;
        const body = await req.json();

        const cliente = await Cliente.findByPk(id);
        
        if (!cliente) {
            return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
        }

        await cliente.update(body);

        return NextResponse.json({ message: 'Cliente actualizado exitosamente', cliente }, { status: 200 });
    } catch (error) {
        console.error("Error al actualizar cliente:", error);
        
        if (error.name === 'SequelizeUniqueConstraintError') {
            return NextResponse.json({ error: 'La identificación o el correo ingresado ya pertenece a otro cliente' }, { status: 409 });
        }
        if (error.name === 'SequelizeValidationError') {
            const mensajes = error.errors.map(e => e.message).join(', ');
            return NextResponse.json({ error: mensajes }, { status: 400 });
        }

        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}

// DELETE: Eliminar un cliente
export async function DELETE(req, { params }) {
    try {
        const { id } = await params;
        const cliente = await Cliente.findByPk(id);

        if (!cliente) {
            return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
        }

        await cliente.destroy();

        return NextResponse.json({ message: 'Cliente eliminado exitosamente' }, { status: 200 });
    } catch (error) {
        console.error("Error al eliminar cliente:", error);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}