// 2026-11-11: la F-146892 (CLINICA LA FAMILIA) y la F-146893 (MAMEQUI) se pusieron a crédito pero el sistema las registró de contado y pagadas, con sus 2 ingresos en caja.
// Se corrigen como si siempre hubieran sido a crédito: condición Crédito y pago Pendiente, sin ingresos, con su cuenta por cobrar (en Bs, como las demás facturas)
// que vence a los días de crédito del cliente contados desde la fecha de la factura (15 y 7), y la línea de comisión de la F-146893 con ese vencimiento.
//   node scripts/migraciones/credito-f146892-f146893.cjs [--aplicar]
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');
const APLICAR = process.argv.includes('--aplicar');
(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        for (const numero of ['F-146892', 'F-146893']) {
            const [v] = (await db.query(`SELECT v.*, c."diasCredito" AS dias FROM "Ventas" v JOIN "Clientes" c ON c.id = v."clienteId" WHERE v."numeroDocumento" = $1 FOR UPDATE OF v`, [numero])).rows;
            if (!v) throw new Error(`No se encontró ${numero}`);
            if (v.condicionPago !== 'Contado') throw new Error(`${numero} ya no está de contado: no se toca`);
            if ((await db.query(`SELECT 1 FROM "Abonos" WHERE "ventaId" = $1`, [v.id])).rowCount) throw new Error(`${numero} tiene abonos: revisar a mano`);
            if ((await db.query(`SELECT 1 FROM "CuentasPorCobrar" WHERE "ventaId" = $1`, [v.id])).rowCount) throw new Error(`${numero} ya tiene cuenta por cobrar`);
            const dias = Number(v.dias) > 0 ? Number(v.dias) : 15;
            const del = await db.query(`DELETE FROM "MovimientosFinancieros" WHERE "ventaId" = $1 AND "abonoId" IS NULL AND tipo = 'INGRESO'`, [v.id]);
            if (del.rowCount !== 2) throw new Error(`${numero}: se esperaban 2 ingresos y hay ${del.rowCount}`);
            await db.query(`UPDATE "Ventas" SET "condicionPago" = 'Credito', "statusPago" = 'Pendiente', "fechaVencimiento" = "createdAt" + ($2 || ' days')::interval, "updatedAt" = now() WHERE id = $1`, [v.id, String(dias)]);
            await db.query(
                `INSERT INTO "CuentasPorCobrar" ("clienteId", "ventaId", "montoTotal", "saldoPendiente", moneda, "tasaCambio", "fechaVencimiento", estado, "createdAt", "updatedAt")
                 VALUES ($1, $2, $3, $3, $4, $5, (($6::timestamptz AT TIME ZONE 'America/Caracas')::date + $7::int), 'Pendiente', now(), now())`,
                [v.clienteId, v.id, v.totalFinal, v.moneda, v.tasaCambio, v.createdAt, dias],
            );
            await db.query(`UPDATE "ComisionesVenta" SET vencimiento = (($2::timestamptz AT TIME ZONE 'America/Caracas')::date + $3::int), "updatedAt" = now() WHERE "ventaId" = $1 AND concepto = 'FACTURA'`, [v.id, v.createdAt, dias]);
            console.log(`${numero}: crédito a ${dias} días · ${del.rowCount} ingresos eliminados · CxC por ${v.totalFinal} ${v.moneda}`);
        }
        if (APLICAR) { await db.query('COMMIT'); console.log('✅ CAMBIOS GUARDADOS'); } else { await db.query('ROLLBACK'); console.log('🧪 SIMULACIÓN: para aplicar --aplicar'); }
    } catch (e) { await db.query('ROLLBACK').catch(() => {}); console.error('❌', e.message); process.exitCode = 1; } finally { await db.end(); }
})();
