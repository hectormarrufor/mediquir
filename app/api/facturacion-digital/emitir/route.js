import { NextResponse } from 'next/server';
import db from '@/models';
import { requerirAdmin } from '@/app/api/_lib/acceso';
import { configTfhka, construirDocumentoTfhka, emitirDocumentoTfhka, ultimoDocumentoTfhka } from '@/app/api/_lib/tfhka';
import { tasaDelDia, tasaVigente } from '@/app/api/_lib/tasaBcv';
import { fechaCaracas } from '@/app/constants/hora';

export const dynamic = 'force-dynamic';
const { EmisionDigital, sequelize } = db;

async function calcularSiguienteNumero({ ambiente, serie, tipoDocumento }) {
    let ultimoTfhka = 0;
    try {
        const res = await ultimoDocumentoTfhka({ serie, tipoDocumento });
        const n = Number(res?.data?.numeroDocumento);
        if (Number.isFinite(n) && n > 0) ultimoTfhka = n;
    } catch {
        // Si TFHKA aún no tiene documentos en esa serie/tipo, arrancamos desde el local o 1
    }

    let ultimoLocal = 0;
    try {
        const [fila] = await sequelize.query(
            `SELECT MAX(CAST("numeroDocumento" AS bigint)) AS max_n
               FROM "EmisionesDigitales"
              WHERE "ambiente" = :ambiente
                AND "tipoDocumento" = :tipoDocumento
                AND "serie" = :serie
                AND "estado" IN ('EMITIDO', 'DUPLICADO', 'ANULADO')
                AND "numeroDocumento" ~ '^[0-9]+$'`,
            {
                replacements: { ambiente, tipoDocumento, serie },
                type: sequelize.QueryTypes.SELECT,
            },
        );
        const n = Number(fila?.max_n);
        if (Number.isFinite(n) && n > 0) ultimoLocal = n;
    } catch {
        // Ignorar si no hay filas aún
    }

    return String(Math.max(ultimoTfhka, ultimoLocal) + 1);
}

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
        const tipoDocumento = String(body?.tipoDocumento || '01').trim();
        const serie = String(body?.serie ?? cfg.serieDefault ?? '').trim().slice(0, 20);
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

        const numeroManual = String(body?.numeroDocumento || '').replace(/\D/g, '');
        const esAutoCorrelativo = !numeroManual;
        let numeroAsignado = numeroManual || await calcularSiguienteNumero({
            ambiente: cfg.ambiente,
            serie,
            tipoDocumento,
        });

        let { payload, resumen } = construirDocumentoTfhka({
            ...body,
            tipoDocumento,
            serie,
            modoNumeracion: 'MANUAL',
            numeroDocumento: numeroAsignado,
            fechaEmision,
            tasaCambio,
        });

        let { data } = await emitirDocumentoTfhka(payload);

        // Si TFHKA indica secuencia esperada (código 203 con numeroDocumentoEsperado) y el número era automático, reintentar una vez con el esperado
        const esperado = String(data?.resultado?.numeroDocumentoEsperado || '').replace(/\D/g, '');
        if (esAutoCorrelativo && String(data?.codigo) === '203' && esperado && Number(esperado) > 0 && esperado !== numeroAsignado) {
            numeroAsignado = esperado;
            ({ payload, resumen } = construirDocumentoTfhka({
                ...body,
                tipoDocumento,
                serie,
                modoNumeracion: 'MANUAL',
                numeroDocumento: numeroAsignado,
                fechaEmision,
                tasaCambio,
            }));
            ({ data } = await emitirDocumentoTfhka(payload));
        }

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
