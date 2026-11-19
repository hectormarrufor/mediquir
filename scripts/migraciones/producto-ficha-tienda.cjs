// Ficha de producto para la tienda (página propia de cada producto, estilo farmacia en línea). Aditiva e idempotente: solo AGREGA columnas
// vacías a "Productos"; ningún dato existente cambia.
//   descripcion    TEXT   -> «Características de …»: párrafo que explica qué es y para qué sirve
//   puntosClave    JSONB  -> «Información importante»: lista de viñetas (["Texto", …])
//   fichaTecnica   JSONB  -> «Ficha técnica»: filas etiqueta/valor ([{ "etiqueta": "Material", "valor": "Nitrilo" }, …])
//   infoAdicional  JSONB  -> «Información adicional»: secciones plegables ([{ "titulo": "Modo de uso", "texto": "…" }, …])
//   fichaActualizadaAt TIMESTAMP -> cuándo se escribió o revisó la ficha por última vez
//   node scripts/migraciones/producto-ficha-tienda.cjs
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

const COLUMNAS = [
    ['descripcion', 'TEXT'],
    ['puntosClave', 'JSONB'],
    ['fichaTecnica', 'JSONB'],
    ['infoAdicional', 'JSONB'],
    ['fichaActualizadaAt', 'TIMESTAMP WITH TIME ZONE'],
];

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        for (const [col, tipo] of COLUMNAS) {
            await db.query(`ALTER TABLE "Productos" ADD COLUMN IF NOT EXISTS "${col}" ${tipo}`);
            console.log(`  Productos.${col} ${tipo}`);
        }
        await db.query('COMMIT');
        console.log('Listo.');
    } catch (e) {
        await db.query('ROLLBACK');
        console.error('Error, se revirtió todo:', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
