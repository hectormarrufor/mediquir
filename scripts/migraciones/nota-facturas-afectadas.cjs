// Migración aditiva: una nota de débito puede afectar a varias facturas a la vez.
//   NotasFiscales.facturasAfectadas -> [{ ventaId, numeroDocumento, fecha }] con TODAS las facturas que afecta la nota
//   (la primera es la "principal": la que lleva el efecto en la cuenta por cobrar, ventaId). Vacío en las notas anteriores.
// Se puede ejecutar varias veces.   node scripts/migraciones/nota-facturas-afectadas.cjs
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        await db.query(`ALTER TABLE "NotasFiscales" ADD COLUMN IF NOT EXISTS "facturasAfectadas" jsonb NOT NULL DEFAULT '[]'::jsonb`);
        await db.query('COMMIT');
        console.log('Migración lista: NotasFiscales.facturasAfectadas');
    } catch (e) {
        await db.query('ROLLBACK');
        console.error('Falló, se revirtió todo:', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
