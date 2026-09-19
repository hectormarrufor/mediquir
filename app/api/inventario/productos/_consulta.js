import { Op } from 'sequelize';
import { sequelize } from '@/models';

export const TAMANOS_PAGINA = [10, 25, 50, 100, 200];

// Columnas por las que se puede ordenar (lista blanca; nunca se usa texto del usuario en el SQL)
export const ORDENABLES = ['nombre', 'codigo', 'categoria', 'marca', 'stockAlmacen', 'stockMinimo', 'costoUsd', 'precio6', 'precio7', 'porcentajeDescuento', 'valor', 'margen', 'updatedAt'];

const int = (v) => {
    const n = parseInt(v, 10);
    return Number.isInteger(n) && n > 0 ? n : null;
};

// Escapa % _ \ para que la búsqueda trate el texto literalmente
const like = (texto) => `%${texto.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export function leerParametros(searchParams) {
    const p = (k) => searchParams.get(k) || '';
    const pageSize = TAMANOS_PAGINA.includes(int(p('pageSize'))) ? int(p('pageSize')) : 50;
    return {
        page: int(p('page')) || 1,
        pageSize,
        q: p('q').trim().slice(0, 100),
        categoriaId: int(p('categoriaId')),
        marcaId: int(p('marcaId')),
        grupoId: int(p('grupoId')),
        tagId: int(p('tagId')),
        oferta: ['con', 'sin'].includes(p('oferta')) ? p('oferta') : '',
        // El estado de stock se evalúa por ENTRADA (un grupo cuenta como uno), ver _entradas.js
        stock: ['agotado', 'bajo', 'ok'].includes(p('stock')) ? p('stock') : '',
        sort: ORDENABLES.includes(p('sort')) ? p('sort') : 'updatedAt',
        dir: p('dir') === 'asc' ? 'ASC' : 'DESC',
    };
}

// Filtros que se resuelven en la base de datos, a nivel de producto
export function construirWhere(f) {
    const and = [];

    // Búsqueda: cada palabra debe aparecer en nombre, código, marca, grupo o etiquetas
    f.q.split(/\s+/).filter(Boolean).forEach((palabra) => {
        const patron = like(palabra);
        and.push({
            [Op.or]: [
                { nombre: { [Op.iLike]: patron } },
                { codigo: { [Op.iLike]: patron } },
                { codigoBarras: { [Op.iLike]: patron } }, // se puede escanear un código de barras en el buscador
                { codigoBarrasCaja: { [Op.iLike]: patron } },
                { codigoBarrasBulto: { [Op.iLike]: patron } },
                { '$marca.nombre$': { [Op.iLike]: patron } },
                sequelize.literal(`EXISTS (SELECT 1 FROM "GruposEquivalencia" g WHERE g."id" = "Producto"."grupoEquivalenciaId" AND g."nombre" ILIKE ${sequelize.escape(patron)})`),
                sequelize.literal(`EXISTS (SELECT 1 FROM "ProductoTags" pt JOIN "Tags" t ON t."id" = pt."tagId"
                    WHERE pt."productoId" = "Producto"."id" AND t."nombre" ILIKE ${sequelize.escape(patron)})`),
            ],
        });
    });

    if (f.categoriaId) and.push({ categoriaId: f.categoriaId });
    if (f.marcaId) and.push({ marcaId: f.marcaId });
    if (f.grupoId) and.push({ grupoEquivalenciaId: f.grupoId });
    if (f.tagId) and.push(sequelize.literal(`EXISTS (SELECT 1 FROM "ProductoTags" pt WHERE pt."productoId" = "Producto"."id" AND pt."tagId" = ${f.tagId})`));

    if (f.oferta === 'con') and.push({ porcentajeDescuento: { [Op.gt]: 0 } });
    if (f.oferta === 'sin') and.push({ [Op.or]: [{ porcentajeDescuento: null }, { porcentajeDescuento: { [Op.lte]: 0 } }] });

    return and.length ? { [Op.and]: and } : {};
}
