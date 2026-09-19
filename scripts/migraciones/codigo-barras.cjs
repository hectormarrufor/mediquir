// Migración aditiva: código de barras del producto.
//   Productos.codigoBarras -> el código de barras IMPRESO en el empaque del producto (EAN/UPC), para verificar el empaque de los pedidos.
//   Es distinto de `codigo` (código interno de la empresa, ej. 0483 o 0093-02). Vacío = el producto no trae código de barras.
// Se puede ejecutar varias veces sin problema.   node scripts/migraciones/codigo-barras.cjs
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        await db.query(`ALTER TABLE "Productos" ADD COLUMN IF NOT EXISTS "codigoBarras" varchar(64) NULL`);
        await db.query(`CREATE INDEX IF NOT EXISTS "Productos_codigoBarras" ON "Productos" ("codigoBarras") WHERE "codigoBarras" IS NOT NULL`);
        await db.query('COMMIT');
        console.log('Migración de código de barras aplicada.');
    } catch (e) {
        await db.query('ROLLBACK');
        console.error('Falló la migración (se revirtió):', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
