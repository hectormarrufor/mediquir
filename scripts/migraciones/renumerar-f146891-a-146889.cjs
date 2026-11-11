// 2026-11-11: la factura registrada por error como F-146891 (control 00-0122708, LOS ILUSTRES, Bs 361.131,52) es la F-146889.
// El correlativo de facturas vuelve a 146891 (146889 y 146890 ya van ocupadas); el de control sigue en 122710.
//   node scripts/migraciones/renumerar-f146891-a-146889.cjs [--aplicar]
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');
const APLICAR = process.argv.includes('--aplicar');
(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        const [v] = (await db.query(`SELECT id FROM "Ventas" WHERE "numeroDocumento" = 'F-146891' AND "numeroControl" = '00-0122708' FOR UPDATE`)).rows;
        if (!v) throw new Error('No se encontró la F-146891 con control 00-0122708 (¿ya se renumeró?)');
        if ((await db.query(`SELECT 1 FROM "Ventas" WHERE "numeroDocumento" = 'F-146889'`)).rowCount) throw new Error('Ya existe la F-146889');
        await db.query(`UPDATE "Ventas" SET "numeroDocumento" = 'F-146889', "updatedAt" = now() WHERE id = $1`, [v.id]);
        await db.query(`UPDATE "SalidasInventario" SET justificacion = 'Venta F-146889' WHERE venta_id = $1 AND justificacion = 'Venta F-146891'`, [v.id]);
        await db.query(`UPDATE correlativos SET "siguienteNumero" = 146891 WHERE prefijo = 'F' AND "siguienteNumero" > 146891`);
        console.log((await db.query(`SELECT "numeroDocumento","numeroControl","totalFinal" FROM "Ventas" WHERE id = $1`, [v.id])).rows, (await db.query(`SELECT prefijo,"siguienteNumero" FROM correlativos WHERE prefijo IN ('F','CONTROL')`)).rows);
        if (APLICAR) { await db.query('COMMIT'); console.log('✅ CAMBIOS GUARDADOS'); } else { await db.query('ROLLBACK'); console.log('🧪 SIMULACIÓN: para aplicar --aplicar'); }
    } catch (e) { await db.query('ROLLBACK').catch(() => {}); console.error('❌', e.message); process.exitCode = 1; } finally { await db.end(); }
})();
