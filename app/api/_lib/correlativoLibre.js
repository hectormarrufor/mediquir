// Facturas escritas a mano muy por delante del correlativo (copias de facturas del sistema anterior): NO mueven el correlativo.
// El siguiente número es el primero libre desde el correlativo: cuando se llega a un número que ya existe (una factura agregada antes), se salta al siguiente.
// Imports relativos con extensión (sin alias "@/") para poder probarlo con un script de Node.
import db from '../../../models/index.js';

const { sequelize } = db;

/**
 * Primer número libre de la serie `prefijo` desde `desde` (incluido).
 * `ocupados`: números que se van a usar en esta misma transacción y todavía no están guardados.
 */
export async function primerLibre({ prefijo, desde, ocupados = [], transaction }) {
    const filas = await sequelize.query(
        `SELECT DISTINCT CAST(regexp_replace("numeroDocumento", '[^0-9]', '', 'g') AS bigint) AS n
           FROM "Ventas" WHERE "numeroDocumento" ~ :patron AND CAST(regexp_replace("numeroDocumento", '[^0-9]', '', 'g') AS bigint) >= :desde`,
        { replacements: { patron: `^${prefijo}-[0-9]+$`, desde: Number(desde) || 1 }, type: sequelize.QueryTypes.SELECT, transaction },
    );
    const usados = new Set([...filas.map((f) => Number(f.n)), ...ocupados.map(Number)]);
    let n = Number(desde) || 1;
    while (usados.has(n)) n += 1;
    return n;
}

/**
 * Desde dónde buscar el siguiente número de FACTURA: si una factura se eliminó, su número queda libre por encima de la última factura con control y
 * la próxima lo reutiliza (no deja un hueco). Lo anterior a la última factura con control nunca se reutiliza. El correlativo guardado no baja.
 */
export async function desdeLibreFacturas({ siguiente, transaction }) {
    const [fila] = await sequelize.query(
        `SELECT MAX(CAST(NULLIF(regexp_replace("numeroDocumento", '[^0-9]', '', 'g'), '') AS bigint)) AS n
           FROM "Ventas" WHERE "numeroDocumento" ~ '^F-[0-9]+$' AND "tipoDocumento" = 'FACTURA' AND "facturaTalonario" = false AND "numeroControl" IS NOT NULL`,
        { type: sequelize.QueryTypes.SELECT, transaction },
    );
    const base = Number(siguiente) || 1;
    return fila?.n ? Math.min(base, Number(fila.n) + 1) : base;
}
