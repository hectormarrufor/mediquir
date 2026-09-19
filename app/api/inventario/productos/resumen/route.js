import { NextResponse } from 'next/server';
import { sequelize } from '@/models';
import { requerirStaff } from '../../_lib';

// GET /api/inventario/productos/resumen  -> indicadores globales (una sola consulta)
// Un grupo de equivalencia cuenta UNA vez (su stock es la suma de los hermanos y su mínimo es el del grupo);
// los productos sueltos cuentan con su propio mínimo.
export async function GET() {
    try {
        const { error } = await requerirStaff();
        if (error) return error;

        const [[r]] = await sequelize.query(`
            WITH g AS (
                SELECT gr."id", gr."stockMinimoGlobal" AS minimo, COALESCE(SUM(p."stockAlmacen"), 0) AS total
                FROM "GruposEquivalencia" gr JOIN "Productos" p ON p."grupoEquivalenciaId" = gr."id"
                GROUP BY gr."id", gr."stockMinimoGlobal"
            ), s AS (
                SELECT * FROM "Productos" WHERE "grupoEquivalenciaId" IS NULL
            )
            SELECT
              (SELECT COUNT(*)::int FROM "Productos") AS total,
              (SELECT COALESCE(SUM("stockAlmacen" * "costoUsd"), 0)::float FROM "Productos") AS valor,
              (SELECT COUNT(*)::int FROM s WHERE "stockAlmacen" <= 0) + (SELECT COUNT(*)::int FROM g WHERE total <= 0) AS agotados,
              (SELECT COUNT(*)::int FROM s WHERE "stockAlmacen" > 0 AND "stockAlmacen" <= "stockMinimo")
                + (SELECT COUNT(*)::int FROM g WHERE total > 0 AND total <= minimo) AS bajos,
              (SELECT COUNT(*)::int FROM "Productos" WHERE "porcentajeDescuento" > 0) AS ofertas,
              (SELECT COUNT(*)::int FROM g) AS grupos
        `);
        return NextResponse.json(r);
    } catch (err) {
        console.error('Error en resumen de inventario:', err);
        return NextResponse.json({ error: 'Error al calcular el resumen' }, { status: 500 });
    }
}
