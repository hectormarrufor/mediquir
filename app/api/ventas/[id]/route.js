import { NextResponse } from 'next/server';
import db from '@/models/index'; 
const { sequelize } = db;

export async function DELETE(request, { params }) {
    const t = await sequelize.transaction();

    try {
        const { id } = await params; // ID de la venta a eliminar

        // 1. Buscar la venta que se quiere eliminar
        const ventaAMatar = await db.Venta.findByPk(id, {
            include: [{ model: db.VentaDetalle, as: 'detalles' }],
            transaction: t
        });

        if (!ventaAMatar) {
            await t.rollback();
            return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 });
        }

        // 2. 🔥 LA REGLA DE ORO: Verificar si es ESTRICTAMENTE LA ÚLTIMA VENTA registrada
        const ultimaVenta = await db.Venta.findOne({
            order: [['createdAt', 'DESC']],
            transaction: t
        });

        if (!ultimaVenta || ultimaVenta.id !== ventaAMatar.id) {
            await t.rollback();
            return NextResponse.json({ 
                error: 'Seguridad del Sistema: Solo se permite eliminar la última venta registrada. Las ventas anteriores no se pueden borrar para mantener la integridad correlativa.' 
            }, { status: 400 });
        }

        // 3. Revertir inventario (devolver stock y restar nroVentas)
        for (const item of ventaAMatar.detalles) {
            const producto = await db.Producto.findByPk(item.productoId, { transaction: t });
            if (producto) {
                producto.stockAlmacen = Number(producto.stockAlmacen) + Number(item.cantidad);
                producto.nroVentas = Math.max(0, Number(producto.nroVentas) - Number(item.cantidad));
                await producto.save({ transaction: t });
            }
        }

        // 4. Borrar registros secundarios asociados (Movimientos financieros y detalles)
        await db.MovimientoFinanciero.destroy({ where: { ventaId: id }, transaction: t });
        await db.VentaDetalle.destroy({ where: { ventaId: id }, transaction: t });

        // 5. Destruir la venta físicamente
        await ventaAMatar.destroy({ transaction: t });

        // 6. 🔥 RETROCESO DEL CORRELATIVO ("Como si nunca hubiese existido")
        let prefijo = ventaAMatar.tipoDocumento === 'FACTURA' ? 'F' : (ventaAMatar.tipoDocumento === 'NOTA_ENTREGA' ? 'NE' : 'V');
        let corr = await db.Correlativo.findOne({ where: { prefijo }, transaction: t });
        
        if (corr && corr.siguienteNumero > 1) {
            corr.siguienteNumero -= 1; // Bajamos el contador para que la próxima venta tome este número exacto
            await corr.save({ transaction: t });
        }

        // Todo salió bien, confirmamos la transacción
        await t.commit();

        return NextResponse.json({ 
            success: true, 
            message: 'La última venta fue eliminada por completo y el correlativo retrocedió.' 
        }, { status: 200 });

    } catch (error) {
        if (!t.finished) await t.rollback();
        console.error('Error al eliminar la última venta:', error);
        return NextResponse.json({ error: 'Error interno al procesar la eliminación', detalle: error.message }, { status: 500 });
    }
}

// Expresión regular para validar si un string es un UUID válido
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request, { params }) {
    try {
        const { id } = await params; 

        let whereClause = {};

        // Si el parámetro es un UUID, buscamos por id. Si no, buscamos por numeroDocumento (ej: V-00001)
        if (UUID_REGEX.test(id)) {
            whereClause.id = id;
        } else {
            whereClause.numeroDocumento = id;
        }

        const venta = await db.Venta.findOne({
            where: whereClause,
            include: [
                { 
                    model: db.VentaDetalle, 
                    as: 'detalles',
                    include: [{ 
                        model: db.Producto, 
                        as: 'producto', 
                        attributes: ['nombre', 'codigo', 'imagen'],
                        include: [{ model: db.Marca, as: 'marca', attributes: ['nombre', 'imagen'] }] 
                    }]
                },
                { 
                    model: db.Cliente, 
                    as: 'cliente',
                    attributes: ['nombre', 'identificacion', 'direccion']
                },
                { 
                    model: db.MovimientoFinanciero, 
                    as: 'movimientos' 
                }
            ]
        });

        if (!venta) {
            return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });
        }

        return NextResponse.json(venta);
    } catch (error) {
        console.error('Error obteniendo detalle de venta:', error);
        return NextResponse.json({ error: 'Error interno del servidor', detalle: error.message }, { status: 500 });
    }
}