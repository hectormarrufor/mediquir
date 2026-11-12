// 2026-11-11: la NC-06262 (forma con control 00-0122648, F-146826, Bs 541.130,26) se registró con el control mal digitado (00-022648).
//   node scripts/migraciones/control-nc-06262.cjs [--aplicar]
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');
const APLICAR = process.argv.includes('--aplicar');
(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        if ((await db.query(`SELECT 1 FROM "NotasFiscales" WHERE "numeroControl" = '00-0122648'`)).rowCount) throw new Error('Ya existe un documento con el control 00-0122648');
        const r = await db.query(`UPDATE "NotasFiscales" SET "numeroControl" = '00-0122648', "updatedAt" = now() WHERE "numeroDocumento" = 'NC-06262' AND "numeroControl" = '00-022648' RETURNING "numeroDocumento","numeroControl","totalFinal"`);
        if (r.rowCount !== 1) throw new Error('No se encontró la NC-06262 con control 00-022648 (¿ya se corrigió?)');
        console.log(r.rows);
        if (APLICAR) { await db.query('COMMIT'); console.log('✅ CAMBIOS GUARDADOS'); } else { await db.query('ROLLBACK'); console.log('🧪 SIMULACIÓN: para aplicar --aplicar'); }
    } catch (e) { await db.query('ROLLBACK').catch(() => {}); console.error('❌', e.message); process.exitCode = 1; } finally { await db.end(); }
})();
