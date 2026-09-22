// Migración aditiva: agrega paqx7 y paqx8 al tipo enumerado de Productos.presentacion.
// paqx7 ya estaba listado en el código (PAQUETES / el modelo) pero nunca se agregó de verdad al tipo de la base:
// elegirlo fallaba al guardar. Solo agrega valores al tipo enumerado (no modifica datos). Se puede ejecutar varias veces.
//   node scripts/migraciones/presentaciones-paqx7-paqx8.cjs
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
        for (const v of ['paqx7', 'paqx8']) await db.query(`ALTER TYPE "${tipo}" ADD VALUE IF NOT EXISTS '${v}'`);
        const { rows: valores } = await db.query(`SELECT unnest(enum_range(NULL::"${tipo}"))::text AS v`);
        console.log('Migración lista. Valores de', tipo + ':', valores.map((r) => r.v).join(', '));
    } catch (e) {
        console.error('Falló:', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
