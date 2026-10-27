import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import db from '@/models';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MAXIMO = 2000;

// Salidas de inventario de un rango de fechas (?desde=AAAA-MM-DD&hasta=AAAA-MM-DD, días de Caracas).
// Antes se descargaban TODAS (cada renglón vendido es una salida): la pantalla se iba volviendo más lenta con cada venta.
export async function GET(request) {
    try {
        const params = new URL(request.url).searchParams;
        const desde = params.get('desde');
        const hasta = params.get('hasta');
        const where = FECHA.test(desde || '') && FECHA.test(hasta || '')
            ? { fecha: { [Op.between]: [new Date(`${desde}T00:00:00-04:00`), new Date(`${hasta}T23:59:59.999-04:00`)] } }
            : {};
        const salidas = await db.SalidaInventario.findAll({
            where,
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
            order: [['fecha', 'DESC'], ['createdAt', 'DESC']],
            limit: MAXIMO,
        });

        return NextResponse.json(salidas);
    } catch (error) {
        console.error('Error al obtener las salidas de inventario:', error);
        return NextResponse.json({ error: 'Error interno del servidor al consultar el inventario' }, { status: 500 });
    }
}
