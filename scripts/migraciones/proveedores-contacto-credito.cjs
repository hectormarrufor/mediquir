// Migración aditiva: proveedores con persona de contacto y crédito (cuántos créditos a la vez y días de cada uno).
// Se puede ejecutar varias veces sin problema (IF NOT EXISTS).   node scripts/migraciones/proveedores-contacto-credito.cjs
//   maxCreditos: máximo de compras a crédito sin pagar a la vez; 0 = no da crédito (contado).   diasCredito: plazo de cada una.
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        await db.query(`ALTER TABLE "Proveedores"
            ADD COLUMN IF NOT EXISTS "contactoNombre" varchar(150),
            ADD COLUMN IF NOT EXISTS "contactoCargo" varchar(100),
            ADD COLUMN IF NOT EXISTS "contactoTelefono" varchar(40),
            ADD COLUMN IF NOT EXISTS "contactoEmail" varchar(150),
            ADD COLUMN IF NOT EXISTS "maxCreditos" integer NOT NULL DEFAULT 3,
            ADD COLUMN IF NOT EXISTS "diasCredito" integer NOT NULL DEFAULT 7`);
        await db.query('COMMIT');
        console.log('Migración de contacto y crédito por proveedor aplicada.');
    } catch (e) {
        await db.query('ROLLBACK');
        console.error('Falló la migración (se revirtió):', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
