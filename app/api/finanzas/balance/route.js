import { NextResponse } from 'next/server';
import sequelize from '@/sequelize';
import { requerirNoVendedor } from '../../_lib/acceso';

export const dynamic = 'force-dynamic';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const VENTA_USD = `(CASE WHEN v."moneda" = 'BS' THEN v."totalFinal" / NULLIF(v."tasaCambio", 0) ELSE v."totalFinal" END)`;
const IVA_VENTA_USD = `(CASE WHEN v."moneda" = 'BS' THEN v."montoIva" / NULLIF(v."tasaCambio", 0) ELSE v."montoIva" END)`;
const IVA_COMPRA_USD = `(CASE WHEN f."moneda" = 'BS' THEN f."montoIva" / NULLIF(f."tasaCambio", 0) ELSE f."montoIva" END)`;

// Notas de crédito (restan) y de débito (suman) vigentes de un origen en el rango: IVA y total en USD
const NOTAS_USD = (campo, origen) => `(SELECT COALESCE(SUM((CASE WHEN n."tipo" = 'DEBITO' THEN 1 ELSE -1 END) * (CASE WHEN n."moneda" = 'BS' THEN n."${campo}" / NULLIF(n."tasaCambio", 0) ELSE n."${campo}" END)), 0)::float
    FROM "NotasFiscales" n WHERE n."origen" = '${origen}' AND n."estado" = 'EMITIDA' AND n."fecha" BETWEEN :desde AND :hasta)`;

// El IVA que se cobra al vender no es ingreso de la empresa: el sistema lo asienta aparte con esta categoría
const CAT_IVA = 'IVA Recaudado';

