import { NextResponse } from 'next/server';
import sequelize from '@/sequelize';
import { Consumible, EntradaInventario } from '@/models';

// ----------------------------------------------------------------------
// GET: Obtener historial de compras de gasoil
// ----------------------------------------------------------------------
export async function GET() {
    try {
        const compras = await EntradaInventario.findAll({
            where: { tipo: 'Compra' },
            include: [{
                model: Consumible,
                as: 'consumible',
                where: { categoria: 'gasoil' },
                attributes: ['id', 'nombre', 'stockAlmacen']
            }],
            order: [['fecha', 'DESC']]
        });
        return NextResponse.json({ success: true, data: compras });
    } catch (error) {
        console.error("Error obteniendo compras:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

// ----------------------------------------------------------------------
// POST: Registrar nueva compra de gasoil
// ----------------------------------------------------------------------
export async function POST(request) {
    const t = await sequelize.transaction();

    try {
        const body = await request.json();
        const { consumibleId, cantidad, costoTotal, observacion, usuarioId } = body;

        const CAPACIDAD_MAXIMA_TANQUE = 8000;

        if (!consumibleId || !cantidad || !costoTotal) {
            throw new Error('Faltan datos obligatorios para la compra.');
        }

        const tanque = await Consumible.findByPk(consumibleId, { transaction: t });
        
        if (!tanque) {
            throw new Error('El tanque de gasoil no existe en el inventario.');
        }

        const cantidadNumerica = parseFloat(cantidad);
        const costoTotalNumerico = parseFloat(costoTotal);
        const costoUnitario = costoTotalNumerico / cantidadNumerica;
        const stockAnterior = parseFloat(tanque.stockAlmacen);

        const espacioDisponible = CAPACIDAD_MAXIMA_TANQUE - stockAnterior;
        if (cantidadNumerica > espacioDisponible) {
            throw new Error(`La cantidad supera la capacidad del tanque. Solo hay espacio para ${espacioDisponible.toFixed(2)} L.`);
        }

        await EntradaInventario.create({
            cantidad: cantidadNumerica,
            costoUnitario: costoUnitario,
            tipo: 'Compra',
            observacion: observacion || 'Compra directa de Gasoil',
            fecha: new Date(),
            consumibleId: tanque.id,
            usuarioId: usuarioId || null 
        }, { transaction: t });

        const precioPromedioAnterior = parseFloat(tanque.precioPromedio || 0);
        const valorInventarioAnterior = stockAnterior * precioPromedioAnterior;
        const nuevoValorInventario = valorInventarioAnterior + costoTotalNumerico;
        const nuevoStock = stockAnterior + cantidadNumerica;
        const nuevoPrecioPromedio = nuevoValorInventario / nuevoStock;

        tanque.stockAlmacen = nuevoStock;
        tanque.precioPromedio = nuevoPrecioPromedio.toFixed(2);
        await tanque.save({ transaction: t });

        await t.commit();
        
        return NextResponse.json({ 
            success: true, 
            message: 'Compra registrada y stock actualizado correctamente.' 
        }, { status: 201 });

    } catch (error) {
        await t.rollback();
        console.error("Error registrando compra de gasoil:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}