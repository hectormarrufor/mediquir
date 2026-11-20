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

// Los INGRESOS y GASTOS (y el IVA del periodo) solo se cuentan desde esta fecha. Las cuentas por cobrar y por pagar y el inventario figuran completos.
export const INICIO_BALANCE = '2026-11-01';

// Balance de un rango de fechas: resultado del periodo, series para gráficos, posición actual e IVA del periodo
export async function GET(request) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;

    try {
        const { searchParams } = new URL(request.url);
        const desde = searchParams.get('desde');
        const hasta = searchParams.get('hasta');
        if (!FECHA.test(desde || '') || !FECHA.test(hasta || '')) return NextResponse.json({ error: 'Rango de fechas inválido' }, { status: 400 });

        // Un rango que termina antes del inicio queda vacío (sin ingresos ni gastos); la posición (por cobrar, por pagar, inventario) se muestra igual
        const antesDelInicio = hasta < INICIO_BALANCE;
        const recortado = desde < INICIO_BALANCE;
        const rep = { desde: recortado ? INICIO_BALANCE : desde, hasta, catIva: CAT_IVA, inicio: INICIO_BALANCE };
        const q = (sql) => sequelize.query(sql, { replacements: rep, type: sequelize.QueryTypes.SELECT });
        const enRango = `m."fecha" BETWEEN :desde AND :hasta`;
        const desdeMov = `FROM "MovimientosFinancieros" m LEFT JOIN "CategoriasFinancieras" c ON c."id" = m."categoriaId"`;

        const [[kpi], porDia, porCategoria, porMetodo, mensual, [posicion], [iva], detalleCompras, detalleVentas] = await Promise.all([
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
                ${desdeMov} WHERE m."fecha" >= GREATEST((date_trunc('month', now() AT TIME ZONE 'America/Caracas') - interval '11 months')::date, :inicio::date)
                GROUP BY 1 ORDER BY 1`),
            // Posición actual (no depende del rango): lo que hay en almacén a costo, lo que te deben y lo que debes
            q(`SELECT
                (SELECT COALESCE(SUM("stockAlmacen" * "costoUsd"), 0)::float FROM "Productos") AS inventario,
                (SELECT COALESCE(SUM(CASE WHEN "moneda" = 'BS' THEN "saldoPendiente" / NULLIF("tasaCambio", 0) ELSE "saldoPendiente" END), 0)::float FROM "CuentasPorCobrar" WHERE "estado" <> 'Pagado')
                 + (SELECT COALESCE(SUM(CASE WHEN v."moneda" = 'BS'
                        THEN GREATEST(v."totalFinal" - COALESCE((SELECT SUM(a."montoVes") FROM "Abonos" a WHERE a."ventaId" = v."id"), 0), 0) / NULLIF(v."tasaCambio", 0)
                        ELSE GREATEST(v."totalFinal" - COALESCE((SELECT SUM(a."montoUsd") FROM "Abonos" a WHERE a."ventaId" = v."id"), 0), 0) END), 0)::float
                    FROM "Ventas" v WHERE v."clienteId" IS NOT NULL AND v."statusPago" <> 'Pagado' AND v."statusDespacho" <> 'Cancelado'
                      AND NOT EXISTS (SELECT 1 FROM "CuentasPorCobrar" x WHERE x."ventaId" = v."id")) AS "porCobrar",
                (SELECT COALESCE(SUM(CASE WHEN "moneda" = 'BS' THEN "saldoPendiente" / NULLIF("tasaCambio", 0) ELSE "saldoPendiente" END), 0)::float FROM "CuentasPorPagar" WHERE "estado" <> 'Pagado') AS "porPagar",
                (SELECT COALESCE(SUM(CASE WHEN m."tipo" = 'INGRESO' THEN m."montoUsd" ELSE -m."montoUsd" END), 0)::float
                    FROM "MovimientosFinancieros" m LEFT JOIN "CategoriasFinancieras" c ON c."id" = m."categoriaId" WHERE COALESCE(c."nombre", '') <> :catIva AND m."fecha" >= :inicio::date) AS "flujoAcumulado"`),
            q(`SELECT
                (SELECT COALESCE(SUM(${IVA_VENTA_USD}), 0)::float FROM "Ventas" v WHERE v."tipoDocumento" = 'FACTURA' AND (COALESCE(v."fechaEmision", v."createdAt") AT TIME ZONE 'America/Caracas')::date BETWEEN :desde AND :hasta AND v."statusDespacho" <> 'Cancelado') + ${NOTAS_USD('montoIva', 'VENTA')} AS debito,
                -- mismo criterio que el libro de compras: la fecha de recepción manda (si no hay, la de la factura)
                (SELECT COALESCE(SUM(${IVA_COMPRA_USD}), 0)::float FROM "FacturasCompras" f WHERE f."tipoDocumento" = 'FACTURA' AND COALESCE(f."fechaRecepcion", f."fechaFactura") BETWEEN :desde AND :hasta) + ${NOTAS_USD('montoIva', 'COMPRA')} AS credito,
                -- IVA que retuvieron los clientes (comprobante confirmado): ya lo pagaron ellos al SENIAT, se descuenta como en el libro
                (SELECT COALESCE(SUM(r."ivaRetenido" / NULLIF(r."tasaCambio", 0)), 0)::float FROM "RetencionesIva" r WHERE r."tipo" = 'VENTA' AND r."estado" = 'REGISTRADA' AND r."fecha" BETWEEN :desde AND :hasta) AS "retenidoClientes",
                (SELECT COALESCE(SUM(${VENTA_USD}), 0)::float FROM "Ventas" v WHERE v."tipoDocumento" = 'FACTURA' AND (COALESCE(v."fechaEmision", v."createdAt") AT TIME ZONE 'America/Caracas')::date BETWEEN :desde AND :hasta AND v."statusDespacho" <> 'Cancelado') + ${NOTAS_USD('totalFinal', 'VENTA')} AS facturado`),
            // Detalle de gastos de compra del periodo (monto completo, sin restar retención) con proveedor enlazable
            q(`SELECT m."id", to_char(m."fecha", 'YYYY-MM-DD') AS fecha, m."facturaCompraId",
                f."numeroDocumento", COALESCE(p."nombre", 'Proveedor') AS proveedor,
                m."montoUsd"::float AS "montoUsd", m."montoVes"::float AS "montoVes",
                m."metodoPago", m."descripcion"
                FROM "MovimientosFinancieros" m
                JOIN "FacturasCompras" f ON f."id" = m."facturaCompraId"
                LEFT JOIN "Proveedores" p ON p."id" = f."proveedorId"
                WHERE ${enRango} AND m."tipo" = 'GASTO' AND m."facturaCompraId" IS NOT NULL
                ORDER BY m."fecha" DESC, m."createdAt" DESC`),
            // Detalle de ingresos por ventas y cobros de facturas del periodo con cliente enlazable
            q(`SELECT m."id", to_char(m."fecha", 'YYYY-MM-DD') AS fecha,
                COALESCE(m."ventaId", a."ventaId") AS "ventaId",
                v."numeroDocumento", COALESCE(cl."nombre", 'Cliente eventual') AS cliente,
                m."montoUsd"::float AS "montoUsd", m."montoVes"::float AS "montoVes",
                m."metodoPago", m."descripcion"
                FROM "MovimientosFinancieros" m
                LEFT JOIN "CategoriasFinancieras" c ON c."id" = m."categoriaId"
                LEFT JOIN "Abonos" a ON a."id" = m."abonoId"
                JOIN "Ventas" v ON v."id" = COALESCE(m."ventaId", a."ventaId")
                LEFT JOIN "Clientes" cl ON cl."id" = v."clienteId"
                WHERE ${enRango} AND m."tipo" = 'INGRESO' AND COALESCE(c."nombre", '') <> :catIva
                  AND (m."ventaId" IS NOT NULL OR m."abonoId" IS NOT NULL)
                ORDER BY m."fecha" DESC, m."createdAt" DESC`),
        ]);

        const utilidad = Number((kpi.ingresos - kpi.gastos).toFixed(2));
        return NextResponse.json({
            inicio: INICIO_BALANCE, recortado, antesDelInicio,
            kpi: { ...kpi, utilidad, margen: kpi.ingresos > 0 ? Number(((utilidad / kpi.ingresos) * 100).toFixed(1)) : 0 },
            porDia, mensual,
            gastosPorCategoria: porCategoria.filter((c) => c.tipo === 'GASTO'),
            ingresosPorCategoria: porCategoria.filter((c) => c.tipo === 'INGRESO'),
            porMetodo,
            detalleCompras,
            detalleVentas,
            posicion: { ...posicion, patrimonio: Number((posicion.inventario + posicion.porCobrar - posicion.porPagar).toFixed(2)) },
            iva: { ...iva, aPagar: Number((iva.debito - iva.credito - iva.retenidoClientes).toFixed(2)) },
        });
    } catch (error) {
        console.error('Balance:', error);
        return NextResponse.json({ error: 'No se pudo calcular el balance' }, { status: 500 });
    }
}
