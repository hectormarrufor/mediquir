import { NextResponse } from 'next/server';
import sequelize from '@/sequelize';
import { requerirNoVendedor } from '../../../_lib/acceso';

export const dynamic = 'force-dynamic';

const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Buscador de retenciones de IVA que hacen los clientes (cuentas por cobrar). ?q= busca por N° de comprobante, factura, control, cliente o RIF.
//  · retenciones: las que ya existen (pendientes de comprobante, por revisar o registradas).
//  · facturas: facturas con IVA que todavía NO tienen retención, para crearles una (con la retención del 75 % que el sistema esperaría).
// ?soloFacturas=1 omite las retenciones (el paso «¿a qué factura se le hizo la retención?»).
export async function GET(request) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    try {
        const url = new URL(request.url);
        const texto = String(url.searchParams.get('q') || '').trim().slice(0, 60);
        const soloFacturas = url.searchParams.get('soloFacturas') === '1';
        if (texto.length < 2) return NextResponse.json({ retenciones: [], facturas: [] });
        const q = (sql) => sequelize.query(sql, { type: sequelize.QueryTypes.SELECT, replacements: { like: `%${texto.replace(/[%_]/g, (c) => '\\' + c)}%` } });

        const retenciones = soloFacturas ? [] : await q(
            `SELECT r.id, r."ventaId", r."facturaAfectada" AS documento, r.fecha, r.estado, r.comprobante, r."ivaRetenido"::float AS "ivaRetenidoBs", r."porcentajeRetencion"::float AS pct,
                    r."montoDeclarado"::float AS "montoDeclarado", v."numeroControl", cl.nombre AS cliente, cl.identificacion AS rif
               FROM "RetencionesIva" r JOIN "Ventas" v ON v.id = r."ventaId" LEFT JOIN "Clientes" cl ON cl.id = v."clienteId"
              WHERE r.tipo = 'VENTA' AND (r.comprobante ILIKE :like OR r."facturaAfectada" ILIKE :like OR v."numeroControl" ILIKE :like OR cl.nombre ILIKE :like OR cl.identificacion ILIKE :like)
              ORDER BY r.fecha DESC, r.id DESC LIMIT 30`);

        const facturas = await q(
            `SELECT v.id AS "ventaId", v."numeroDocumento" AS documento, v."numeroControl", (COALESCE(v."fechaEmision", v."createdAt") AT TIME ZONE 'America/Caracas')::date AS emision,
                    v.moneda::text AS moneda, v."tasaCambio"::float AS tasa, v."montoIva"::float AS iva, v."totalFinal"::float AS total, cl.nombre AS cliente, cl.identificacion AS rif
               FROM "Ventas" v LEFT JOIN "Clientes" cl ON cl.id = v."clienteId"
              WHERE v."tipoDocumento" = 'FACTURA' AND v."statusDespacho" <> 'Cancelado' AND v."montoIva" > 0
                AND NOT EXISTS (SELECT 1 FROM "RetencionesIva" r WHERE r."ventaId" = v.id)
                AND (v."numeroDocumento" ILIKE :like OR v."numeroControl" ILIKE :like OR cl.nombre ILIKE :like OR cl.identificacion ILIKE :like)
              ORDER BY v."createdAt" DESC LIMIT 20`);

        return NextResponse.json({
            retenciones: retenciones.map((r) => ({ ...r, fecha: iso(r.fecha) })),
            facturas: facturas.map((f) => {
                const ivaBs = f.moneda === 'BS' ? Number(f.iva) : Number(f.iva) * (Number(f.tasa) || 1);
                const totalBs = f.moneda === 'BS' ? Number(f.total) : Number(f.total) * (Number(f.tasa) || 1);
                return { ...f, emision: iso(f.emision), ivaBs: r2(ivaBs), totalBs: r2(totalBs), retencionEsperadaBs: r2(ivaBs * 0.75) };
            }),
        });
    } catch (error) {
        console.error('Buscador de retenciones:', error);
        return NextResponse.json({ error: 'No se pudo buscar' }, { status: 500 });
    }
}
