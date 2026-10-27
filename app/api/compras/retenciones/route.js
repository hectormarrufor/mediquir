import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import db from '@/models';
import { requerirNoVendedor } from '../../_lib/acceso';
import { retenerFacturas, proximoComprobante, ErrorRetencion } from '../../_lib/retenciones';
import { ErrorNumeracion } from '../../_lib/numeracion';
import { fechaCaracas } from '@/app/constants/hora';

export const dynamic = 'force-dynamic';

const { sequelize, RetencionIva } = db;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

const responderError = (error, contexto) => {
    if (error instanceof ErrorRetencion || error instanceof ErrorNumeracion) {
        return NextResponse.json({ error: error.message, codigo: error.codigo || null }, { status: error.status || 400 });
    }
    console.error(contexto, error);
    return NextResponse.json({ error: 'No se pudo completar la retención' }, { status: 500 });
};

// GET ?fecha=AAAA-MM-DD → el número que le toca al próximo comprobante fechado ese día.
// GET ?desde=&hasta=     → además, los comprobantes emitidos en ese rango (uno por número, con sus facturas).
export async function GET(request) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    try {
        const p = new URL(request.url).searchParams;
        const fecha = FECHA.test(p.get('fecha') || '') ? p.get('fecha') : fechaCaracas();
        const proximo = await proximoComprobante(fecha);
        let comprobantes;
        if (FECHA.test(p.get('desde') || '') && FECHA.test(p.get('hasta') || '')) {
            const filas = await RetencionIva.findAll({
                where: { tipo: 'COMPRA', estado: 'REGISTRADA', comprobante: { [Op.ne]: null }, fecha: { [Op.between]: [p.get('desde'), p.get('hasta')] } },
                order: [['comprobante', 'DESC'], ['id', 'ASC']],
            });
            const porNumero = new Map();
            for (const r of filas) {
                const c = porNumero.get(r.comprobante) || {
                    comprobante: r.comprobante, fecha: r.fecha, proveedor: r.contraparteNombre, rif: r.contraparteRif,
                    porcentaje: Number(r.porcentajeRetencion), facturas: [], facturaIds: [], retenidoBs: 0,
                };
                c.facturas.push(r.facturaAfectada);
                if (r.facturaCompraId) c.facturaIds.push(r.facturaCompraId);
                c.retenidoBs = Math.round((c.retenidoBs + Number(r.ivaRetenido)) * 100) / 100;
                porNumero.set(r.comprobante, c);
            }
            comprobantes = [...porNumero.values()];
        }
        return NextResponse.json({ proximo, comprobantes });
    } catch (error) {
        return responderError(error, 'Retenciones (consulta):');
    }
}

// POST { facturaIds, porcentaje?, fecha? } → un comprobante para esas facturas (de un mismo proveedor) con el siguiente número
export async function POST(request) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    const t = await sequelize.transaction();
    try {
        const body = await request.json();
        const r = await retenerFacturas({ facturaIds: body.facturaIds, porcentaje: body.porcentaje, fecha: body.fecha, registradoPorId: Number(acceso.sesion?.id) || null }, t);
        await t.commit();
        return NextResponse.json({ success: true, ...r });
    } catch (error) {
        if (!t.finished) await t.rollback();
        return responderError(error, 'Retenciones (emitir):');
    }
}

// DELETE { facturaId } → «no se retiene»: quita la retención PENDIENTE de esa factura (por ejemplo, se pagó con la tarjeta de la empresa).
// Un comprobante ya emitido no se borra desde aquí.
export async function DELETE(request) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    try {
        const { facturaId } = await request.json();
        const borradas = await RetencionIva.destroy({ where: { facturaCompraId: String(facturaId || ''), tipo: 'COMPRA', estado: 'PENDIENTE', comprobante: null } });
        if (!borradas) return NextResponse.json({ error: 'Esa factura no tiene una retención pendiente' }, { status: 404 });
        return NextResponse.json({ success: true });
    } catch (error) {
        return responderError(error, 'Retenciones (descartar):');
    }
}
