// Migración aditiva: presentaciones (unidad, caja, bulto) en pedidos y códigos de barras por presentación.
//   Productos.codigoBarras       -> (ya existe) código de barras de la UNIDAD
//   Productos.codigoBarrasCaja   -> código de barras de la CAJA
//   Productos.codigoBarrasBulto  -> código de barras del BULTO
//   VentaDetalles.presentacionPedida / cantidadPresentacion / unidadesPorPresentacion
//                                -> lo que pidió el cliente ("2 cajas") y cuántas unidades tenía cada caja EN ESE MOMENTO;
//                                   `cantidad` sigue en unidades (stock, precio e inventario no cambian). NULL = pedido sin presentación
//                                   (punto de venta, pedidos anteriores): el empaque arma bultos, cajas y sueltas con la regla.
//   VentaEmpaqueItems.*Empacados / nivelVerificado -> evidencia de cuántos bultos, cajas y sueltas empacó y con qué código lo comprobó
// Se puede ejecutar varias veces sin problema.   node scripts/migraciones/presentaciones.cjs
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        await db.query(`ALTER TABLE "Productos"
            ADD COLUMN IF NOT EXISTS "codigoBarrasCaja" varchar(64) NULL,
            ADD COLUMN IF NOT EXISTS "codigoBarrasBulto" varchar(64) NULL`);
        await db.query(`CREATE INDEX IF NOT EXISTS "Productos_codigoBarrasCaja" ON "Productos" ("codigoBarrasCaja") WHERE "codigoBarrasCaja" IS NOT NULL`);
        await db.query(`CREATE INDEX IF NOT EXISTS "Productos_codigoBarrasBulto" ON "Productos" ("codigoBarrasBulto") WHERE "codigoBarrasBulto" IS NOT NULL`);

        await db.query(`ALTER TABLE "VentaDetalles"
            ADD COLUMN IF NOT EXISTS "presentacionPedida" varchar(10) NULL,
            ADD COLUMN IF NOT EXISTS "cantidadPresentacion" integer NULL,
            ADD COLUMN IF NOT EXISTS "unidadesPorPresentacion" integer NULL`);

        await db.query(`ALTER TABLE "VentaEmpaqueItems"
            ADD COLUMN IF NOT EXISTS "bultosEmpacados" integer NULL,
            ADD COLUMN IF NOT EXISTS "cajasEmpacadas" integer NULL,
            ADD COLUMN IF NOT EXISTS "sueltasEmpacadas" integer NULL,
            ADD COLUMN IF NOT EXISTS "nivelVerificado" varchar(10) NULL`);
        await db.query('COMMIT');
        console.log('Migración de presentaciones aplicada.');
    } catch (e) {
        await db.query('ROLLBACK');
        console.error('Falló la migración (se revirtió):', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
