// Migración: VentaDetalles.productoId admite NULL (renglón personalizado / producto genérico: lleva su nombre en nombreFicticio).
// El modelo y el código ya lo tratan así (app/api/ventas/route.js guarda productoId = null en los genéricos, y la llave foránea es ON DELETE SET NULL),
// pero la columna había quedado NOT NULL en la base. Se puede ejecutar varias veces.   node scripts/migraciones/venta-detalle-producto-opcional.cjs
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('ALTER TABLE "VentaDetalles" ALTER COLUMN "productoId" DROP NOT NULL');
        console.log('VentaDetalles.productoId ahora admite NULL.');
    } catch (e) {
        console.error('Falló la migración:', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
