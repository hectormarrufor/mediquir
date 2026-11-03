// Migración: las compras guardan los números TAL CUAL se escriben (sin redondear a céntimos ni cortar la tasa a 2 decimales).
//   FacturasCompras: subtotal, montoIva, montoRetencion, totalFinal, montoExento -> numeric(20,6); tasaCambio -> numeric(20,8)
//   CuentasPorPagar.tasaCambio, RetencionesIva.tasaCambio                         -> numeric(20,8)
//   EntradasInventario.costoUnitario (lo que costó una unidad en esa compra)       -> numeric(20,8)
// Solo AGRANDA las columnas: ningún valor guardado cambia. Mientras no se ejecute, la base sigue guardando a 2 decimales.
// Se puede ejecutar varias veces.   node scripts/migraciones/compras-sin-redondeo.cjs
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

const CAMBIOS = [
    ['FacturasCompras', 'subtotal', 'numeric(20,6)'],
    ['FacturasCompras', 'montoIva', 'numeric(20,6)'],
    ['FacturasCompras', 'montoRetencion', 'numeric(20,6)'],
    ['FacturasCompras', 'totalFinal', 'numeric(20,6)'],
    ['FacturasCompras', 'montoExento', 'numeric(20,6)'],
    ['FacturasCompras', 'tasaCambio', 'numeric(20,8)'],
    ['CuentasPorPagar', 'tasaCambio', 'numeric(20,8)'],
    ['RetencionesIva', 'tasaCambio', 'numeric(20,8)'],
    ['EntradasInventario', 'costoUnitario', 'numeric(20,8)'],
];

// Algunas tablas (EntradasInventario, underscored) guardan las columnas como costo_unitario y no costoUnitario:
// se busca el nombre real en la base antes de cambiarla.
const conGuionBajo = (s) => s.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`);

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        for (const [tabla, columna, tipo] of CAMBIOS) {
            const { rows } = await db.query(
                `SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = ANY($2)`,
                [tabla, [columna, conGuionBajo(columna)]]
            );
            if (!rows.length) throw new Error(`no existe la columna ${columna} (ni ${conGuionBajo(columna)}) en "${tabla}"`);
            const real = rows[0].column_name;
            await db.query(`ALTER TABLE "${tabla}" ALTER COLUMN "${real}" TYPE ${tipo}`);
            console.log(`  ${tabla}.${real} -> ${tipo}`);
        }
        await db.query('COMMIT');
        console.log('Migración lista: las compras ya guardan los montos y la tasa con todos sus decimales.');
    } catch (e) {
        await db.query('ROLLBACK');
        console.error('Falló, se revirtió todo:', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
