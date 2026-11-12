// Migración aditiva: recibos de pago a empleados (beneficio de alimentación, beneficio de transporte y quincena),
// con la confirmación del empleado desde su usuario (sin firma dibujada). Crea la tabla "PagosEmpleados".
// Se puede ejecutar varias veces.   node scripts/migraciones/pagos-empleados.cjs
// IMPORTANTE: correrla ANTES de desplegar el código que usa esta tabla.
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        await db.query(`
            CREATE TABLE IF NOT EXISTS "PagosEmpleados" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "tipo" varchar(15) NOT NULL,
                "empleadoId" integer NOT NULL REFERENCES "Empleados"("id"),
                "empleadoNombre" varchar(160) NOT NULL,
                "cedula" varchar(20) NOT NULL,
                "cargo" varchar(120) NULL,
                "fechaIngreso" date NULL,
                "fecha" date NOT NULL,
                "periodoDesde" date NULL,
                "periodoHasta" date NULL,
                "dias" integer NULL,
                "conceptos" jsonb NOT NULL DEFAULT '[]',
                "totalAsignaciones" numeric(14,2) NOT NULL DEFAULT 0,
                "totalDeducciones" numeric(14,2) NOT NULL DEFAULT 0,
                "totalCobrar" numeric(14,2) NOT NULL DEFAULT 0,
                "formaPago" varchar(15) NULL,
                "referencia" varchar(100) NULL,
                "conceptoTexto" varchar(250) NULL,
                "estado" varchar(12) NOT NULL DEFAULT 'PENDIENTE',
                "confirmadoAt" timestamptz NULL,
                "confirmadoPorId" integer NULL,
                "confirmadoIp" varchar(60) NULL,
                "anuladoAt" timestamptz NULL,
                "anuladoMotivo" varchar(250) NULL,
                "creadoPorId" integer NULL,
                "creadoPorNombre" varchar(120) NULL,
                "createdAt" timestamptz NOT NULL DEFAULT now(),
                "updatedAt" timestamptz NOT NULL DEFAULT now()
            )`);
        await db.query('CREATE INDEX IF NOT EXISTS "PagosEmpleados_empleado_idx" ON "PagosEmpleados" ("empleadoId", "fecha")');
        await db.query('CREATE INDEX IF NOT EXISTS "PagosEmpleados_tipo_fecha_idx" ON "PagosEmpleados" ("tipo", "fecha")');
        await db.query('COMMIT');
        console.log('Migración lista: tabla PagosEmpleados');
    } catch (e) {
        await db.query('ROLLBACK');
        console.error('Falló, se revirtió todo:', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
