// Ayudas de los recibos de pago a empleados (servidor). Todo se decide con la SESIÓN, nunca con lo que mande el navegador.
import { NextResponse } from 'next/server';
import db from '@/models';
import { getSesion } from '../../notificaciones/_lib';
import { rolDe } from '@/app/constants/roles';

const minus = (t) => String(t ?? '').toLowerCase();

// Administración (quien registra los pagos): administradores, la administradora y la presidencia
export function esAdministracion(sesion) {
    if (!sesion || sesion.clienteId) return false;
    if (rolDe(sesion) === 'admin' || Number(sesion.id) === 1) return true;
    const puestos = (sesion.puestos || []).map((p) => minus(p?.nombre ?? p));
    return puestos.some((p) => p.includes('administrador') || p.includes('presidente'));
}

// Cualquier personal con sesión; devuelve además su empleadoId (el enlace usuario -> empleado) para ver SOLO sus recibos
export async function requerirPersonal() {
    const sesion = await getSesion();
    if (!sesion) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
    if (sesion.clienteId) return { error: NextResponse.json({ error: 'Acceso restringido al personal' }, { status: 403 }) };
    const usuario = await db.User.findByPk(Number(sesion.id), { attributes: ['id', 'empleadoId'] });
    return { sesion, usuarioId: Number(sesion.id), empleadoId: usuario?.empleadoId ? Number(usuario.empleadoId) : null, admin: esAdministracion(sesion) };
}

export async function requerirAdministracion() {
    const acceso = await requerirPersonal();
    if (acceso.error) return acceso;
    if (!acceso.admin) return { error: NextResponse.json({ error: 'Solo administración puede hacer esto' }, { status: 403 }) };
    return acceso;
}

export const nombreDe = (sesion) => [sesion.nombre, sesion.apellido].filter(Boolean).join(' ').slice(0, 120) || null;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const FECHA = /^\d{4}-\d{2}-\d{2}$/;
