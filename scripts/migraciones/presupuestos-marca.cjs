// 2026-11-12: los presupuestos ya hechos guardaron algunos renglones sin marca (salía «—» en el PDF). Todos los productos tienen marca:
// a cada renglón con producto y sin marca se le guarda la marca de su producto (por productoId; si no tiene, por el código del renglón).
// Solo se rellenan renglones SIN marca: nunca se cambia una marca ya guardada. Idempotente.
//   node scripts/migraciones/presupuestos-marca.cjs [--aplicar]
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');
const APLICAR = process.argv.includes('--aplicar');
(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        const marcas = (await db.query(`SELECT p.id, p.codigo, m.nombre AS marca FROM "Productos" p JOIN "Marcas" m ON m.id = p."marcaId"`)).rows;
        const porId = new Map(marcas.map((p) => [p.id, p.marca]));
        const porCodigo = new Map(marcas.filter((p) => p.codigo).map((p) => [String(p.codigo).trim().toUpperCase(), p.marca]));
        const presupuestos = (await db.query(`SELECT id, renglones FROM "Presupuestos" ORDER BY id FOR UPDATE`)).rows;
        let renglonesTocados = 0, presupuestosTocados = 0;
        const sinResolver = [];
        for (const p of presupuestos) {
            let cambio = false;
            const nuevos = (p.renglones || []).map((r) => {
                if (String(r.marca || '').trim()) return r;
                const marca = (r.productoId && porId.get(Number(r.productoId))) || (r.codigo && porCodigo.get(String(r.codigo).trim().toUpperCase())) || null;
                if (!marca) { if (r.productoId || r.codigo) sinResolver.push(`P-${p.id}: ${r.codigo || ''} ${r.nombre}`); return r; }
                cambio = true; renglonesTocados++;
                return { ...r, marca };
            });
            if (cambio) { presupuestosTocados++; await db.query(`UPDATE "Presupuestos" SET renglones = $2::jsonb, "updatedAt" = now() WHERE id = $1`, [p.id, JSON.stringify(nuevos)]); }
        }
        console.log(`${renglonesTocados} renglones con marca nueva en ${presupuestosTocados} de ${presupuestos.length} presupuestos`);
        if (sinResolver.length) console.log(`Sin marca (producto no encontrado):\n  ${sinResolver.join('\n  ')}`);
        if (APLICAR) { await db.query('COMMIT'); console.log('✅ CAMBIOS GUARDADOS'); } else { await db.query('ROLLBACK'); console.log('🧪 SIMULACIÓN: para aplicar --aplicar'); }
    } catch (e) { await db.query('ROLLBACK').catch(() => {}); console.error('❌', e.message); process.exitCode = 1; } finally { await db.end(); }
})();
