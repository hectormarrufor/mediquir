// 2026-11-12: (1) Ventas.impresaAt marca cuándo una factura se mandó a imprimir en la forma libre; mientras esté vacía, el usuario 1 y «jolexi»
// pueden corregirla o eliminarla desde su detalle. Todas las facturas que ya existen se marcan como impresas (impresaAt = su fecha), salvo la F-146902.
// (2) La F-146902 es a crédito pero se registró de contado y pagada, con sus ingresos en caja: se corrige como si siempre hubiera sido a crédito
// (condición Crédito, pago Pendiente, sin ingresos, con su cuenta por cobrar que vence a los días de crédito del cliente desde la fecha de la factura,
// y la línea de comisión con ese vencimiento). Días: los del cliente, o 15; para otros usar --dias=N.
//   node scripts/migraciones/factura-impresa-f146902.cjs [--dias=N] [--aplicar]
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');
const APLICAR = process.argv.includes('--aplicar');
const DIAS = (process.argv.find((a) => a.startsWith('--dias=')) || '').split('=')[1];
const NUMERO = 'F-146902';
(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        await db.query(`ALTER TABLE "Ventas" ADD COLUMN IF NOT EXISTS "impresaAt" timestamptz`);
        const marcadas = await db.query(`UPDATE "Ventas" SET "impresaAt" = COALESCE("fechaEmision", "createdAt") WHERE "tipoDocumento" = 'FACTURA' AND "impresaAt" IS NULL AND "numeroDocumento" <> $1`, [NUMERO]);
        console.log(`${marcadas.rowCount} facturas marcadas como impresas`);

        const [v] = (await db.query(`SELECT v.*, c."diasCredito" AS dias FROM "Ventas" v LEFT JOIN "Clientes" c ON c.id = v."clienteId" WHERE v."numeroDocumento" = $1 FOR UPDATE OF v`, [NUMERO])).rows;
        if (!v) throw new Error(`No se encontró ${NUMERO}`);
        if (!v.clienteId) throw new Error(`${NUMERO} no tiene cliente`);
        if (v.condicionPago !== 'Contado') throw new Error(`${NUMERO} ya no está de contado: no se toca`);
        if ((await db.query(`SELECT 1 FROM "Abonos" WHERE "ventaId" = $1`, [v.id])).rowCount) throw new Error(`${NUMERO} tiene abonos: revisar a mano`);
        if ((await db.query(`SELECT 1 FROM "CuentasPorCobrar" WHERE "ventaId" = $1`, [v.id])).rowCount) throw new Error(`${NUMERO} ya tiene cuenta por cobrar`);
        const dias = DIAS !== undefined ? Number(DIAS) : (Number(v.dias) > 0 ? Number(v.dias) : 15);
        if (!Number.isInteger(dias) || dias < 0) throw new Error('Días inválidos');
        const del = await db.query(`DELETE FROM "MovimientosFinancieros" WHERE "ventaId" = $1 AND "abonoId" IS NULL AND tipo = 'INGRESO'`, [v.id]);
        await db.query(`UPDATE "Ventas" SET "condicionPago" = 'Credito', "statusPago" = 'Pendiente', "fechaVencimiento" = COALESCE("fechaEmision", "createdAt") + ($2 || ' days')::interval, "updatedAt" = now() WHERE id = $1`, [v.id, String(dias)]);
        await db.query(
            `INSERT INTO "CuentasPorCobrar" ("clienteId", "ventaId", "montoTotal", "saldoPendiente", moneda, "tasaCambio", "fechaVencimiento", estado, "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $3, $4, $5, (($6::timestamptz AT TIME ZONE 'America/Caracas')::date + $7::int), 'Pendiente', now(), now())`,
            [v.clienteId, v.id, v.totalFinal, v.moneda, v.tasaCambio, v.fechaEmision || v.createdAt, dias],
        );
        const com = await db.query(`UPDATE "ComisionesVenta" SET vencimiento = (($2::timestamptz AT TIME ZONE 'America/Caracas')::date + $3::int), "updatedAt" = now() WHERE "ventaId" = $1 AND concepto = 'FACTURA'`, [v.id, v.fechaEmision || v.createdAt, dias]);
        console.log(`${NUMERO}: crédito a ${dias} días · ${del.rowCount} ingresos eliminados · CxC por ${v.totalFinal} ${v.moneda} · ${com.rowCount} línea(s) de comisión`);
        if (APLICAR) { await db.query('COMMIT'); console.log('✅ CAMBIOS GUARDADOS'); } else { await db.query('ROLLBACK'); console.log('🧪 SIMULACIÓN: para aplicar --aplicar'); }
    } catch (e) { await db.query('ROLLBACK').catch(() => {}); console.error('❌', e.message); process.exitCode = 1; } finally { await db.end(); }
})();
