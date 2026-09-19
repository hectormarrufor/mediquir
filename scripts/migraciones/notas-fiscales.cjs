// Migración aditiva: notas de crédito y de débito.
//   NotasFiscales        -> una nota por fila. origen VENTA = la emite la empresa a un cliente (afecta una factura de venta);
//                           origen COMPRA = la recibe la empresa de un proveedor (afecta una factura de compra).
//   NotaFiscalDetalles   -> renglones de las notas de venta.
//   CuentasPorCobrar.notaId -> cuenta por cobrar creada por una nota de débito sobre una factura que no era a crédito.
// Se puede ejecutar varias veces sin problema.   node scripts/migraciones/notas-fiscales.cjs
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        await db.query(`CREATE TABLE IF NOT EXISTS "NotasFiscales" (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tipo varchar(8) NOT NULL CHECK (tipo IN ('CREDITO', 'DEBITO')),
            origen varchar(6) NOT NULL CHECK (origen IN ('VENTA', 'COMPRA')),
            "numeroDocumento" varchar(50) NOT NULL,
            "numeroControl" varchar(30) NULL,
            fecha date NOT NULL,
            estado varchar(10) NOT NULL DEFAULT 'EMITIDA' CHECK (estado IN ('EMITIDA', 'ANULADA')),
            "ventaId" uuid NULL REFERENCES "Ventas"(id),
            "facturaCompraId" uuid NULL REFERENCES "FacturasCompras"(id),
            "clienteId" integer NULL,
            "proveedorId" integer NULL,
            moneda varchar(3) NOT NULL DEFAULT 'USD',
            "tasaCambio" numeric(10,2) NOT NULL DEFAULT 1,
            subtotal numeric(12,2) NOT NULL DEFAULT 0,
            "baseImponible" numeric(12,2) NOT NULL DEFAULT 0,
            "montoExento" numeric(12,2) NOT NULL DEFAULT 0,
            "montoIva" numeric(12,2) NOT NULL DEFAULT 0,
            "alicuotaIva" numeric(5,2) NOT NULL DEFAULT 16,
            "totalFinal" numeric(12,2) NOT NULL DEFAULT 0,
            motivo text NOT NULL,
            "devuelveInventario" boolean NOT NULL DEFAULT false,
            "saldoAFavorUsd" numeric(12,2) NOT NULL DEFAULT 0,
            "reintegradoUsd" numeric(12,2) NOT NULL DEFAULT 0,
            "abonoId" integer NULL,
            "anuladaAt" timestamptz NULL,
            "registradoPorId" integer NULL,
            "createdAt" timestamptz NOT NULL DEFAULT now(),
            "updatedAt" timestamptz NOT NULL DEFAULT now()
        )`);
        await db.query(`CREATE INDEX IF NOT EXISTS "NotasFiscales_venta" ON "NotasFiscales" ("ventaId")`);
        await db.query(`CREATE INDEX IF NOT EXISTS "NotasFiscales_compra" ON "NotasFiscales" ("facturaCompraId")`);
        await db.query(`CREATE INDEX IF NOT EXISTS "NotasFiscales_fecha" ON "NotasFiscales" (origen, fecha)`);
        // Las notas de venta llevan NUESTRO correlativo (NC-00001 / ND-00001): no puede repetirse
        await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "NotasFiscales_numero_venta" ON "NotasFiscales" ("numeroDocumento") WHERE origen = 'VENTA'`);

        await db.query(`CREATE TABLE IF NOT EXISTS "NotaFiscalDetalles" (
            id serial PRIMARY KEY,
            "notaId" uuid NOT NULL REFERENCES "NotasFiscales"(id) ON DELETE CASCADE,
            "ventaDetalleId" uuid NULL,
            "productoId" integer NULL,
            descripcion varchar(200) NOT NULL,
            cantidad integer NOT NULL DEFAULT 1,
            "precioUnitario" numeric(10,3) NOT NULL DEFAULT 0,
            "aplicaIva" boolean NOT NULL DEFAULT true,
            "porcentajeIva" numeric(5,2) NOT NULL DEFAULT 16,
            subtotal numeric(14,2) NOT NULL DEFAULT 0
        )`);
        await db.query(`CREATE INDEX IF NOT EXISTS "NotaFiscalDetalles_nota" ON "NotaFiscalDetalles" ("notaId")`);

        await db.query(`ALTER TABLE "CuentasPorCobrar" ADD COLUMN IF NOT EXISTS "notaId" uuid NULL`);
        await db.query('COMMIT');
        console.log('Migración de notas de crédito y débito aplicada.');
    } catch (e) {
        await db.query('ROLLBACK');
        console.error('Falló la migración (se revirtió):', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
