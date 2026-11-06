// Corrección de la carga de notas fiscales (notas-carga.cjs):
//   1) Notas de crédito cuyos renglones no suman su subtotal (el emparejamiento tomó renglones de más): se les quitan los renglones y quedan solo con su cabecera.
//   2) Notas de venta con el número de control con un dígito de más (00-01421650): se corrige con los controles de las facturas de esa misma fecha.
//   node scripts/migraciones/notas-correccion.cjs            -> SIMULACIÓN
//   node scripts/migraciones/notas-correccion.cjs --aplicar  -> aplica
const path = require('path');
const APLICAR = process.argv.includes('--aplicar');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        // ---- 1) renglones que no suman
        const malas = (await db.query(`SELECT n.id, n."numeroDocumento" AS num FROM "NotasFiscales" n JOIN "NotaFiscalDetalles" d ON d."notaId" = n.id
            GROUP BY n.id, n.subtotal, n."numeroDocumento" HAVING abs(sum(d.subtotal) - n.subtotal) > 0.05`)).rows;
        const ids = malas.map((m) => m.id);
        console.log(`Notas con renglones que no suman su subtotal: ${malas.length}`);

        // ---- 2) controles con un dígito de más: el esperado es el de las facturas del mismo día (mediana)
        const raros = (await db.query(`SELECT id, "numeroDocumento" AS num, "numeroControl" AS control, fecha::text AS fecha FROM "NotasFiscales"
            WHERE origen = 'VENTA' AND "numeroControl" ~ '^00-[0-9]+$' AND CAST(substring("numeroControl" from 4) AS bigint) > 123000 ORDER BY fecha`)).rows;
        const arreglos = [];
        for (const r of raros) {
            // 1º las notas vecinas por número (misma serie de formas); si no hay, las facturas de esa fecha
            const nn = Number(String(r.num).replace(/\D/g, ''));
            const vecNotas = (await db.query(`SELECT CAST(substring("numeroControl" from 4) AS bigint)::float AS n FROM "NotasFiscales" WHERE origen = 'VENTA' AND tipo = 'CREDITO' AND "numeroControl" ~ '^00-[0-9]+$'
                AND CAST(substring("numeroControl" from 4) AS bigint) <= 123000 AND abs(CAST(regexp_replace("numeroDocumento", '[^0-9]', '', 'g') AS int) - $1) <= 6 ORDER BY 1`, [nn])).rows.map((x) => x.n);
            const vec = (await db.query(`SELECT CAST(substring("numeroControl" from 4) AS bigint)::float AS n FROM "Ventas" WHERE "numeroControl" ~ '^00-[0-9]+$'
                AND CAST(substring("numeroControl" from 4) AS bigint) <= 123000 AND "fechaEmision"::date BETWEEN ($1::date - 3) AND ($1::date + 3) ORDER BY 1`, [r.fecha])).rows.map((x) => x.n);
            const base = vecNotas.length >= 2 ? vecNotas : vec;
            const esperado = base.length ? base[Math.floor(base.length / 2)] : null;
            const digitos = r.control.slice(3);
            let elegido = null;
            if (esperado !== null) for (let i = 0; i < digitos.length; i++) {
                const c = Number(digitos.slice(0, i) + digitos.slice(i + 1));
                if (c <= 123000 && Math.abs(c - esperado) <= 60 && (elegido === null || Math.abs(c - esperado) < Math.abs(elegido - esperado))) elegido = c;
            }
            arreglos.push({ ...r, esperado, nuevo: elegido === null ? null : `00-${String(elegido).padStart(7, '0')}` });
        }
        console.log('Controles con dígito de más:');
        for (const a of arreglos) console.log(`   ${a.num} (${a.fecha}): ${a.control} -> ${a.nuevo ?? 'sin control (no se pudo deducir)'}  [esperado ~${a.esperado ?? '?'}]`);

        if (!APLICAR) { await db.query('ROLLBACK'); console.log('\nSimulación: no se escribió nada.'); return; }
        if (ids.length) {
            await db.query(`DELETE FROM "NotaFiscalDetalles" WHERE "notaId" = ANY($1::uuid[])`, [ids]);
            await db.query(`UPDATE "NotasFiscales" SET motivo = 'Nota de crédito migrada del sistema anterior', "updatedAt" = now() WHERE id = ANY($1::uuid[])`, [ids]);
        }
        for (const a of arreglos) await db.query(`UPDATE "NotasFiscales" SET "numeroControl" = $1, "updatedAt" = now() WHERE id = $2`, [a.nuevo, a.id]);
        await db.query('COMMIT');
        const mx = (await db.query(`SELECT max(CAST(substring("numeroControl" from 4) AS bigint)) m FROM (SELECT "numeroControl" FROM "Ventas" UNION ALL SELECT "numeroControl" FROM "NotasFiscales" WHERE origen = 'VENTA') t WHERE "numeroControl" ~ '^00-[0-9]+$'`)).rows[0].m;
        console.log(`\nCorregido: ${ids.length} notas sin renglones erróneos, ${arreglos.length} controles. Máximo control ahora: ${mx} (el siguiente será ${Number(mx) + 1}).`);
    } catch (e) {
        await db.query('ROLLBACK').catch(() => {});
        console.error('Falló (se revirtió):', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
