// Migración aditiva: crédito por cliente (días de crédito aprobados y máximo de pedidos a crédito activos).
// Se puede ejecutar varias veces sin problema (IF NOT EXISTS).   node scripts/migraciones/credito-clientes.cjs
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        await db.query(`ALTER TABLE "Clientes"
            ADD COLUMN IF NOT EXISTS "diasCredito" integer NOT NULL DEFAULT 7,
            ADD COLUMN IF NOT EXISTS "maxPedidosCredito" integer NOT NULL DEFAULT 5`);
        await db.query('COMMIT');
        console.log('Migración de crédito por cliente aplicada.');
    } catch (e) {
        await db.query('ROLLBACK');
        console.error('Falló la migración (se revirtió):', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
