// Migración aditiva: tarifa de precios de cada cliente con usuario (portal B2B).
//   Clientes.tarifaPrecio -> 'precio6' (mayor, la de siempre) | 'precio7' (detal). Solo la cambia un administrador.
// Se puede ejecutar varias veces.   node scripts/migraciones/tarifa-cliente.cjs
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        await db.query(`ALTER TABLE "Clientes" ADD COLUMN IF NOT EXISTS "tarifaPrecio" varchar(10) NOT NULL DEFAULT 'precio6'`);
        await db.query(`DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Clientes_tarifaPrecio_chk') THEN
                ALTER TABLE "Clientes" ADD CONSTRAINT "Clientes_tarifaPrecio_chk" CHECK ("tarifaPrecio" IN ('precio6', 'precio7'));
            END IF;
        END $$`);
        await db.query('COMMIT');
        console.log('Migración lista: Clientes.tarifaPrecio (todos quedan en precio6)');
    } catch (e) {
        await db.query('ROLLBACK');
        console.error('Falló, se revirtió todo:', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
