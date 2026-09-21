// Tabla para auditar las imágenes que cargó lista6-imagenes.cjs (pantalla /superuser/inventario/imagenes-nuevas).
// Aditiva e idempotente: crea "ImagenAuditoria" si no existe y (con --importar) registra como PENDIENTE cada imagen del log que sigue vigente.
//   node scripts/migraciones/lista6-auditoria.cjs             -> crea la tabla
//   node scripts/migraciones/lista6-auditoria.cjs --importar  -> además importa lo que hay en datos/lista6-imagenes-log.json (se puede repetir)
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const fs = require('fs');
const path = require('path');
const db = require('../../models');

const TABLAS = { producto: 'Productos', grupo: 'GruposEquivalencia', marca: 'Marcas' };
const SINGULAR = { productos: 'producto', grupos: 'grupo', marcas: 'marca' };

(async () => {
    const q = (s, r) => db.sequelize.query(s, { replacements: r });
    try {
        await q(`CREATE TABLE IF NOT EXISTS "ImagenAuditoria" (
            tipo VARCHAR(10) NOT NULL, "refId" INTEGER NOT NULL, estado VARCHAR(12) NOT NULL DEFAULT 'PENDIENTE',
            fuente TEXT, pagina TEXT, puntaje NUMERIC(4,2), "revisadoPor" INTEGER, "revisadoEn" TIMESTAMP, "creadoEn" TIMESTAMP NOT NULL DEFAULT NOW(),
            PRIMARY KEY (tipo, "refId"))`);
        console.log('Tabla ImagenAuditoria lista.');
        if (!process.argv.includes('--importar')) return;
        const log = JSON.parse(fs.readFileSync(path.join(__dirname, 'datos', 'lista6-imagenes-log.json'), 'utf8')).items;
        let nuevos = 0, omitidos = 0;
        for (const x of Object.values(log)) {
            if (x.estado !== 'ok') continue;
            const tipo = SINGULAR[x.tipo];
            const [[fila]] = await q(`SELECT imagen FROM "${TABLAS[tipo]}" WHERE id = :id`, { id: x.id });
            if (!fila || fila.imagen !== x.imagen) { omitidos++; continue; } // ya se cambió a mano: no se audita
            const [, meta] = await q(`INSERT INTO "ImagenAuditoria" (tipo, "refId", fuente, pagina, puntaje) VALUES (:tipo, :id, :fuente, :pagina, :puntaje) ON CONFLICT (tipo, "refId") DO NOTHING`,
                { tipo, id: x.id, fuente: x.fuente || null, pagina: x.pagina || null, puntaje: x.puntaje ?? null });
            if (meta?.rowCount) nuevos++;
        }
        console.log(`Importadas ${nuevos} imágenes para auditar (${omitidos} omitidas por haber cambiado).`);
    } finally { await db.sequelize.close(); }
})().catch((e) => { console.error('Falló:', e.message); process.exit(1); });
