// Migración aditiva: compras de la tienda con pago por verificar + registro de intentos de pago.
//   Ventas.verificacionPago    -> NULL (pago conciliado normal) | 'POR_VERIFICAR' | 'CONFIRMADO' | 'CONFIRMADO_AUTO' | 'RECHAZADO' | 'VENCIDO'
//   Ventas.referenciaDeclarada -> la referencia que escribió el cliente (para conciliar el SMS que llegue tarde)
//   Ventas.verificacionNota    -> observaciones (p. ej. "llegó un pago con esa referencia pero por otro monto")
//   Ventas.verificacionAt      -> cuándo se registró para verificación / cuándo se resolvió
//   IntentosPago               -> cada intento de pago móvil en el checkout (IP, cédula, referencia, resultado): límite de intentos y auditoría
// Se puede ejecutar varias veces.   node scripts/migraciones/pago-por-verificar.cjs
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        await db.query(`ALTER TABLE "Ventas"
            ADD COLUMN IF NOT EXISTS "verificacionPago" varchar(15) NULL,
            ADD COLUMN IF NOT EXISTS "referenciaDeclarada" varchar(20) NULL,
            ADD COLUMN IF NOT EXISTS "verificacionNota" text NULL,
            ADD COLUMN IF NOT EXISTS "verificacionAt" timestamp NULL`);
        await db.query(`CREATE INDEX IF NOT EXISTS "Ventas_verificacionPago" ON "Ventas" ("verificacionPago") WHERE "verificacionPago" = 'POR_VERIFICAR'`);
        await db.query(`CREATE TABLE IF NOT EXISTS "IntentosPago" (
            "id" serial PRIMARY KEY,
            "ip" varchar(64) NULL,
            "identificacion" varchar(40) NULL,
            "idIntento" varchar(64) NULL,
            "referencia" varchar(20) NULL,
            "montoBs" numeric(12,2) NULL,
            "resultado" varchar(24) NOT NULL,
            "detalle" text NULL,
            "ventaId" uuid NULL,
            "createdAt" timestamp NOT NULL DEFAULT now(),
            "updatedAt" timestamp NOT NULL DEFAULT now()
        )`);
        await db.query(`CREATE INDEX IF NOT EXISTS "IntentosPago_ip" ON "IntentosPago" ("ip", "createdAt")`);
        await db.query(`CREATE INDEX IF NOT EXISTS "IntentosPago_identificacion" ON "IntentosPago" ("identificacion", "createdAt")`);
        await db.query('COMMIT');
        console.log('Migración lista: Ventas.verificacionPago / referenciaDeclarada / verificacionNota / verificacionAt e IntentosPago');
    } catch (e) {
        await db.query('ROLLBACK');
        console.error('Falló, se revirtió todo:', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
