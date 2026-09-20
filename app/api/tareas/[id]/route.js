// app/api/tareas/[id]/route.js
import { NextResponse } from 'next/server';
import { notificarCabezas, notificarUsuario, notificarUsuarios } from '@/app/handlers/notificar';
import { ESTADOS, PRIORIDADES, corto } from '@/app/constants/tareas';
import { Tarea, FECHA_ISO, INCLUIR_PERSONAS, anotar, asignablesDe, contarComentarios, limpiarSubtareas, puedeVer, requerirPersonal, serializar } from '../_lib';

export const dynamic = 'force-dynamic';

class ErrorTarea extends Error {
    constructor(mensaje, status = 400) { super(mensaje); this.status = status; }
}

async function cargar(id, ctx) {
    const tarea = await Tarea.findByPk(Number(id), { include: INCLUIR_PERSONAS });
    if (!tarea || !puedeVer(tarea, ctx)) throw new ErrorTarea('Tarea no encontrada', 404);
    return tarea;
}

const avisar = async (fn) => { try { await fn(); } catch (e) { console.error('No se pudo avisar de la tarea:', e.message); } };

export async function GET(request, { params }) {
    const acceso = await requerirPersonal();
    if (acceso.error) return acceso.error;
    try {
        const { id } = await params;
        const tarea = await cargar(id, acceso.ctx);
        const conteo = await contarComentarios([tarea.id]);
        return NextResponse.json(serializar(tarea, conteo.get(tarea.id) || 0));
    } catch (error) {
        if (error instanceof ErrorTarea) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('Tarea:', error);
        return NextResponse.json({ error: 'No se pudo cargar la tarea' }, { status: 500 });
    }
}

