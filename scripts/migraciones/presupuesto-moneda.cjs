// Migración aditiva: moneda de cada presupuesto.
//   Presupuestos.moneda -> 'USD' (P7/P6, como todos los anteriores) | 'BS' (P4/P5: precios y totales en Bs a la tasa del día).
// Se puede ejecutar varias veces.   node scripts/migraciones/presupuesto-moneda.cjs
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        await db.query(`ALTER TABLE "Presupuestos" ADD COLUMN IF NOT EXISTS "moneda" varchar(3) NOT NULL DEFAULT 'USD'`);
        await db.query(`DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Presupuestos_moneda_chk') THEN
                ALTER TABLE "Presupuestos" ADD CONSTRAINT "Presupuestos_moneda_chk" CHECK ("moneda" IN ('USD', 'BS'));
            END IF;
        END $$`);
        await db.query('COMMIT');
        const { rows } = await db.query(`SELECT moneda, count(*)::int AS cantidad FROM "Presupuestos" GROUP BY moneda`);
        console.log('Migración lista: Presupuestos.moneda', rows);
    } catch (e) {
        await db.query('ROLLBACK');
        console.error('Falló, se revirtió todo:', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
