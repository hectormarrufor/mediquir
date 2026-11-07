import { NextResponse } from 'next/server';
import db from '@/models';
import sequelize from '@/sequelize';
import { requerirNoVendedor } from '../../_lib/acceso';
import { numeroDeDocumento, porcentajeValido, baseDePago, PCT_MIN, PCT_MAX } from '../route';
import { fechaCaracas } from '@/app/constants/hora';

export const dynamic = 'force-dynamic';
const { ComisionVenta, Venta } = db;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const numOpt = (v) => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : r2(v));

// Corrige una línea de la hoja de un vendedor. Si cambia la base o el porcentaje y no se manda la comisión, se recalcula (base x % / 100).
// Al marcarla PAGADA sin fecha, toma la de hoy.
export async function PATCH(request, { params }) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    try {
        const { id } = await params;
        const linea = await ComisionVenta.findByPk(Number(id));
        if (!linea) return NextResponse.json({ error: 'Esa línea ya no existe' }, { status: 404 });
        const b = await request.json();
        const c = {};
        const tiene = (k) => Object.prototype.hasOwnProperty.call(b, k);
        for (const k of ['fecha', 'vencimiento', 'fechaPagoComision']) if (tiene(k)) {
            if (b[k] && !FECHA.test(String(b[k]))) return NextResponse.json({ error: `La fecha "${k}" no es válida` }, { status: 400 });
            c[k] = b[k] || null;
        }
        for (const k of ['montoUsd', 'baseUsd', 'porcentaje', 'comisionUsd']) if (tiene(k)) c[k] = numOpt(b[k]);
        if (tiene('porcentaje') && !porcentajeValido(c.porcentaje)) return NextResponse.json({ error: `El porcentaje de comisión debe estar entre ${PCT_MIN}% y ${PCT_MAX}%` }, { status: 400 });
        if (tiene('estatusCliente')) c.estatusCliente = String(b.estatusCliente || '').trim().slice(0, 120) || null;
        if (tiene('observacion')) c.observacion = String(b.observacion || '').trim() || null;
        if (tiene('clienteTexto')) c.clienteTexto = String(b.clienteTexto || '').trim().slice(0, 200) || null;
        if (tiene('concepto') && ['FACTURA', 'ABONO', 'NOTA'].includes(b.concepto)) c.concepto = b.concepto;
        if (tiene('documentoTexto')) {
            c.documentoTexto = String(b.documentoTexto || '').trim().slice(0, 60) || null;
            const numero = numeroDeDocumento(c.documentoTexto);
            const venta = numero ? await Venta.findOne({ where: { numeroDocumento: numero }, attributes: ['id'] }) : null;
            c.ventaId = venta?.id || null; // vuelve a relacionarla con su factura
        }
        if (tiene('estatusComision')) {
            if (!['PENDIENTE', 'PAGADA'].includes(b.estatusComision)) return NextResponse.json({ error: 'El estatus de la comisión debe ser PENDIENTE o PAGADA' }, { status: 400 });
            c.estatusComision = b.estatusComision;
            if (b.estatusComision === 'PAGADA' && !c.fechaPagoComision && !linea.fechaPagoComision) c.fechaPagoComision = fechaCaracas();
            if (b.estatusComision === 'PENDIENTE') c.fechaPagoComision = null;
        }
        if ((tiene('baseUsd') || tiene('porcentaje')) && !tiene('comisionUsd')) {
            const base = c.baseUsd !== undefined ? c.baseUsd : (linea.baseUsd === null ? null : Number(linea.baseUsd));
            const pct = c.porcentaje !== undefined ? c.porcentaje : (linea.porcentaje === null ? null : Number(linea.porcentaje));
            if (base !== null && pct !== null) c.comisionUsd = r2((base * pct) / 100);
        }
        // al corregir el monto de un abono, su comisión se recalcula sola (sobre la parte sin IVA), salvo que se mande la base o la comisión
        const esAbono = (c.concepto || linea.concepto) === 'ABONO';
        if (tiene('montoUsd') && esAbono && c.montoUsd !== null && !tiene('baseUsd') && !tiene('comisionUsd')) {
            c.baseUsd = await baseDePago(linea.vendedorId, c.documentoTexto ?? linea.documentoTexto, c.montoUsd);
            const pct = c.porcentaje !== undefined ? c.porcentaje : (linea.porcentaje === null ? null : Number(linea.porcentaje));
            if (c.baseUsd !== null && pct !== null) c.comisionUsd = r2((c.baseUsd * pct) / 100);
        }
        await linea.update(c);
        // el porcentaje se fija en la FACTURA: al cambiarlo, los abonos que aún no se han pagado (los amarillos) toman el nuevo y recalculan su comisión
        // (los ya pagados no se tocan)
        let hijosActualizados = 0;
        if (tiene('porcentaje') && c.porcentaje !== null && c.porcentaje !== undefined && linea.concepto === 'FACTURA' && Number(linea.montoUsd) > 0 && linea.documentoTexto) {
            const [, meta] = await sequelize.query(
                `UPDATE "ComisionesVenta" SET porcentaje = :p, "comisionUsd" = CASE WHEN "baseUsd" IS NOT NULL THEN round("baseUsd" * :p / 100, 2) ELSE "comisionUsd" END, "updatedAt" = now()
                  WHERE "vendedorId" = :v AND "documentoTexto" = :d AND id <> :id AND "estatusComision" <> 'PAGADA' AND (concepto = 'ABONO' OR ("montoUsd" < 0 AND concepto <> 'NOTA'))`,
                { replacements: { p: c.porcentaje, v: linea.vendedorId, d: linea.documentoTexto, id: linea.id } },
            );
            hijosActualizados = meta?.rowCount ?? 0;
        }
        return NextResponse.json({ ok: true, linea, hijosActualizados });
    } catch (error) {
        console.error('Editar comisión:', error);
        return NextResponse.json({ error: 'No se pudo guardar el cambio' }, { status: 500 });
    }
}

export async function DELETE(request, { params }) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    try {
        const { id } = await params;
        const n = await ComisionVenta.destroy({ where: { id: Number(id) } });
        return n ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Esa línea ya no existe' }, { status: 404 });
    } catch (error) {
        console.error('Borrar comisión:', error);
        return NextResponse.json({ error: 'No se pudo borrar la línea' }, { status: 500 });
    }
}
