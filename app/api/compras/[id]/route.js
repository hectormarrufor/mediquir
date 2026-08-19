import { NextResponse } from 'next/server';
import db from '@/models/index'; 
const { sequelize, FacturaCompra, EntradaInventario, Producto, MovimientoFinanciero, CuentaPorPagar } = db;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function DELETE(request, { params }) {
    const t = await sequelize.transaction();

    try {
        const { id } = await params;

        let whereClause = UUID_REGEX.test(id) ? { id } : { numeroDocumento: id };

        // 1. Buscar la factura de compra junto con sus entradas de inventario y detalles
        const facturaAMatar = await FacturaCompra.findOne({
            where: whereClause,
            include: [{ model: EntradaInventario, as: 'entradas' }],
            transaction: t
        });

        if (!facturaAMatar) {
            await t.rollback();
            return NextResponse.json({ error: 'Factura de compra no encontrada' }, { status: 404 });
        }

        // 2. REGLA DE ORO: Verificar si es la última factura de compra registrada
        const ultimaFactura = await FacturaCompra.findOne({
            order: [['createdAt', 'DESC']],
            transaction: t
        });

        if (!ultimaFactura || ultimaFactura.id !== facturaAMatar.id) {
            await t.rollback();
            return NextResponse.json({ 
                error: 'Seguridad del Sistema: Solo se permite eliminar la última factura de compra registrada para no alterar el historial de costos ponderados.' 
            }, { status: 400 });
        }

        // 3. Revertir el stock en el inventario de cada producto involucrado
        for (const entrada of facturaAMatar.entradas) {
            const producto = await Producto.findByPk(entrada.productoId, { transaction: t });
            if (producto) {
                // Restamos del stock actual las unidades que habían entrado en esta factura
                producto.stockAlmacen = Math.max(0, Number(producto.stockAlmacen) - Number(entrada.cantidad));
                
                // Nota sobre costos y precios: 
                // Revertir matemáticamente un costo ponderado exacto requiere recalcular el estado anterior del inventario. 
                // Por seguridad operativa, el stock se devuelve, pero el costo/precios se pueden auditar manualmente si hubo variaciones.
                
                await producto.save({ transaction: t });
            }
        }

        // 4. Destruir dependencias financieras y registros asociados (Cascada controlada)
        await MovimientoFinanciero.destroy({ where: { facturaCompraId: facturaAMatar.id }, transaction: t });
        await CuentaPorPagar.destroy({ where: { facturaCompraId: facturaAMatar.id }, transaction: t });
        await EntradaInventario.destroy({ where: { facturaCompraId: facturaAMatar.id }, transaction: t });

        // 5. Destruir la cabecera (FacturaCompra)
        await facturaAMatar.destroy({ transaction: t });

        await t.commit();

        return NextResponse.json({ 
            success: true, 
            message: 'La última factura de compra fue eliminada y el inventario fue revertido con éxito.' 
        }, { status: 200 });

    } catch (error) {
        if (!t.finished) await t.rollback();
        console.error('Error al eliminar la factura de compra:', error);
        return NextResponse.json({ error: 'Error interno al procesar la eliminación', detalle: error.message }, { status: 500 });
    }
}