#!/usr/bin/env node
// Respaldo de la base de datos (Aiven PostgreSQL) a un archivo comprimido en ESTE equipo, con rotación.
//
//   node scripts/respaldo/respaldar.js               -> respaldo completo + rotación
//   node scripts/respaldo/respaldar.js --keepalive   -> solo una consulta (evita que la base se apague por inactividad)
//   node scripts/respaldo/respaldar.js --verificar   -> comprueba que el último respaldo se puede leer y está completo
//
// No usa pg_dump: exporta el esquema (tipos, secuencias, tablas, restricciones e índices) y todas las filas, y
// scripts/respaldo/restaurar.js lo reconstruye. Corre desde Windows, así que no lo limita Vercel (10 s por petición).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { CARPETA, RETENCION, conectar, ident, registrar } = require('./comun');

const LOTE = 2000;
const PATRON = /^mediquir_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})\.json\.gz$/;

// ---------------------------------------------------------------- esquema
async function leerEsquema(db) {
    const q = async (sql) => (await db.query(sql)).rows;

    const enums = await q(`SELECT t.typname AS nombre, array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS valores
        FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typnamespace = 'public'::regnamespace GROUP BY t.typname ORDER BY t.typname`);
    const secuencias = await q(`SELECT sequencename AS nombre, start_value::text AS inicio, increment_by::text AS paso, min_value::text AS minimo, max_value::text AS maximo, last_value::text AS ultimo
        FROM pg_sequences WHERE schemaname = 'public' ORDER BY sequencename`);
    const tablas = await q(`SELECT c.oid, c.relname AS nombre FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' ORDER BY c.relname`);

    for (const t of tablas) {
        t.columnas = await q(`SELECT a.attname AS nombre, format_type(a.atttypid, a.atttypmod) AS tipo, a.attnotnull AS "noNulo", pg_get_expr(d.adbin, d.adrelid) AS defecto
            FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
            WHERE a.attrelid = ${t.oid} AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum`);
    }

    const restricciones = await q(`SELECT conrelid::regclass::text AS tabla, conname AS nombre, contype AS tipo, pg_get_constraintdef(oid) AS definicion
        FROM pg_constraint WHERE connamespace = 'public'::regnamespace ORDER BY CASE contype WHEN 'p' THEN 1 WHEN 'u' THEN 2 WHEN 'c' THEN 3 ELSE 4 END, conname`);
    const indices = await q(`SELECT indexdef AS definicion FROM pg_indexes WHERE schemaname = 'public'
        AND indexname NOT IN (SELECT conname FROM pg_constraint WHERE connamespace = 'public'::regnamespace) ORDER BY indexname`);

    return {
        enums, secuencias,
        tablas: tablas.map(({ oid, ...t }) => t),
        restricciones,
        indices: indices.map((i) => i.definicion.replace(/ public\./g, ' ')), // sin esquema, para poder restaurar en otro
    };
}

// ---------------------------------------------------------------- respaldo
async function respaldar() {
    const inicio = Date.now();
    const db = conectar();
    await db.connect();
    try {
        const version = (await db.query('SELECT version() AS v')).rows[0].v;
        // Una sola transacción de solo lectura: todo el respaldo sale del MISMO instante, aunque la base siga recibiendo ventas
        await db.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');

        const esquema = await leerEsquema(db);
        const datos = {};
        const filasPorTabla = {};
        for (const t of esquema.tablas) {
            const filas = [];
            let salto = 0;
            for (;;) {
                const { rows } = await db.query(`SELECT * FROM ${ident(t.nombre)} ORDER BY ctid LIMIT ${LOTE} OFFSET ${salto}`);
                filas.push(...rows);
                if (rows.length < LOTE) break;
                salto += LOTE;
            }
            datos[t.nombre] = filas;
            filasPorTabla[t.nombre] = filas.length;
        }
        await db.query('COMMIT');

        const ahora = new Date();
        const marca = ahora.toISOString().replace(/[-:T]/g, '').slice(0, 14); // AAAAMMDDHHMMSS (UTC)
        const nombre = `mediquir_${marca.slice(0, 8)}_${marca.slice(8, 14)}.json.gz`;
        const contenido = JSON.stringify({ meta: { version: 1, creado: ahora.toISOString(), servidor: version, filas: filasPorTabla }, esquema, datos });
        const comprimido = zlib.gzipSync(contenido, { level: 9 });

        fs.mkdirSync(CARPETA, { recursive: true });
        const ruta = path.join(CARPETA, nombre);
        const temporal = `${ruta}.tmp`;
        fs.writeFileSync(temporal, comprimido);
        fs.renameSync(temporal, ruta); // el archivo solo aparece completo
        fs.writeFileSync(`${ruta}.sha256`, `${crypto.createHash('sha256').update(comprimido).digest('hex')}  ${nombre}\n`);

        const total = Object.values(filasPorTabla).reduce((a, b) => a + b, 0);
        registrar(`OK respaldo ${nombre}: ${esquema.tablas.length} tablas, ${total} filas, ${(comprimido.length / 1024).toFixed(0)} KB, ${((Date.now() - inicio) / 1000).toFixed(1)} s`);

        const verificacion = verificarArchivo(ruta);
        if (!verificacion.ok) throw new Error(`El respaldo recién creado no pasó la verificación: ${verificacion.motivo}`);
        rotar();
        return ruta;
    } finally {
        await db.end().catch(() => {});
    }
}

