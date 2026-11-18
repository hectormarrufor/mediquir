// 2026-11-17: las facturas y notas de crédito/débito de los vendedores NO mueven inventario, cuentas por cobrar, caja ni comisiones hasta que jolexi
// las aprueba. Mientras esperan, lo que hay que aplicar al aprobar queda guardado aquí:
//   Ventas.efectosPendientes / NotasFiscales.efectosPendientes : JSON con los datos del pago/nota (NULL = los efectos ya se aplicaron o no aplica)
// Los documentos que ya existen quedan en NULL (sus efectos ya están aplicados).
//   node scripts/migraciones/aprobacion-efectos.cjs
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');
(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        for (const tabla of ['Ventas', 'NotasFiscales']) {
            await db.query(`ALTER TABLE "${tabla}" ADD COLUMN IF NOT EXISTS "efectosPendientes" jsonb`);
        }
        await db.query('COMMIT');
        console.log('✅ Columna efectosPendientes creada en Ventas y NotasFiscales');
    } catch (e) { await db.query('ROLLBACK').catch(() => {}); console.error('❌', e.message); process.exitCode = 1; } finally { await db.end(); }
})();
