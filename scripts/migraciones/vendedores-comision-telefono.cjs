// Migración aditiva: teléfono de cada vendedor a comisión (para compartir el recibo de su pago por WhatsApp directo a su chat) y carga de los de los 5 actuales.
//   VendedoresComision.telefono -> varchar(30) NULL, en formato nacional (04246371531)
// Se puede ejecutar varias veces (solo llena el teléfono si todavía está vacío).   node scripts/migraciones/vendedores-comision-telefono.cjs
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

// nombre en el sistema -> teléfono (los que pasó Hector el 18/11/2026)
const TELEFONOS = [
    { nombre: 'EDDY', persona: 'Eddy Landaeta', telefono: '04246371531' },
    { nombre: 'EDGAR JIMENEZ', persona: 'Edgar Jiménez', telefono: '04121245649' },
    { nombre: 'JUAN GUTIERREZ', persona: 'Juan Gutiérrez', telefono: '04246758854' },
    { nombre: 'MICHAEL', persona: 'Michael Laviera', telefono: '04246690925' },
    { nombre: 'ALEX VILORIA', persona: 'Alexander Viloria', telefono: '04247126887' },
];

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        await db.query(`ALTER TABLE "VendedoresComision" ADD COLUMN IF NOT EXISTS "telefono" varchar(30) NULL`);
        for (const t of TELEFONOS) {
            const r = await db.query(`UPDATE "VendedoresComision" SET "telefono" = $1 WHERE "nombre" = $2 AND ("telefono" IS NULL OR "telefono" = '')`, [t.telefono, t.nombre]);
            console.log(`${t.persona} (${t.nombre}): ${r.rowCount ? `teléfono ${t.telefono} guardado` : 'ya tenía teléfono o no se encontró ese nombre'}`);
        }
        await db.query('COMMIT');
        console.log('Migración lista: VendedoresComision.telefono');
    } catch (e) {
        await db.query('ROLLBACK');
        console.error('Falló, se revirtió todo:', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
