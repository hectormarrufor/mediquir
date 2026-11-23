import { NextResponse } from 'next/server';
import sequelize from '@/sequelize';
import { rolDe } from '@/app/api/_lib/acceso';
import { requerirStaff } from '@/app/api/inventario/_lib';
import { idsPorAprobar } from '@/app/api/_lib/aprobacion';

export const dynamic = 'force-dynamic';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Lista de notas de crédito y de débito (emitidas a clientes y recibidas de proveedores) con filtros
export async function GET(request) {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;
    const esVend = rolDe(acceso.sesion) === 'vendedor';
    try {
        const p = new URL(request.url).searchParams;
        const donde = ['1 = 1'];
        const rep = {};
        if (esVend) {
            donde.push(`n.origen = 'VENTA'`);
            donde.push(`(n."registradoPorId" = :yo OR v."vendedorId" = :yo OR v."empacadorId" = :yo OR v."etiquetadorId" = :yo)`);
            rep.yo = Number(acceso.sesion.id);
        } else if (['VENTA', 'COMPRA'].includes(p.get('origen'))) {
            donde.push('n.origen = :origen');
            rep.origen = p.get('origen');
        }
        if (['CREDITO', 'DEBITO'].includes(p.get('tipo'))) { donde.push('n.tipo = :tipo'); rep.tipo = p.get('tipo'); }
        if (FECHA.test(p.get('desde') || '')) { donde.push('n.fecha >= :desde'); rep.desde = p.get('desde'); }
        if (FECHA.test(p.get('hasta') || '')) { donde.push('n.fecha <= :hasta'); rep.hasta = p.get('hasta'); }
        const q = String(p.get('q') || '').trim().toLowerCase();
        if (q) {
            donde.push(`(lower(n."numeroDocumento") LIKE :q OR lower(COALESCE(c.nombre, pr.nombre, '')) LIKE :q OR lower(COALESCE(v."numeroDocumento", f."numeroDocumento", '')) LIKE :q OR lower(n."facturasAfectadas"::text) LIKE :q)`);
            rep.q = `%${q}%`;
        }

        const filas = await sequelize.query(
            `SELECT n.id, n.tipo, n.origen, n."numeroDocumento", n."numeroControl", n.fecha::text AS fecha, n.estado, n.moneda, n."tasaCambio"::float AS "tasaCambio",
                n."totalFinal"::float AS total, n."montoIva"::float AS iva, n.motivo, n."ventaId", n."facturaCompraId",
                n."saldoAFavorUsd"::float AS "saldoAFavorUsd", n."reintegradoUsd"::float AS "reintegradoUsd",
                (SELECT COALESCE(SUM(a."montoUsd"), 0) FROM "Abonos" a WHERE n.tipo = 'CREDITO' AND n.origen = 'VENTA' AND a.referencia = n."numeroDocumento" AND a."metodoPago" = 'Nota de crédito (saldo a favor)')::float AS "compensadoUsd",
                COALESCE(c.nombre, pr.nombre) AS contraparte, COALESCE(NULLIF((SELECT string_agg(e->>'numeroDocumento', ', ') FROM jsonb_array_elements(n."facturasAfectadas") e), ''), v."numeroDocumento", f."numeroDocumento") AS "facturaAfectada"
             FROM "NotasFiscales" n
             LEFT JOIN "Clientes" c ON c.id = n."clienteId" LEFT JOIN "Proveedores" pr ON pr.id = n."proveedorId"
             LEFT JOIN "Ventas" v ON v.id = COALESCE(n."ventaId", (n."facturasAfectadas"->0->>'ventaId')::uuid)
             LEFT JOIN "FacturasCompras" f ON f.id = n."facturaCompraId"
             WHERE ${donde.join(' AND ')} ORDER BY n.fecha DESC, n."createdAt" DESC LIMIT 500`,
            { replacements: rep, type: sequelize.QueryTypes.SELECT },
        );
        const porAprobar = await idsPorAprobar('NOTA', filas.filter((n) => n.origen === 'VENTA').map((n) => n.id)).catch(() => new Set());
        const notas = filas.map((n) => (porAprobar.has(String(n.id)) ? { ...n, porAprobar: true } : n));
        return NextResponse.json({ notas });
    } catch (error) {
        console.error('Lista de notas:', error);
        return NextResponse.json({ error: 'No se pudieron cargar las notas' }, { status: 500 });
    }
}
