import { NextResponse } from 'next/server';
import db from '@/models';

export async function GET(request) {
    try {
        const entradas = await db.EntradaInventario.findAll({
            include: [
                {
                    model: db.Producto,
                    as: 'producto',
                    attributes: ['id', 'codigo', 'nombre', 'imagen'],
                    include: [{ model: db.Marca, as: 'marca', attributes: ['nombre'] }]
                },
                {
                    model: db.User,
                    as: 'registrador',
                    attributes: ['id', 'user']
                },
                {
                    model: db.User,
                    as: 'recibidor',
                    attributes: ['id', 'user']
                },
                {
                    model: db.Proveedor, // 🔥 Relación con el Proveedor
                    as: 'proveedor',
                    attributes: ['id', 'nombre', 'identificacion']
                }
            ],
            order: [['fecha', 'DESC'], ['createdAt', 'DESC']]
        });

        return NextResponse.json(entradas);
    } catch (error) {
        console.error('Error al obtener las entradas de inventario:', error);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}