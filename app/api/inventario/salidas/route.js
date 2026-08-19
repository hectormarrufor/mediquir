import { NextResponse } from 'next/server';
import db from '@/models';

export async function GET(request) {
    try {
        const salidas = await db.SalidaInventario.findAll({
            include: [
                {
                    model: db.Producto,
                    as: 'producto',
                    attributes: ['id', 'codigo', 'nombre', 'imagen'],
                    include: [{ model: db.Marca, as: 'marca', attributes: ['nombre'] }]
                },
                {
                    model: db.User,
                    as: 'solicitante',
                    attributes: ['id', 'user']
                },
                {
                    model: db.User,
                    as: 'despachador',
                    attributes: ['id', 'user']
                },
                {
                    model: db.Venta,
                    as: 'venta',
                    attributes: ['id', 'numeroDocumento', 'tipoDocumento']
                }
            ],
            order: [['fecha', 'DESC'], ['createdAt', 'DESC']]
        });

        return NextResponse.json(salidas);
    } catch (error) {
        console.error('Error al obtener las salidas de inventario:', error);
        return NextResponse.json({ error: 'Error interno del servidor al consultar el inventario' }, { status: 500 });
    }
}