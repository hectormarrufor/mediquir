// 2026-11-11: la factura registrada como F-146889 (control 00-0122708, LOS ILUSTRES, Bs 105.906,88) en realidad es la F-146890 (control 00-0122709);
// el hueco de la F-146889 / 00-0122708 es de otra factura que se carga aparte. Ambas son a crédito de 15 días: el cliente pasa a 15 días y se recalcula el vencimiento.
// Los correlativos quedan en factura 146891 y control 122710 (146889, 146890, 122708 y 122709 ya van ocupados).
//   node scripts/migraciones/renumerar-f146889-a-146890.cjs [--aplicar]
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');
const APLICAR = process.argv.includes('--aplicar');
(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        const [v] = (await db.query(`SELECT id, "clienteId", "createdAt" FROM "Ventas" WHERE "numeroDocumento" = 'F-146889' AND "numeroControl" = '00-0122708' FOR UPDATE`)).rows;
        if (!v) throw new Error('No se encontró la F-146889 con control 00-0122708 (¿ya se renumeró?)');
        if ((await db.query(`SELECT 1 FROM "Ventas" WHERE "numeroDocumento" = 'F-146890'`)).rowCount) throw new Error('Ya existe la F-146890');
        await db.query(`UPDATE "Ventas" SET "numeroDocumento" = 'F-146890', "numeroControl" = '00-0122709', "fechaVencimiento" = "createdAt" + interval '15 days', "updatedAt" = now() WHERE id = $1`, [v.id]);
        await db.query(`UPDATE "SalidasInventario" SET justificacion = 'Venta F-146890' WHERE venta_id = $1 AND justificacion = 'Venta F-146889'`, [v.id]);
        await db.query(`UPDATE "CuentasPorCobrar" SET "fechaVencimiento" = (SELECT ("createdAt" AT TIME ZONE 'America/Caracas')::date + 15 FROM "Ventas" WHERE id = $1), "updatedAt" = now() WHERE "ventaId" = $1`, [v.id]);
        await db.query(`UPDATE "Clientes" SET "diasCredito" = 15 WHERE id = $1`, [v.clienteId]);
        await db.query(`UPDATE correlativos SET "siguienteNumero" = 146891 WHERE prefijo = 'F'`);
        await db.query(`UPDATE correlativos SET "siguienteNumero" = 122710 WHERE prefijo = 'CONTROL'`);
        console.log((await db.query(`SELECT "numeroDocumento","numeroControl","fechaVencimiento" FROM "Ventas" WHERE id = $1`, [v.id])).rows, (await db.query(`SELECT prefijo,"siguienteNumero" FROM correlativos WHERE prefijo IN ('F','CONTROL')`)).rows);
        if (APLICAR) { await db.query('COMMIT'); console.log('✅ CAMBIOS GUARDADOS'); } else { await db.query('ROLLBACK'); console.log('🧪 SIMULACIÓN: para aplicar --aplicar'); }
    } catch (e) { await db.query('ROLLBACK').catch(() => {}); console.error('❌', e.message); process.exitCode = 1; } finally { await db.end(); }
})();
