import { NextResponse } from 'next/server';
import { MovimientoFinanciero, CategoriaFinanciera, BcvPrecioHistorico } from '@/models';
import sequelize from '@/sequelize';

// GET: Obtener el libro mayor (Todos los ingresos y gastos)
export async function GET() {
    try {
        const movimientos = await MovimientoFinanciero.findAll({
            include: [
                { model: CategoriaFinanciera, as: 'categoria', attributes: ['nombre', 'tipo'] }
            ],
            order: [['fecha', 'DESC'], ['createdAt', 'DESC']]
        });
        
        return NextResponse.json(movimientos, { status: 200 });
    } catch (error) {
        console.error("Error al obtener flujo de caja:", error);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}

// POST: Registrar un Gasto o Ingreso Manual
export async function POST(req) {
    const t = await sequelize.transaction();

    try {
        const body = await req.json();
        const { tipo, fecha, metodoPago, referencia, montoUsd, descripcion, categoriaId } = body;

        if (!tipo || !fecha || !montoUsd || !categoriaId || !metodoPago) {
            throw new Error('Faltan datos obligatorios para registrar el movimiento');
        }

        // 1. Validar la tasa BCV de la fecha del movimiento
        const tasaHistorica = await BcvPrecioHistorico.findOne({
            where: { fecha: fecha },
            order: [['hora', 'DESC']],
            transaction: t
        });

        if (!tasaHistorica) {
            throw new Error(`No hay tasa BCV registrada para la fecha ${fecha}. Imposible cuadrar la caja.`);
        }

        const tasaBcv = parseFloat(tasaHistorica.monto);
        const montoUsdFloat = parseFloat(montoUsd);
        
        // 2. Calcular los Bolívares
        const montoVesCalculado = montoUsdFloat * tasaBcv;

        // 3. Registrar el movimiento en el Libro Mayor
        const nuevoMovimiento = await MovimientoFinanciero.create({
            tipo,
            fecha,
            metodoPago,
            referencia,
            montoUsd: montoUsdFloat,
            tasaBcvAplicada: tasaBcv,
            montoVes: montoVesCalculado,
            descripcion,
            categoriaId,
            // pedidoId y abonoId quedan en NULL porque es un registro manual
        }, { transaction: t });

        await t.commit();
        
        return NextResponse.json({ 
            message: 'Movimiento registrado exitosamente', 
            movimiento: nuevoMovimiento 
        }, { status: 201 });

    } catch (error) {
        await t.rollback();
        console.error("Error al registrar movimiento:", error);
        return NextResponse.json({ error: error.message || 'Error interno del servidor' }, { status: 500 });
    }
}