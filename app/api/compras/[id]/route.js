import { NextResponse } from 'next/server';
import db from '@/models/index'; 
import { requerirStaff } from '../../inventario/_lib';
import { rolDe } from '@/app/constants/roles';
const { sequelize, FacturaCompra, EntradaInventario, Producto, MovimientoFinanciero, CuentaPorPagar, Proveedor, RetencionIva, User, Empleado } = db;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Detalle de una compra: documento, proveedor, productos que entraron y su retención de IVA (si la tiene)
export async function GET(request, { params }) {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;
    try {
        const { id } = await params;
        const factura = await FacturaCompra.findOne({
            where: UUID_REGEX.test(id) ? { id } : { numeroDocumento: id },
            include: [
                { model: Proveedor, as: 'proveedor', attributes: ['id', 'nombre', 'identificacion', 'telefono'] },
                { model: EntradaInventario, as: 'entradas', include: [{ model: Producto, as: 'producto', attributes: ['id', 'nombre', 'codigo'] }] },
                { model: RetencionIva, as: 'retenciones', attributes: ['id', 'tipo', 'comprobante', 'fecha', 'ivaRetenido', 'porcentajeRetencion'] },
                { model: User, as: 'registrador', attributes: ['id', 'user'], include: [{ model: Empleado, as: 'empleado', attributes: ['nombre', 'apellido'] }] },
            ],
        });
        // Un vendedor solo ve las compras que él registró
        if (!factura || (rolDe(acceso.sesion) === 'vendedor' && Number(factura.registradoPorId) !== Number(acceso.sesion.id))) {
            return NextResponse.json({ error: 'Compra no encontrada' }, { status: 404 });
        }
        return NextResponse.json(factura);
    } catch (error) {
        console.error('Detalle de compra:', error);
        return NextResponse.json({ error: 'No se pudo cargar la compra' }, { status: 500 });
    }
}

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