// Migración aditiva para los libros de compras y ventas: número de control, fecha de recepción, exento y comprobantes de retención de IVA.
// Se puede ejecutar varias veces sin problema (IF NOT EXISTS).   node scripts/migraciones/libros-fiscales.cjs
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        await db.query(`ALTER TABLE "Ventas"
            ADD COLUMN IF NOT EXISTS "numeroControl" varchar(30) NULL,
            ADD COLUMN IF NOT EXISTS "tipoTransaccion" varchar(2) NOT NULL DEFAULT '01'`);
        await db.query(`ALTER TABLE "FacturasCompras"
            ADD COLUMN IF NOT EXISTS "numeroControl" varchar(30) NULL,
            ADD COLUMN IF NOT EXISTS "fechaRecepcion" date NULL,
            ADD COLUMN IF NOT EXISTS "montoExento" numeric(12,2) NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS "alicuotaIva" numeric(5,2) NOT NULL DEFAULT 16,
            ADD COLUMN IF NOT EXISTS "tipoTransaccion" varchar(2) NOT NULL DEFAULT '01'`);
        // Un comprobante de retención por factura afectada. Montos en BOLÍVARES (los libros se llevan en Bs).
        //   COMPRA: la empresa le retiene al proveedor · VENTA: el cliente le retiene a la empresa
        await db.query(`CREATE TABLE IF NOT EXISTS "RetencionesIva" (
            id serial PRIMARY KEY,
            tipo varchar(6) NOT NULL CHECK (tipo IN ('COMPRA', 'VENTA')),
            fecha date NOT NULL,
            periodo char(7) NOT NULL,
            comprobante varchar(30) NOT NULL,
            "facturaAfectada" varchar(50) NOT NULL,
            "numeroControlFactura" varchar(30) NULL,
            "contraparteRif" varchar(30) NULL,
            "contraparteNombre" varchar(200) NULL,
            "baseImponible" numeric(14,2) NOT NULL DEFAULT 0,
            alicuota numeric(5,2) NOT NULL DEFAULT 16,
            "montoIva" numeric(14,2) NOT NULL DEFAULT 0,
            "porcentajeRetencion" numeric(5,2) NOT NULL DEFAULT 75,
            "ivaRetenido" numeric(14,2) NOT NULL,
            "tasaCambio" numeric(10,2) NOT NULL DEFAULT 1,
            "ventaId" uuid NULL REFERENCES "Ventas"(id) ON DELETE CASCADE,
            "facturaCompraId" uuid NULL REFERENCES "FacturasCompras"(id) ON DELETE CASCADE,
            "abonoId" integer NULL,
            "registradoPorId" integer NULL,
            "createdAt" timestamptz NOT NULL DEFAULT now(),
            "updatedAt" timestamptz NOT NULL DEFAULT now()
        )`);
        await db.query(`CREATE INDEX IF NOT EXISTS "RetencionesIva_tipo_fecha" ON "RetencionesIva" (tipo, fecha)`);
        await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "RetencionesIva_venta_unica" ON "RetencionesIva" ("ventaId") WHERE "ventaId" IS NOT NULL`);
        await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "RetencionesIva_compra_unica" ON "RetencionesIva" ("facturaCompraId") WHERE "facturaCompraId" IS NOT NULL`);
        await db.query('COMMIT');
        console.log('Migración aplicada. RetencionesIva:', (await db.query('SELECT count(*)::int n FROM "RetencionesIva"')).rows[0].n, 'filas');
    } catch (e) {
        await db.query('ROLLBACK');
        throw e;
    } finally {
        await db.end();
    }
})().catch((e) => { console.error(e.message); process.exit(1); });
