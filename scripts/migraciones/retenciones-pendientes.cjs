// Migración aditiva: retenciones de IVA "pendientes de comprobante". Al facturar a un contribuyente especial el sistema
// calcula la retención sola; el número de comprobante lo emite el cliente y se carga después.
// Se puede ejecutar varias veces sin problema.   node scripts/migraciones/retenciones-pendientes.cjs
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        await db.query(`ALTER TABLE "RetencionesIva" ALTER COLUMN "comprobante" DROP NOT NULL`);
        await db.query(`ALTER TABLE "RetencionesIva" ADD COLUMN IF NOT EXISTS "estado" varchar(12) NOT NULL DEFAULT 'REGISTRADA'`);
        await db.query('COMMIT');
        console.log('Migración de retenciones pendientes aplicada.');
    } catch (e) {
        await db.query('ROLLBACK');
        console.error('Falló la migración (se revirtió):', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
