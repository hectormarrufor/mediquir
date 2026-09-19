import { NextResponse } from 'next/server';
import sequelize from '@/sequelize';
import { rolDe } from '@/app/constants/roles';
import { requerirStaff } from '../../inventario/_lib';
import { USD, alcanceDe } from '../_lib';

export const dynamic = 'force-dynamic';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Indicadores y series para los gráficos de Ventas en un rango de fechas (día de Caracas)
export async function GET(request) {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;

    try {
        const { searchParams } = new URL(request.url);
        const desde = searchParams.get('desde');
        const hasta = searchParams.get('hasta');
        if (!FECHA.test(desde || '') || !FECHA.test(hasta || '')) return NextResponse.json({ error: 'Rango de fechas inválido' }, { status: 400 });

        const alcance = alcanceDe(acceso.sesion);
        const base = `FROM "Ventas" v WHERE (v."createdAt" AT TIME ZONE 'America/Caracas')::date BETWEEN :desde AND :hasta${alcance.sql}`;
        const replacements = { desde, hasta, ...alcance.replacements };
        const consultar = (sql) => sequelize.query(sql, { replacements, type: sequelize.QueryTypes.SELECT });
        const esAdmin = rolDe(acceso.sesion) !== 'vendedor';

        const [[kpi], porDia, porTipo, topProductos, topVendedores] = await Promise.all([
            consultar(`SELECT
                COUNT(*) FILTER (WHERE v."statusDespacho" <> 'Cancelado')::int AS ventas,
                COALESCE(SUM(${USD}) FILTER (WHERE v."statusDespacho" <> 'Cancelado'), 0)::float AS total,
                COUNT(*) FILTER (WHERE v."statusDespacho" = 'Cancelado')::int AS anuladas,
                COALESCE(SUM(${USD}) FILTER (WHERE v."statusDespacho" <> 'Cancelado' AND v."statusPago" <> 'Pagado'), 0)::float AS "porCobrar",
                COUNT(*) FILTER (WHERE v."statusDespacho" IN ('Pendiente', 'Empacado', 'Parcial'))::int AS "porDespachar"
                ${base}`),
            consultar(`SELECT to_char((v."createdAt" AT TIME ZONE 'America/Caracas')::date, 'YYYY-MM-DD') AS dia,
                COALESCE(SUM(${USD}), 0)::float AS total, COUNT(*)::int AS ventas
                ${base} AND v."statusDespacho" <> 'Cancelado' GROUP BY 1 ORDER BY 1`),
            consultar(`SELECT v."tipoVenta" AS tipo, COALESCE(SUM(${USD}), 0)::float AS total, COUNT(*)::int AS ventas
                ${base} AND v."statusDespacho" <> 'Cancelado' GROUP BY 1 ORDER BY 2 DESC`),
            consultar(`SELECT COALESCE(p."nombre", d."nombreFicticio", 'Producto genérico') AS nombre, SUM(d."cantidad")::int AS cantidad, COALESCE(SUM(d."subtotal"), 0)::float AS monto
                FROM "VentaDetalles" d JOIN "Ventas" v ON v."id" = d."ventaId" LEFT JOIN "Productos" p ON p."id" = d."productoId"
                WHERE (v."createdAt" AT TIME ZONE 'America/Caracas')::date BETWEEN :desde AND :hasta AND v."statusDespacho" <> 'Cancelado'${alcance.sql}
                GROUP BY 1 ORDER BY cantidad DESC LIMIT 6`),
            esAdmin ? consultar(`SELECT COALESCE(e."nombre" || ' ' || e."apellido", u."user", 'Sin vendedor') AS nombre,
                COALESCE(SUM(${USD}), 0)::float AS total, COUNT(*)::int AS ventas
                FROM "Ventas" v LEFT JOIN "Usuarios" u ON u."id" = v."vendedorId" LEFT JOIN "Empleados" e ON e."id" = u."empleadoId"
                WHERE (v."createdAt" AT TIME ZONE 'America/Caracas')::date BETWEEN :desde AND :hasta AND v."statusDespacho" <> 'Cancelado'
                GROUP BY 1 ORDER BY 2 DESC LIMIT 6`) : Promise.resolve([]),
        ]);

        return NextResponse.json({
            ...kpi,
            ticketPromedio: kpi.ventas ? Number((kpi.total / kpi.ventas).toFixed(2)) : 0,
            porDia, porTipo, topProductos, topVendedores,
        });
    } catch (error) {
        console.error('Resumen de ventas:', error);
        return NextResponse.json({ error: 'No se pudo cargar el resumen' }, { status: 500 });
    }
}
