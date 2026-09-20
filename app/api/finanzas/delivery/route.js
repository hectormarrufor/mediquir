import { NextResponse } from 'next/server';
import sequelize from '@/sequelize';
import { requerirNoVendedor } from '../../_lib/acceso';

export const dynamic = 'force-dynamic';

const USD = (col) => `(CASE WHEN v."moneda" = 'BS' THEN v."${col}" / NULLIF(v."tasaCambio", 0) ELSE v."${col}" END)`;

// Acumulado de las diferencias entre lo que se cobró de delivery a los clientes de la tienda y lo que cobró de verdad la empresa de delivery.
// Cobrar de más = se sobrevalora el servicio; cobrar de menos = se subvalora (la tienda pone la diferencia). Todo en USD.
export async function GET() {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;

    try {
        const [fila] = await sequelize.query(
            `SELECT COUNT(*)::int AS pedidos,
                COALESCE(SUM(${USD('costoFlete')}), 0)::float AS cobrado,
                COALESCE(SUM(${USD('costoFleteReal')}), 0)::float AS real,
                COALESCE(SUM(GREATEST(${USD('costoFlete')} - ${USD('costoFleteReal')}, 0)), 0)::float AS sobrante,
                COALESCE(SUM(GREATEST(${USD('costoFleteReal')} - ${USD('costoFlete')}, 0)), 0)::float AS faltante,
                COUNT(*) FILTER (WHERE ROUND((${USD('costoFlete')} - ${USD('costoFleteReal')})::numeric, 2) > 0)::int AS "pedidosDeMas",
                COUNT(*) FILTER (WHERE ROUND((${USD('costoFlete')} - ${USD('costoFleteReal')})::numeric, 2) < 0)::int AS "pedidosDeMenos"
             FROM "Ventas" v
             WHERE v."tipoVenta" = 'ONLINE' AND v."costoFleteReal" IS NOT NULL AND v."statusDespacho" <> 'Cancelado'`,
            { type: sequelize.QueryTypes.SELECT }
        );
        const r2 = (n) => Math.round(n * 100) / 100;
        return NextResponse.json({
            pedidos: fila.pedidos, cobrado: r2(fila.cobrado), real: r2(fila.real),
            sobrante: r2(fila.sobrante), faltante: r2(fila.faltante), neto: r2(fila.sobrante - fila.faltante),
            pedidosDeMas: fila.pedidosDeMas, pedidosDeMenos: fila.pedidosDeMenos,
            pedidosExactos: fila.pedidos - fila.pedidosDeMas - fila.pedidosDeMenos,
        });
    } catch (error) {
        console.error('Delivery:', error);
        return NextResponse.json({ error: 'No se pudo calcular el resumen de delivery' }, { status: 500 });
    }
}
