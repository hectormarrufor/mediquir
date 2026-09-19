import { NextResponse } from 'next/server';
import { getSesion } from '../notificaciones/_lib';
import { rolDe } from '@/app/constants/roles';

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

// Personal que NO es vendedor (admin y demás empleados): para lo que un vendedor no puede hacer (finanzas, costos, despacho...).
export async function requerirNoVendedor() {
    const sesion = await getSesion();
    if (!sesion) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
    if (sesion.clienteId) return { error: NextResponse.json({ error: 'Acceso restringido al personal' }, { status: 403 }) };
    if (rolDe(sesion) === 'vendedor') return { error: NextResponse.json({ error: 'Tu rol no permite esta acción' }, { status: 403 }) };
    return { sesion };
}

export { rolDe };
