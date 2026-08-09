import { NextResponse } from 'next/server';
import { Pedido, PedidoRenglon, Producto, SalidaInventario } from '@/models';
import sequelize from '@/sequelize';

export async function POST(req, { params }) {
    const t = await sequelize.transaction();

    try {
        const { id } = await params;
        const body = await req.json();
        
        // Recibimos un arreglo con las cantidades a despachar hoy y datos logísticos actualizados
        const { despachos, quienRetira, fechaHoraRetiro } = body; 

        const pedido = await Pedido.findByPk(id, {
            include: [{ model: PedidoRenglon, as: 'renglones' }],
            transaction: t
        });

        if (!pedido) throw new Error('Pedido no encontrado');
        if (pedido.statusDespacho === 'Completado' || pedido.statusDespacho === 'Cancelado') {
            throw new Error(`El pedido ya está ${pedido.statusDespacho}`);
        }

        let totalSolicitado = 0;
        let totalDespachadoHistorico = 0;

        // Procesamos cada renglón enviado desde el frontend
        for (const [renglonId, cantidadADespachar] of Object.entries(despachos)) {
            const cantidad = parseInt(cantidadADespachar, 10);
            if (cantidad <= 0) continue; // Si mandó 0, lo ignoramos

            const renglon = pedido.renglones.find(r => r.id.toString() === renglonId);
            if (!renglon) throw new Error(`Renglón ${renglonId} no pertenece a este pedido`);

            const pendientePorDespachar = renglon.cantidadSolicitada - renglon.cantidadDespachada;
            if (cantidad > pendientePorDespachar) {
                throw new Error(`Estás intentando despachar más de lo pendiente en un producto`);
            }

            // Descontamos del inventario real
            const producto = await Producto.findByPk(renglon.productoId, { transaction: t });
            if (producto.stockAlmacen < cantidad) {
                throw new Error(`Stock insuficiente para el producto: ${producto.nombre}`);
            }

            // 1. Restar stock
            await producto.update({
                stockAlmacen: parseFloat(producto.stockAlmacen) - cantidad
            }, { transaction: t });

            // 2. Registrar la salida en el historial de inventario
            await SalidaInventario.create({
                productoId: producto.id,
                cantidad: cantidad,
                motivo: `Despacho de Pedido #${pedido.id}`,
                fecha: new Date(),
                // Aquí podrías agregar el usuario que hizo el despacho si lo pasas en el body
            }, { transaction: t });

            // 3. Actualizar lo despachado en el renglón
            await renglon.update({
                cantidadDespachada: renglon.cantidadDespachada + cantidad
            }, { transaction: t });
        }

        // Recalcular el estatus global del pedido leyendo de nuevo los renglones actualizados
        const renglonesActualizados = await PedidoRenglon.findAll({
            where: { pedidoId: pedido.id },
            transaction: t
        });

        for (const r of renglonesActualizados) {
            totalSolicitado += r.cantidadSolicitada;
            totalDespachadoHistorico += r.cantidadDespachada;
        }

        // Si ya se entregó todo es Completado, si no, es Parcial
        const nuevoStatus = totalDespachadoHistorico >= totalSolicitado ? 'Completado' : 'Parcial';

        // 4. Actualizar Cabecera del Pedido
        await pedido.update({
            statusDespacho: nuevoStatus,
            quienRetira: quienRetira || pedido.quienRetira,
            fechaHoraRetiro: fechaHoraRetiro || pedido.fechaHoraRetiro
        }, { transaction: t });

        await t.commit();
        return NextResponse.json({ message: 'Despacho procesado exitosamente', status: nuevoStatus }, { status: 200 });

    } catch (error) {
        await t.rollback();
        console.error("Error al procesar despacho:", error);
        return NextResponse.json({ error: error.message || 'Error interno del servidor' }, { status: 500 });
    }
}