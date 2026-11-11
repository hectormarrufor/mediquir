// Migración aditiva: formas libres anuladas (números de control que nunca llevaron un documento: la hoja se dañó o se saltó).
// Con ellas el listado de números de control explica sus huecos y el sistema no vuelve a asignar ese número.
// Se puede ejecutar varias veces.   node scripts/migraciones/formas-anuladas.cjs
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        await db.query(`CREATE TABLE IF NOT EXISTS "FormasAnuladas" (
            id SERIAL PRIMARY KEY,
            numero INTEGER NOT NULL UNIQUE,
            motivo TEXT,
            "usuarioId" INTEGER,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now())`);
        await db.query('COMMIT');
        console.log('Migración lista: tabla FormasAnuladas');
    } catch (e) {
        await db.query('ROLLBACK');
        console.error('Falló, se revirtió todo:', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
