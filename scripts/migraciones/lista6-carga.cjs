// Carga de la "lista de precios 6" (septiembre 2026): productos nuevos con sus marcas, grupos de equivalencia y categorías.
// Los datos salen de datos/lista6-plan.json (generado y revisado a partir del PDF). Todo es ADITIVO: no modifica ningún producto existente.
//
//   node scripts/migraciones/lista6-carga.cjs            -> SIMULA dentro de una transacción y hace rollback (no queda nada)
//   node scripts/migraciones/lista6-carga.cjs --aplicar  -> crea todo y anota cada fila creada en la tabla "CargaLista6"
//   node scripts/migraciones/lista6-carga.cjs --revertir -> borra exactamente lo que creó esta carga (si nada de eso se ha usado todavía)
//
// Reglas de la carga (acordadas con la administración):
//   · Código: la primera marca lleva el código de la lista; las siguientes, código-01, código-02...
//   · Precio 6 = unitario. Costo y precio 7 quedan en 0 (se cargan después); stock 0. IVA 0 si el nombre trae (E).
//   · Producto con varias marcas -> grupo de equivalencia; producto único -> sin grupo (su foto es la del producto).
//   · Presentación: unidad (por defecto), par, paqxN; "caja x N" = unidadesPorCaja N.
// Los valores nuevos de presentación (paqx5, paqx10...) se agregan al tipo enumerado de la base (solo con --aplicar).
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const db = require('../../models');
const plan = require('./datos/lista6-plan.json');

const APLICAR = process.argv.includes('--aplicar');
const REVERTIR = process.argv.includes('--revertir');
const TABLA = 'CargaLista6';
const TROZO = 200;

class Simulacion extends Error {}
const lotes = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, (i + 1) * n));

async function asegurarEnum() {
    const [[t]] = await db.sequelize.query(`SELECT t.typname FROM pg_type t JOIN pg_attribute a ON a.atttypid = t.oid JOIN pg_class c ON c.oid = a.attrelid WHERE c.relname = 'Productos' AND a.attname = 'presentacion'`);
    if (!t || !/^[A-Za-z_]+$/.test(t.typname)) throw new Error('No se encontró el tipo de Productos.presentacion');
    for (const v of plan.paqNuevas) await db.sequelize.query(`ALTER TYPE "${t.typname}" ADD VALUE IF NOT EXISTS '${v}'`);
}

