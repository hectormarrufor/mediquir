import { NextResponse } from 'next/server';
import { notificarUsuarios } from '@/app/handlers/notificar';
import { Tarea, INCLUIR_PERSONAS, anotar, nombreDeUsuario, puedeVer, requerirPersonal } from '../../_lib';
import db from '@/models';

export const dynamic = 'force-dynamic';

const { TareaComentario, User, Empleado } = db;

async function cargar(id, ctx) {
    const tarea = await Tarea.findByPk(Number(id), { include: INCLUIR_PERSONAS });
    return tarea && puedeVer(tarea, ctx) ? tarea : null;
}

// Conversación y bitácora de una tarea, de la más antigua a la más nueva
export async function GET(request, { params }) {
    const acceso = await requerirPersonal();
    if (acceso.error) return acceso.error;
    try {
        const { id } = await params;
        const tarea = await cargar(id, acceso.ctx);
        if (!tarea) return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 });
        const filas = await TareaComentario.findAll({
            where: { tareaId: tarea.id }, order: [['createdAt', 'ASC']], limit: 300,
            include: [{ model: User, as: 'autor', attributes: ['id', 'user'], include: [{ model: Empleado, as: 'empleado', attributes: ['nombre', 'apellido'] }] }],
        });
        return NextResponse.json(filas.map((f) => ({ id: f.id, tipo: f.tipo, texto: f.texto, createdAt: f.createdAt, autorId: f.usuarioId, autor: f.autor ? nombreDeUsuario(f.autor) : 'Sistema' })));
    } catch (error) {
        console.error('Comentarios de tarea:', error);
        return NextResponse.json({ error: 'No se pudieron cargar los comentarios' }, { status: 500 });
    }
}

// Escribir un comentario: le llega un aviso a quien creó la tarea y a su responsable (menos a quien lo escribe)
export async function POST(request, { params }) {
    const acceso = await requerirPersonal();
    if (acceso.error) return acceso.error;
    const { ctx } = acceso;
    try {
        const { id } = await params;
        const tarea = await cargar(id, ctx);
        if (!tarea) return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 });
        const texto = String((await request.json()).texto || '').trim().slice(0, 1000);
        if (!texto) return NextResponse.json({ error: 'Escribe un comentario' }, { status: 400 });
        const c = await anotar(tarea.id, ctx.userId, texto, 'COMENTARIO');
        try {
            await notificarUsuarios([tarea.creadoPorId, tarea.asignadoAId].filter((u) => u && u !== ctx.userId), {
                title: `Comentario en una tarea 💬`, body: `${ctx.nombre} en "${tarea.titulo}": ${texto.slice(0, 120)}${texto.length > 120 ? '…' : ''}`,
                url: `/superuser?tarea=${tarea.id}`, tipo: 'Info',
            });
        } catch (e) {
            console.error('No se pudo avisar del comentario:', e.message);
        }
        return NextResponse.json({ id: c.id, tipo: c.tipo, texto: c.texto, createdAt: c.createdAt, autorId: ctx.userId, autor: ctx.nombre }, { status: 201 });
    } catch (error) {
        console.error('Comentar tarea:', error);
        return NextResponse.json({ error: 'No se pudo comentar' }, { status: 500 });
    }
}
