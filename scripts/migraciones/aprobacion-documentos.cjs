// 2026-11-13: facturas y notas de crédito/débito hechas por vendedores quedan "por aprobar": jolexi (o el usuario 1) las revisa, las corrige y las aprueba;
// recién entonces se imprimen. Mientras tanto no se pueden imprimir.
//   Ventas.aprobacionEstado / NotasFiscales.aprobacionEstado : 'PENDIENTE' (por aprobar) | 'APROBADA' | NULL (documento normal, sin aprobación)
//   aprobadaAt / aprobadaPorId : cuándo y quién la aprobó
// Los documentos que ya existen quedan en NULL (no pasan por aprobación).
//   node scripts/migraciones/aprobacion-documentos.cjs
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');
(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        for (const tabla of ['Ventas', 'NotasFiscales']) {
            await db.query(`ALTER TABLE "${tabla}" ADD COLUMN IF NOT EXISTS "aprobacionEstado" varchar(10)`);
            await db.query(`ALTER TABLE "${tabla}" ADD COLUMN IF NOT EXISTS "aprobadaAt" timestamptz`);
            await db.query(`ALTER TABLE "${tabla}" ADD COLUMN IF NOT EXISTS "aprobadaPorId" integer`);
            await db.query(`CREATE INDEX IF NOT EXISTS "${tabla}_aprobacion_pendiente" ON "${tabla}" ("aprobacionEstado") WHERE "aprobacionEstado" = 'PENDIENTE'`);
        }
        await db.query('COMMIT');
        console.log('✅ Columnas de aprobación creadas en Ventas y NotasFiscales');
    } catch (e) { await db.query('ROLLBACK').catch(() => {}); console.error('❌', e.message); process.exitCode = 1; } finally { await db.end(); }
})();
