// Historial de tasas BCV con su FECHA VALOR (el día en que cada tasa rige).
//   1) Las filas que ya hay estaban guardadas con la fecha en que el cron las leyó (6:00 p. m.), o sea con un día de desfase:
//      la tasa que rige el 6-nov estaba en la fila del 5-nov. Aquí se les corrige la fecha.
//   2) Se agregan las tasas diarias desde 2023-01-03 que faltan (fuente: ve.dolarapi.com, que publica el dólar oficial BCV por fecha valor).
//   node scripts/migraciones/bcv-historico.cjs            -> simulación (no escribe)
//   node scripts/migraciones/bcv-historico.cjs --aplicar  -> aplica todo en una transacción
// La tasa se guarda con 2 decimales (como el resto del sistema).
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

const APLICAR = process.argv.includes('--aplicar');
const ARCHIVO = path.join(__dirname, 'datos', 'privado', 'bcv-dolarapi.json');
const r2 = (n) => (Math.round((Number(n) + Number.EPSILON) * 100) / 100).toFixed(2);

(async () => {
    if (!fs.existsSync(ARCHIVO)) {
        const res = await fetch('https://ve.dolarapi.com/v1/historicos/dolares/oficial');
        if (!res.ok) throw new Error('No se pudo bajar el historial de dolarapi');
        fs.writeFileSync(ARCHIVO, JSON.stringify(await res.json()));
    }
    const fuente = JSON.parse(fs.readFileSync(ARCHIVO, 'utf8')).filter((x) => x.promedio > 0).sort((a, b) => a.fecha.localeCompare(b.fecha));
    const valor = new Map(fuente.map((x) => [x.fecha, r2(x.promedio)]));
    console.log(`Fuente: ${fuente.length} fechas valor, de ${fuente[0].fecha} a ${fuente[fuente.length - 1].fecha}`);

    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        const filas = (await db.query(`SELECT id, fecha::text AS fecha, hora, monto::text AS monto FROM "BcvPreciosHistoricos" ORDER BY fecha, id`)).rows;
        // Fecha valor de cada fila existente: la primera fecha >= a la de la fila con ese mismo monto (hasta 6 días después)
        const plan = []; const sinPar = [];
        for (const f of filas) {
            const limite = new Date(new Date(f.fecha + 'T12:00:00Z').getTime() + 6 * 864e5).toISOString().slice(0, 10);
            const v = fuente.find((x) => x.fecha >= f.fecha && x.fecha <= limite && valor.get(x.fecha) === r2(f.monto));
            if (v) plan.push({ ...f, valor: v.fecha }); else sinPar.push(f);
        }
        // Dos filas que caen en la misma fecha valor (repetidos de fin de semana o corridas dobles): se queda la más nueva
        const porValor = new Map();
        for (const p of plan) { const x = porValor.get(p.valor); if (!x || p.id > x.id) porValor.set(p.valor, p); }
        const conservar = [...porValor.values()];
        const borrar = plan.filter((p) => porValor.get(p.valor).id !== p.id);
        const yaOk = conservar.filter((p) => p.fecha === p.valor).length;
        const hoy = new Date(Date.now() - 4 * 36e5).toISOString().slice(0, 10);
        const existentesValor = new Set(conservar.map((p) => p.valor));
        const nuevas = fuente.filter((x) => !existentesValor.has(x.fecha));

        console.log(`Filas en la base: ${filas.length} -> a corregir de fecha: ${conservar.length - yaOk}, ya correctas: ${yaOk}, repetidas a quitar: ${borrar.length}, sin par en dolarapi: ${sinPar.length}`);
        console.log('Ejemplos de corrección:', conservar.filter((p) => p.fecha !== p.valor).slice(-4).map((p) => `${p.fecha} (${p.monto}) -> ${p.valor}`));
        if (sinPar.length) console.log('SIN PAR (no se tocan):', sinPar.map((f) => `${f.fecha} ${f.monto}`));
        console.log(`Tasas nuevas a agregar: ${nuevas.length} (de ${nuevas[0]?.fecha} a ${nuevas[nuevas.length - 1]?.fecha})`);
        console.log(`Hoy (${hoy}) regirá: ${valor.get(hoy) ?? [...valor].filter(([d]) => d <= hoy).pop().join(' ')}`);
        if (!APLICAR) { console.log('\nSimulación: no se escribió nada. Para aplicar: --aplicar'); return; }

        await db.query('BEGIN');
        if (borrar.length) await db.query(`DELETE FROM "BcvPreciosHistoricos" WHERE id = ANY($1::int[])`, [borrar.map((b) => b.id)]);
        for (const p of conservar.filter((x) => x.fecha !== x.valor)) await db.query(`UPDATE "BcvPreciosHistoricos" SET fecha = $1, "updatedAt" = now() WHERE id = $2`, [p.valor, p.id]);
        for (const x of nuevas) {
            await db.query(`INSERT INTO "BcvPreciosHistoricos" (fecha, hora, monto, "createdAt", "updatedAt") VALUES ($1, '00:00:00', $2, now(), now())`, [x.fecha, valor.get(x.fecha)]);
        }
        await db.query('COMMIT');
        const total = (await db.query(`SELECT count(*)::int n, min(fecha)::text d, max(fecha)::text h FROM "BcvPreciosHistoricos"`)).rows[0];
        console.log(`\nListo. Ahora hay ${total.n} tasas, de ${total.d} a ${total.h}.`);
    } catch (e) {
        await db.query('ROLLBACK').catch(() => {});
        console.error('Falló (se revirtió):', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
