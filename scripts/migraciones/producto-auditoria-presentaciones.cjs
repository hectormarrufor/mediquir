// Migración aditiva: auditoría del inventario por producto y presentaciones confirmadas por el empacador.
//   Productos.inventarioAuditado / inventarioAuditadoAt / inventarioAuditadoPorId -> el stock de este producto ya se contó y corrigió.
//     Mientras sea false (naranja), vender o empacar NO mueve el stock (solo suma las unidades vendidas); en true (verde) sí.
//   Productos.presentacionesVerificadasAt / presentacionesVerificadasPorId -> alguien con el producto en la mano ya confirmó
//     sus presentaciones (caja, bulto) o que no aplican; si está vacío, el empaque se las pregunta al empacador.
// Se puede ejecutar varias veces.   node scripts/migraciones/producto-auditoria-presentaciones.cjs
// IMPORTANTE: correrla ANTES de desplegar el código que usa estas columnas.
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        await db.query(`ALTER TABLE "Productos" ADD COLUMN IF NOT EXISTS "inventarioAuditado" boolean NOT NULL DEFAULT false`);
        await db.query(`ALTER TABLE "Productos" ADD COLUMN IF NOT EXISTS "inventarioAuditadoAt" timestamptz NULL`);
        await db.query(`ALTER TABLE "Productos" ADD COLUMN IF NOT EXISTS "inventarioAuditadoPorId" integer NULL`);
        await db.query(`ALTER TABLE "Productos" ADD COLUMN IF NOT EXISTS "presentacionesVerificadasAt" timestamptz NULL`);
        await db.query(`ALTER TABLE "Productos" ADD COLUMN IF NOT EXISTS "presentacionesVerificadasPorId" integer NULL`);
        await db.query('COMMIT');
        console.log('Migración lista: Productos (auditoría de inventario y presentaciones verificadas)');
    } catch (e) {
        await db.query('ROLLBACK');
        console.error('Falló, se revirtió todo:', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
