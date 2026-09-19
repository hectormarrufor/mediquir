// Separa "presentación" (qué es UNA unidad: unidad, par, paquete x2, paquete x4) de "caja" (cuántas unidades trae una caja).
// Antes, para llenar "Und/caja" había que marcar el producto como presentación "Caja": ahora la caja es un dato aparte.
//
//   node scripts/migraciones/presentacion-base.cjs            -> SIMULA y muestra qué cambiaría (no toca nada)
//   node scripts/migraciones/presentacion-base.cjs --aplicar  -> guarda un respaldo en "ProductosRespaldoPresentacion" y aplica
//   node scripts/migraciones/presentacion-base.cjs --revertir -> devuelve los productos respaldados a como estaban
//
// Reglas (acordadas con la administración):
//   · Guantes: la unidad es el PAR y la caja trae 50 pares (una "caja x100" eran 100 guantes sueltos = 50 pares).
//     Si el costo y el precio de la caja de guantes estaban por CAJA (costo >= $1 con 100 guantes), se pasan a por PAR:
//     stock x50, costo y precios / 50. Los guantes estériles ya estaban por par: solo cambian la presentación.
//   · Demás productos "caja" con costo por UNIDAD (jeringas, hojillas, electrodos...): pasan a presentación "unidad" y conservan
//     sus unidades por caja y por bulto.
//   · Demás productos "caja" con costo por CAJA (costo >= $1: curitas, mascarillas quirúrgicas, pañales...): pasan a "unidad",
//     donde la unidad ES esa caja/paquete (igual que las curitas Cx20). No se inventa un desglose: sin unidades por caja, y el bulto
//     queda en las cajas que ya traía. La administración puede re-basarlos a pieza si lo desea.
//   · Gasa con "sobre X 10" marcada como par: pasa a "unidad" (un sobre).
require('dotenv').config();
const db = require('../../models');

const APLICAR = process.argv.includes('--aplicar');
const REVERTIR = process.argv.includes('--revertir');
const PARES_POR_CAJA = 50;

const num = (v) => Number(v);
const redondear = (v, dec) => Number(v.toFixed(dec));

async function planear(q) {
    const [productos] = await q(`SELECT id, nombre, presentacion, "unidadesPorCaja" upc, "cajasPorBulto" cpb, "unidadesPorBulto" upb,
        "stockAlmacen" stock, "stockMinimo" minimo, "costoUsd" costo, precio6, precio7, "grupoEquivalenciaId" grupo
        FROM "Productos" WHERE presentacion = 'caja' OR (presentacion = 'par' AND nombre ILIKE '%sobre%') ORDER BY nombre`);
    const plan = [];
    for (const p of productos) {
        const upc = p.upc ? num(p.upc) : null;
        const cpb = p.cpb ? num(p.cpb) : null;
        const cambio = { id: p.id, nombre: p.nombre, antes: { ...p }, despues: {}, tipo: '' };
        if (p.presentacion === 'par') {
            cambio.tipo = 'sobre';
            cambio.despues = { presentacion: 'unidad', upc: null, cpb: null, upb: num(p.upb) || 1 };
        } else if (/guante/i.test(p.nombre)) {
            const porCaja = upc === 100 && num(p.costo) >= 1;
            const cajas = cpb || 1;
            cambio.tipo = porCaja ? 'guante re-basado (por caja -> por par)' : 'guante por par';
            cambio.despues = { presentacion: 'par', upc: PARES_POR_CAJA, cpb: cajas, upb: cajas * PARES_POR_CAJA };
            if (porCaja) {
                cambio.despues.stock = redondear(num(p.stock) * PARES_POR_CAJA, 2);
                cambio.despues.minimo = redondear(num(p.minimo) * PARES_POR_CAJA, 2);
                cambio.despues.costo = redondear(num(p.costo) / PARES_POR_CAJA, 5);
                cambio.despues.precio6 = redondear(num(p.precio6) / PARES_POR_CAJA, 3);
                cambio.despues.precio7 = redondear(num(p.precio7) / PARES_POR_CAJA, 3);
            }
        } else if (num(p.costo) >= 1) {
            cambio.tipo = 'costo por caja: la unidad es la caja/paquete';
            cambio.despues = { presentacion: 'unidad', upc: null, cpb: null, upb: cpb && cpb > 1 ? cpb : 1 };
        } else {
            cambio.tipo = 'costo por unidad';
            cambio.despues = { presentacion: 'unidad', upc, cpb, upb: num(p.upb) || 1 };
        }
        plan.push(cambio);
    }
    return plan;
}

