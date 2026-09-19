import { NextResponse } from 'next/server';
import sequelize from '@/sequelize';
import { rolDe } from '@/app/constants/roles';
import { requerirStaff } from '../../inventario/_lib';

export const dynamic = 'force-dynamic';

const USD = `(CASE WHEN v."moneda" = 'BS' THEN v."totalFinal" / NULLIF(v."tasaCambio", 0) ELSE v."totalFinal" END)`;

// Clientes con lo que interesa de un vistazo: si tienen acceso al portal, cuánto han comprado y cuánto deben.
// Un vendedor ve los clientes pero no sus montos.
export async function GET() {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;
    const conDinero = rolDe(acceso.sesion) !== 'vendedor';

    try {
        const filas = await sequelize.query(
            `SELECT c."id", c."identificacion", c."nombre", c."telefono", c."email", c."direccion", c."imagen", c."esContribuyenteEspecial", c."createdAt",
                (SELECT u."user" FROM "Usuarios" u WHERE u."clienteId" = c."id" LIMIT 1) AS usuario,
                COALESCE(m."compras", 0)::float AS compras, COALESCE(m."pedidos", 0)::int AS pedidos, m."ultima" AS "ultimaCompra",
                COALESCE(m."saldo", 0)::float AS saldo
             FROM "Clientes" c
             LEFT JOIN (
                SELECT v."clienteId",
                    SUM(${USD}) FILTER (WHERE v."statusDespacho" <> 'Cancelado') AS compras,
                    COUNT(*) FILTER (WHERE v."statusDespacho" <> 'Cancelado') AS pedidos,
                    MAX(v."createdAt") FILTER (WHERE v."statusDespacho" <> 'Cancelado') AS ultima,
                    SUM(GREATEST(${USD} - COALESCE((SELECT SUM(a."montoUsd") FROM "Abonos" a WHERE a."ventaId" = v."id"), 0), 0))
                        FILTER (WHERE v."statusDespacho" <> 'Cancelado' AND v."statusPago" <> 'Pagado') AS saldo
                FROM "Ventas" v WHERE v."clienteId" IS NOT NULL GROUP BY v."clienteId"
             ) m ON m."clienteId" = c."id"
             ORDER BY c."createdAt" DESC`,
            { type: sequelize.QueryTypes.SELECT }
        );

        const clientes = filas.map((c) => (conDinero ? c : { ...c, compras: null, saldo: null, pedidos: null }));
        return NextResponse.json({ clientes });
    } catch (error) {
        console.error('Resumen de clientes:', error);
        return NextResponse.json({ error: 'No se pudo cargar la lista de clientes' }, { status: 500 });
    }
}