// ---------------------------------------------------------------- verificación
function leerRespaldo(ruta) {
    return JSON.parse(zlib.gunzipSync(fs.readFileSync(ruta)).toString('utf8'));
}

function verificarArchivo(ruta) {
    try {
        const sumaGuardada = fs.existsSync(`${ruta}.sha256`) ? fs.readFileSync(`${ruta}.sha256`, 'utf8').split(' ')[0] : null;
        const suma = crypto.createHash('sha256').update(fs.readFileSync(ruta)).digest('hex');
        if (sumaGuardada && sumaGuardada !== suma) return { ok: false, motivo: 'la suma de comprobación no coincide (archivo dañado)' };
        const r = leerRespaldo(ruta);
        for (const t of r.esquema.tablas) {
            if ((r.datos[t.nombre] || []).length !== r.meta.filas[t.nombre]) return { ok: false, motivo: `la tabla ${t.nombre} no tiene las filas esperadas` };
        }
        return { ok: true, tablas: r.esquema.tablas.length, filas: Object.values(r.meta.filas).reduce((a, b) => a + b, 0), creado: r.meta.creado };
    } catch (e) {
        return { ok: false, motivo: e.message };
    }
}

// ---------------------------------------------------------------- rotación
// Conserva: uno por día (últimos N días), el más reciente de cada semana (últimas N) y de cada mes (últimos N).
function listar() {
    if (!fs.existsSync(CARPETA)) return [];
    return fs.readdirSync(CARPETA).map((archivo) => {
        const m = PATRON.exec(archivo);
        if (!m) return null;
        const fecha = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
        return { archivo, fecha };
    }).filter(Boolean).sort((a, b) => b.fecha - a.fecha);
}

const claveDia = (d) => d.toISOString().slice(0, 10);
const claveMes = (d) => d.toISOString().slice(0, 7);
function claveSemana(d) { // lunes de esa semana
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
    return x.toISOString().slice(0, 10);
}

function elegirConservados(respaldos) { // respaldos ordenados del más nuevo al más viejo
    const conservar = new Set();
    for (const [clave, cuantos] of [[claveDia, RETENCION.diarios], [claveSemana, RETENCION.semanales], [claveMes, RETENCION.mensuales]]) {
        const vistos = new Set();
        for (const r of respaldos) {
            const k = clave(r.fecha);
            if (vistos.has(k)) continue;
            if (vistos.size >= cuantos) break;
            vistos.add(k);
            conservar.add(r.archivo);
        }
    }
    return conservar;
}

function rotar() {
    const todos = listar();
    const conservar = elegirConservados(todos);
    let borrados = 0;
    for (const r of todos) {
        if (conservar.has(r.archivo)) continue;
        for (const f of [r.archivo, `${r.archivo}.sha256`]) fs.rmSync(path.join(CARPETA, f), { force: true });
        borrados += 1;
    }
    registrar(`Rotación: ${conservar.size} respaldo(s) conservados, ${borrados} eliminado(s)`);
}

// ---------------------------------------------------------------- keepalive
async function mantenerViva() {
    const db = conectar();
    await db.connect();
    try {
        await db.query('SELECT 1');
        registrar('OK keepalive: la base respondió');
    } finally {
        await db.end().catch(() => {});
    }
}

module.exports = { respaldar, verificarArchivo, leerRespaldo, elegirConservados, listar };

if (require.main === module) {
    const arg = process.argv[2];
    const ejecutar = arg === '--keepalive' ? mantenerViva()
        : arg === '--verificar' ? Promise.resolve().then(() => {
            const ultimo = listar()[0];
            if (!ultimo) throw new Error('No hay respaldos en ' + CARPETA);
            const v = verificarArchivo(path.join(CARPETA, ultimo.archivo));
            registrar(`${v.ok ? 'OK' : 'ERROR'} verificación de ${ultimo.archivo}: ${v.ok ? `${v.tablas} tablas, ${v.filas} filas (${v.creado})` : v.motivo}`);
            if (!v.ok) process.exitCode = 1;
        })
        : respaldar();
    ejecutar.catch((e) => { registrar(`ERROR ${e.message}`); process.exitCode = 1; });
}
