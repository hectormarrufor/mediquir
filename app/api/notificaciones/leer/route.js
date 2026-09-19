import { NextResponse } from 'next/server';
import { sequelize } from '@/models';
import { getSesion, getVisibilidadSql, leidaSql } from '../_lib';

const MAX_IDS = 200;

// POST /api/notificaciones/leer
//   { ids: [1, 2, 3] }               -> marca esas notificaciones como leídas
//   { todas: true }                  -> marca como leídas todas las visibles del usuario
//   { ids: [1], leida: false }       -> vuelve a marcarlas como no leídas
// Una sola sentencia SQL (sin transacción abiertas), y solo afecta notificaciones que el usuario puede ver.
export async function POST(request) {
    try {
        const sesion = await getSesion();
        if (!sesion) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });

        const body = await request.json().catch(() => ({}));
        const marcarLeida = body.leida !== false;
        const uid = Number(sesion.id);

        const visibilidad = await getVisibilidadSql(uid);
        if (!visibilidad) return NextResponse.json({ success: false, error: 'No encontrado' }, { status: 404 });

        let filtroIds = '';
        if (!body.todas) {
            const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map(Number))].filter(Number.isInteger) : [];
            if (ids.length === 0 || ids.length > MAX_IDS) {
                return NextResponse.json({ success: false, error: `Envía entre 1 y ${MAX_IDS} ids, o { todas: true }` }, { status: 400 });
            }
            filtroIds = `AND "Notificacion"."id" IN (${ids.join(',')})`;
        }

        if (marcarLeida) {
            await sequelize.query(
                `INSERT INTO "NotificacionesLeidas" ("notificacionId", "usuarioId", "leidaAt")
                 SELECT "Notificacion"."id", ${uid}, NOW()
                 FROM "Notificaciones" AS "Notificacion"
                 WHERE ${visibilidad} ${filtroIds} AND NOT ${leidaSql(uid)}
                 ON CONFLICT ("notificacionId", "usuarioId") DO NOTHING`
            );
        } else {
            await sequelize.query(
                `DELETE FROM "NotificacionesLeidas" l
                 USING "Notificaciones" AS "Notificacion"
                 WHERE l."notificacionId" = "Notificacion"."id" AND l."usuarioId" = ${uid}
                   AND ${visibilidad} ${filtroIds}`
            );
        }

        const [[{ total }]] = await sequelize.query(
            `SELECT COUNT(*)::int AS total FROM "Notificaciones" AS "Notificacion"
             WHERE ${visibilidad} AND NOT ${leidaSql(uid)}`
        );

        return NextResponse.json({ success: true, unreadCount: total });
    } catch (error) {
        console.error('Error marcando notificaciones:', error);
        return NextResponse.json({ success: false, error: 'Error actualizando notificaciones' }, { status: 500 });
    }
}
