// Migración aditiva: préstamos a vendedores a comisión y pagos de comisión.
//  - "PagosComision": cada pago hecho a un vendedor de lo acumulado por pagar (total de comisión, lo abonado al préstamo y lo pagado en neto).
//  - "MovimientosPrestamoVendedor": cada préstamo (suma) o abono al préstamo (resta, normalmente ligado a un pago). Saldo = préstamos - abonos.
// Se puede ejecutar varias veces.   node scripts/migraciones/prestamos-vendedores.cjs
// IMPORTANTE: correrla ANTES de desplegar el código que usa estas tablas.
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        await db.query(`
            CREATE TABLE IF NOT EXISTS "PagosComision" (
                "id" serial PRIMARY KEY,
                "vendedorId" integer NOT NULL REFERENCES "VendedoresComision"("id"),
                "fecha" date NOT NULL,
                "totalComisionUsd" numeric(12,2) NOT NULL,
                "abonoPrestamoUsd" numeric(12,2) NOT NULL DEFAULT 0,
                "pagadoUsd" numeric(12,2) NOT NULL,
                "tasaBcv" numeric(14,4) NULL,
                "lineas" jsonb NOT NULL DEFAULT '[]',
                "prestamoAntesUsd" numeric(12,2) NOT NULL DEFAULT 0,
                "prestamoDespuesUsd" numeric(12,2) NOT NULL DEFAULT 0,
                "observacion" text NULL,
                "createdAt" timestamptz NOT NULL DEFAULT now(),
                "updatedAt" timestamptz NOT NULL DEFAULT now()
            )`);
        await db.query('CREATE INDEX IF NOT EXISTS "PagosComision_vendedor_idx" ON "PagosComision" ("vendedorId", "fecha")');
        await db.query(`
            CREATE TABLE IF NOT EXISTS "MovimientosPrestamoVendedor" (
                "id" serial PRIMARY KEY,
                "vendedorId" integer NOT NULL REFERENCES "VendedoresComision"("id"),
                "tipo" varchar(10) NOT NULL,
                "montoUsd" numeric(12,2) NOT NULL,
                "fecha" date NOT NULL,
                "nota" text NULL,
                "pagoComisionId" integer NULL REFERENCES "PagosComision"("id") ON DELETE SET NULL,
                "createdAt" timestamptz NOT NULL DEFAULT now(),
                "updatedAt" timestamptz NOT NULL DEFAULT now()
            )`);
        await db.query('CREATE INDEX IF NOT EXISTS "MovPrestamoVend_vendedor_idx" ON "MovimientosPrestamoVendedor" ("vendedorId", "fecha")');
        await db.query('COMMIT');
        console.log('Migración lista: tablas PagosComision y MovimientosPrestamoVendedor');
    } catch (e) {
        await db.query('ROLLBACK');
        console.error('Falló, se revirtió todo:', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