async function cargar() {
    if (APLICAR) await asegurarEnum();
    const nuevasPres = new Set(plan.paqNuevas);
    await db.sequelize.transaction(async (transaction) => {
        const q = (sql, replacements) => db.sequelize.query(sql, { transaction, replacements });
        await q(`CREATE TABLE IF NOT EXISTS "${TABLA}" (tipo VARCHAR(20) NOT NULL, "refId" INTEGER NOT NULL, "creadoEn" TIMESTAMP NOT NULL DEFAULT NOW())`);
        const [[{ n: previas }]] = await q(`SELECT count(*)::int n FROM "${TABLA}"`);
        if (previas > 0) throw new Error(`La carga ya se aplicó (${previas} filas en ${TABLA}). Usa --revertir antes de volver a cargarla.`);
        const registro = [];
        const anotar = (tipo, ids) => ids.forEach((id) => registro.push([tipo, id]));

        // 1) Categorías
        const catId = new Map();
        for (const nombre of plan.categoriasNuevas) {
            const [[e]] = await q(`SELECT id FROM "Categorias" WHERE nombre = :nombre`, { nombre });
            if (e) { catId.set(nombre, e.id); continue; }
            const [[c]] = await q(`INSERT INTO "Categorias" (nombre) VALUES (:nombre) RETURNING id`, { nombre });
            catId.set(nombre, c.id); anotar('categoria', [c.id]);
        }

        // 2) Marcas (las de los productos nuevos y las de las variantes)
        const marcaId = new Map();
        const nombresMarca = [...new Set([...plan.productos.map((p) => p.marca), ...plan.clones.map((c) => c.marca)])];
        const [existentes] = await q(`SELECT id, nombre FROM "Marcas"`);
        existentes.forEach((m) => marcaId.set(m.nombre, m.id));
        for (const nombre of nombresMarca) {
            if (marcaId.has(nombre)) continue;
            const [[m]] = await q(`INSERT INTO "Marcas" (nombre, "createdAt", "updatedAt") VALUES (:nombre, NOW(), NOW()) RETURNING id`, { nombre });
            marcaId.set(nombre, m.id); anotar('marca', [m.id]);
        }

        // 3) Grupos de equivalencia
        const grupoId = new Map();
        const [gExist] = await q(`SELECT id, nombre FROM "GruposEquivalencia"`);
        gExist.forEach((g) => grupoId.set(g.nombre, g.id));
        const gruposPlan = new Map();
        plan.productos.forEach((p) => { if (p.grupo && !gruposPlan.has(p.grupo)) gruposPlan.set(p.grupo, p.categoria); });
        for (const [nombre, cat] of gruposPlan) {
            if (grupoId.has(nombre)) continue;
            const [[g]] = await q(`INSERT INTO "GruposEquivalencia" (nombre, "stockMinimoGlobal", "categoriaId", "createdAt", "updatedAt") VALUES (:nombre, 0, :cat, NOW(), NOW()) RETURNING id`, { nombre, cat: catId.get(cat) });
            grupoId.set(nombre, g.id); anotar('grupo', [g.id]);
        }

        // 4) Productos nuevos
        const filas = plan.productos.map((p) => ({
            nombre: p.nombre, codigo: p.codigo, categoriaId: catId.get(p.categoria), marcaId: marcaId.get(p.marca), grupoEquivalenciaId: p.grupo ? grupoId.get(p.grupo) : null,
            // En la simulación las presentaciones nuevas aún no existen en la base: se validan como "unidad"
            presentacion: !APLICAR && nuevasPres.has(p.presentacion) ? 'unidad' : p.presentacion,
            unidadesPorCaja: p.unidadesPorCaja, cajasPorBulto: p.cajasPorBulto, unidadesPorBulto: p.unidadesPorBulto,
            precio6: p.precio6, precio7: 0, costoUsd: 0, porcentajeIva: p.iva, stockAlmacen: 0, stockMinimo: 0,
        }));
        const [ocupados] = await q(`SELECT codigo FROM "Productos" WHERE codigo IN (:codigos)`, { codigos: filas.map((f) => f.codigo).concat(plan.clones.map((c) => c.codigo)) });
        if (ocupados.length) throw new Error('Códigos que ya existen en la base: ' + ocupados.map((o) => o.codigo).join(', '));
        let creados = 0;
        for (const trozo of lotes(filas, TROZO)) {
            const r = await db.Producto.bulkCreate(trozo, { transaction, returning: true });
            anotar('producto', r.map((x) => x.id)); creados += r.length;
        }

        // 5) Variantes de marca de productos ya registrados (copian los datos de su hermano; stock 0)
        let clonados = 0;
        for (const c of plan.clones) {
            const [[h]] = await q(`SELECT * FROM "Productos" WHERE codigo = :codigo`, { codigo: c.clonDe });
            if (!h) throw new Error('No existe el producto base ' + c.clonDe);
            const r = await db.Producto.create({
                nombre: h.nombre, codigo: c.codigo, categoriaId: h.categoriaId, marcaId: marcaId.get(c.marca), grupoEquivalenciaId: h.grupoEquivalenciaId, presentacion: h.presentacion,
                unidadesPorCaja: h.unidadesPorCaja, cajasPorBulto: h.cajasPorBulto, unidadesPorBulto: h.unidadesPorBulto, porcentajeIva: h.porcentajeIva,
                precio6: h.precio6, precio7: h.precio7, costoUsd: h.costoUsd, stockAlmacen: 0, stockMinimo: 0,
            }, { transaction });
            anotar('producto', [r.id]); clonados++;
        }

        // 6) Registro para poder revertir
        for (const trozo of lotes(registro, 500)) {
            await q(`INSERT INTO "${TABLA}" (tipo, "refId") VALUES ${trozo.map((_, i) => `(:t${i}, :i${i})`).join(',')}`, Object.fromEntries(trozo.flatMap(([t, id], i) => [[`t${i}`, t], [`i${i}`, id]])));
        }
        const cuenta = (t) => registro.filter((x) => x[0] === t).length;
        console.log(`Categorías nuevas: ${cuenta('categoria')} | Marcas nuevas: ${cuenta('marca')} | Grupos nuevos: ${cuenta('grupo')} | Productos: ${creados} + ${clonados} variantes`);
        if (!APLICAR) throw new Simulacion();
    });
}

