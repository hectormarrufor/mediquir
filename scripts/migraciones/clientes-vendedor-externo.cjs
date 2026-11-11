// Migración aditiva: vendedor externo (a comisión) de cada cliente.
//   Clientes.vendedorComisionId -> VendedoresComision.id. Las facturas y notas de entrega de ese cliente toman su línea de comisión solas.
// Llena el vendedor de los clientes que ya tienen comisiones (el de su línea más reciente) y solo donde está vacío.
// Se puede ejecutar varias veces.   node scripts/migraciones/clientes-vendedor-externo.cjs
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        await db.query(`ALTER TABLE "Clientes" ADD COLUMN IF NOT EXISTS "vendedorComisionId" INTEGER NULL REFERENCES "VendedoresComision"(id) ON DELETE SET NULL`);
        const r = await db.query(`
            UPDATE "Clientes" c SET "vendedorComisionId" = x."vendedorId", "updatedAt" = now()
              FROM (SELECT DISTINCT ON (v."clienteId") v."clienteId", cv."vendedorId"
                      FROM "ComisionesVenta" cv JOIN "Ventas" v ON v.id = cv."ventaId"
                     WHERE cv.concepto = 'FACTURA' AND v."clienteId" IS NOT NULL
                     ORDER BY v."clienteId", COALESCE(cv.fecha, v."fechaEmision"::date) DESC NULLS LAST, cv.id DESC) x
             WHERE c.id = x."clienteId" AND c."vendedorComisionId" IS NULL`);
        const resumen = await db.query(`SELECT vc.nombre, COUNT(*)::int AS clientes FROM "Clientes" c JOIN "VendedoresComision" vc ON vc.id = c."vendedorComisionId" GROUP BY 1 ORDER BY 1`);
        await db.query('COMMIT');
        console.log(`Migración lista: Clientes.vendedorComisionId (${r.rowCount} clientes asignados ahora)`);
        for (const f of resumen.rows) console.log(`  ${f.nombre}: ${f.clientes} clientes`);
    } catch (e) {
        await db.query('ROLLBACK');
        console.error('Falló, se revirtió todo:', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
