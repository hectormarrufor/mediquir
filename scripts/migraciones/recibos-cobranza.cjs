// Migración aditiva: los recibos de cobranza (cuentas por cobrar) guardan el detalle de las facturas que cubren.
// Agrega la columna "detalle" (jsonb) a "Recibos". Se puede ejecutar varias veces.   node scripts/migraciones/recibos-cobranza.cjs
// IMPORTANTE: correrla ANTES de desplegar el código que usa esta columna.
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        await db.query('ALTER TABLE "Recibos" ADD COLUMN IF NOT EXISTS "detalle" jsonb NULL');
        await db.query(`CREATE INDEX IF NOT EXISTS "Recibos_detalle_clave_idx" ON "Recibos" ((detalle->>'clave'))`);
        await db.query('COMMIT');
        console.log('Migración lista: columna Recibos.detalle');
    } catch (e) {
        await db.query('ROLLBACK');
        console.error('Falló, se revirtió todo:', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