// Quién puede qué:
//  · Quien la creó y administración: todo (editar, reasignar, cancelar, borrar).
//  · Su responsable: avanzar el estado (menos cancelar) y marcar los pasos.
//  · Cualquiera con acceso a una tarea general: tomarla (acción TOMAR).
export async function PATCH(request, { params }) {
    const acceso = await requerirPersonal();
    if (acceso.error) return acceso.error;
    const { ctx } = acceso;
    try {
        const { id } = await params;
        const tarea = await cargar(id, ctx);
        const body = await request.json();

        const esCreador = tarea.creadoPorId === ctx.userId;
        const esResponsable = tarea.asignadoAId === ctx.userId;
        const puedeGestionar = ctx.esAdmin || esCreador;
        const puedeAvanzar = puedeGestionar || esResponsable;

        const cambios = {};
        const bitacora = [];
        const avisos = []; // funciones que envían avisos al terminar
        const antes = { estado: tarea.estado, asignadoAId: tarea.asignadoAId, fecha: tarea.fechaVencimiento };
        const ahora = new Date();

        // ---- Tomar una tarea general ----
        if (body.accion === 'TOMAR') {
            if (tarea.asignadoAId) throw new ErrorTarea('Esta tarea ya tiene responsable', 409);
            if (!['Pendiente', 'En Progreso'].includes(tarea.estado)) throw new ErrorTarea('Esta tarea ya está cerrada', 409);
            cambios.asignadoAId = ctx.userId;
            cambios.estado = 'En Progreso';
            if (!tarea.iniciadaAt) cambios.iniciadaAt = ahora;
            bitacora.push(`${ctx.nombre} tomó la tarea`);
            if (tarea.creadoPorId !== ctx.userId) avisos.push(() => notificarUsuario(tarea.creadoPorId, { title: 'Alguien tomó tu tarea 🙋', body: `${ctx.nombre} tomó "${tarea.titulo}".`, url: `/superuser?tarea=${tarea.id}`, tipo: 'Info' }));
        } else {
            // ---- Contenido (solo quien la gestiona) ----
            const editaContenido = ['titulo', 'descripcion', 'prioridad', 'fechaVencimiento'].some((c) => body[c] !== undefined);
            if (editaContenido && !puedeGestionar) throw new ErrorTarea('Solo quien creó la tarea (o administración) puede editarla', 403);
            if (body.titulo !== undefined) {
                const titulo = String(body.titulo).trim().slice(0, 200);
                if (!titulo) throw new ErrorTarea('El título no puede quedar vacío');
                cambios.titulo = titulo;
            }
            if (body.descripcion !== undefined) cambios.descripcion = String(body.descripcion || '').trim().slice(0, 2000) || null;
            if (body.prioridad !== undefined) {
                if (!PRIORIDADES.includes(body.prioridad)) throw new ErrorTarea('Prioridad no válida');
                if (body.prioridad !== tarea.prioridad) { cambios.prioridad = body.prioridad; bitacora.push(`${ctx.nombre} cambió la prioridad a ${body.prioridad}`); }
            }
            if (body.fechaVencimiento !== undefined) {
                const f = body.fechaVencimiento === null || body.fechaVencimiento === '' ? null : String(body.fechaVencimiento).slice(0, 10);
                if (f !== null && !FECHA_ISO.test(f)) throw new ErrorTarea('Fecha no válida');
                if (f !== (tarea.fechaVencimiento || null)) {
                    cambios.fechaVencimiento = f;
                    cambios.recordadaEl = null; // con fecha nueva vuelve a poder recordarse
                    bitacora.push(f ? `${ctx.nombre} cambió el vencimiento al ${corto(f)}` : `${ctx.nombre} quitó la fecha de vencimiento`);
                    if (tarea.asignadoAId && tarea.asignadoAId !== ctx.userId) avisos.push(() => notificarUsuario(tarea.asignadoAId, { title: 'Cambió la fecha de una tarea 📅', body: `"${tarea.titulo}" ${f ? `ahora vence el ${corto(f)}` : 'ya no tiene fecha límite'}.`, url: `/superuser?tarea=${tarea.id}`, tipo: 'Info' }));
                }
            }

            // ---- Responsable ----
            if (body.asignadoAId !== undefined) {
                const nuevo = body.asignadoAId === null || body.asignadoAId === 'general' || body.asignadoAId === '' ? null : Number(body.asignadoAId);
                if (nuevo !== tarea.asignadoAId) {
                    if (!puedeGestionar) throw new ErrorTarea('Solo quien creó la tarea (o administración) puede reasignarla', 403);
                    if (nuevo === null && !ctx.puedeAsignar) throw new ErrorTarea('No tienes permiso para dejar una tarea sin responsable', 403);
                    if (nuevo !== null && nuevo !== ctx.userId && !ctx.esAdmin) {
                        const permitidos = new Set((await asignablesDe(ctx)).map((p) => p.id));
                        if (!permitidos.has(nuevo)) throw new ErrorTarea('No puedes asignarle tareas a esa persona', 403);
                    }
                    cambios.asignadoAId = nuevo;
                    if (nuevo === null) bitacora.push(`${ctx.nombre} la dejó para el equipo`);
                    else {
                        const nombre = (await asignablesDe({ ...ctx, esAdmin: true, puedeAsignar: true })).find((p) => p.id === nuevo)?.nombre || 'otra persona';
                        bitacora.push(`${ctx.nombre} la asignó a ${nombre}`);
                        if (nuevo !== ctx.userId) avisos.push(() => notificarUsuario(nuevo, { title: 'Te asignaron una tarea 📋', body: `${ctx.nombre}: "${tarea.titulo}".`, url: `/superuser?tarea=${tarea.id}`, tipo: 'Info' }));
                    }
                }
            }

            // ---- Estado ----
            if (body.estado !== undefined && body.estado !== tarea.estado) {
                if (!ESTADOS.includes(body.estado)) throw new ErrorTarea('Estado no válido');
                if (!puedeAvanzar) throw new ErrorTarea('Solo el responsable (o quien creó la tarea) puede cambiar su estado', 403);
                if (body.estado === 'Cancelada' && !puedeGestionar) throw new ErrorTarea('Solo quien creó la tarea puede cancelarla', 403);
                cambios.estado = body.estado;
                bitacora.push(`${ctx.nombre} cambió el estado: ${tarea.estado} → ${body.estado}`);
                if (body.estado === 'Completada') { cambios.completadaAt = ahora; cambios.completadaPorId = ctx.userId; }
                if (tarea.estado === 'Completada' && body.estado !== 'Completada') { cambios.completadaAt = null; cambios.completadaPorId = null; }
                if (body.estado === 'En Progreso' && !tarea.iniciadaAt) cambios.iniciadaAt = ahora;

                const otros = [tarea.creadoPorId, tarea.asignadoAId].filter((u) => u && u !== ctx.userId);
                if (body.estado === 'Completada') {
                    avisos.push(() => notificarUsuarios([tarea.creadoPorId].filter((u) => u !== ctx.userId), { title: 'Tarea completada ✅', body: `${ctx.nombre} completó "${tarea.titulo}".`, url: `/superuser?tarea=${tarea.id}`, tipo: 'Info' }));
                    if (tarea.prioridad === 'Urgente') avisos.push(() => notificarCabezas({ title: 'Se completó una tarea urgente ✅', body: `${ctx.nombre} completó "${tarea.titulo}".`, url: `/superuser?tarea=${tarea.id}`, tipo: 'Info' }));
                } else if (body.estado === 'Cancelada') {
                    avisos.push(() => notificarUsuarios(otros, { title: 'Tarea cancelada 🚫', body: `${ctx.nombre} canceló "${tarea.titulo}".`, url: `/superuser?tarea=${tarea.id}`, tipo: 'Info' }));
                } else if (tarea.estado === 'Completada' || tarea.estado === 'Cancelada') {
                    avisos.push(() => notificarUsuarios(otros, { title: 'Tarea reabierta 🔄', body: `${ctx.nombre} reabrió "${tarea.titulo}".`, url: `/superuser?tarea=${tarea.id}`, tipo: 'Info' }));
                } else if (body.estado === 'En Progreso' && !tarea.iniciadaAt && tarea.creadoPorId !== ctx.userId) {
                    avisos.push(() => notificarUsuario(tarea.creadoPorId, { title: 'Tarea en marcha 🚀', body: `${ctx.nombre} empezó "${tarea.titulo}".`, url: `/superuser?tarea=${tarea.id}`, tipo: 'Info' }));
                }
            }

            // ---- Pasos: el responsable solo los marca; quien gestiona también agrega, cambia y quita ----
            if (body.subtareas !== undefined) {
                if (!puedeAvanzar) throw new ErrorTarea('No puedes modificar los pasos de esta tarea', 403);
                const nuevas = limpiarSubtareas(body.subtareas);
                if (nuevas === null) throw new ErrorTarea('Lista de pasos no válida');
                if (!puedeGestionar) {
                    const previas = Array.isArray(tarea.subtareas) ? tarea.subtareas : [];
                    const mismos = nuevas.length === previas.length && nuevas.every((s, i) => s.id === previas[i].id && s.texto === previas[i].texto);
                    if (!mismos) throw new ErrorTarea('El responsable solo puede marcar los pasos como hechos', 403);
                }
                cambios.subtareas = nuevas;
            }
        }

        if (Object.keys(cambios).length === 0) return NextResponse.json({ success: true, sinCambios: true });

        await tarea.update(cambios);
        for (const texto of bitacora) await anotar(tarea.id, ctx.userId, texto);
        for (const enviar of avisos) await avisar(enviar);
        const conteo = await contarComentarios([tarea.id]);
        await tarea.reload({ include: INCLUIR_PERSONAS });
        return NextResponse.json({ success: true, tarea: serializar(tarea, conteo.get(tarea.id) || 0), antes });
    } catch (error) {
        if (error instanceof ErrorTarea) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('Actualizar tarea:', error);
        return NextResponse.json({ error: 'No se pudo actualizar la tarea' }, { status: 500 });
    }
}

// Borrar: solo quien la creó o administración (antes cualquiera podía borrar cualquier tarea)
export async function DELETE(request, { params }) {
    const acceso = await requerirPersonal();
    if (acceso.error) return acceso.error;
    const { ctx } = acceso;
    try {
        const { id } = await params;
        const tarea = await cargar(id, ctx);
        if (!(ctx.esAdmin || tarea.creadoPorId === ctx.userId)) throw new ErrorTarea('Solo quien creó la tarea (o administración) puede eliminarla', 403);
        const { titulo, asignadoAId } = tarea;
        await tarea.destroy();
        if (asignadoAId && asignadoAId !== ctx.userId) {
            await avisar(() => notificarUsuario(asignadoAId, { title: 'Tarea eliminada 🗑️', body: `${ctx.nombre} eliminó la tarea "${titulo}".`, url: '/superuser', tipo: 'Info' }));
        }
        return NextResponse.json({ success: true });
    } catch (error) {
        if (error instanceof ErrorTarea) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('Eliminar tarea:', error);
        return NextResponse.json({ error: 'No se pudo eliminar la tarea' }, { status: 500 });
    }
}
