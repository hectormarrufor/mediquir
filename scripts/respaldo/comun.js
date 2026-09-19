// Utilidades compartidas por el respaldo y la restauración de la base de datos (Node puro, sin pg_dump).
const path = require('path');
const os = require('os');
const fs = require('fs');
const { Client, types } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

// Los valores se leen como TEXTO tal cual los entrega Postgres (fechas, hora, bytea): así el respaldo es exacto,
// sin desplazamientos de zona horaria ni pérdida de precisión, y se restaura con el mismo texto.
types.setTypeParser(1082, (v) => v); // date
types.setTypeParser(1114, (v) => v); // timestamp
types.setTypeParser(1184, (v) => v); // timestamptz
types.setTypeParser(17, (v) => v);   // bytea (formato \x...)

const CARPETA = process.env.BACKUP_DIR || path.join(os.homedir(), 'Respaldos', 'Mediquir');
const RETENCION = {
    diarios: Number(process.env.BACKUP_DIARIOS) || 7,     // los últimos N días (uno por día)
    semanales: Number(process.env.BACKUP_SEMANALES) || 4, // el más reciente de cada una de las últimas N semanas
    mensuales: Number(process.env.BACKUP_MENSUALES) || 12, // el más reciente de cada uno de los últimos N meses
};

function conectar() {
    if (!process.env.DB_URI) throw new Error('Falta DB_URI en el archivo .env');
    return new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false }, statement_timeout: 120000 });
}

const ident = (n) => `"${String(n).replace(/"/g, '""')}"`;
const literal = (v) => `'${String(v).replace(/'/g, "''")}'`;

function registrar(mensaje) {
    const linea = `[${new Date().toISOString()}] ${mensaje}`;
    console.log(linea);
    try {
        fs.mkdirSync(CARPETA, { recursive: true });
        fs.appendFileSync(path.join(CARPETA, 'respaldo.log'), linea + '\n');
    } catch { /* el log es de cortesía */ }
}

module.exports = { CARPETA, RETENCION, conectar, ident, literal, registrar };
