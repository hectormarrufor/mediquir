// Migración aditiva: tabla EmisionesDigitales para pruebas y seguimiento de Imprenta Digital (TFHKA).
// Aislada de Ventas, NotasFiscales y Correlativos: no altera la facturación por forma libre.
// Se puede ejecutar varias veces.   node scripts/migraciones/emisiones-digitales.cjs
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        await db.query(`CREATE TABLE IF NOT EXISTS "EmisionesDigitales" (
            "id" uuid PRIMARY KEY,
            "ambiente" varchar(10) NOT NULL DEFAULT 'demo',
            "proveedor" varchar(20) NOT NULL DEFAULT 'TFHKA',
            "ventaId" uuid NULL REFERENCES "Ventas"("id") ON DELETE SET NULL,
            "tipoDocumento" varchar(2) NOT NULL,
            "serie" varchar(20) NOT NULL DEFAULT '',
            "numeroDocumento" varchar(30) NULL,
            "transaccionId" varchar(50) NULL,
            "numeroControl" varchar(40) NULL,
            "estado" varchar(20) NOT NULL DEFAULT 'PENDIENTE',
            "fechaEmision" date NOT NULL,
            "moneda" varchar(5) NOT NULL DEFAULT 'BSD',
            "tasaCambio" numeric(14, 4) NULL,
            "clienteRif" varchar(30) NULL,
            "clienteNombre" varchar(255) NULL,
            "totalBs" numeric(14, 2) NOT NULL DEFAULT 0,
            "totalUsd" numeric(14, 2) NULL,
            "urlConsulta" text NULL,
            "fechaAsignacion" varchar(20) NULL,
            "horaAsignacion" varchar(20) NULL,
            "rangoAsignado" varchar(150) NULL,
            "codigoRespuesta" varchar(20) NULL,
            "mensajeRespuesta" text NULL,
            "validaciones" jsonb NULL,
            "payloadEnviado" jsonb NULL,
            "respuestaCruda" jsonb NULL,
            "anuladoMotivo" text NULL,
            "anuladoAt" timestamp with time zone NULL,
            "usuarioId" integer NULL,
            "createdAt" timestamp with time zone NOT NULL DEFAULT NOW(),
            "updatedAt" timestamp with time zone NOT NULL DEFAULT NOW()
        )`);
        await db.query(`CREATE INDEX IF NOT EXISTS "EmisionesDigitales_ambiente_createdAt" ON "EmisionesDigitales" ("ambiente", "createdAt" DESC)`);
        await db.query(`CREATE INDEX IF NOT EXISTS "EmisionesDigitales_doc" ON "EmisionesDigitales" ("tipoDocumento", "serie", "numeroDocumento")`);
        await db.query('COMMIT');
        console.log('Migración lista: tabla EmisionesDigitales creada/verificada');
    } catch (e) {
        await db.query('ROLLBACK');
        console.error('Falló, se revirtió todo:', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
