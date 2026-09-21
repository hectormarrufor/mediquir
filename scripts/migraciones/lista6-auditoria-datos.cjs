// Tabla para auditar precios, costo y empaque de los productos cargados con lista6-carga.cjs (pantalla /superuser/inventario/auditar-datos).
// Aditiva e idempotente. Para cada producto de la carga guarda: estado de revisión, lo que dice el reporte del sistema (precio 6 y 7) y notas de
// las decisiones automáticas (precios de caja dudosos, conversiones, precio 7 no cargado...).
//   node scripts/migraciones/lista6-auditoria-datos.cjs
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const db = require('../../models');
const ref = require('./datos/lista6-referencia.json');

const lotes = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, (i + 1) * n));

(async () => {
    const q = (s, r) => db.sequelize.query(s, { replacements: r });
    try {
        await q(`CREATE TABLE IF NOT EXISTS "DatoAuditoria" (
            "productoId" INTEGER PRIMARY KEY, estado VARCHAR(12) NOT NULL DEFAULT 'PENDIENTE', referencia JSONB, notas JSONB,
            "revisadoPor" INTEGER, "revisadoEn" TIMESTAMP, "creadoEn" TIMESTAMP NOT NULL DEFAULT NOW())`);
        const [prods] = await q(`SELECT p.id, p.codigo FROM "Productos" p JOIN "CargaLista6" l ON l.tipo = 'producto' AND l."refId" = p.id`);
        let n = 0;
        for (const trozo of lotes(prods, 200)) {
            const valores = [], reemplazos = {};
            trozo.forEach((p, i) => {
                const r = ref[p.codigo.split('-')[0]] || {};
                valores.push(`(:id${i}, :ref${i}::jsonb, :notas${i}::jsonb)`);
                reemplazos[`id${i}`] = p.id;
                reemplazos[`ref${i}`] = JSON.stringify(r.erpP6 !== undefined ? { p6: r.erpP6, p7: r.erpP7, nombre: r.erpNombre } : null);
                reemplazos[`notas${i}`] = JSON.stringify(r.notas || []);
            });
            await q(`INSERT INTO "DatoAuditoria" ("productoId", referencia, notas) VALUES ${valores.join(',')}
                ON CONFLICT ("productoId") DO UPDATE SET referencia = EXCLUDED.referencia, notas = EXCLUDED.notas`, reemplazos);
            n += trozo.length;
        }
        console.log(`Tabla DatoAuditoria lista: ${n} productos por auditar.`);
    } finally { await db.sequelize.close(); }
})().catch((e) => { console.error('Falló:', e.message); process.exit(1); });
