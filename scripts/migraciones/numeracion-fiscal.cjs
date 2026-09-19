// Migración aditiva: numeración fiscal configurable.
//   correlativos.configurado -> false = la persona todavía no dijo con qué número empieza esa numeración (el sistema se lo pregunta).
//   Quedan por configurar: NC (notas de crédito), ND (notas de débito) y CONTROL (número de control de la forma libre, compartido
//   por facturas, notas de crédito y notas de débito). Las numeraciones que ya existían (F, NE, V...) siguen como estaban.
// Se puede ejecutar varias veces sin problema.   node scripts/migraciones/numeracion-fiscal.cjs
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        const existia = (await db.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'correlativos' AND column_name = 'configurado'`)).rowCount > 0;
        await db.query(`ALTER TABLE correlativos ADD COLUMN IF NOT EXISTS configurado boolean NOT NULL DEFAULT true`);
        // Solo la primera vez: las numeraciones nuevas arrancan sin configurar (después no se vuelven a tocar)
        if (!existia) {
            await db.query(`UPDATE correlativos SET configurado = false WHERE prefijo IN ('NC', 'ND', 'CONTROL')`);
        }
        await db.query(`INSERT INTO correlativos (prefijo, "siguienteNumero", "cerosRelleno", configurado)
            VALUES ('NC', 1, 5, false), ('ND', 1, 5, false), ('CONTROL', 1, 6, false) ON CONFLICT (prefijo) DO NOTHING`);
        await db.query('COMMIT');
        console.log('Migración de numeración fiscal aplicada:', (await db.query(`SELECT prefijo, "siguienteNumero", configurado FROM correlativos ORDER BY id`)).rows);
    } catch (e) {
        await db.query('ROLLBACK');
        console.error('Falló la migración (se revirtió):', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
