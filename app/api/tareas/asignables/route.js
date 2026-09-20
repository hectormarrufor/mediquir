import { NextResponse } from 'next/server';
import { asignablesDe, requerirPersonal } from '../_lib';

export const dynamic = 'force-dynamic';

// A quién puede encargarle tareas quien llama (vacío si no tiene permiso de asignar). Solo id, nombre y puestos.
export async function GET() {
    const acceso = await requerirPersonal();
    if (acceso.error) return acceso.error;
    try {
        return NextResponse.json(await asignablesDe(acceso.ctx));
    } catch (error) {
        console.error('Asignables:', error);
        return NextResponse.json({ error: 'No se pudo cargar la lista' }, { status: 500 });
    }
}
