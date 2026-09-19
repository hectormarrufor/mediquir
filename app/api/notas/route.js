import { NextResponse } from 'next/server';
import sequelize from '@/sequelize';
import { requerirNoVendedor } from '@/app/api/_lib/acceso';

export const dynamic = 'force-dynamic';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Lista de notas de crédito y de débito (emitidas a clientes y recibidas de proveedores) con filtros
export async function GET(request) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    try {
        const p = new URL(request.url).searchParams;
        const donde = ['1 = 1'];
        const rep = {};
        if (['VENTA', 'COMPRA'].includes(p.get('origen'))) { donde.push('n.origen = :origen'); rep.origen = p.get('origen'); }
        if (['CREDITO', 'DEBITO'].includes(p.get('tipo'))) { donde.push('n.tipo = :tipo'); rep.tipo = p.get('tipo'); }
        if (FECHA.test(p.get('desde') || '')) { donde.push('n.fecha >= :desde'); rep.desde = p.get('desde'); }
        if (FECHA.test(p.get('hasta') || '')) { donde.push('n.fecha <= :hasta'); rep.hasta = p.get('hasta'); }
        const q = String(p.get('q') || '').trim().toLowerCase();
        if (q) {
            donde.push(`(lower(n."numeroDocumento") LIKE :q OR lower(COALESCE(c.nombre, pr.nombre, '')) LIKE :q OR lower(COALESCE(v."numeroDocumento", f."numeroDocumento", '')) LIKE :q)`);
            rep.q = `%${q}%`;
        }

        const notas = await sequelize.query(
            `SELECT n.id, n.tipo, n.origen, n."numeroDocumento", n."numeroControl", n.fecha::text AS fecha, n.estado, n.moneda, n."tasaCambio"::float AS "tasaCambio",
                n."totalFinal"::float AS total, n."montoIva"::float AS iva, n.motivo, n."ventaId", n."facturaCompraId",
                n."saldoAFavorUsd"::float AS "saldoAFavorUsd", n."reintegradoUsd"::float AS "reintegradoUsd",
                COALESCE(c.nombre, pr.nombre) AS contraparte, COALESCE(v."numeroDocumento", f."numeroDocumento") AS "facturaAfectada"
             FROM "NotasFiscales" n
             LEFT JOIN "Clientes" c ON c.id = n."clienteId" LEFT JOIN "Proveedores" pr ON pr.id = n."proveedorId"
             LEFT JOIN "Ventas" v ON v.id = n."ventaId" LEFT JOIN "FacturasCompras" f ON f.id = n."facturaCompraId"
             WHERE ${donde.join(' AND ')} ORDER BY n.fecha DESC, n."createdAt" DESC LIMIT 500`,
            { replacements: rep, type: sequelize.QueryTypes.SELECT },
        );
        return NextResponse.json({ notas });
    } catch (error) {
        console.error('Lista de notas:', error);
        return NextResponse.json({ error: 'No se pudieron cargar las notas' }, { status: 500 });
    }
}
