// Migración aditiva: historial de cambios de precio hechos desde el Consultor de precios (permite revertir un cambio hecho por error).
//   CambiosPrecio -> productoId, campo (precio7 | precio6), precioAnterior, precioNuevo, usuarioId, motivo, revierteId, revertidoAt, revertidoPorId, createdAt
// Se puede ejecutar varias veces.   node scripts/migraciones/cambios-precio.cjs
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        await db.query(`CREATE TABLE IF NOT EXISTS "CambiosPrecio" (
            "id" SERIAL PRIMARY KEY,
            "productoId" integer NOT NULL,
            "campo" varchar(10) NOT NULL,
            "precioAnterior" numeric(10,3) NULL,
            "precioNuevo" numeric(10,3) NOT NULL,
            "usuarioId" integer NOT NULL,
            "motivo" varchar(200) NULL,
            "revierteId" integer NULL,
            "revertidoAt" timestamptz NULL,
            "revertidoPorId" integer NULL,
            "createdAt" timestamptz NOT NULL DEFAULT now()
        )`);
        await db.query(`CREATE INDEX IF NOT EXISTS "CambiosPrecio_producto_idx" ON "CambiosPrecio" ("productoId", "createdAt" DESC)`);
        await db.query('COMMIT');
        console.log('Migración lista: tabla CambiosPrecio');
    } catch (e) {
        await db.query('ROLLBACK');
        console.error('Falló, se revirtió todo:', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
