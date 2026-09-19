import { sequelize } from '@/models';

// Estado de un conjunto de existencias frente a su mínimo:
//   agotado: no queda nada · bajo: hay, pero en o por debajo del mínimo · ok: por encima del mínimo
export const estadoDe = (stock, minimo) => {
    const s = Number(stock) || 0;
    if (s <= 0) return 'agotado';
    return s <= (Number(minimo) || 0) ? 'bajo' : 'ok';
};

// Agregados de los grupos de equivalencia: el stock que importa es la SUMA de los hermanos y el
// mínimo que importa es el del grupo (stockMinimoGlobal), no el de cada producto.
// Devuelve un Map(id -> grupo). Con `ids` solo consulta esos grupos.
export async function cargarGrupos(ids) {
    const lista = ids ? [...new Set(ids)].map(Number).filter(Number.isInteger) : null;
    if (lista && lista.length === 0) return new Map();
    const filtro = lista ? `WHERE g."id" IN (${lista.join(',')})` : '';

    const filas = await sequelize.query(
        `SELECT g."id", g."nombre", g."imagen", g."stockMinimoGlobal", g."categoriaId", c."nombre" AS "categoria",
                COALESCE(SUM(p."stockAlmacen"), 0)::float AS "stockTotal",
                COUNT(p."id")::int AS "nProductos",
                MAX(p."updatedAt") AS "actualizado"
         FROM "GruposEquivalencia" g
         LEFT JOIN "Productos" p ON p."grupoEquivalenciaId" = g."id"
         LEFT JOIN "Categorias" c ON c."id" = g."categoriaId"
         ${filtro}
         GROUP BY g."id", c."nombre"`,
        { type: 'SELECT' }
    );

    return new Map(filas.map((g) => {
        const stockMinimoGlobal = Number(g.stockMinimoGlobal) || 0;
        return [g.id, { ...g, stockMinimoGlobal, estado: estadoDe(g.stockTotal, stockMinimoGlobal) }];
    }));
}
