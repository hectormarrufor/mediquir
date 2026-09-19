// Migración aditiva: el cliente contribuyente especial sube su comprobante de retención desde el portal B2B.
//   comprobanteUrl  -> archivo del comprobante (PDF o imagen) para que administración lo vea e imprima
//   montoDeclarado  -> IVA retenido (Bs) que el cliente dice que trae su comprobante (administración lo confirma)
// Estados de una retención de venta: PENDIENTE (falta el comprobante) · POR_REVISAR (el cliente lo subió) · REGISTRADA (confirmada, entra al libro).
// Se puede ejecutar varias veces sin problema.   node scripts/migraciones/retenciones-comprobante.cjs
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        await db.query(`ALTER TABLE "RetencionesIva"
            ADD COLUMN IF NOT EXISTS "comprobanteUrl" text NULL,
            ADD COLUMN IF NOT EXISTS "montoDeclarado" numeric(14,2) NULL`);
        await db.query('COMMIT');
        console.log('Migración de comprobante de retención aplicada.');
    } catch (e) {
        await db.query('ROLLBACK');
        console.error('Falló la migración (se revirtió):', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
