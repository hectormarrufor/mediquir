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
