import { NextResponse } from 'next/server';
import db from '@/models';
import { requerirAdmin } from '@/app/api/_lib/acceso';
import { configTfhka, construirDocumentoTfhka, emitirDocumentoTfhka } from '@/app/api/_lib/tfhka';
import { tasaDelDia, tasaVigente } from '@/app/api/_lib/tasaBcv';
import { fechaCaracas } from '@/app/constants/hora';

export const dynamic = 'force-dynamic';
const { EmisionDigital } = db;

export async function POST(request) {
    const acceso = await requerirAdmin();
    if (acceso.error) return acceso.error;

    try {
        const cfg = configTfhka();
        if (!cfg.configurado) {
            return NextResponse.json(
                { error: 'Faltan variables de entorno de TFHKA en el servidor (TFHKA_ENV, TFHKA_BASE_URL, TFHKA_USUARIO, TFHKA_CLAVE).' },
                { status: 400 },
            );
        }

        const body = await request.json();
        const fechaEmision = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.fechaEmision || ''))
            ? String(body.fechaEmision)
            : fechaCaracas();

        let tasaCambio = Number(body?.tasaCambio);
        if (!(tasaCambio > 0) && body?.incluirEquivalenteUsd !== false) {
            try {
                tasaCambio = (await tasaDelDia(fechaEmision)) || (await tasaVigente());
            } catch {
                tasaCambio = 0;
            }
        }

        const { payload, resumen } = construirDocumentoTfhka({
            ...body,
            fechaEmision,
            tasaCambio,
        });

        const { data } = await emitirDocumentoTfhka(payload);
        const codigo = data?.codigo !== undefined && data?.codigo !== null ? String(data.codigo) : null;
        const resultado = data?.resultado || null;

        let estado = 'ERROR';
        if (codigo === '200') estado = 'EMITIDO';
        else if (codigo === '201') estado = 'DUPLICADO';

        const emision = await EmisionDigital.create({
            ambiente: cfg.ambiente,
            proveedor: 'TFHKA',
            ventaId: body?.ventaId || null,
            tipoDocumento: resumen.tipoDocumento,
            serie: resultado?.serie ?? resumen.serie,
            numeroDocumento: resultado?.numeroDocumento || resumen.numeroDocumento,
            transaccionId: resultado?.transaccionId || resumen.transaccionId,
            numeroControl: resultado?.numeroControl || null,
            estado,
            fechaEmision: resumen.fechaEmisionIso,
            moneda: 'BSD',
            tasaCambio: resumen.tasaCambio,
            clienteRif: resumen.clienteRif,
            clienteNombre: resumen.clienteNombre,
            totalBs: resumen.totalBs,
            totalUsd: resumen.totalUsd,
            urlConsulta: resultado?.urlConsulta || null,
            fechaAsignacion: resultado?.fechaAsignacion || null,
            horaAsignacion: resultado?.horaAsignacion || null,
            rangoAsignado: resultado?.rangoAsignado || null,
            codigoRespuesta: codigo,
            mensajeRespuesta: data?.mensaje || data?.rawText || null,
            validaciones: Array.isArray(data?.validaciones) ? data.validaciones : null,
            payloadEnviado: payload,
            respuestaCruda: data,
            usuarioId: Number(acceso.sesion.id) || null,
        });

        const ok = estado === 'EMITIDO' || estado === 'DUPLICADO';
        return NextResponse.json(
            { ok, emision, respuestaTfhka: data },
            { status: ok ? 200 : 422 },
        );
    } catch (error) {
        console.error('Error emitiendo documento digital TFHKA:', error);
        return NextResponse.json(
            { error: error.message || 'No se pudo emitir el documento en TFHKA' },
            { status: 400 },
        );
    }
}
