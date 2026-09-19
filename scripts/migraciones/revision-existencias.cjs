// Migración aditiva: pedidos B2B "en revisión de existencias".
// Un cliente puede pedir más de lo que hay en almacén: el pedido queda en revisión (sin cuenta por cobrar ni retención) hasta que
// administración confirme que consigue las cantidades o ajuste los renglones.
//   Ventas.revisionStock       -> 'PENDIENTE' (en revisión) | 'RESUELTA' | NULL (nunca estuvo en revisión)
//   Ventas.revisionNota        -> ajustes que hizo administración (renglones quitados o reducidos), para avisarle al cliente
//   Ventas.revisionResueltaAt  -> cuándo se confirmó
// Se puede ejecutar varias veces.   node scripts/migraciones/revision-existencias.cjs
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        await db.query(`ALTER TABLE "Ventas"
            ADD COLUMN IF NOT EXISTS "revisionStock" varchar(10) NULL,
            ADD COLUMN IF NOT EXISTS "revisionNota" text NULL,
            ADD COLUMN IF NOT EXISTS "revisionResueltaAt" timestamp NULL`);
        await db.query(`CREATE INDEX IF NOT EXISTS "Ventas_revisionStock" ON "Ventas" ("revisionStock") WHERE "revisionStock" = 'PENDIENTE'`);
        await db.query('COMMIT');
        console.log('Migración lista: Ventas.revisionStock / revisionNota / revisionResueltaAt');
    } catch (e) {
        await db.query('ROLLBACK');
        console.error('Falló, se revirtió todo:', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
