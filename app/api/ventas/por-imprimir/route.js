import { NextResponse } from 'next/server';
import { sequelize } from '@/models';
import { requerirStaff } from '@/app/api/inventario/_lib';
import { rolDe } from '@/app/constants/roles';
import { DESDE_CONTROL as DESDE_POR_IMPRIMIR, pendientesDeControlOrdenados } from '@/app/api/_lib/numeracion';

export const dynamic = 'force-dynamic';


// Documentos por imprimir: los que todavía no tienen número de control (el control se asigna AL IMPRIMIR por primera vez).
//  · Vendedor: sus facturas y notas de crédito/débito que ya aprobó jolexi y aún no se imprimen (sin control).
//  · Administración: facturas, notas de crédito y notas de débito emitidas por la empresa sin control, también las facturas de vendedores por aprobar (para ver las seguidillas).
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
                           COALESCE(c."nombre", 'Cliente al detal') AS cliente, v."createdAt" AS creado, v."aprobacionEstado" AS aprobacion
                      FROM "Ventas" v LEFT JOIN "Clientes" c ON c."id" = v."clienteId"
                     WHERE v."tipoDocumento" = 'FACTURA' AND v."facturaTalonario" = false AND v."numeroControl" IS NULL AND v."statusDespacho" <> 'Cancelado'
                       AND v."createdAt" >= :desde
                    UNION ALL
                    SELECT n."id", CASE WHEN n."tipo" = 'CREDITO' THEN 'NOTA_CREDITO' ELSE 'NOTA_DEBITO' END, n."numeroDocumento", n."fecha"::timestamptz, n."aprobadaAt", n."moneda"::text, n."totalFinal"::float,
                           COALESCE(c."nombre", 'Cliente al detal'), n."createdAt", n."aprobacionEstado"
                      FROM "NotasFiscales" n LEFT JOIN "Clientes" c ON c."id" = n."clienteId"
                     WHERE n."origen" = 'VENTA' AND n."estado" = 'EMITIDA' AND n."numeroControl" IS NULL AND n."createdAt" >= :desde
                 ) d ORDER BY d."creado"`,
                { desde: DESDE_POR_IMPRIMIR },
            );
        }
        // Un documento de vendedor que aún no aprueba jolexi no se imprime: desde la lista se va a su pantalla para aprobarlo
        // Seguidilla: facturas, notas de crédito y de débito en UN solo orden (el del correlativo de control). Si hay uno anterior sin control (aunque sea de otro vendedor o esté por aprobar) se avisa cuál es.
        const orden = await pendientesDeControlOrdenados();
        const posicion = new Map(orden.map((o, i) => [o.id, i]));
        const primero = orden[0] || null;
        documentos.sort((x, y) => (posicion.has(x.id) ? posicion.get(x.id) : 1e9) - (posicion.has(y.id) ? posicion.get(y.id) : 1e9));
        const lista = documentos.map((d) => {
            const pendiente = d.aprobacion === 'PENDIENTE' && d.tipo === 'FACTURA';
            const espera = primero && posicion.has(d.id) && primero.id !== d.id ? primero.numeroDocumento : null;
            return { ...d, esperaPor: espera, url: pendiente ? `/superuser/ventas/${d.id}` : (d.tipo === 'FACTURA' ? `/superuser/ventas/imprimir/${d.id}` : `/superuser/notas/${d.id}/imprimir`) };
        });
        return NextResponse.json({ documentos: lista, total: lista.length });
    } catch (error) {
        if (error?.original?.code === '42703') return NextResponse.json({ documentos: [], total: 0, sinMigrar: true });
        console.error('Documentos por imprimir:', error);
        return NextResponse.json({ error: 'No se pudieron cargar los documentos por imprimir' }, { status: 500 });
    }
}
