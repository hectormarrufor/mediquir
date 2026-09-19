// Migración aditiva: registro de errores de empaque por empleado (para saber quién se equivoca más al buscar productos).
//   EmpaqueErrores: un renglón por cada vez que el empacador tomó un producto o una presentación equivocada
//   (el sistema lo frenó o lo avisó). Se puede ejecutar varias veces.   node scripts/migraciones/empaque-errores.cjs
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        await db.query(`CREATE TABLE IF NOT EXISTS "EmpaqueErrores" (
            id serial PRIMARY KEY,
            "ventaId" uuid NOT NULL,
            "ventaDetalleId" uuid NULL,
            "empacadorId" integer NOT NULL,
            "productoId" integer NULL,
            tipo varchar(12) NOT NULL,            -- PRODUCTO (otro producto), PRESENTACION (unidad/caja/bulto equivocado), MARCA
            "nivelPedido" varchar(10) NULL,       -- lo que pedían (el nivel mayor: UNIDAD, CAJA o BULTO)
            "nivelEscaneado" varchar(10) NULL,    -- lo que tenía en la mano según el código
            codigo varchar(64) NULL,
            "createdAt" timestamp NOT NULL DEFAULT NOW()
        )`);
        await db.query(`CREATE INDEX IF NOT EXISTS "EmpaqueErrores_empacador_fecha" ON "EmpaqueErrores" ("empacadorId", "createdAt")`);
        await db.query(`CREATE INDEX IF NOT EXISTS "EmpaqueErrores_venta" ON "EmpaqueErrores" ("ventaId")`);
        await db.query('COMMIT');
        console.log('Migración lista: EmpaqueErrores');
    } catch (e) {
        await db.query('ROLLBACK');
        console.error('Falló, se revirtió todo:', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
