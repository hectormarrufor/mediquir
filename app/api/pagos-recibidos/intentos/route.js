import { NextResponse } from 'next/server';
import sequelize from '@/sequelize';
import { requerirNoVendedor } from '@/app/api/_lib/acceso';

export const dynamic = 'force-dynamic';

// Intentos de pago móvil del checkout de la tienda que NO terminaron bien en las últimas 48 horas (referencia inexistente, monto distinto,
// bloqueos por demasiados intentos y pedidos dejados "por verificar"). Sirve para ver quién escribe referencias que no existen.
export async function GET() {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    try {
        const filas = await sequelize.query(
            `SELECT i."id", i."createdAt", i."ip", i."identificacion", i."referencia", i."montoBs"::float AS "montoBs", i."resultado", i."detalle", v."numeroDocumento"
             FROM "IntentosPago" i LEFT JOIN "Ventas" v ON v."id" = i."ventaId"
             WHERE i."resultado" <> 'OK' AND i."createdAt" >= now() - interval '48 hours'
             ORDER BY i."createdAt" DESC LIMIT 100`,
            { type: sequelize.QueryTypes.SELECT }
        );
        return NextResponse.json(filas);
    } catch (error) {
        console.error('Intentos de pago:', error);
        return NextResponse.json({ error: 'No se pudieron cargar los intentos' }, { status: 500 });
    }
}
