// Equivalencias aprendidas al cargar facturas de proveedores: "este código (o esta descripción) de este proveedor = este producto,
// comprado por unidad, caja o bulto". Se llenan solas al registrar una compra con renglones leídos de la factura y la próxima
// factura de ese proveedor propone el mismo producto. Aditiva e idempotente.
//   node scripts/migraciones/productos-proveedor.cjs
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const db = require('../../models');

(async () => {
    const q = (s) => db.sequelize.query(s);
    try {
        await q(`CREATE TABLE IF NOT EXISTS "ProductosProveedor" (
            id SERIAL PRIMARY KEY,
            "proveedorId" INTEGER NOT NULL REFERENCES "Proveedores"(id) ON DELETE CASCADE,
            clave VARCHAR(220) NOT NULL,
            descripcion TEXT,
            "productoId" INTEGER NOT NULL REFERENCES "Productos"(id) ON DELETE CASCADE,
            "unidadCompra" VARCHAR(10) NOT NULL DEFAULT 'unidad',
            usos INTEGER NOT NULL DEFAULT 1,
            "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
        )`);
        await q(`CREATE UNIQUE INDEX IF NOT EXISTS "productos_proveedor_clave_uq" ON "ProductosProveedor" ("proveedorId", clave)`);
        console.log('Tabla ProductosProveedor lista.');
    } finally { await db.sequelize.close(); }
})().catch((e) => { console.error('Falló:', e.message); process.exit(1); });
