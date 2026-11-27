import { NextResponse } from 'next/server';
import db from '@/models';
import { requerirAdmin } from '@/app/api/_lib/acceso';
import { descargarArchivoTfhka } from '@/app/api/_lib/tfhka';

export const dynamic = 'force-dynamic';
const { EmisionDigital } = db;

const MIME_TIPOS = {
    pdf: 'application/pdf',
    xml: 'application/xml; charset=utf-8',
    json: 'application/json; charset=utf-8',
};

export async function GET(request, { params }) {
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

        const tipoParam = String(new URL(request.url).searchParams.get('tipo') || 'pdf').toLowerCase();
        const tipoArchivo = ['pdf', 'xml', 'json'].includes(tipoParam) ? tipoParam : 'pdf';

        const { data } = await descargarArchivoTfhka({
            serie: emision.serie || '',
            tipoDocumento: emision.tipoDocumento,
            numeroDocumento: emision.numeroDocumento,
            tipoArchivo,
        });

        if (String(data?.codigo) !== '200' || !data?.archivo) {
            return NextResponse.json(
                { error: data?.mensaje || 'TFHKA no devolvió el archivo solicitado', respuestaTfhka: data },
                { status: 422 },
            );
        }

        const buffer = Buffer.from(data.archivo, 'base64');
        const nombreArchivo = `TFHKA-${emision.tipoDocumento}-${emision.numeroDocumento}.${tipoArchivo}`;
        return new NextResponse(buffer, {
            status: 200,
            headers: {
                'Content-Type': MIME_TIPOS[tipoArchivo],
                'Content-Disposition': `inline; filename="${nombreArchivo}"`,
                'Cache-Control': 'no-store',
            },
        });
    } catch (error) {
        console.error('Error descargando archivo TFHKA:', error);
        return NextResponse.json({ error: error.message || 'No se pudo descargar el archivo' }, { status: 500 });
    }
}
