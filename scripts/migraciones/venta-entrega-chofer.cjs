// Migración aditiva: evidencia de la entrega de la mercancía al chofer o agencia.
//   Ventas.choferNombre / choferCedula / choferEmpresa -> quién se llevó la mercancía
//   Ventas.firmaChoferUrl -> imagen de la firma dibujada en el teléfono
//   Ventas.facturaEntregadaChofer -> el vendedor confirmó que le entregó la factura impresa
//   Ventas.entregadoPorId / entregadoPorNombre -> quién de Mediquir hizo la entrega
// Se puede ejecutar varias veces.   node scripts/migraciones/venta-entrega-chofer.cjs
// IMPORTANTE: correrla ANTES de desplegar el código que usa estas columnas.
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        await db.query(`ALTER TABLE "Ventas" ADD COLUMN IF NOT EXISTS "choferNombre" varchar(120) NULL`);
        await db.query(`ALTER TABLE "Ventas" ADD COLUMN IF NOT EXISTS "choferCedula" varchar(30) NULL`);
        await db.query(`ALTER TABLE "Ventas" ADD COLUMN IF NOT EXISTS "choferEmpresa" varchar(120) NULL`);
        await db.query(`ALTER TABLE "Ventas" ADD COLUMN IF NOT EXISTS "firmaChoferUrl" text NULL`);
        await db.query(`ALTER TABLE "Ventas" ADD COLUMN IF NOT EXISTS "facturaEntregadaChofer" boolean NOT NULL DEFAULT false`);
        await db.query(`ALTER TABLE "Ventas" ADD COLUMN IF NOT EXISTS "entregadoPorId" integer NULL`);
        await db.query(`ALTER TABLE "Ventas" ADD COLUMN IF NOT EXISTS "entregadoPorNombre" varchar(120) NULL`);
        await db.query('COMMIT');
        console.log('Migración lista: Ventas (datos del chofer, firma y confirmación de factura)');
    } catch (e) {
        await db.query('ROLLBACK');
        console.error('Falló, se revirtió todo:', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