(async () => {
    const q = (s, o) => db.sequelize.query(s, o);
    try {
        if (REVERTIR) {
            const [r] = await q(`SELECT COUNT(*)::int n FROM "ProductosRespaldoPresentacion"`);
            await q(`UPDATE "Productos" p SET presentacion = r.presentacion, "unidadesPorCaja" = r."unidadesPorCaja", "cajasPorBulto" = r."cajasPorBulto",
                "unidadesPorBulto" = r."unidadesPorBulto", "stockAlmacen" = r."stockAlmacen", "stockMinimo" = r."stockMinimo", "costoUsd" = r."costoUsd",
                precio6 = r.precio6, precio7 = r.precio7, "updatedAt" = NOW() FROM "ProductosRespaldoPresentacion" r WHERE r.id = p.id`);
            console.log(`Revertidos ${r[0].n} productos.`);
            return;
        }

        const plan = await planear(q);
        const porTipo = {};
        plan.forEach((c) => { porTipo[c.tipo] = (porTipo[c.tipo] || 0) + 1; });
        console.log(`Productos a cambiar: ${plan.length}`);
        console.table(porTipo);
        plan.filter((c) => c.tipo.startsWith('costo por caja') || c.tipo === 'sobre' || c.tipo.startsWith('guante re-basado')).slice(0, 60).forEach((c) => {
            const a = c.antes, d = c.despues;
            console.log(`${c.id} | ${c.nombre.trim()} | ${a.presentacion} upc=${a.upc} cpb=${a.cpb} upb=${a.upb} stock=${a.stock} costo=${a.costo} p6=${a.precio6} p7=${a.precio7}`
                + `\n     -> ${d.presentacion} upc=${d.upc} cpb=${d.cpb} upb=${d.upb} stock=${d.stock ?? a.stock} costo=${d.costo ?? a.costo} p6=${d.precio6 ?? a.precio6} p7=${d.precio7 ?? a.precio7}`);
        });

        // Los grupos de equivalencia suman el stock de sus miembros: no pueden mezclar productos re-basados con otros que no
        const rebasados = new Set(plan.filter((c) => c.tipo.startsWith('guante re-basado')).map((c) => c.id));
        const grupos = new Map();
        const [todosGrupo] = await q(`SELECT id, "grupoEquivalenciaId" g FROM "Productos" WHERE "grupoEquivalenciaId" IS NOT NULL AND (nombre ILIKE '%guante%')`);
        todosGrupo.forEach((p) => { if (!grupos.has(p.g)) grupos.set(p.g, []); grupos.get(p.g).push(p.id); });
        const mezclados = [...grupos.entries()].filter(([, ids]) => ids.some((i) => rebasados.has(i)) && ids.some((i) => !rebasados.has(i)));
        console.log(mezclados.length ? `ATENCIÓN: grupos que mezclan guantes re-basados con otros: ${JSON.stringify(mezclados)}` : 'Ningún grupo mezcla guantes re-basados con otros.');
        const [vd] = await q(`SELECT COUNT(*)::int n FROM "VentaDetalles" d JOIN "Productos" p ON p.id = d.\"productoId\" WHERE p.id IN (${plan.map((c) => c.id).join(',') || 0})`);
        console.log(`Renglones de ventas históricas sobre estos productos (no se modifican): ${vd[0].n}`);

        if (!APLICAR) { console.log('\nSIMULACIÓN: no se cambió nada. Ejecuta con --aplicar para guardar el respaldo y aplicar.'); return; }

        await db.sequelize.transaction(async (transaction) => {
            await q(`CREATE TABLE IF NOT EXISTS "ProductosRespaldoPresentacion" (
                id INTEGER PRIMARY KEY, presentacion TEXT, "unidadesPorCaja" INTEGER, "cajasPorBulto" INTEGER, "unidadesPorBulto" INTEGER,
                "stockAlmacen" NUMERIC, "stockMinimo" NUMERIC, "costoUsd" NUMERIC, precio6 NUMERIC, precio7 NUMERIC, "respaldadoAt" TIMESTAMP DEFAULT NOW())`, { transaction });
            for (const c of plan) {
                const a = c.antes, d = c.despues;
                await q(`INSERT INTO "ProductosRespaldoPresentacion" (id, presentacion, "unidadesPorCaja", "cajasPorBulto", "unidadesPorBulto", "stockAlmacen", "stockMinimo", "costoUsd", precio6, precio7)
                    VALUES (:id, :pres, :upc, :cpb, :upb, :stock, :minimo, :costo, :p6, :p7) ON CONFLICT (id) DO NOTHING`,
                    { transaction, replacements: { id: a.id, pres: a.presentacion, upc: a.upc, cpb: a.cpb, upb: a.upb, stock: a.stock, minimo: a.minimo, costo: a.costo, p6: a.precio6, p7: a.precio7 } });
                await q(`UPDATE "Productos" SET presentacion = :pres, "unidadesPorCaja" = :upc, "cajasPorBulto" = :cpb, "unidadesPorBulto" = :upb,
                    "stockAlmacen" = :stock, "stockMinimo" = :minimo, "costoUsd" = :costo, precio6 = :p6, precio7 = :p7, "updatedAt" = NOW() WHERE id = :id`,
                    { transaction, replacements: {
                        id: a.id, pres: d.presentacion, upc: d.upc, cpb: d.cpb, upb: d.upb,
                        stock: d.stock ?? a.stock, minimo: d.minimo ?? a.minimo, costo: d.costo ?? a.costo, p6: d.precio6 ?? a.precio6, p7: d.precio7 ?? a.precio7,
                    } });
            }
        });
        console.log(`\nAplicado a ${plan.length} productos. Respaldo en "ProductosRespaldoPresentacion" (para deshacer: --revertir).`);
    } finally {
        await db.sequelize.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
