// Segunda parte de presentacion-base.cjs: los productos cuyo costo y precios estaban por CAJA (curitas, mascarillas, liga clip, pañal)
// se pasan a por UNIDAD, igual que los guantes: stock x unidades por caja, costo y precios / unidades por caja, y recuperan su caja y bulto.
// Toma los datos originales de "ProductosRespaldoPresentacion" y solo toca los que aún no se han re-basado (es seguro repetirlo).
//   node scripts/migraciones/presentacion-base-cajas.cjs            -> simula
//   node scripts/migraciones/presentacion-base-cajas.cjs --aplicar  -> aplica (para deshacer: presentacion-base.cjs --revertir)
require('dotenv').config();
const db = require('../../models');

const APLICAR = process.argv.includes('--aplicar');
const r = (v, d) => Number(Number(v).toFixed(d));

(async () => {
    const q = (s, o) => db.sequelize.query(s, o);
    try {
        const [filas] = await q(`SELECT p.id, p.nombre, p."stockAlmacen" stock, p."stockMinimo" minimo, p."costoUsd" costo, p.precio6, p.precio7,
                b."unidadesPorCaja" upc, b."cajasPorBulto" cpb, b."unidadesPorBulto" upb
            FROM "Productos" p JOIN "ProductosRespaldoPresentacion" b ON b.id = p.id
            WHERE b.presentacion = 'caja' AND b."costoUsd" >= 1 AND b."unidadesPorCaja" > 1 AND p."unidadesPorCaja" IS NULL AND p."costoUsd" = b."costoUsd"
              AND p.nombre !~* 'guante' ORDER BY p.nombre`);
        console.log(`Productos a re-basar: ${filas.length}`);
        const plan = filas.map((f) => {
            const u = Number(f.upc);
            return { ...f, n: {
                stock: r(f.stock * u, 2), minimo: r(f.minimo * u, 2), costo: r(f.costo / u, 5), p6: r(f.precio6 / u, 3), p7: r(f.precio7 / u, 3),
                upc: u, cpb: f.cpb || 1, upb: f.upb || u,
            } };
        });
        plan.forEach((p) => console.log(`${p.id} | ${p.nombre.trim()} (x${p.upc})\n     stock ${p.stock} -> ${p.n.stock} | costo ${p.costo} -> ${p.n.costo} | p6 ${p.precio6} -> ${p.n.p6} | p7 ${p.precio7} -> ${p.n.p7} | caja=${p.n.upc} bulto=${p.n.upb}`));
        if (!APLICAR) { console.log('\nSIMULACIÓN: no se cambió nada.'); return; }
        await db.sequelize.transaction(async (transaction) => {
            for (const p of plan) {
                await q(`UPDATE "Productos" SET "unidadesPorCaja" = :upc, "cajasPorBulto" = :cpb, "unidadesPorBulto" = :upb, "stockAlmacen" = :stock, "stockMinimo" = :minimo,
                    "costoUsd" = :costo, precio6 = :p6, precio7 = :p7, "updatedAt" = NOW() WHERE id = :id`, { transaction, replacements: { id: p.id, ...p.n } });
            }
        });
        console.log(`\nAplicado a ${plan.length} productos.`);
    } finally { await db.sequelize.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
