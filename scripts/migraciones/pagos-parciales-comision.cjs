// Migración aditiva: pagos PARCIALES de la comisión acumulada de un vendedor a comisión.
//  - "VendedoresComision"."comisionAbonadaUsd": lo ya pagado de la comisión acumulada que todavía no cubre una línea completa (se aplica a las
//    líneas por pagar de la más vieja a la más nueva; cuando cubre una entera, esa línea pasa a pagada y se descuenta de aquí).
//  - "PagosComision": cuánto había acumulado antes del pago y cuánto quedó por pagar después (para el formato de pago).
// Se puede ejecutar varias veces.   node scripts/migraciones/pagos-parciales-comision.cjs
// IMPORTANTE: correrla ANTES de desplegar el código que usa estas columnas.
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        await db.query(`ALTER TABLE "VendedoresComision" ADD COLUMN IF NOT EXISTS "comisionAbonadaUsd" numeric(12,2) NOT NULL DEFAULT 0`);
        await db.query(`ALTER TABLE "PagosComision" ADD COLUMN IF NOT EXISTS "acumuladoAntesUsd" numeric(12,2) NULL`);
        await db.query(`ALTER TABLE "PagosComision" ADD COLUMN IF NOT EXISTS "acumuladoDespuesUsd" numeric(12,2) NULL`);
        await db.query('COMMIT');
        console.log('Migración lista: pagos parciales de comisión');
    } catch (e) {
        await db.query('ROLLBACK');
        console.error('Falló, se revirtió todo:', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
