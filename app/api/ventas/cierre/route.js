import { NextResponse } from 'next/server';
import sequelize from '@/sequelize';
import { requerirNoVendedor } from '@/app/api/_lib/acceso';

export const dynamic = 'force-dynamic';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const consulta = (sql, replacements) => sequelize.query(sql, { replacements, type: sequelize.QueryTypes.SELECT });
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Cierre de caja de un día (día de Caracas): relación de facturas y devoluciones del día (en Bs, como el cierre del sistema anterior)
// y recibo de caja con lo cobrado ese día por método de pago (contado y abonos), p. ej. cada punto de venta por separado.
export async function GET(request) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    try {
        const fecha = new URL(request.url).searchParams.get('fecha');
        if (!FECHA.test(fecha || '')) return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 });

        const [facturas, debitos, devoluciones, cobros] = await Promise.all([
            consulta(`
                SELECT v.id::text AS id, v."numeroDocumento" AS numero, v."tipoDocumento"::text AS "tipoDocumento", v."condicionPago"::text AS condicion,
                       v."statusPago"::text AS pago, c.nombre AS cliente, c.identificacion AS rif,
                       (CASE WHEN v.moneda = 'BS' THEN v."totalFinal" ELSE v."totalFinal" * v."tasaCambio" END)::float AS "totalBs",
                       (CASE WHEN v.moneda = 'BS' THEN v."totalFinal" / NULLIF(v."tasaCambio", 0) ELSE v."totalFinal" END)::float AS "totalUsd",
                       EXISTS (SELECT 1 FROM "Abonos" a WHERE a."ventaId" = v.id) AS abonada
                  FROM "Ventas" v LEFT JOIN "Clientes" c ON c.id = v."clienteId"
                 WHERE (COALESCE(v."fechaEmision", v."createdAt") AT TIME ZONE 'America/Caracas')::date = :fecha
                   AND v."statusDespacho" <> 'Cancelado' AND v."tipoDocumento" = 'FACTURA'
                 ORDER BY v."createdAt"`, { fecha }),
            consulta(`
                SELECT n.id::text AS id, n."ventaId"::text AS "ventaId", n."numeroDocumento" AS numero, 'NOTA_DEBITO' AS "tipoDocumento", 'Credito' AS condicion, '' AS estado,
                       c.nombre AS cliente, c.identificacion AS rif,
                       (CASE WHEN n.moneda = 'BS' THEN n."totalFinal" ELSE n."totalFinal" * n."tasaCambio" END)::float AS "totalBs"
                  FROM "NotasFiscales" n LEFT JOIN "Clientes" c ON c.id = n."clienteId"
                 WHERE n.origen = 'VENTA' AND n.tipo = 'DEBITO' AND n.estado = 'EMITIDA' AND n.fecha = :fecha
                 ORDER BY n."createdAt"`, { fecha }),
            consulta(`
                SELECT n.id::text AS id, n."ventaId"::text AS "ventaId", n."numeroDocumento" AS numero, c.nombre AS cliente, c.identificacion AS rif,
                       (CASE WHEN n.moneda = 'BS' THEN n."totalFinal" ELSE n."totalFinal" * n."tasaCambio" END)::float AS "totalBs",
                       (CASE WHEN n.moneda = 'BS' THEN n."totalFinal" / NULLIF(n."tasaCambio", 0) ELSE n."totalFinal" END)::float AS "totalUsd"
                  FROM "NotasFiscales" n LEFT JOIN "Clientes" c ON c.id = n."clienteId"
                 WHERE n.origen = 'VENTA' AND n.tipo = 'CREDITO' AND n.estado = 'EMITIDA' AND n.fecha = :fecha
                 ORDER BY n."createdAt"`, { fecha }),
            consulta(`
                SELECT m."metodoPago" AS metodo, COUNT(DISTINCT COALESCE(m."abonoId"::text, m."ventaId"::text))::int AS cobros,
                       COALESCE(SUM(m."montoVes"), 0)::float AS "montoBs", COALESCE(SUM(m."montoUsd"), 0)::float AS "montoUsd"
                  FROM "MovimientosFinancieros" m
                 WHERE m.tipo = 'INGRESO' AND m.fecha = :fecha AND (m."ventaId" IS NOT NULL OR m."abonoId" IS NOT NULL)
                 GROUP BY m."metodoPago" ORDER BY 3 DESC`, { fecha }),
        ]);

        const doc = (f) => ({ ...f, estado: f.pago === 'Pagado' ? 'Pag' : f.abonada ? 'Abo' : 'Pen' });
        // Las notas de débito suben la deuda del cliente: van con las facturas, en crédito
        const lista = [...facturas.map(doc), ...debitos];
        const totalCredito = r2(lista.filter((f) => f.condicion === 'Credito').reduce((s, f) => s + f.totalBs, 0));
        const totalContado = r2(lista.filter((f) => f.condicion !== 'Credito').reduce((s, f) => s + f.totalBs, 0));
        const totalDevoluciones = r2(devoluciones.reduce((s, d) => s + d.totalBs, 0));

        return NextResponse.json({
            fecha,
            facturas: lista,
            devoluciones,
            totales: { credito: totalCredito, contado: totalContado, facturas: r2(totalCredito + totalContado), devoluciones: totalDevoluciones },
            cobros,
            totalCobradoBs: r2(cobros.reduce((s, c) => s + c.montoBs, 0)),
        });
    } catch (error) {
        console.error('Cierre de caja:', error);
        return NextResponse.json({ error: 'No se pudo cargar el cierre de caja' }, { status: 500 });
    }
}
