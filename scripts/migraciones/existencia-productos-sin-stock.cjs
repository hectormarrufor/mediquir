// Pone existencia a los productos que están en 0 (o negativo), proporcional a su precio de venta web (precio 7; si falta, costo x 1,5):
//   menos de $3 -> 50  ·  de $3 a menos de $5 -> 30  ·  de $5 a $20 -> 20  ·  más de $20 hasta $50 -> 10  ·  más de $50 -> 5
// (la regla pedida no cubría $5 a $20: se usó 20.) Guarda un respaldo con la existencia anterior de cada uno.
//   node scripts/migraciones/existencia-productos-sin-stock.cjs             -> SIMULA: cuenta cuántos caen en cada nivel
//   node scripts/migraciones/existencia-productos-sin-stock.cjs --aplicar   -> aplica y guarda el respaldo
//   node scripts/migraciones/existencia-productos-sin-stock.cjs --revertir  -> devuelve cada producto a su existencia anterior
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const RESPALDO = path.join(__dirname, 'datos', 'existencia-productos-sin-stock-respaldo-2026-11-19.json');
const APLICAR = process.argv.includes('--aplicar');
const REVERTIR = process.argv.includes('--revertir');

const PRECIO = `COALESCE(NULLIF("precio7", 0), "costoUsd" * 1.5)`;
const NIVEL = `(CASE WHEN ${PRECIO} < 3 THEN 50 WHEN ${PRECIO} < 5 THEN 30 WHEN ${PRECIO} <= 20 THEN 20 WHEN ${PRECIO} <= 50 THEN 10 ELSE 5 END)`;

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        if (REVERTIR) {
            const previos = JSON.parse(fs.readFileSync(RESPALDO, 'utf8'));
            for (const p of previos) await db.query('UPDATE "Productos" SET "stockAlmacen" = $1, "updatedAt" = now() WHERE id = $2', [p.stockAnterior, p.id]);
            await db.query('COMMIT');
            console.log(`Revertidos ${previos.length} productos a su existencia anterior.`);
            return;
        }
        const { rows } = await db.query(`SELECT id, "stockAlmacen"::float AS "stockAnterior", ${NIVEL} AS nuevo FROM "Productos" WHERE "stockAlmacen" <= 0 AND ${PRECIO} > 0`);
        const porNivel = {};
        rows.forEach((r) => { porNivel[r.nuevo] = (porNivel[r.nuevo] || 0) + 1; });
        console.log(`Productos sin existencia: ${rows.length}`, porNivel);
        const { rows: sinPrecio } = await db.query(`SELECT count(*)::int n FROM "Productos" WHERE "stockAlmacen" <= 0 AND NOT (${PRECIO} > 0)`);
        console.log(`Sin precio (no se tocan): ${sinPrecio[0].n}`);
        if (!APLICAR) { await db.query('ROLLBACK'); console.log('Simulación: no se cambió nada. Use --aplicar.'); return; }
        fs.writeFileSync(RESPALDO, JSON.stringify(rows.map(({ id, stockAnterior }) => ({ id, stockAnterior })), null, 1));
        await db.query(`UPDATE "Productos" SET "stockAlmacen" = ${NIVEL}, "updatedAt" = now() WHERE "stockAlmacen" <= 0 AND ${PRECIO} > 0`);
        await db.query('COMMIT');
        console.log('Existencias aplicadas. Respaldo en', RESPALDO);
    } catch (e) {
        await db.query('ROLLBACK');
        console.error('Error, se revirtió todo:', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
