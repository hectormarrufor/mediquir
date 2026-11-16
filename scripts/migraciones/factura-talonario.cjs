// Migración aditiva: facturas de talonario (hechas a mano). Agrega "facturaTalonario" a "Ventas": su número (serie FM-) y su control
// los trae el talonario y no cuentan en el correlativo de facturas ni en el del control de la forma libre.
// Se puede ejecutar varias veces.   node scripts/migraciones/factura-talonario.cjs
// IMPORTANTE: correrla ANTES de desplegar el código que usa esta columna.
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        await db.query('ALTER TABLE "Ventas" ADD COLUMN IF NOT EXISTS "facturaTalonario" boolean NOT NULL DEFAULT false');
        await db.query('COMMIT');
        console.log('Migración lista: columna Ventas.facturaTalonario');
    } catch (e) {
        await db.query('ROLLBACK');
        console.error('Falló, se revirtió todo:', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
