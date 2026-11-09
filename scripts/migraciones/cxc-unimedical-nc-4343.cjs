// Unimedical (hoja de Edgar): la nota de crédito NC-04343 (88,91 $, 12-feb-2025) afectaba la factura F-142160 (426,27 $), pero Unimedical la pagó completa (300 + 126,27 $ el 22-may-2025):
// quedó pagando de más 88,91 $. El Excel de la administradora (Saldo Restante 581,60) resta ese crédito de lo que Unimedical debe; el sistema lo perdió (la nota migrada quedó con saldo a favor 0 y
// sin abono) y mostraba 670,51 $. Decisión de Hector (2026-11-09, opción A): compensar el crédito en la factura pendiente más antigua, la F-142159, con un abono de 88,91 $.
// Repetible: no duplica (busca el abono con referencia NC-04343).   node scripts/migraciones/cxc-unimedical-nc-4343.cjs [--aplicar]
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

const APLICAR = process.argv.includes('--aplicar');
const MONTO = 88.91;
const FECHA = '2025-05-22'; // cuando Unimedical pagó de más la F-142160

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        const [venta] = (await db.query(`SELECT v.id, v."clienteId", cl.nombre FROM "Ventas" v JOIN "Clientes" cl ON cl.id = v."clienteId" WHERE v."numeroDocumento" = 'F-142159'`)).rows;
        if (!venta || !/UNIMEDICAL/i.test(venta.nombre)) throw new Error('La F-142159 no es de Unimedical');
        const [nota] = (await db.query(`SELECT n.id FROM "NotasFiscales" n WHERE n."numeroDocumento" = 'NC-04343' AND n."clienteId" = $1`, [venta.clienteId])).rows;
        if (!nota) throw new Error('No se encontró la NC-04343 de Unimedical');
        // El saldo a favor de la nota (lo que el cliente pagó de más): con el modelo de compensación (app/api/_lib/notasFiscales.js) pendiente = saldoAFavor − reintegrado − compensado
        const arreglada = await db.query(`UPDATE "NotasFiscales" SET "saldoAFavorUsd" = $1, "updatedAt" = now() WHERE id = $2 AND "saldoAFavorUsd" = 0`, [MONTO, nota.id]);
        if (arreglada.rowCount) console.log(`NC-04343: saldo a favor 0 → ${MONTO} $`);
        const ya = (await db.query(`SELECT id FROM "Abonos" WHERE "ventaId" = $1 AND referencia = 'NC-04343'`, [venta.id])).rows.length;
        if (ya) { console.log('El abono ya está aplicado: no se repite'); if (APLICAR) await db.query('COMMIT'); else await db.query('ROLLBACK'); return; }
        const [cxc] = (await db.query(`SELECT id, "saldoPendiente"::float AS saldo FROM "CuentasPorCobrar" WHERE "ventaId" = $1 FOR UPDATE`, [venta.id])).rows;
        if (!cxc || cxc.saldo < MONTO) throw new Error('La cuenta de la F-142159 no existe o debe menos que el crédito');
        const [bcv] = (await db.query(`SELECT monto::float AS tasa FROM "BcvPreciosHistoricos" WHERE fecha <= $1 ORDER BY fecha DESC, id DESC LIMIT 1`, [FECHA])).rows;
        const tasa = bcv?.tasa || 1;
        const bs = Math.round(MONTO * tasa * 100) / 100;
        await db.query(
            `INSERT INTO "Abonos" ("fechaPago", "metodoPago", referencia, "montoUsd", "tasaBcvAplicada", "montoVes", notas, "createdAt", "updatedAt", "ventaId", "montoBs", "tasaCambio")
             VALUES ($1, 'Nota de crédito (saldo a favor)', 'NC-04343', $2, $3, $4, $5, now(), now(), $6, $4, $3)`,
            [FECHA, MONTO, tasa, bs, 'Saldo a favor de Unimedical: la NC-04343 (88,91 $) afectaba la F-142160, que ya estaba pagada completa. Se compensa aquí, como lo lleva el Excel de Edgar (Saldo Restante 581,60).', venta.id],
        );
        const nuevo = Math.round((cxc.saldo - MONTO) * 100) / 100;
        await db.query(`UPDATE "CuentasPorCobrar" SET "saldoPendiente" = $1, "updatedAt" = now() WHERE id = $2`, [nuevo, cxc.id]);
        console.log(`F-142159: saldo ${cxc.saldo.toFixed(2)} → ${nuevo.toFixed(2)} (abono de ${MONTO} $ a tasa ${tasa}, ${bs} Bs)`);
        const [tot] = (await db.query(`SELECT COALESCE(SUM(c."saldoPendiente"), 0)::float AS s FROM "CuentasPorCobrar" c WHERE c."clienteId" = $1 AND c.estado <> 'Pagado'`, [venta.clienteId])).rows;
        console.log(`Unimedical debe ahora: ${tot.s.toFixed(2)} $ (Excel: 581,60)`);
        if (APLICAR) { await db.query('COMMIT'); console.log('\n✅ CAMBIOS GUARDADOS'); }
        else { await db.query('ROLLBACK'); console.log('\n🧪 SIMULACIÓN: no se guardó nada. Para aplicar: --aplicar'); }
    } catch (e) {
        await db.query('ROLLBACK').catch(() => {});
        console.error('❌', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
