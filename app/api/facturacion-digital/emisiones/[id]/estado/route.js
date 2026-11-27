import { NextResponse } from 'next/server';
import db from '@/models';
import { requerirAdmin } from '@/app/api/_lib/acceso';
import { estadoDocumentoTfhka } from '@/app/api/_lib/tfhka';

export const dynamic = 'force-dynamic';
const { EmisionDigital } = db;

export async function POST(_request, { params }) {
    const acceso = await requerirAdmin();
    if (acceso.error) return acceso.error;

    try {
        const { id } = await params;
        const emision = await EmisionDigital.findByPk(id);
        if (!emision) {
            return NextResponse.json({ error: 'Emisión digital no encontrada' }, { status: 404 });
        }

        const { data } = await estadoDocumentoTfhka({
            serie: emision.serie || '',
            tipoDocumento: emision.tipoDocumento,
            numeroDocumento: emision.numeroDocumento,
            transaccionId: emision.transaccionId,
        });

        const ok = String(data?.codigo) === '200';
        if (ok && data?.estado) {
            const st = data.estado;
            const estadoDoc = String(st.estadoDocumento || '').toLowerCase();
            const updates = {
                numeroControl: st.numeroControl || emision.numeroControl,
                numeroDocumento: st.numeroDocumento || emision.numeroDocumento,
                urlConsulta: st.urlConsulta || emision.urlConsulta,
                fechaAsignacion: st.fechaAsignacion || emision.fechaAsignacion,
                horaAsignacion: st.horaAsignacion || emision.horaAsignacion,
            };
            if (estadoDoc.includes('anulad')) updates.estado = 'ANULADO';
            else if (estadoDoc.includes('enviad') || estadoDoc.includes('emitid')) updates.estado = 'EMITIDO';
            await emision.update(updates);
        }

        return NextResponse.json({ ok, emision, respuestaTfhka: data }, { status: ok ? 200 : 422 });
    } catch (error) {
        console.error('Error consultando estado de documento TFHKA:', error);
        return NextResponse.json({ error: error.message || 'No se pudo consultar el estado en TFHKA' }, { status: 500 });
    }
}
