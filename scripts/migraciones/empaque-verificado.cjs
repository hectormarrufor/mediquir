// Migración aditiva para el empaque verificado: evidencia por renglón y fotos de la caja.
// Se puede ejecutar varias veces sin problema (IF NOT EXISTS).   node scripts/migraciones/empaque-verificado.cjs
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        await db.query(`ALTER TABLE "Ventas"
            ADD COLUMN IF NOT EXISTS "fotoCajaAbiertaUrl" text NULL,
            ADD COLUMN IF NOT EXISTS "fotoCajaSelladaUrl" text NULL,
            ADD COLUMN IF NOT EXISTS "empaqueIniciadoAt" timestamptz NULL,
            ADD COLUMN IF NOT EXISTS "empaqueVerificado" boolean NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS "fotosVencidasAt" timestamptz NULL`);
        await db.query(`CREATE TABLE IF NOT EXISTS "VentaEmpaqueItems" (
            id serial PRIMARY KEY,
            "ventaId" uuid NOT NULL REFERENCES "Ventas"(id) ON DELETE CASCADE,
            "ventaDetalleId" uuid NOT NULL UNIQUE REFERENCES "VentaDetalles"(id) ON DELETE CASCADE,
            estado varchar(10) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'OK', 'NOVEDAD')),
            "cantidadPedida" numeric(10,2) NOT NULL,
            "cantidadEmpacada" numeric(10,2) NULL,
            metodo varchar(10) NULL,
            "intentosFallidos" integer NOT NULL DEFAULT 0,
            observacion text NULL,
            "verificadoAt" timestamptz NULL
        )`);
        await db.query(`CREATE INDEX IF NOT EXISTS "VentaEmpaqueItems_ventaId" ON "VentaEmpaqueItems" ("ventaId")`);
        await db.query('COMMIT');
        console.log('Migración de empaque verificado aplicada.');
    } catch (e) {
        await db.query('ROLLBACK');
        console.error('Falló la migración (se revirtió):', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
