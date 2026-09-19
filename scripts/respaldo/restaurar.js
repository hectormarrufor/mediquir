#!/usr/bin/env node
// Restaura un respaldo hecho con respaldar.js.
//
//   node scripts/respaldo/restaurar.js <archivo.json.gz> --esquema restauracion   -> restaura en un esquema APARTE (seguro, para probar)
//   node scripts/respaldo/restaurar.js <archivo.json.gz> --esquema public --confirmar
//        -> restaura en la base real. Solo si las tablas están vacías o no existen; nunca borra nada.
//
// Con --esquema distinto de "public" se crea ese esquema (falla si ya existe) y no se toca nada más.
const path = require('path');
const { conectar, ident, literal, registrar } = require('./comun');
const { leerRespaldo } = require('./respaldar');

const LOTE = 500;

async function restaurar(ruta, esquemaDestino, { comparar = true } = {}) {
    const r = leerRespaldo(ruta);
    const db = conectar();
    await db.connect();
    try {
        await db.query('BEGIN');
        if (esquemaDestino !== 'public') {
            const existe = await db.query('SELECT 1 FROM pg_namespace WHERE nspname = $1', [esquemaDestino]);
            if (existe.rowCount) throw new Error(`El esquema "${esquemaDestino}" ya existe; elige otro nombre o elimínalo antes`);
            await db.query(`CREATE SCHEMA ${ident(esquemaDestino)}`);
        } else {
            const ocupadas = await db.query(`SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'`);
            for (const { relname } of ocupadas.rows) {
                const { rows } = await db.query(`SELECT count(*)::int AS n FROM ${ident(relname)}`);
                if (rows[0].n > 0) throw new Error(`La tabla ${relname} ya tiene datos; para restaurar en "public" las tablas deben estar vacías`);
            }
        }
        await db.query(`SET LOCAL search_path TO ${ident(esquemaDestino)}`);

        for (const e of r.esquema.enums) {
            await db.query(`CREATE TYPE ${ident(e.nombre)} AS ENUM (${e.valores.map(literal).join(', ')})`);
        }
        for (const s of r.esquema.secuencias) {
            await db.query(`CREATE SEQUENCE ${ident(s.nombre)} START WITH ${s.inicio} INCREMENT BY ${s.paso} MINVALUE ${s.minimo} MAXVALUE ${s.maximo}`);
        }
        for (const t of r.esquema.tablas) {
            const columnas = t.columnas.map((c) => `${ident(c.nombre)} ${c.tipo}${c.defecto ? ` DEFAULT ${c.defecto}` : ''}${c.noNulo ? ' NOT NULL' : ''}`);
            await db.query(`CREATE TABLE ${ident(t.nombre)} (${columnas.join(', ')})`);
        }

        // Datos: cada lote viaja como JSON y Postgres lo convierte al tipo de cada columna (enums, fechas, numéricos, arreglos...)
        for (const t of r.esquema.tablas) {
            const filas = r.datos[t.nombre] || [];
            for (let i = 0; i < filas.length; i += LOTE) {
                await db.query(`INSERT INTO ${ident(t.nombre)} SELECT * FROM jsonb_populate_recordset(null::${ident(t.nombre)}, $1::jsonb)`, [JSON.stringify(filas.slice(i, i + LOTE))]);
            }
        }

        // Restricciones e índices al final (más rápido y sin problemas de orden entre llaves foráneas)
        for (const c of r.esquema.restricciones) {
            await db.query(`ALTER TABLE ${c.tabla} ADD CONSTRAINT ${ident(c.nombre)} ${c.definicion}`);
        }
        for (const definicion of r.esquema.indices) await db.query(definicion);
        for (const s of r.esquema.secuencias) {
            if (s.ultimo !== null) await db.query('SELECT setval($1, $2::bigint, true)', [`${ident(esquemaDestino)}.${ident(s.nombre)}`, s.ultimo]);
        }

        let diferencias = [];
        if (comparar) {
            for (const t of r.esquema.tablas) {
                const { rows } = await db.query(`SELECT count(*)::int AS n FROM ${ident(t.nombre)}`);
                if (rows[0].n !== r.meta.filas[t.nombre]) diferencias.push(`${t.nombre}: esperadas ${r.meta.filas[t.nombre]}, restauradas ${rows[0].n}`);
            }
            if (diferencias.length) throw new Error(`La restauración no coincide con el respaldo: ${diferencias.join('; ')}`);
        }
        await db.query('COMMIT');
        const total = Object.values(r.meta.filas).reduce((a, b) => a + b, 0);
        registrar(`OK restauración de ${path.basename(ruta)} en el esquema "${esquemaDestino}": ${r.esquema.tablas.length} tablas, ${total} filas`);
        return { tablas: r.esquema.tablas.length, filas: total };
    } catch (e) {
        await db.query('ROLLBACK').catch(() => {});
        throw e;
    } finally {
        await db.end().catch(() => {});
    }
}

module.exports = { restaurar };

if (require.main === module) {
    const args = process.argv.slice(2);
    const archivo = args.find((a) => !a.startsWith('--'));
    const i = args.indexOf('--esquema');
    const esquema = i >= 0 ? args[i + 1] : null;
    if (!archivo || !esquema) { console.error('Uso: node restaurar.js <archivo.json.gz> --esquema <nombre> [--confirmar]'); process.exit(2); }
    if (esquema === 'public' && !args.includes('--confirmar')) { console.error('Restaurar en "public" requiere --confirmar'); process.exit(2); }
    restaurar(path.resolve(archivo), esquema).catch((e) => { registrar(`ERROR ${e.message}`); process.exitCode = 1; });
}
