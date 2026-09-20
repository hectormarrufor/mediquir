import { NextResponse } from 'next/server';
import sequelize from '@/sequelize';
import { requerirNoVendedor } from '../../_lib/acceso';

export const dynamic = 'force-dynamic';

const USD = `(CASE WHEN v."moneda" = 'BS' THEN v."totalFinal" / NULLIF(v."tasaCambio", 0) ELSE v."totalFinal" END)`;
const SALDO_USD = (t) => `(CASE WHEN ${t}."moneda" = 'BS' THEN ${t}."saldoPendiente" / NULLIF(${t}."tasaCambio", 0) ELSE ${t}."saldoPendiente" END)`;
const DIA = `(v."createdAt" AT TIME ZONE 'America/Caracas')::date`;
const HOY = `(now() AT TIME ZONE 'America/Caracas')::date`;
const IVA_USD = `(CASE WHEN v."moneda" = 'BS' THEN v."montoIva" / NULLIF(v."tasaCambio", 0) ELSE v."montoIva" END)`;

// Pulso del negocio para el panel de inicio: ventas de hoy y de la semana, deudas, pedidos pendientes y stock bajo
export async function GET() {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;

    try {
        const q = (sql) => sequelize.query(sql, { type: sequelize.QueryTypes.SELECT });
        const activas = `v."statusDespacho" <> 'Cancelado'`;

        const [[ventas], serie, [cobrar], [pagar], [pedidos], stockBajo, [tienda], [iva], [alertas]] = await Promise.all([
            q(`SELECT
                COALESCE(SUM(${USD}) FILTER (WHERE ${DIA} = ${HOY}), 0)::float AS "hoyTotal",
                COUNT(*) FILTER (WHERE ${DIA} = ${HOY})::int AS "hoyVentas",
                COALESCE(SUM(${USD}) FILTER (WHERE ${DIA} = ${HOY} - 1), 0)::float AS "ayerTotal",
                COALESCE(SUM(${USD}) FILTER (WHERE date_trunc('month', ${DIA}) = date_trunc('month', ${HOY})), 0)::float AS "mesTotal",
                COUNT(*) FILTER (WHERE date_trunc('month', ${DIA}) = date_trunc('month', ${HOY}))::int AS "mesVentas"
               FROM "Ventas" v WHERE ${activas} AND ${DIA} >= date_trunc('month', ${HOY} - 31)::date`),
            q(`SELECT to_char(d::date, 'YYYY-MM-DD') AS dia, COALESCE(s.total, 0)::float AS total
               FROM generate_series(${HOY} - 6, ${HOY}, interval '1 day') d
               LEFT JOIN (SELECT ${DIA} AS dia, SUM(${USD}) AS total FROM "Ventas" v WHERE ${activas} GROUP BY 1) s ON s.dia = d::date ORDER BY 1`),
            q(`SELECT COALESCE(SUM(${SALDO_USD('c')}), 0)::float AS total,
                COUNT(*) FILTER (WHERE c."fechaVencimiento" < ${HOY})::int AS vencidas,
                COALESCE(SUM(${SALDO_USD('c')}) FILTER (WHERE c."fechaVencimiento" < ${HOY}), 0)::float AS "montoVencido"
               FROM "CuentasPorCobrar" c WHERE c."estado" <> 'Pagado' AND c."saldoPendiente" > 0`),
            q(`SELECT COALESCE(SUM(${SALDO_USD('c')}), 0)::float AS total,
                COUNT(*) FILTER (WHERE c."fechaVencimiento" < ${HOY})::int AS vencidas,
                COUNT(*) FILTER (WHERE c."fechaVencimiento" BETWEEN ${HOY} AND ${HOY} + 7)::int AS "porVencer"
               FROM "CuentasPorPagar" c WHERE c."estado" <> 'Pagado' AND c."saldoPendiente" > 0`),
            q(`SELECT
                COUNT(*) FILTER (WHERE v."statusDespacho" IN ('Pendiente', 'Empacado', 'Parcial') AND v."tipoVenta" <> 'DETAL')::int AS "porDespachar",
                COUNT(*) FILTER (WHERE v."statusDespacho" = 'Pendiente' AND v."tipoVenta" <> 'DETAL' AND v."empacadorId" IS NULL)::int AS "sinAsignar"
               FROM "Ventas" v`),
            q(`SELECT p."id", p."nombre", p."stockAlmacen"::float AS stock, p."stockMinimo"::float AS minimo FROM "Productos" p
               WHERE p."stockMinimo" > 0 AND p."stockAlmacen" <= p."stockMinimo" AND p."grupoEquivalenciaId" IS NULL
               ORDER BY (p."stockAlmacen" / NULLIF(p."stockMinimo", 0)) ASC LIMIT 200`),
            // Tienda online: compras de hoy y recibos (V-) del mes que todavía no son factura
            q(`SELECT COALESCE(SUM(${USD}) FILTER (WHERE ${DIA} = ${HOY}), 0)::float AS "hoyTotal",
                COUNT(*) FILTER (WHERE ${DIA} = ${HOY})::int AS "hoyCompras",
                COUNT(*) FILTER (WHERE v."tipoDocumento" = 'VENTA_RAPIDA' AND date_trunc('month', ${DIA}) = date_trunc('month', ${HOY}))::int AS "recibosMes"
               FROM "Ventas" v WHERE v."tipoVenta" = 'ONLINE' AND ${activas}`),
            // IVA de las facturas emitidas este mes (la fecha de emisión manda: una factura convertida cuenta en el mes en que se emite)
            q(`SELECT COALESCE(SUM(${IVA_USD}), 0)::float AS "mes" FROM "Ventas" v
               WHERE v."tipoDocumento" = 'FACTURA' AND ${activas}
                 AND date_trunc('month', (COALESCE(v."fechaEmision", v."createdAt") AT TIME ZONE 'America/Caracas')::date) = date_trunc('month', ${HOY})`),
            // Pedidos B2B en revisión de existencias y retenciones de IVA que esperan al cliente o a administración
            q(`SELECT
                (SELECT COUNT(*) FROM "Ventas" v WHERE v."revisionStock" = 'PENDIENTE' AND ${activas})::int AS "enRevision",
                (SELECT COUNT(*) FROM "Ventas" v WHERE v."verificacionPago" = 'POR_VERIFICAR' AND ${activas})::int AS "porVerificar",
                (SELECT COUNT(*) FROM "IntentosPago" i WHERE i."resultado" IN ('NO_ENCONTRADO', 'MONTO', 'BLOQUEADO') AND i."createdAt" >= now() - interval '24 hours')::int AS "intentosFallidos",
                (SELECT COUNT(*) FROM "RetencionesIva" r WHERE r."tipo" = 'VENTA' AND r."estado" = 'PENDIENTE')::int AS "retencionesPendientes",
                (SELECT COUNT(*) FROM "RetencionesIva" r WHERE r."tipo" = 'VENTA' AND r."estado" = 'POR_REVISAR')::int AS "retencionesPorRevisar"`),
        ]);

        const cambio = ventas.ayerTotal > 0 ? ((ventas.hoyTotal - ventas.ayerTotal) / ventas.ayerTotal) * 100 : null;
        return NextResponse.json({
            ventas: { ...ventas, cambioVsAyer: cambio },
            serie,
            porCobrar: cobrar, porPagar: pagar, pedidos, tienda, ivaMes: iva.mes, alertas,
            stockBajo: { total: stockBajo.length, agotados: stockBajo.filter((p) => p.stock <= 0).length, top: stockBajo.slice(0, 5) },
        });
    } catch (error) {
        console.error('Resumen del panel:', error);
        return NextResponse.json({ error: 'No se pudo cargar el resumen' }, { status: 500 });
    }
}
