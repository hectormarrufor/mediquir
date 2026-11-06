// Migración aditiva: vendedores a comisión (no son nómina) y sus comisiones por factura, y observación editable en las cuentas por cobrar.
//   VendedoresComision : quién es (nombre) y su % de comisión por defecto. No tiene usuario ni acceso al sistema.
//   ComisionesVenta    : una fila por línea de la hoja de cada vendedor: la factura (o el abono / nota de crédito) con el monto a comisionar sin IVA, el %, la comisión,
//                        el estatus del cliente y el de la comisión (PENDIENTE / PAGADA con su fecha). Todo editable por administración.
//   CuentasPorCobrar.observacion : "VENCIDA", "PAGADO PENDIENTE RET", "BCV"... (como lo lleva hoy la administradora en Excel).
// Se puede ejecutar varias veces sin problema.   node scripts/migraciones/cxc-vendedores-comisiones.cjs
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        await db.query(`CREATE TABLE IF NOT EXISTS "VendedoresComision" (
            id SERIAL PRIMARY KEY,
            nombre VARCHAR(120) NOT NULL UNIQUE,
            porcentaje NUMERIC(5,2) NOT NULL DEFAULT 5,
            activo BOOLEAN NOT NULL DEFAULT true,
            notas TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now())`);
        await db.query(`CREATE TABLE IF NOT EXISTS "ComisionesVenta" (
            id SERIAL PRIMARY KEY,
            "vendedorId" INTEGER NOT NULL REFERENCES "VendedoresComision"(id) ON DELETE CASCADE,
            "ventaId" UUID REFERENCES "Ventas"(id) ON DELETE SET NULL,
            concepto VARCHAR(10) NOT NULL DEFAULT 'FACTURA',
            fecha DATE,
            vencimiento DATE,
            "documentoTexto" VARCHAR(60),
            "clienteTexto" VARCHAR(200),
            "montoUsd" NUMERIC(12,2),
            "baseUsd" NUMERIC(12,2),
            porcentaje NUMERIC(5,2),
            "comisionUsd" NUMERIC(12,2),
            "estatusCliente" VARCHAR(120),
            "estatusComision" VARCHAR(10) NOT NULL DEFAULT 'PENDIENTE',
            "fechaPagoComision" DATE,
            observacion TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now())`);
        await db.query(`CREATE INDEX IF NOT EXISTS "ComisionesVenta_vendedor" ON "ComisionesVenta" ("vendedorId")`);
        await db.query(`CREATE INDEX IF NOT EXISTS "ComisionesVenta_venta" ON "ComisionesVenta" ("ventaId")`);
        await db.query(`ALTER TABLE "CuentasPorCobrar" ADD COLUMN IF NOT EXISTS observacion TEXT`);
        await db.query('COMMIT');
        console.log('Migración aplicada: VendedoresComision, ComisionesVenta y CuentasPorCobrar.observacion.');
    } catch (e) {
        await db.query('ROLLBACK');
        console.error('Falló la migración (se revirtió):', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
