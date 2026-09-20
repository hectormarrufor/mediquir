// app/api/tareas/route.js
import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { notificarTodos, notificarUsuario } from '@/app/handlers/notificar';
import { PRIORIDADES } from '@/app/constants/tareas';
import { fechaCaracas } from '@/app/constants/hora';
import { Tarea, INCLUIR_PERSONAS, FECHA_ISO, anotar, asignablesDe, contarComentarios, limpiarSubtareas, requerirPersonal, serializar } from './_lib';

export const dynamic = 'force-dynamic';

// Tareas que la persona puede ver (según su sesión): las suyas, las que delegó y las generales; administración todas.
// Las cerradas hace más de 30 días no se envían (el tablero solo necesita lo reciente).
export async function GET() {
    const acceso = await requerirPersonal();
    if (acceso.error) return acceso.error;
    const { ctx } = acceso;
    try {
        const visibles = ctx.esAdmin ? {} : { [Op.or]: [{ asignadoAId: ctx.userId }, { creadoPorId: ctx.userId }, { asignadoAId: null }] };
        const recientes = { [Op.or]: [{ estado: { [Op.in]: ['Pendiente', 'En Progreso'] } }, { updatedAt: { [Op.gte]: new Date(Date.now() - 30 * 86400000) } }] };
        const tareas = await Tarea.findAll({ where: { [Op.and]: [visibles, recientes] }, include: INCLUIR_PERSONAS, order: [['createdAt', 'DESC']] });
        const conteo = await contarComentarios(tareas.map((t) => t.id));
        return NextResponse.json({
            tareas: tareas.map((t) => serializar(t, conteo.get(t.id) || 0)),
            yo: { userId: ctx.userId, esAdmin: ctx.esAdmin, puedeAsignar: ctx.puedeAsignar },
            hoy: fechaCaracas(),
        });
    } catch (error) {
        console.error('Tareas:', error);
        return NextResponse.json({ error: 'No se pudieron cargar las tareas' }, { status: 500 });
    }
}

export async function POST(request) {
    const acceso = await requerirPersonal();
    if (acceso.error) return acceso.error;
    const { ctx } = acceso;
    try {
        const body = await request.json();
        const titulo = String(body.titulo || '').trim().slice(0, 200);
        if (!titulo) return NextResponse.json({ error: 'Escribe el título de la tarea' }, { status: 400 });
        const descripcion = String(body.descripcion || '').trim().slice(0, 2000) || null;
        const prioridad = PRIORIDADES.includes(body.prioridad) ? body.prioridad : 'Media';
        const fechaVencimiento = FECHA_ISO.test(body.fechaVencimiento || '') ? body.fechaVencimiento : null;

        // Responsable: quien no tiene permiso de asignar solo puede crearse tareas a sí mismo. "general" = sin responsable (cualquiera la toma).
        let asignadoAId = body.asignadoAId === 'general' || body.asignadoAId === null ? null : (body.asignadoAId === undefined || body.asignadoAId === '' ? ctx.userId : Number(body.asignadoAId));
        if (!ctx.puedeAsignar) asignadoAId = ctx.userId;
        else if (asignadoAId !== null && asignadoAId !== ctx.userId) {
            const permitidos = new Set((await asignablesDe(ctx)).map((p) => p.id));
            if (!permitidos.has(asignadoAId)) return NextResponse.json({ error: 'No puedes asignarle tareas a esa persona' }, { status: 403 });
        }

        const tarea = await Tarea.create({
            titulo, descripcion, prioridad, fechaVencimiento, creadoPorId: ctx.userId, asignadoAId, estado: 'Pendiente',
            subtareas: limpiarSubtareas(body.subtareas) || [],
        });
        await anotar(tarea.id, ctx.userId, asignadoAId === ctx.userId ? `${ctx.nombre} creó la tarea` : asignadoAId ? `${ctx.nombre} creó y asignó la tarea` : `${ctx.nombre} creó la tarea para el equipo`);

        // Avisos: a la persona encargada (si no es quien la creó) o, si es general, a todo el personal
        try {
            const cuando = fechaVencimiento ? ` Vence el ${fechaVencimiento.slice(8, 10)}/${fechaVencimiento.slice(5, 7)}.` : '';
            if (asignadoAId && asignadoAId !== ctx.userId) {
                await notificarUsuario(asignadoAId, { title: 'Te asignaron una tarea 📋', body: `${ctx.nombre}: "${titulo}"${prioridad === 'Urgente' || prioridad === 'Alta' ? ` (prioridad ${prioridad.toLowerCase()})` : ''}.${cuando}`, url: `/superuser?tarea=${tarea.id}`, tipo: prioridad === 'Urgente' ? 'Alerta' : 'Info' });
            } else if (asignadoAId === null) {
                await notificarTodos({ title: 'Nueva tarea para el equipo 📢', body: `${ctx.nombre} creó "${titulo}". Quien pueda, que la tome.${cuando}`, url: `/superuser?tarea=${tarea.id}`, tipo: 'Info' });
            }
        } catch (e) {
            console.error('No se pudo avisar de la tarea nueva:', e.message);
        }
        return NextResponse.json({ success: true, id: tarea.id }, { status: 201 });
    } catch (error) {
        console.error('Crear tarea:', error);
        return NextResponse.json({ error: 'No se pudo crear la tarea' }, { status: 500 });
    }
}
