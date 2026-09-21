// Precio 7 de los productos que no lo tenían, tomado del reporte "Lista De Precio" (precio #6 y #7) de septiembre 2026.
// Solo llena precio7 donde hoy es 0 o vacío (nunca pisa uno existente). Ya viene convertido a la unidad del sistema cuando el reporte
// vende por caja (se divide) o por pieza (se multiplica por el paquete). Datos en datos/lista7-plan.json.
// También corrige 4 códigos que inventé para suturas (3571-3574) y que en el sistema ya eran de otros productos.
//
//   node scripts/migraciones/lista7-precios.cjs            -> SIMULA (transacción con rollback)
//   node scripts/migraciones/lista7-precios.cjs --aplicar  -> aplica y guarda el estado anterior en "Lista7Respaldo"
//   node scripts/migraciones/lista7-precios.cjs --revertir -> devuelve precio 7 y códigos a como estaban
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const db = require('../../models');
const plan = require('./datos/lista7-plan.json');

const APLICAR = process.argv.includes('--aplicar');
const REVERTIR = process.argv.includes('--revertir');
class Simulacion extends Error {}

(async () => {
    try {
        await db.sequelize.transaction(async (transaction) => {
            const q = (sql, replacements) => db.sequelize.query(sql, { transaction, replacements });
            await q(`CREATE TABLE IF NOT EXISTS "Lista7Respaldo" (id INTEGER PRIMARY KEY, "codigoAntes" VARCHAR, "precio7Antes" NUMERIC, "creadoEn" TIMESTAMP NOT NULL DEFAULT NOW())`);

            if (REVERTIR) {
                const [filas] = await q(`SELECT id, "codigoAntes", "precio7Antes" FROM "Lista7Respaldo"`);
                for (const f of filas) await q(`UPDATE "Productos" SET codigo = :codigo, precio7 = :p7, "updatedAt" = NOW() WHERE id = :id`, { id: f.id, codigo: f.codigoAntes, p7: f.precio7Antes ?? 0 });
                await q(`DELETE FROM "Lista7Respaldo"`);
                console.log(`Revertidos ${filas.length} productos.`);
                return;
            }

            const [[{ n: previas }]] = await q(`SELECT count(*)::int n FROM "Lista7Respaldo"`);
            if (previas) throw new Error(`Ya se aplicó (${previas} filas de respaldo). Usa --revertir antes de repetir.`);

            // 1) Códigos que chocaban con otros productos del sistema
            let recodificados = 0;
            for (const c of plan.cambiosCodigo) {
                const [libre] = await q(`SELECT 1 FROM "Productos" WHERE codigo = :a OR codigo LIKE :aLike LIMIT 1`, { a: c.a, aLike: `${c.a}-%` });
                if (libre.length) throw new Error(`El código nuevo ${c.a} ya está ocupado`);
                const [filas] = await q(`SELECT id, codigo, "precio7" FROM "Productos" WHERE codigo = :de OR codigo LIKE :deLike`, { de: c.de, deLike: `${c.de}-%` });
                for (const f of filas) {
                    await q(`INSERT INTO "Lista7Respaldo" (id, "codigoAntes", "precio7Antes") VALUES (:id, :cod, :p7) ON CONFLICT (id) DO NOTHING`, { id: f.id, cod: f.codigo, p7: f.precio7 });
                    await q(`UPDATE "Productos" SET codigo = :nuevo, "updatedAt" = NOW() WHERE id = :id`, { id: f.id, nuevo: c.a + f.codigo.slice(c.de.length) });
                    recodificados++;
                }
            }

            // 2) Precio 7 (solo donde falta)
            let actualizados = 0, omitidos = 0;
            for (const p of plan.precios) {
                const [[f]] = await q(`SELECT codigo, precio7 FROM "Productos" WHERE id = :id`, { id: p.id });
                if (!f || Number(f.precio7) > 0) { omitidos++; continue; }
                await q(`INSERT INTO "Lista7Respaldo" (id, "codigoAntes", "precio7Antes") VALUES (:id, :cod, :p7) ON CONFLICT (id) DO NOTHING`, { id: p.id, cod: f.codigo, p7: f.precio7 });
                await q(`UPDATE "Productos" SET precio7 = :p7, "updatedAt" = NOW() WHERE id = :id`, { id: p.id, p7: p.precio7 });
                actualizados++;
            }
            console.log(`Códigos corregidos: ${recodificados} | Precio 7 puesto: ${actualizados} | ya lo tenían u omitidos: ${omitidos}`);
            if (!APLICAR) throw new Simulacion();
        });
        if (APLICAR || REVERTIR) console.log('\nListo.');
    } catch (e) {
        if (e instanceof Simulacion) console.log('\nSIMULACIÓN: se hizo rollback (no se cambió nada).');
        else { console.error('Falló:', e.message); process.exitCode = 1; }
    } finally { await db.sequelize.close(); }
})();
