import { NextResponse } from 'next/server';
import { sequelize } from '@/models';
import { requerirStaff } from '@/app/api/inventario/_lib';

export const dynamic = 'force-dynamic';

// Facturas del usuario que ya aprobó jolexi y todavía no se imprimen (el vendedor las imprime desde aquí o desde la lista de ventas)
export async function GET() {
    const a = await requerirStaff();
    if (a.error) return a.error;
    try {
        const documentos = await sequelize.query(
            `SELECT v."id", v."numeroDocumento" AS numero, COALESCE(v."fechaEmision", v."createdAt") AS fecha, v."aprobadaAt", v."moneda"::text AS moneda, v."totalFinal"::float AS total,
                    COALESCE(c."nombre", 'Cliente al detal') AS cliente
               FROM "Ventas" v LEFT JOIN "Clientes" c ON c."id" = v."clienteId"
              WHERE v."vendedorId" = :u AND v."tipoDocumento" = 'FACTURA' AND v."aprobacionEstado" = 'APROBADA' AND v."impresaAt" IS NULL AND v."statusDespacho" <> 'Cancelado'
              ORDER BY v."aprobadaAt" NULLS LAST, v."createdAt"`,
            { replacements: { u: Number(a.sesion.id) }, type: sequelize.QueryTypes.SELECT },
        );
        return NextResponse.json({ documentos, total: documentos.length });
    } catch (error) {
        if (error?.original?.code === '42703' || /aprobacionEstado|impresaAt|aprobadaAt/.test(error?.message || '')) return NextResponse.json({ documentos: [], total: 0, sinMigrar: true });
        console.error('Facturas por imprimir:', error);
        return NextResponse.json({ error: 'No se pudieron cargar las facturas por imprimir' }, { status: 500 });
    }
}
