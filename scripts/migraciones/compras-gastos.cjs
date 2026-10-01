// Migración aditiva: gastos registrados como documento de compra (sin inventario; entran al libro de compras si son factura).
//   FacturasCompras.esGasto          -> true si el documento es un gasto (servicio, flete, alquiler...) y no mercancía.
//   FacturasCompras.descripcionGasto -> en qué se gastó.
//   FacturasCompras.categoriaGastoId -> categoría financiera (tipo GASTO) con la que se contabiliza.
//   También crea unas categorías de gasto de partida (solo si no existen).
// Se puede ejecutar varias veces.   node scripts/migraciones/compras-gastos.cjs
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        await db.query(`ALTER TABLE "FacturasCompras" ADD COLUMN IF NOT EXISTS "esGasto" boolean NOT NULL DEFAULT false`);
        await db.query(`ALTER TABLE "FacturasCompras" ADD COLUMN IF NOT EXISTS "descripcionGasto" varchar(200)`);
        await db.query(`ALTER TABLE "FacturasCompras" ADD COLUMN IF NOT EXISTS "categoriaGastoId" integer`);
        // Categorías de gasto de partida (solo si no existen): luego se pueden agregar más desde Finanzas
        for (const nombre of ['Fletes y transporte', 'Alquileres', 'Servicios (luz, agua, internet)', 'Mantenimiento y reparaciones', 'Papelería y oficina', 'Combustible', 'Honorarios profesionales', 'Otros gastos']) {
            await db.query(`INSERT INTO "CategoriasFinancieras" (nombre, tipo) SELECT $1::varchar, 'GASTO' WHERE NOT EXISTS (SELECT 1 FROM "CategoriasFinancieras" WHERE nombre = $1::varchar)`, [nombre]);
        }
        await db.query('COMMIT');
        console.log('Migración lista: FacturasCompras.esGasto, descripcionGasto, categoriaGastoId');
    } catch (e) {
        await db.query('ROLLBACK');
        console.error('Falló, se revirtió todo:', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
