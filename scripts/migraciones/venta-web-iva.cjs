// Migración aditiva: compras de la tienda con IVA a la vista, delivery como dinero de paso y conversión de recibo (V-) a factura (F-).
//   Ventas.fechaEmision             -> fecha en que la venta pasó a ser FACTURA (NULL = usa createdAt). Manda en el libro de ventas y en el IVA del periodo
//   Ventas.numeroDocumentoAnterior  -> el V- que tenía antes de convertirse en factura (para ubicar sus archivos en el Blob)
//   Ventas.costoFleteReal           -> lo que cobró de verdad la empresa de delivery (se compara con lo cobrado al cliente, Ventas.costoFlete)
// Se puede ejecutar varias veces.   node scripts/migraciones/venta-web-iva.cjs
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        await db.query(`ALTER TABLE "Ventas"
            ADD COLUMN IF NOT EXISTS "fechaEmision" timestamp NULL,
            ADD COLUMN IF NOT EXISTS "numeroDocumentoAnterior" varchar(255) NULL,
            ADD COLUMN IF NOT EXISTS "costoFleteReal" numeric(10,2) NULL`);
        await db.query('COMMIT');
        console.log('Migración lista: Ventas.fechaEmision / numeroDocumentoAnterior / costoFleteReal');
    } catch (e) {
        await db.query('ROLLBACK');
        console.error('Falló, se revirtió todo:', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
