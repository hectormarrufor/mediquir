// Ayudas del módulo de tareas (servidor). Todo se decide con la SESIÓN: antes el navegador mandaba su userId y si era "presidencia",
// así que cualquiera podía ver todas las tareas o modificar/borrar las de otros.
import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import db from '@/models';
import { getSesion } from '../notificaciones/_lib';
import { rolDe } from '@/app/constants/roles';
import { ABIERTA } from '@/app/constants/tareas';

const { Tarea, User, Empleado, Puesto, Departamento, MenuPermission, TareaComentario, sequelize } = db;

const minus = (t) => String(t ?? '').toLowerCase();

// Solo personal interno (los clientes del portal no tienen tareas)
export async function requerirPersonal() {
    const sesion = await getSesion();
    if (!sesion) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
    if (sesion.clienteId) return { error: NextResponse.json({ error: 'Acceso restringido al personal' }, { status: 403 }) };
    return { sesion, ctx: await contextoDe(sesion) };
}

// Quién es quien llama y qué puede: administración/presidencia lo ve y hace todo; quien tiene permiso de asignar (configurable por puesto o
// departamento en el engranaje del panel) puede encargar tareas; todos pueden crear tareas para sí mismos.
export async function contextoDe(sesion) {
    const userId = Number(sesion.id);
    const puestos = (sesion.puestos || []).map((p) => minus(p?.nombre ?? p));
    const departamentos = (sesion.departamentos || []).map((d) => minus(d?.nombre ?? d));
    const esAdmin = rolDe(sesion) === 'admin' || userId === 1 || puestos.some((p) => p.includes('presidente')) || departamentos.some((d) => d.includes('presidencia'));

    let puedeAsignar = esAdmin;
    if (!puedeAsignar) {
        const cfg = await MenuPermission.findOne({ where: { href: 'config:asignar-tareas' } });
        const deps = (cfg?.allowedDepartments || []).map(minus);
        const pos = (cfg?.allowedPositions || []).map(minus);
        puedeAsignar = deps.some((d) => departamentos.some((x) => x.includes(d))) || pos.some((p) => puestos.some((x) => x.includes(p)));
    }
    return {
        userId, esAdmin, puedeAsignar,
        nombre: [sesion.nombre, sesion.apellido].filter(Boolean).join(' ') || 'Alguien',
        departamentos: (sesion.departamentos || []).map((d) => d?.nombre ?? d).filter(Boolean),
    };
}

export const nombreDeUsuario = (u) => (u?.empleado ? `${u.empleado.nombre} ${u.empleado.apellido}`.trim() : (u?.user || 'Usuario'));

// A quién puede encargarle tareas quien llama: administración a todo el personal activo; los demás, a su propio departamento
export async function asignablesDe(ctx) {
    if (!ctx.puedeAsignar) return [];
    const empleados = await Empleado.findAll({
        where: { estado: 'Activo' },
        attributes: ['id', 'nombre', 'apellido'],
        include: [
            { model: User, as: 'usuario', required: true, attributes: ['id'] },
            { model: Puesto, as: 'puestos', attributes: ['nombre'], include: [{ model: Departamento, as: 'departamento', attributes: ['nombre'] }] },
        ],
    });
    const misDeps = ctx.departamentos.map(minus);
    return empleados
        .filter((e) => ctx.esAdmin || e.usuario.id === ctx.userId || (e.puestos || []).some((p) => misDeps.includes(minus(p.departamento?.nombre))))
        .map((e) => ({ id: e.usuario.id, nombre: `${e.nombre} ${e.apellido}`.trim(), puestos: (e.puestos || []).map((p) => p.nombre).join(', ') || 'General' }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

// ¿Esta persona puede ver la tarea? Administración todas; el resto las suyas, las que creó y las generales (sin responsable)
export const puedeVer = (tarea, ctx) => ctx.esAdmin || tarea.asignadoAId === ctx.userId || tarea.creadoPorId === ctx.userId || tarea.asignadoAId === null;

export const INCLUIR_PERSONAS = [
    { model: User, as: 'creador', attributes: ['id', 'user'], include: [{ model: Empleado, as: 'empleado', attributes: ['nombre', 'apellido'] }] },
    { model: User, as: 'responsable', attributes: ['id', 'user'], include: [{ model: Empleado, as: 'empleado', attributes: ['nombre', 'apellido'] }] },
];

// Forma que ve el navegador (sin datos de usuario innecesarios: antes se devolvía el usuario completo, con su contraseña cifrada)
export function serializar(t, comentarios = 0) {
    const j = typeof t.toJSON === 'function' ? t.toJSON() : t;
    return {
        id: j.id, titulo: j.titulo, descripcion: j.descripcion, estado: j.estado, prioridad: j.prioridad,
        fechaVencimiento: j.fechaVencimiento, subtareas: Array.isArray(j.subtareas) ? j.subtareas : [],
        creadoPorId: j.creadoPorId, asignadoAId: j.asignadoAId,
        creador: j.creador ? { id: j.creador.id, nombre: nombreDeUsuario(j.creador) } : null,
        responsable: j.responsable ? { id: j.responsable.id, nombre: nombreDeUsuario(j.responsable) } : null,
        completadaAt: j.completadaAt, iniciadaAt: j.iniciadaAt, createdAt: j.createdAt, updatedAt: j.updatedAt, comentarios,
    };
}

// Cantidad de comentarios (sin contar la bitácora) por tarea
export async function contarComentarios(ids) {
    if (!ids.length) return new Map();
    const filas = await TareaComentario.findAll({
        attributes: ['tareaId', [sequelize.fn('COUNT', sequelize.col('id')), 'n']],
        where: { tareaId: { [Op.in]: ids }, tipo: 'COMENTARIO' }, group: ['tareaId'], raw: true,
    });
    return new Map(filas.map((f) => [f.tareaId, Number(f.n)]));
}

export const anotar = (tareaId, usuarioId, texto, tipo = 'ACTIVIDAD', transaction) => TareaComentario.create({ tareaId, usuarioId, tipo, texto: String(texto).slice(0, 2000) }, { transaction });

// Lista de pasos que llega del navegador -> lista limpia [{ id, texto, hecha }]
export function limpiarSubtareas(entrada) {
    if (!Array.isArray(entrada)) return null;
    const usados = new Set();
    return entrada.slice(0, 30).map((s, i) => {
        const texto = String(typeof s === 'string' ? s : s?.texto ?? '').trim().slice(0, 200);
        let id = String(typeof s === 'object' && s?.id ? s.id : `${Date.now().toString(36)}${i}`).slice(0, 24);
        while (usados.has(id)) id += 'x';
        usados.add(id);
        return texto ? { id, texto, hecha: Boolean(typeof s === 'object' && s?.hecha) } : null;
    }).filter(Boolean);
}

export { ABIERTA, Tarea };
export const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;
