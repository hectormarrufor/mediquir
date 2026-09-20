// Migración aditiva: dirección de entrega de las compras de la tienda con delivery.
//   Ventas.direccionEntrega -> lo que marcó el cliente en el mapa: dirección que entendió Google + "(GPS: lat, lng)".
// Antes la ubicación solo se guardaba en la ficha del cliente al crearlo, así que un cliente que ya existía no dejaba su destino en el pedido.
// Se puede ejecutar varias veces.   node scripts/migraciones/venta-direccion-entrega.cjs
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        await db.query(`ALTER TABLE "Ventas" ADD COLUMN IF NOT EXISTS "direccionEntrega" text NULL`);
        await db.query('COMMIT');
        console.log('Migración lista: Ventas.direccionEntrega');
    } catch (e) {
        await db.query('ROLLBACK');
        console.error('Falló, se revirtió todo:', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
