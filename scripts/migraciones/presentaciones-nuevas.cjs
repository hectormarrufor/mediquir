// Migración aditiva: nuevas presentaciones base de producto (qué es UNA unidad).
//   cx100 / cx200 -> "Caja x100" / "Caja x200" como unidad de venta (stock, costo y precio por caja de 100 o 200).
//   metro / rollo -> mangueras y similares: se vende por metro (números enteros) o el rollo completo.
// Solo agrega valores al tipo enumerado (no modifica datos). Se puede ejecutar varias veces.   node scripts/migraciones/presentaciones-nuevas.cjs
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        const { rows } = await db.query(`SELECT t.typname FROM pg_type t JOIN pg_attribute a ON a.atttypid = t.oid JOIN pg_class c ON c.oid = a.attrelid
            WHERE c.relname = 'Productos' AND a.attname = 'presentacion'`);
        if (!rows.length) throw new Error('No se encontró el tipo de Productos.presentacion');
        const tipo = rows[0].typname;
        if (!/^[A-Za-z_]+$/.test(tipo)) throw new Error('Nombre de tipo inesperado: ' + tipo);
        for (const v of ['cx100', 'cx200', 'metro', 'rollo']) await db.query(`ALTER TYPE "${tipo}" ADD VALUE IF NOT EXISTS '${v}'`);
        const { rows: valores } = await db.query(`SELECT unnest(enum_range(NULL::"${tipo}"))::text AS v`);
        console.log('Migración lista. Valores de', tipo + ':', valores.map((r) => r.v).join(', '));
    } catch (e) {
        console.error('Falló:', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
