// Migración aditiva: recibos (pagos hechos a / cobros recibidos de una persona), con su correlativo propio (12501, 12502...).
// Crea la tabla "Recibos". Se puede ejecutar varias veces.   node scripts/migraciones/recibos.cjs
// IMPORTANTE: correrla ANTES de desplegar el código que usa esta tabla.
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        await db.query(`
            CREATE TABLE IF NOT EXISTS "Recibos" (
                "id" serial PRIMARY KEY,
                "numero" integer NOT NULL UNIQUE,
                "tipo" varchar(12) NOT NULL DEFAULT 'PAGADO_A',
                "fecha" date NOT NULL,
                "lugar" varchar(80) NULL,
                "personaNombre" varchar(200) NOT NULL,
                "personaIdentificacion" varchar(40) NULL,
                "moneda" varchar(3) NOT NULL DEFAULT 'BS',
                "monto" numeric(14,2) NOT NULL,
                "montoLetras" text NULL,
                "concepto" text NULL,
                "formaPago" varchar(15) NOT NULL DEFAULT 'EFECTIVO',
                "referencia" varchar(100) NULL,
                "banco" varchar(120) NULL,
                "anulado" boolean NOT NULL DEFAULT false,
                "creadoPorId" integer NULL,
                "createdAt" timestamptz NOT NULL DEFAULT now(),
                "updatedAt" timestamptz NOT NULL DEFAULT now()
            )`);
        await db.query('CREATE INDEX IF NOT EXISTS "Recibos_fecha_idx" ON "Recibos" ("fecha")');
        await db.query('COMMIT');
        console.log('Migración lista: tabla Recibos');
    } catch (e) {
        await db.query('ROLLBACK');
        console.error('Falló, se revirtió todo:', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
