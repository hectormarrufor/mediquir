// Migración de datos: las cuentas por pagar abiertas (ids 2 y 3) se marcan como pagadas "desde que nacieron":
//   CuentasPorPagar: saldoPendiente = 0, estado = 'Pagado'; FacturasCompras (la de cada cuenta): statusPago = 'Pagado'.
// Guarda un respaldo JSON antes de cambiar. Se puede ejecutar varias veces.   node scripts/migraciones/cxp-marcar-pagadas.cjs
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        const { rows } = await db.query(`SELECT * FROM "CuentasPorPagar" WHERE "estado" <> 'Pagado' OR "saldoPendiente" > 0`);
        if (!rows.length) { console.log('No hay cuentas por pagar abiertas.'); await db.query('ROLLBACK'); return; }
        const ids = rows.map((r) => r.id);
        const facturas = rows.map((r) => r.facturaCompraId).filter(Boolean);
        const { rows: fcs } = await db.query(`SELECT * FROM "FacturasCompras" WHERE "id" = ANY($1)`, [facturas]);
        fs.writeFileSync(
            path.join(__dirname, 'datos', 'cxp-marcar-pagadas-respaldo-2026-11-19.json'),
            JSON.stringify({ cuentasPorPagar: rows, facturasCompras: fcs }, null, 2)
        );
        await db.query(`UPDATE "CuentasPorPagar" SET "saldoPendiente" = 0, "estado" = 'Pagado', "updatedAt" = now() WHERE "id" = ANY($1)`, [ids]);
        await db.query(`UPDATE "FacturasCompras" SET "statusPago" = 'Pagado' WHERE "id" = ANY($1)`, [facturas]);
        await db.query('COMMIT');
        console.log(`Marcadas como pagadas: cuentas ${ids.join(', ')} (${facturas.length} facturas de compra).`);
    } catch (e) {
        await db.query('ROLLBACK');
        console.error('Error, se revirtió todo:', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
