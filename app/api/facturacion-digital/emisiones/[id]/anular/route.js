import { NextResponse } from 'next/server';
import db from '@/models';
import { requerirAdmin } from '@/app/api/_lib/acceso';
import { anularDocumentoTfhka } from '@/app/api/_lib/tfhka';

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
            return NextResponse.json({ error: 'Este registro no tiene NumeroDocumento asignado en TFHKA' }, { status: 409 });
        }

        const body = await request.json();
        const motivoAnulacion = String(body?.motivoAnulacion || '').trim();
        if (!motivoAnulacion) {
            return NextResponse.json({ error: 'Debes indicar el motivo de la anulación' }, { status: 400 });
        }

        const { data } = await anularDocumentoTfhka({
            serie: emision.serie || '',
            tipoDocumento: emision.tipoDocumento,
            numeroDocumento: emision.numeroDocumento,
            motivoAnulacion,
        });

        const ok = String(data?.codigo) === '200';
        if (ok) {
            await emision.update({
                estado: 'ANULADO',
                anuladoMotivo: motivoAnulacion.slice(0, 255),
                anuladoAt: new Date(),
                respuestaCruda: data,
            });
            return NextResponse.json({ ok: true, emision, respuestaTfhka: data }, { status: 200 });
        }

        const validaciones = Array.isArray(data?.validaciones) ? data.validaciones.filter(Boolean) : [];
        const baseMsg = data?.mensaje || data?.rawText || 'TFHKA rechazó la anulación';
        const codigoStr = data?.codigo !== undefined && data?.codigo !== null ? `Código ${data.codigo}: ` : '';
        const error = `${codigoStr}${baseMsg}${validaciones.length ? ` (${validaciones.join(' · ')})` : ''}`;

        return NextResponse.json({ ok: false, error, emision, respuestaTfhka: data }, { status: 422 });
    } catch (error) {
        console.error('Error anulando documento TFHKA:', error);
        return NextResponse.json({ error: error.message || 'No se pudo anular el documento' }, { status: 500 });
    }
}
