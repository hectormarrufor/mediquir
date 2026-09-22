// Tabla de presupuestos (cotizaciones) para clientes: NO es un documento fiscal, no toca correlativos,
// no afecta el inventario ni la contabilidad. Aditiva e idempotente.
//   node scripts/migraciones/presupuestos.cjs
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const db = require('../../models');

(async () => {
    const q = (s) => db.sequelize.query(s);
    try {
        await q(`CREATE TABLE IF NOT EXISTS "Presupuestos" (
            id SERIAL PRIMARY KEY,
            "clienteId" INTEGER REFERENCES "Clientes"(id) ON DELETE SET NULL,
            "clienteNombre" VARCHAR(255) NOT NULL,
            "clienteIdentificacion" VARCHAR(255),
            "clienteDireccion" TEXT,
            tarifa VARCHAR(10) NOT NULL DEFAULT 'precio6',
            "tasaCambio" DECIMAL(10,2) NOT NULL DEFAULT 1,
            subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
            "montoIva" DECIMAL(12,2) NOT NULL DEFAULT 0,
            "totalFinal" DECIMAL(12,2) NOT NULL DEFAULT 0,
            "validoDias" INTEGER NOT NULL DEFAULT 15,
            renglones JSONB NOT NULL DEFAULT '[]',
            notas TEXT,
            "creadoPorId" INTEGER,
            "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
        )`);
        await q(`CREATE INDEX IF NOT EXISTS "presupuestos_cliente_idx" ON "Presupuestos" ("clienteId")`);
        console.log('Tabla Presupuestos lista.');
    } finally { await db.sequelize.close(); }
})().catch((e) => { console.error('Falló:', e.message); process.exit(1); });
