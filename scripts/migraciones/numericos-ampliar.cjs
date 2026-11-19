// Migración: agranda los campos numéricos de compras, cuentas por pagar, movimientos e inventario para que no haya
// «numeric field overflow» con montos en bolívares ni con cantidades grandes. Solo AGRANDA (ningún valor cambia). Repetible.
//   node scripts/migraciones/numericos-ampliar.cjs
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');
const M = 'numeric(20,6)', T = 'numeric(20,8)', C = 'numeric(20,3)', K = 'numeric(20,8)';
const CAMBIOS = [
    ['FacturasCompras', 'subtotal', M], ['FacturasCompras', 'montoIva', M], ['FacturasCompras', 'montoRetencion', M],
    ['FacturasCompras', 'totalFinal', M], ['FacturasCompras', 'montoExento', M], ['FacturasCompras', 'tasaCambio', T],
    ['CuentasPorPagar', 'montoTotal', M], ['CuentasPorPagar', 'saldoPendiente', M], ['CuentasPorPagar', 'tasaCambio', T],
    ['RetencionesIva', 'tasaCambio', T],
    ['MovimientosFinancieros', 'montoUsd', M], ['MovimientosFinancieros', 'montoVes', M], ['MovimientosFinancieros', 'tasaBcvAplicada', T],
    ['EntradasInventario', 'cantidad', C], ['EntradasInventario', 'costoUnitario', K],
    ['Productos', 'costoUsd', K], ['Productos', 'stockAlmacen', C], ['Productos', 'stockMinimo', C],
];
const gb = (s) => s.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`);
(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        for (const [t, c, tipo] of CAMBIOS) {
            const { rows } = await db.query(`SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1 AND column_name=ANY($2)`, [t, [c, gb(c)]]);
            if (!rows.length) throw new Error(`no existe ${t}.${c}`);
            await db.query(`ALTER TABLE "${t}" ALTER COLUMN "${rows[0].column_name}" TYPE ${tipo}`);
            console.log(`  ${t}.${rows[0].column_name} -> ${tipo}`);
        }
        await db.query('COMMIT'); console.log('Listo.');
    } catch (e) { await db.query('ROLLBACK'); console.error('Falló, se revirtió todo:', e.message); process.exitCode = 1; }
    finally { await db.end(); }
})();
