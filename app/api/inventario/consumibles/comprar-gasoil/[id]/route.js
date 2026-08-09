import { NextResponse } from 'next/server';
import sequelize from '@/sequelize';
import { EntradaInventario, Consumible } from '@/models';

export async function DELETE(request, { params }) {
    const t = await sequelize.transaction();

    try {
        const { id } = await params;

        // 1. Buscar la entrada a eliminar
        const entrada = await EntradaInventario.findByPk(id, { transaction: t });
        if (!entrada) throw new Error('El registro de compra no existe.');

        // 2. Buscar el tanque afectado
        const tanque = await Consumible.findByPk(entrada.consumibleId, { transaction: t });
        if (!tanque) throw new Error('El tanque asociado no existe.');

        const cantidadEntrada = parseFloat(entrada.cantidad);
        const costoTotalEntrada = cantidadEntrada * parseFloat(entrada.costoUnitario);
        const stockActual = parseFloat(tanque.stockAlmacen);
        const precioPromedioActual = parseFloat(tanque.precioPromedio || 0);

        // 3. Revertir el Stock Físico
        const nuevoStock = stockActual - cantidadEntrada;
        
        if (nuevoStock < 0) {
            throw new Error('No puedes revertir esta compra porque dejaría el inventario en negativo. Significa que ya despachaste este gasoil a los equipos.');
        }

        // 4. Revertir el Precio Promedio Ponderado
        let nuevoPrecioPromedio = 0;
        if (nuevoStock > 0) {
            const valorInventarioActual = stockActual * precioPromedioActual;
            const valorInventarioAnterior = valorInventarioActual - costoTotalEntrada;
            // Math.max evita precios negativos por micro-decimales
            nuevoPrecioPromedio = Math.max(0, valorInventarioAnterior / nuevoStock);
        }

        // 5. Guardar los cambios
        tanque.stockAlmacen = nuevoStock;
        tanque.precioPromedio = nuevoPrecioPromedio.toFixed(2);
        await tanque.save({ transaction: t });

        // 6. Eliminar el registro
        await entrada.destroy({ transaction: t });

        await t.commit();
        
        return NextResponse.json({ 
            success: true, 
            message: 'Compra revertida. El stock y el precio promedio han sido restaurados.' 
        });

    } catch (error) {
        await t.rollback();
        console.error("Error revirtiendo compra:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}