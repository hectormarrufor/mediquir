import { NextResponse } from 'next/server';
import { requerirAdmin } from '@/app/api/_lib/acceso';
import { configPublicaTfhka, probarConexionTfhka } from '@/app/api/_lib/tfhka';
import { tasaVigente } from '@/app/api/_lib/tasaBcv';
import { fechaCaracas } from '@/app/constants/hora';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    const acceso = await requerirAdmin();
    if (acceso.error) return acceso.error;

    try {
        const probar = new URL(request.url).searchParams.get('probar') === '1';
        const config = configPublicaTfhka();
        let tasaBcvHoy = null;
        try {
            tasaBcvHoy = await tasaVigente();
        } catch {
            tasaBcvHoy = null;
        }

        const respuesta = {
            config,
            fechaHoy: fechaCaracas(),
            tasaBcvHoy,
        };

        if (probar) {
            respuesta.conexion = await probarConexionTfhka();
        }

        return NextResponse.json(respuesta);
    } catch (error) {
        console.error('Error consultando estado TFHKA:', error);
        return NextResponse.json({ error: 'No se pudo consultar el estado de TFHKA' }, { status: 500 });
    }
}
