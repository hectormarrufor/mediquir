import { NextResponse } from 'next/server';
import sequelize from '@/sequelize';
import { requerirNoVendedor } from '../../_lib/acceso';

export const dynamic = 'force-dynamic';

const USD = `(CASE WHEN v."moneda" = 'BS' THEN v."totalFinal" / NULLIF(v."tasaCambio", 0) ELSE v."totalFinal" END)`;
const SALDO_USD = (t) => `(CASE WHEN ${t}."moneda" = 'BS' THEN ${t}."saldoPendiente" / NULLIF(${t}."tasaCambio", 0) ELSE ${t}."saldoPendiente" END)`;
const DIA = `(v."createdAt" AT TIME ZONE 'America/Caracas')::date`;
const HOY = `(now() AT TIME ZONE 'America/Caracas')::date`;

// Pulso del negocio para el panel de inicio: ventas de hoy y de la semana, deudas, pedidos pendientes y stock bajo
export async function GET() {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;

    try {
        const q = (sql) => sequelize.query(sql, { type: sequelize.QueryTypes.SELECT });
        const activas = `v."statusDespacho" <> 'Cancelado'`;

        const [[ventas], serie, [cobrar], [pagar], [pedidos], stockBajo] = await Promise.all([
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
        ]);

        const cambio = ventas.ayerTotal > 0 ? ((ventas.hoyTotal - ventas.ayerTotal) / ventas.ayerTotal) * 100 : null;
        return NextResponse.json({
            ventas: { ...ventas, cambioVsAyer: cambio },
            serie,
            porCobrar: cobrar, porPagar: pagar, pedidos,
            stockBajo: { total: stockBajo.length, agotados: stockBajo.filter((p) => p.stock <= 0).length, top: stockBajo.slice(0, 5) },
        });
    } catch (error) {
        console.error('Resumen del panel:', error);
        return NextResponse.json({ error: 'No se pudo cargar el resumen' }, { status: 500 });
    }
}
