// Migración aditiva: notas de débito por diferencial cambiario.
//   NotasFiscales.esDiferencial  -> true si la nota cobra la diferencia de tasa entre la fecha de la factura y la del pago.
//   NotasFiscales.diferencialUsd -> cuántos dólares de la factura cubre esa nota (para no cobrar dos veces el mismo tramo).
// Se puede ejecutar varias veces.   node scripts/migraciones/nota-diferencial.cjs
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        await db.query(`ALTER TABLE "NotasFiscales" ADD COLUMN IF NOT EXISTS "esDiferencial" boolean NOT NULL DEFAULT false`);
        await db.query(`ALTER TABLE "NotasFiscales" ADD COLUMN IF NOT EXISTS "diferencialUsd" numeric(12,2) NOT NULL DEFAULT 0`);
        await db.query('COMMIT');
        console.log('Migración lista: NotasFiscales.esDiferencial, NotasFiscales.diferencialUsd');
    } catch (e) {
        await db.query('ROLLBACK');
        console.error('Falló, se revirtió todo:', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
