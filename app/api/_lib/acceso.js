import { NextResponse } from 'next/server';
import { getSesion } from '../notificaciones/_lib';

// Solo administradores (gestión de usuarios y permisos, herramientas de prueba).
export async function requerirAdmin() {
    const sesion = await getSesion();
    if (!sesion) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
    if (sesion.clienteId || !sesion.isAdmin) return { error: NextResponse.json({ error: 'Solo administradores' }, { status: 403 }) };
    return { sesion };
}

// Solo clientes con usuario (portal B2B). Devuelve el clienteId del JWT: NUNCA se acepta un clienteId del navegador.
export async function requerirCliente() {
    const sesion = await getSesion();
    if (!sesion) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
    if (!sesion.clienteId) return { error: NextResponse.json({ error: 'Ruta exclusiva de clientes' }, { status: 403 }) };
    return { sesion, clienteId: Number(sesion.clienteId) };
}
