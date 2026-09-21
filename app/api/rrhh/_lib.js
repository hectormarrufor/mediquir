import { NextResponse } from 'next/server';
import { getSesion } from '../notificaciones/_lib';
import { rolDe } from '@/app/constants/roles';

// Exige un administrador (las acciones que cambian la estructura de personal: puestos, departamentos, altas y bajas).
export async function requerirAdmin() {
    const sesion = await getSesion();
    if (!sesion) return { error: NextResponse.json({ message: 'No autorizado' }, { status: 401 }) };
    if (rolDe(sesion) !== 'admin') return { error: NextResponse.json({ message: 'Solo un administrador puede hacer esto' }, { status: 403 }) };
    return { sesion };
}

// Texto vacío -> null; el resto se recorta.
export const limpiar = (v) => {
    if (v === null || v === undefined) return null;
    const t = String(v).trim();
    return t === '' ? null : t;
};
