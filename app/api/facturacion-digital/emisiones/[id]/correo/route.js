import { NextResponse } from 'next/server';
import db from '@/models';
import { requerirAdmin } from '@/app/api/_lib/acceso';
import { enviarCorreoTfhka } from '@/app/api/_lib/tfhka';

export const dynamic = 'force-dynamic';
const { EmisionDigital } = db;

export async function POST(request, { params }) {
    const acceso = await requerirAdmin();
    if (acceso.error) return acceso.error;

    try {
        const { id } = await params;
        const emision = await EmisionDigital.findByPk(id);
        if (!emision) {
            return NextResponse.json({ error: 'Emisión digital no encontrada' }, { status: 404 });
        }
        if (!emision.numeroDocumento) {
            return NextResponse.json({ error: 'Este documento no tiene número asignado en TFHKA' }, { status: 409 });
        }

        const body = await request.json();
        const lista = Array.isArray(body?.correos)
            ? body.correos
            : String(body?.correos || '').split(/[,\s;]+/);
        const correos = lista
            .map((c) => String(c || '').trim())
            .filter((c) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c));

        if (!correos.length) {
            return NextResponse.json({ error: 'Indica al menos un correo electrónico válido' }, { status: 400 });
        }

        const { data } = await enviarCorreoTfhka({
            serie: emision.serie || '',
            tipoDocumento: emision.tipoDocumento,
            numeroDocumento: emision.numeroDocumento,
            correos,
        });

        const ok = String(data?.codigo) === '200';
        return NextResponse.json({ ok, respuestaTfhka: data }, { status: ok ? 200 : 422 });
    } catch (error) {
        console.error('Error enviando correo TFHKA:', error);
        return NextResponse.json({ error: error.message || 'No se pudo enviar el correo' }, { status: 500 });
    }
}