// Balance de un rango de fechas: resultado del periodo, series para gráficos, posición actual e IVA del periodo
export async function GET(request) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;

    try {
        const { searchParams } = new URL(request.url);
        const desde = searchParams.get('desde');
        const hasta = searchParams.get('hasta');
        if (!FECHA.test(desde || '') || !FECHA.test(hasta || '')) return NextResponse.json({ error: 'Rango de fechas inválido' }, { status: 400 });

        const rep = { desde, hasta, catIva: CAT_IVA };
        const q = (sql) => sequelize.query(sql, { replacements: rep, type: sequelize.QueryTypes.SELECT });
        const enRango = `m."fecha" BETWEEN :desde AND :hasta`;
        const desdeMov = `FROM "MovimientosFinancieros" m LEFT JOIN "CategoriasFinancieras" c ON c."id" = m."categoriaId"`;

        const [[kpi], porDia, porCategoria, porMetodo, mensual, [posicion], [iva]] = await Promise.all([
            q(`SELECT
                COALESCE(SUM(m."montoUsd") FILTER (WHERE m."tipo" = 'INGRESO' AND COALESCE(c."nombre", '') <> :catIva), 0)::float AS ingresos,
                COALESCE(SUM(m."montoUsd") FILTER (WHERE m."tipo" = 'INGRESO' AND c."nombre" = :catIva), 0)::float AS "ivaRecaudado",
                COALESCE(SUM(m."montoUsd") FILTER (WHERE m."tipo" = 'GASTO'), 0)::float AS gastos,
                COUNT(*)::int AS movimientos
                ${desdeMov} WHERE ${enRango}`),
            q(`SELECT to_char(m."fecha", 'YYYY-MM-DD') AS dia,
                COALESCE(SUM(m."montoUsd") FILTER (WHERE m."tipo" = 'INGRESO' AND COALESCE(c."nombre", '') <> :catIva), 0)::float AS ingresos,
                COALESCE(SUM(m."montoUsd") FILTER (WHERE m."tipo" = 'GASTO'), 0)::float AS gastos
                ${desdeMov} WHERE ${enRango} GROUP BY 1 ORDER BY 1`),
            q(`SELECT m."tipo", COALESCE(c."nombre", 'Sin categoría') AS nombre, SUM(m."montoUsd")::float AS monto
                ${desdeMov} WHERE ${enRango} AND COALESCE(c."nombre", '') <> :catIva GROUP BY 1, 2 ORDER BY 3 DESC`),
            q(`SELECT m."metodoPago" AS metodo, SUM(m."montoUsd")::float AS monto
                ${desdeMov} WHERE ${enRango} AND m."tipo" = 'INGRESO' AND COALESCE(c."nombre", '') <> :catIva GROUP BY 1 ORDER BY 2 DESC`),
            // Últimos 12 meses (independiente del rango elegido) para ver la tendencia
            q(`SELECT to_char(date_trunc('month', m."fecha"), 'YYYY-MM') AS mes,
                COALESCE(SUM(m."montoUsd") FILTER (WHERE m."tipo" = 'INGRESO' AND COALESCE(c."nombre", '') <> :catIva), 0)::float AS ingresos,
                COALESCE(SUM(m."montoUsd") FILTER (WHERE m."tipo" = 'GASTO'), 0)::float AS gastos
                ${desdeMov} WHERE m."fecha" >= (date_trunc('month', now() AT TIME ZONE 'America/Caracas') - interval '11 months')::date
                GROUP BY 1 ORDER BY 1`),
            // Posición actual (no depende del rango): lo que hay en almacén a costo, lo que te deben y lo que debes
            q(`SELECT
                (SELECT COALESCE(SUM("stockAlmacen" * "costoUsd"), 0)::float FROM "Productos") AS inventario,
                (SELECT COALESCE(SUM(CASE WHEN "moneda" = 'BS' THEN "saldoPendiente" / NULLIF("tasaCambio", 0) ELSE "saldoPendiente" END), 0)::float FROM "CuentasPorCobrar" WHERE "estado" <> 'Pagado')
                 + (SELECT COALESCE(SUM(GREATEST(v."totalFinal" - COALESCE((SELECT SUM(a."montoUsd") FROM "Abonos" a WHERE a."ventaId" = v."id"), 0), 0)), 0)::float
                    FROM "Ventas" v WHERE v."clienteId" IS NOT NULL AND v."statusPago" <> 'Pagado' AND v."statusDespacho" <> 'Cancelado' AND v."moneda" = 'USD'
                      AND NOT EXISTS (SELECT 1 FROM "CuentasPorCobrar" x WHERE x."ventaId" = v."id")) AS "porCobrar",
                (SELECT COALESCE(SUM(CASE WHEN "moneda" = 'BS' THEN "saldoPendiente" / NULLIF("tasaCambio", 0) ELSE "saldoPendiente" END), 0)::float FROM "CuentasPorPagar" WHERE "estado" <> 'Pagado') AS "porPagar",
                (SELECT COALESCE(SUM(CASE WHEN m."tipo" = 'INGRESO' THEN m."montoUsd" ELSE -m."montoUsd" END), 0)::float
                    FROM "MovimientosFinancieros" m LEFT JOIN "CategoriasFinancieras" c ON c."id" = m."categoriaId" WHERE COALESCE(c."nombre", '') <> :catIva) AS "flujoAcumulado"`),
            q(`SELECT
                (SELECT COALESCE(SUM(${IVA_VENTA_USD}), 0)::float FROM "Ventas" v WHERE v."tipoDocumento" = 'FACTURA' AND (COALESCE(v."fechaEmision", v."createdAt") AT TIME ZONE 'America/Caracas')::date BETWEEN :desde AND :hasta AND v."statusDespacho" <> 'Cancelado') + ${NOTAS_USD('montoIva', 'VENTA')} AS debito,
                (SELECT COALESCE(SUM(${IVA_COMPRA_USD}), 0)::float FROM "FacturasCompras" f WHERE f."fechaFactura" BETWEEN :desde AND :hasta) + ${NOTAS_USD('montoIva', 'COMPRA')} AS credito,
                (SELECT COALESCE(SUM(${VENTA_USD}), 0)::float FROM "Ventas" v WHERE v."tipoDocumento" = 'FACTURA' AND (COALESCE(v."fechaEmision", v."createdAt") AT TIME ZONE 'America/Caracas')::date BETWEEN :desde AND :hasta AND v."statusDespacho" <> 'Cancelado') + ${NOTAS_USD('totalFinal', 'VENTA')} AS facturado`),
        ]);

        const utilidad = Number((kpi.ingresos - kpi.gastos).toFixed(2));
        return NextResponse.json({
            kpi: { ...kpi, utilidad, margen: kpi.ingresos > 0 ? Number(((utilidad / kpi.ingresos) * 100).toFixed(1)) : 0 },
            porDia, mensual,
            gastosPorCategoria: porCategoria.filter((c) => c.tipo === 'GASTO'),
            ingresosPorCategoria: porCategoria.filter((c) => c.tipo === 'INGRESO'),
            porMetodo,
            posicion: { ...posicion, patrimonio: Number((posicion.inventario + posicion.porCobrar - posicion.porPagar).toFixed(2)) },
            iva: { ...iva, aPagar: Number((iva.debito - iva.credito).toFixed(2)) },
        });
    } catch (error) {
        console.error('Balance:', error);
        return NextResponse.json({ error: 'No se pudo calcular el balance' }, { status: 500 });
    }
}
