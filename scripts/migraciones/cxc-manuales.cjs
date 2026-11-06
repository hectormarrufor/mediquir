// Cuentas por cobrar MANUALES: deudas y préstamos que no vienen de una venta (DEUDA, PRESTAMO...). Viven aparte de las ventas para no tocar los libros fiscales ni los
// reportes de ventas, y tienen sus propios abonos (guardados como una lista dentro de la misma fila).
//   node scripts/migraciones/cxc-manuales.cjs            -> crea la tabla y carga las partidas manuales del Excel (DEUDA / PRESTAMO) si no están
// Se puede ejecutar varias veces sin problema.
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

const normNombre = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\bC\.?\s?A\.?\b|\bS\.?\s?A\.?\b/g, ' ').replace(/[^A-Z0-9]+/g, ' ').trim();

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        await db.query(`CREATE TABLE IF NOT EXISTS "CuentasManuales" (
            id SERIAL PRIMARY KEY,
            "clienteId" INTEGER REFERENCES "Clientes"(id) ON DELETE SET NULL,
            "clienteTexto" VARCHAR(200) NOT NULL,
            concepto VARCHAR(120) NOT NULL DEFAULT 'DEUDA',
            "montoUsd" NUMERIC(12,2) NOT NULL,
            fecha DATE,
            vence DATE,
            observacion TEXT,
            abonos JSONB NOT NULL DEFAULT '[]',
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now())`);
        let cargadas = 0;
        const archivo = path.join(__dirname, 'datos', 'privado', 'cxc-excel.json');
        if (fs.existsSync(archivo)) {
            const clientes = (await db.query(`SELECT id, nombre FROM "Clientes"`)).rows;
            const filas = JSON.parse(fs.readFileSync(archivo, 'utf8')).filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(String(r.v[0])) && /^(DEUDA|PRESTAMO)/i.test(String(r.v[1])) && typeof r.v[3] === 'number');
            for (const r of filas) {
                const cliente = String(r.v[2]).trim(); const concepto = /PRESTAMO/i.test(r.v[1]) ? 'PRÉSTAMO' : 'DEUDA';
                if ((await db.query(`SELECT 1 FROM "CuentasManuales" WHERE "clienteTexto" = $1 AND concepto = $2 AND "montoUsd" = $3`, [cliente, concepto, r.v[3]])).rowCount) continue;
                const c = clientes.find((x) => normNombre(x.nombre) === normNombre(cliente));
                await db.query(`INSERT INTO "CuentasManuales" ("clienteId", "clienteTexto", concepto, "montoUsd", fecha, vence, observacion, "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5::date,$5::date,$6,($5::date)::timestamptz,now())`,
                    [c?.id || null, cliente.slice(0, 200), concepto, r.v[3], r.v[0], 'Pasada del Excel de cuentas por cobrar']);
                cargadas++;
            }
        }
        await db.query('COMMIT');
        console.log(`Tabla CuentasManuales lista. Partidas manuales cargadas desde el Excel: ${cargadas}.`);
    } catch (e) {
        await db.query('ROLLBACK');
        console.error('Falló (se revirtió):', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
