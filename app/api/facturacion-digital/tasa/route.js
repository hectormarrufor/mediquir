import { NextResponse } from 'next/server';
import { requerirAdmin } from '@/app/api/_lib/acceso';
import { tasaDelDia } from '@/app/api/_lib/tasaBcv';
import { fechaCaracas } from '@/app/constants/hora';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    const acceso = await requerirAdmin();
    if (acceso.error) return acceso.error;

    try {
        const fecha = new URL(request.url).searchParams.get('fecha') || fechaCaracas();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
            return NextResponse.json({ error: 'Formato de fecha inválido (use YYYY-MM-DD)' }, { status: 400 });
        }
        const tasa = await tasaDelDia(fecha);
        return NextResponse.json({ fecha, tasa });
    } catch (error) {
        console.error('Error consultando tasa BCV por fecha:', error);
        return NextResponse.json({ error: 'No se pudo consultar la tasa BCV' }, { status: 500 });
    }
}
