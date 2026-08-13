import { NextResponse } from 'next/server';
import db from '@/models/index'; 
const { sequelize } = db;

export async function DELETE(request, { params }) {
    // Abrimos la transacción
    const t = await sequelize.transaction();

    try {
        const { id } = await params;

        // 1. Buscamos la venta con sus detalles DENTRO de la transacción
        const venta = await db.Venta.findOne({
            where: { id: id }, // Como es UUID, no hace falta el isNaN
            include: [{ model: db.VentaDetalle, as: 'detalles' }],
            transaction: t // 🔥 MUY IMPORTANTE: Amarrar la búsqueda a la transacción
        });

        if (!venta) {
            await t.rollback();
            return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 });
        }

        // 2. Devolver stock a los productos
        if (venta.detalles && venta.detalles.length > 0) {
            for (const detalle of venta.detalles) {
                const productoDB = await db.Producto.findByPk(detalle.productoId, { transaction: t });
                if (productoDB) {
                    productoDB.stockAlmacen = (Number(productoDB.stockAlmacen) || 0) + Number(detalle.cantidad);
                    const nuevasVentas = (Number(productoDB.nroVentas) || 0) - Number(detalle.cantidad);
                    productoDB.nroVentas = nuevasVentas < 0 ? 0 : nuevasVentas;
                    await productoDB.save({ transaction: t });
                }
            }
        }

        // 3. Borrar Movimientos Financieros
        await db.MovimientoFinanciero.destroy({
            where: { ventaId: venta.id },
            transaction: t
        });

        // 4. Borrar Detalles
        await db.VentaDetalle.destroy({
            where: { ventaId: venta.id },
            transaction: t
        });

        // 5. Borrar Venta
        await venta.destroy({ transaction: t });

        // Confirmamos todo
        await t.commit();

        return NextResponse.json({ success: true, message: 'Venta eliminada y stock devuelto.' });

    } catch (error) {
        // Si algo falla, liberamos el bloqueo de inmediato
        if (t && !t.finished) {
            await t.rollback();
        }
        console.error('Error eliminando venta:', error);
        return NextResponse.json({ error: 'Error interno al intentar eliminar la venta', detalle: error.message }, { status: 500 });
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