async function revertir() {
    await db.sequelize.transaction(async (transaction) => {
        const q = (sql, replacements) => db.sequelize.query(sql, { transaction, replacements });
        const [reg] = await q(`SELECT tipo, "refId" FROM "${TABLA}"`);
        const ids = (t) => reg.filter((r) => r.tipo === t).map((r) => r.refId);
        const prod = ids('producto');
        if (!prod.length && !reg.length) { console.log('No hay nada que revertir.'); return; }
        // Si algo de lo cargado ya se usó (ventas, entradas, salidas...), no se borra: se avisa
        const [fks] = await q(`SELECT tc.table_name t, kcu.column_name c FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
            JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'Productos' AND tc.table_name NOT IN ('ProductoTags')`);
        for (const fk of fks) {
            const [[{ n }]] = await q(`SELECT count(*)::int n FROM "${fk.t}" WHERE "${fk.c}" IN (:ids)`, { ids: prod.length ? prod : [0] });
            if (n > 0) throw new Error(`No se puede revertir: ${n} filas de ${fk.t} ya usan productos de esta carga.`);
        }
        if (prod.length) {
            await q(`DELETE FROM "ProductoTags" WHERE "productoId" IN (:ids)`, { ids: prod });
            await q(`DELETE FROM "Productos" WHERE id IN (:ids)`, { ids: prod });
        }
        const grupos = ids('grupo'); if (grupos.length) await q(`DELETE FROM "GruposEquivalencia" WHERE id IN (:ids) AND NOT EXISTS (SELECT 1 FROM "Productos" p WHERE p."grupoEquivalenciaId" = "GruposEquivalencia".id)`, { ids: grupos });
        const marcas = ids('marca'); if (marcas.length) await q(`DELETE FROM "Marcas" WHERE id IN (:ids) AND NOT EXISTS (SELECT 1 FROM "Productos" p WHERE p."marcaId" = "Marcas".id)`, { ids: marcas });
        const cats = ids('categoria'); if (cats.length) await q(`DELETE FROM "Categorias" WHERE id IN (:ids) AND NOT EXISTS (SELECT 1 FROM "Productos" p WHERE p."categoriaId" = "Categorias".id)`, { ids: cats });
        await q(`DELETE FROM "${TABLA}"`);
        console.log(`Revertido: ${prod.length} productos, ${grupos.length} grupos, ${marcas.length} marcas, ${cats.length} categorías (las imágenes subidas al Blob se borran aparte).`);
    });
}

(async () => {
    try {
        if (REVERTIR) await revertir(); else await cargar();
        if (APLICAR) console.log('\nAplicado. Para deshacer: node scripts/migraciones/lista6-carga.cjs --revertir');
    } catch (e) {
        if (e instanceof Simulacion) console.log('\nSIMULACIÓN: todo se pudo crear y se hizo rollback (no se cambió nada).');
        else { console.error('Falló:', e.message); process.exitCode = 1; }
    } finally { await db.sequelize.close(); }
})();
