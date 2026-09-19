import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { Notificacion, sequelize } from '@/models';
import { getSesion, getVisibilidadSql, leidaSql } from './_lib';

const LIMITE_POR_DEFECTO = 15;
const LIMITE_MAXIMO = 50;

// GET /api/notificaciones
//   ?soloConteo=1            -> { unreadCount } (barato: lo usa la campana para el contador)
//   ?limit=15&cursor=<id>    -> página de notificaciones (paginación por cursor, más nuevas primero)
//   ?filtro=no-leidas        -> solo las que el usuario no ha leído
export async function GET(request) {
    try {
        const sesion = await getSesion();
        if (!sesion) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });

        const visibilidad = await getVisibilidadSql(sesion.id);
        if (!visibilidad) return NextResponse.json({ success: false, error: 'No encontrado' }, { status: 404 });

        const params = new URL(request.url).searchParams;
        const noLeidasSql = `NOT ${leidaSql(sesion.id)}`;

        const contarNoLeidas = () =>
            Notificacion.count({ where: { [Op.and]: [sequelize.literal(visibilidad), sequelize.literal(noLeidasSql)] } });

        if (params.get('soloConteo')) {
            return NextResponse.json({ success: true, unreadCount: await contarNoLeidas() });
        }

        const limit = Math.min(Math.max(parseInt(params.get('limit'), 10) || LIMITE_POR_DEFECTO, 1), LIMITE_MAXIMO);
        const cursor = parseInt(params.get('cursor'), 10);
        const soloNoLeidas = params.get('filtro') === 'no-leidas';

        const condiciones = [sequelize.literal(visibilidad)];
        if (Number.isInteger(cursor)) condiciones.push({ id: { [Op.lt]: cursor } });
        if (soloNoLeidas) condiciones.push(sequelize.literal(noLeidasSql));

        // Se pide una fila de más para saber si existe otra página sin hacer un COUNT
        const filas = await Notificacion.findAll({
            attributes: { include: [[sequelize.literal(leidaSql(sesion.id)), 'leida']] },
            where: { [Op.and]: condiciones },
            order: [['id', 'DESC']],
            limit: limit + 1,
        });

        const hayMas = filas.length > limit;
        const data = (hayMas ? filas.slice(0, limit) : filas).map((n) => n.toJSON());

        // El contador total solo se calcula en la primera página
        const respuesta = {
            success: true,
            data,
            nextCursor: hayMas ? data[data.length - 1].id : null,
        };
        if (!Number.isInteger(cursor)) respuesta.unreadCount = await contarNoLeidas();

        return NextResponse.json(respuesta);
    } catch (error) {
        console.error('Error obteniendo notificaciones:', error);
        return NextResponse.json({ success: false, error: 'Error obteniendo notificaciones' }, { status: 500 });
    }
}
