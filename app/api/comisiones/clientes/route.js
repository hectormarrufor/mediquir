import { NextResponse } from 'next/server';
import sequelize from '@/sequelize';
import { requerirNoVendedor } from '../../_lib/acceso';

export const dynamic = 'force-dynamic';
const consulta = (sql, replacements) => sequelize.query(sql, { replacements, type: sequelize.QueryTypes.SELECT });

// Clientes de un vendedor a comisión para auditarlos: ?vendedorId=
//   · clientes   : los vinculados (Clientes.vendedorComisionId) con cuántas facturas tienen, la última, cuántas líneas hay en su hoja y cuánto se les debe
//   · historicos : nombres de su hoja (líneas de comisión) que NO corresponden a un cliente vinculado a él: por revisar (vincularlos o dejarlos)
export async function GET(request) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    try {
        const vendedorId = Number(new URL(request.url).searchParams.get('vendedorId'));
        if (!Number.isInteger(vendedorId)) return NextResponse.json({ error: 'Elige un vendedor' }, { status: 400 });

        const clientes = await consulta(`
            SELECT c.id, c.nombre, c.identificacion,
                   (SELECT count(*)::int FROM "Ventas" v WHERE v."clienteId" = c.id AND v."tipoDocumento" IN ('FACTURA','NOTA_ENTREGA') AND v."statusDespacho" <> 'Cancelado') AS facturas,
                   (SELECT max(COALESCE(v."fechaEmision", v."createdAt")) FROM "Ventas" v WHERE v."clienteId" = c.id AND v."tipoDocumento" IN ('FACTURA','NOTA_ENTREGA') AND v."statusDespacho" <> 'Cancelado') AS "ultimaFactura",
                   (SELECT count(*)::int FROM "ComisionesVenta" cv JOIN "Ventas" v ON v.id = cv."ventaId" WHERE v."clienteId" = c.id AND cv."vendedorId" = :v AND cv.concepto = 'FACTURA') AS lineas,
                   (SELECT COALESCE(sum(x."saldoPendiente"), 0)::float FROM "CuentasPorCobrar" x WHERE x."clienteId" = c.id AND x.estado <> 'Pagado' AND x.moneda = 'USD') AS "debeUsd"
              FROM "Clientes" c WHERE c."vendedorComisionId" = :v ORDER BY c.nombre`, { v: vendedorId });

        const historicos = await consulta(`
            SELECT COALESCE(NULLIF(trim(cv."clienteTexto"), ''), '(sin nombre)') AS nombre, count(*)::int AS lineas, max(cv.fecha) AS ultima,
                   count(*) FILTER (WHERE cv."ventaId" IS NULL)::int AS "sinFactura",
                   (SELECT c2.id FROM "Clientes" c2 WHERE upper(regexp_replace(c2.nombre, '[^A-Za-z0-9]', '', 'g')) = upper(regexp_replace(COALESCE(cv."clienteTexto", ''), '[^A-Za-z0-9]', '', 'g')) LIMIT 1) AS "clienteIdProbable"
              FROM "ComisionesVenta" cv
             WHERE cv."vendedorId" = :v AND cv.concepto = 'FACTURA'
               AND NOT EXISTS (SELECT 1 FROM "Ventas" v JOIN "Clientes" c ON c.id = v."clienteId" WHERE v.id = cv."ventaId" AND c."vendedorComisionId" = cv."vendedorId")
          GROUP BY 1, 5 ORDER BY lineas DESC`, { v: vendedorId });
        return NextResponse.json({ clientes, historicos });
    } catch (error) {
        console.error('Clientes del vendedor:', error);
        return NextResponse.json({ error: 'No se pudo cargar la lista de clientes' }, { status: 500 });
    }
}
