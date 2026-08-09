import db from '@/models';
import { NextResponse } from 'next/server';
import { Op } from 'sequelize';

export async function GET(request) {
    try {
        const salidas = await db.SalidaInventario.findAll({
            include: [
                { model: db.Consumible, as: 'consumible' },
                { model: db.Activo, as: 'activo' },
                // 🔥 AQUÍ ESTÁ LA MAGIA QUE ALIMENTA EL AVATAR DEL FRONTEND
                { 
                    model: db.User, 
                    as: 'solicitante', 
                    include: [{ model: db.Empleado, as: 'empleado' }] 
                },
                { 
                    model: db.User, 
                    as: 'despachador', 
                    include: [{ model: db.Empleado, as: 'empleado' }] 
                },
                { model: db.Requisicion, as: 'requisicion' }
            ],
            order: [['createdAt', 'DESC']]
        });

        return NextResponse.json(salidas);
    } catch (error) {
        console.error("Error obteniendo salidas:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

// POST para registrar una nueva salida (con justificación)
export async function POST(request) {
    const transaction = await db.sequelize.transaction();
    try {
        const body = await request.json();
        const { consumibleId, cantidad } = body;

        const consumible = await db.Consumible.findByPk(consumibleId, { transaction });
        if (!consumible || consumible.stock < cantidad) {
            throw new Error('Stock insuficiente o el consumible no existe.');
        }

        await consumible.decrement('stock', { by: cantidad, transaction });
        const nuevaSalida = await db.SalidaInventario.create(body, { transaction });

        await transaction.commit();
        return NextResponse.json(nuevaSalida, { status: 201 });
    } catch (error) {
        await transaction.rollback();
        return NextResponse.json({ message: error.message }, { status: 400 });
    }
}