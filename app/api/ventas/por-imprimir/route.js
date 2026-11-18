import { NextResponse } from 'next/server';
import { sequelize } from '@/models';
import { requerirStaff } from '@/app/api/inventario/_lib';
import { rolDe } from '@/app/constants/roles';

export const dynamic = 'force-dynamic';

// Documentos por imprimir: los que todavía no tienen número de control (el control se asigna AL IMPRIMIR por primera vez).
//  · Vendedor: sus facturas y notas de crédito/débito que ya aprobó jolexi y aún no se imprimen (sin control).
//  · Administración: facturas, notas de crédito y notas de débito emitidas por la empresa sin control, ya aprobadas (las de vendedores por aprobar no salen).
// tipo: FACTURA | NOTA_CREDITO | NOTA_DEBITO  ·  url: la pantalla que la imprime
export async function GET() {
    const a = await requerirStaff();
    if (a.error) return a.error;
    try {
        const consulta = (sql, replacements = {}) => sequelize.query(sql, { replacements, type: sequelize.QueryTypes.SELECT });
        let documentos;
        if (rolDe(a.sesion) === 'vendedor') {
            documentos = await consulta(
                `SELECT * FROM (
                    SELECT v."id", 'FACTURA' AS tipo, v."numeroDocumento" AS numero, COALESCE(v."fechaEmision", v."createdAt") AS fecha, v."aprobadaAt", v."moneda"::text AS moneda, v."totalFinal"::float AS total,
                           COALESCE(c."nombre", 'Cliente al detal') AS cliente
                      FROM "Ventas" v LEFT JOIN "Clientes" c ON c."id" = v."clienteId"
                     WHERE v."vendedorId" = :u AND v."tipoDocumento" = 'FACTURA' AND v."aprobacionEstado" = 'APROBADA' AND v."impresaAt" IS NULL AND v."statusDespacho" <> 'Cancelado'
                    UNION ALL
                    SELECT n."id", CASE WHEN n."tipo" = 'CREDITO' THEN 'NOTA_CREDITO' ELSE 'NOTA_DEBITO' END, n."numeroDocumento", n."fecha"::timestamptz, n."aprobadaAt", n."moneda"::text, n."totalFinal"::float,
                           COALESCE(c."nombre", 'Cliente al detal')
                      FROM "NotasFiscales" n LEFT JOIN "Ventas" v ON v."id" = COALESCE(n."ventaId", (n."facturasAfectadas"->0->>'ventaId')::uuid) LEFT JOIN "Clientes" c ON c."id" = n."clienteId"
                     WHERE n."origen" = 'VENTA' AND n."estado" = 'EMITIDA' AND n."aprobacionEstado" = 'APROBADA' AND n."numeroControl" IS NULL
                       AND COALESCE(n."registradoPorId", v."vendedorId") = :u
                 ) d ORDER BY d."aprobadaAt" NULLS LAST`,
                { u: Number(a.sesion.id) },
            );
        } else {
            documentos = await consulta(
                `SELECT * FROM (
                    SELECT v."id", 'FACTURA' AS tipo, v."numeroDocumento" AS numero, COALESCE(v."fechaEmision", v."createdAt") AS fecha, v."aprobadaAt", v."moneda"::text AS moneda, v."totalFinal"::float AS total,
                           COALESCE(c."nombre", 'Cliente al detal') AS cliente, v."createdAt" AS creado
                      FROM "Ventas" v LEFT JOIN "Clientes" c ON c."id" = v."clienteId"
                     WHERE v."tipoDocumento" = 'FACTURA' AND v."facturaTalonario" = false AND v."numeroControl" IS NULL AND v."statusDespacho" <> 'Cancelado'
                       AND v."createdAt" > now() - interval '90 days' AND v."aprobacionEstado" IS DISTINCT FROM 'PENDIENTE'
                    UNION ALL
                    SELECT n."id", CASE WHEN n."tipo" = 'CREDITO' THEN 'NOTA_CREDITO' ELSE 'NOTA_DEBITO' END, n."numeroDocumento", n."fecha"::timestamptz, n."aprobadaAt", n."moneda"::text, n."totalFinal"::float,
                           COALESCE(c."nombre", 'Cliente al detal'), n."createdAt"
                      FROM "NotasFiscales" n LEFT JOIN "Clientes" c ON c."id" = n."clienteId"
                     WHERE n."origen" = 'VENTA' AND n."estado" = 'EMITIDA' AND n."numeroControl" IS NULL AND n."aprobacionEstado" IS DISTINCT FROM 'PENDIENTE'
                 ) d ORDER BY d."creado"`,
            );
        }
        const lista = documentos.map((d) => ({ ...d, url: d.tipo === 'FACTURA' ? `/superuser/ventas/imprimir/${d.id}` : `/superuser/notas/${d.id}/imprimir` }));
        return NextResponse.json({ documentos: lista, total: lista.length });
    } catch (error) {
        if (error?.original?.code === '42703' || /aprobacionEstado|impresaAt|aprobadaAt/.test(error?.message || '')) return NextResponse.json({ documentos: [], total: 0, sinMigrar: true });
        console.error('Documentos por imprimir:', error);
        return NextResponse.json({ error: 'No se pudieron cargar los documentos por imprimir' }, { status: 500 });
    }
}
