import { NextResponse } from 'next/server';
import { Pedido, PedidoRenglon, Cliente, Producto } from '@/models';

// GET: Obtener un pedido específico con TODO su detalle
export async function GET(req, { params }) {
    try {
        const { id } = await params;
        
        const pedido = await Pedido.findByPk(id, {
            include: [
                { 
                    model: Cliente, 
                    as: 'cliente' 
                },
                { 
                    model: PedidoRenglon, 
                    as: 'renglones',
                    include: [
                        { model: Producto, as: 'producto', attributes: ['id', 'nombre', 'codigo', 'imagen'] }
                    ]
                }
            ]
        });

        if (!pedido) {
            return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
        }

        return NextResponse.json(pedido, { status: 200 });
    } catch (error) {
        console.error("Error al obtener el detalle del pedido:", error);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}

// PUT: Actualizar datos administrativos del pedido (Ej. Fecha de retiro, quien retira o estatus logístico)
export async function PUT(req, { params }) {
    try {
        const { id } = await params;
        const body = await req.json();

        // Extraemos solo los campos que es seguro actualizar libremente
        const { quienRetira, fechaHoraRetiro, statusDespacho, costoFlete } = body;

        const pedido = await Pedido.findByPk(id);
        
        if (!pedido) {
            return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
        }

        // Si se modifica el flete, debemos recalcular el Total
        let nuevoTotal = parseFloat(pedido.total);
        if (costoFlete !== undefined && parseFloat(costoFlete) !== parseFloat(pedido.costoFlete)) {
            // Restamos el flete viejo y sumamos el nuevo
            nuevoTotal = nuevoTotal - parseFloat(pedido.costoFlete) + parseFloat(costoFlete);
        }

        await pedido.update({
            quienRetira: quienRetira !== undefined ? quienRetira : pedido.quienRetira,
            fechaHoraRetiro: fechaHoraRetiro !== undefined ? fechaHoraRetiro : pedido.fechaHoraRetiro,
            statusDespacho: statusDespacho !== undefined ? statusDespacho : pedido.statusDespacho,
            costoFlete: costoFlete !== undefined ? costoFlete : pedido.costoFlete,
            total: nuevoTotal
        });

        return NextResponse.json({ message: 'Pedido actualizado exitosamente', pedido }, { status: 200 });
    } catch (error) {
        console.error("Error al actualizar pedido:", error);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}

// DELETE: Anular o eliminar un pedido
export async function DELETE(req, { params }) {
    try {
        const { id } = await params;
        const pedido = await Pedido.findByPk(id);

        if (!pedido) {
            return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
        }

        // Al usar 'CASCADE' en la asociación, esto también borrará automáticamente sus PedidoRenglones
        await pedido.destroy();

        return NextResponse.json({ message: 'Pedido eliminado exitosamente' }, { status: 200 });
    } catch (error) {
        console.error("Error al eliminar pedido:", error);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}