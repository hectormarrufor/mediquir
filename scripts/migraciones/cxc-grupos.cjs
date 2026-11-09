// Grupos (pestañas) del libro de cobranza: cada Excel de la administradora es un grupo de clientes. La administradora puede crear grupos, renombrarlos, borrarlos y agregar o quitar clientes.
//   GruposCobranza        : id, nombre (único), orden
//   GrupoCobranzaClientes : grupoId + clienteId (un cliente puede estar en más de un grupo; sin grupo sale en la pestaña «Sin grupo»)
// Grupos iniciales (los 6 Excel): Vendedores · Clientes varios Joly · Maraplus · Clientes varios · Plan médico y Medik · Droguesi y Grupo Farmasi.
// Quién va en cada uno sale de los NÚMEROS DE DOCUMENTO de cada libro (datos/privado/cxc-excel.json → la factura o nota de entrega en el sistema → su cliente), no del nombre escrito en el Excel
// (que varía: «FCIA VENFARMA»…). En el de vendedores también cuentan las facturas enlazadas a las líneas de comisión, y las cuentas manuales cuyo nombre coincide con el del libro.
// Los grupos que ya existen NO se tocan (lo que la administradora haya editado se respeta): solo se siembran los que falten.
//   node scripts/migraciones/cxc-grupos.cjs            -> SIMULACIÓN (crea las tablas si faltan, pero no siembra)
//   node scripts/migraciones/cxc-grupos.cjs --aplicar  -> siembra los grupos que falten
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const APLICAR = process.argv.includes('--aplicar');
const L = JSON.parse(fs.readFileSync(path.join(__dirname, 'datos', 'privado', 'cxc-excel.json'), 'utf8'));
const GRUPOS = [
    ['CXC_VENDEDORES', 'Vendedores'],
    ['CXC_CLIENTES_VARIOS_JOLY', 'Clientes varios Joly'],
    ['CXC_MARAPLUS', 'Maraplus'],
    ['CXC_CLIENTES_VARIOS', 'Clientes varios'],
    ['CXC_PLAN_MEDICO_Y_MEDIK', 'Plan médico y Medik'],
    ['CXC_DROGUESI_Y_GRUPO_FARMASI', 'Droguesi y Grupo Farmasi'],
];
const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const sinAcentos = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const normNombre = (s) => sinAcentos(s).toUpperCase().replace(/\bFCIA\b/g, 'FARMACIA').replace(/\bC\.?\s?A\.?\b|\bS\.?\s?A\.?\b/g, ' ').replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

// número de documento del Excel -> clave del sistema ('F-146288' | 'NE-05666'), o null si no es una factura ni una nota de entrega
function claveDoc(t) {
    t = String(t ?? '').trim();
    if (/^\d{5,6}$/.test(t)) return `F-${t}`;
    if (/^\d{4}-\d{4}$/.test(t)) return `NE-${String(Number(t.slice(5))).padStart(5, '0')}`;
    if (/^\d{4}$/.test(t)) return `NE-${t.padStart(5, '0')}`;
    return null;
}

// documentos y nombres de cliente de cada libro (misma lectura de columnas que cxc-libros-carga.cjs)
function leerLibros() {
    const por = new Map(GRUPOS.map(([a]) => [a, { docs: new Set(), nombres: new Set() }]));
    const ultimo = new Map();
    for (const r of L) {
        const g = por.get(r.archivo); if (!g) continue;
        const v = r.v;
        if (r.archivo === 'CXC_VENDEDORES') {
            const k = claveDoc(v[2]); if (k) g.docs.add(k);
            if (typeof v[3] === 'string' && v[3].trim() && !/saldo|deuda|total|cliente|resumen|comision|fecha/i.test(v[3])) g.nombres.add(normNombre(v[3]));
            continue;
        }
        const mRet = /^Ret\s*(\d{5,6})/i.exec(String(v[0] ?? ''));
        if (mRet) { g.docs.add(`F-${mRet[1]}`); continue; }
        const esRet = /^RETENCION$/i.test(String(v[0] ?? '').trim());
        if (!esRet && !ES_FECHA.test(String(v[0]))) continue;
        let cli = String(v[2] ?? '').trim();
        const sk = r.archivo + r.hoja;
        if (/^ABONO$/i.test(cli)) cli = ultimo.get(sk) || ''; else if (cli) ultimo.set(sk, cli);
        if (cli) g.nombres.add(normNombre(cli));
        const doc = esRet ? null : claveDoc(v[1]); if (doc) g.docs.add(doc);
        const fact = /FACT\s*(\d{5,6})/i.exec(String(v[1] ?? ''))?.[1] || (esRet && /^\d{5,6}$/.test(String(v[1] ?? '').trim()) ? String(v[1]).trim() : null);
        if (fact) g.docs.add(`F-${fact}`);
    }
    return por;
}

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        await db.query(`CREATE TABLE IF NOT EXISTS "GruposCobranza" (
            id SERIAL PRIMARY KEY,
            nombre VARCHAR(80) NOT NULL UNIQUE,
            orden INTEGER NOT NULL DEFAULT 0,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now())`);
        await db.query(`CREATE TABLE IF NOT EXISTS "GrupoCobranzaClientes" (
            "grupoId" INTEGER NOT NULL REFERENCES "GruposCobranza"(id) ON DELETE CASCADE,
            "clienteId" INTEGER NOT NULL REFERENCES "Clientes"(id) ON DELETE CASCADE,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY ("grupoId", "clienteId"))`);
        await db.query(`CREATE INDEX IF NOT EXISTS "GrupoCobranzaClientes_cliente" ON "GrupoCobranzaClientes" ("clienteId")`);

        const existentes = new Set((await db.query('SELECT nombre FROM "GruposCobranza"')).rows.map((r) => r.nombre));
        const libros = leerLibros();
        const ventas = (await db.query(`SELECT "numeroDocumento" AS num, "clienteId" FROM "Ventas"`)).rows;
        const clientePorDoc = new Map(ventas.map((v) => [v.num, v.clienteId]));
        const manuales = (await db.query(`SELECT "clienteId", "clienteTexto" FROM "CuentasManuales" WHERE "clienteId" IS NOT NULL`)).rows;
        const nombres = new Map((await db.query('SELECT id, nombre FROM "Clientes"')).rows.map((c) => [c.id, c.nombre]));
        const vendedoresVentas = (await db.query(`SELECT DISTINCT v."clienteId" FROM "ComisionesVenta" cv JOIN "Ventas" v ON v.id = cv."ventaId"`)).rows.map((r) => r.clienteId);

        let orden = 0;
        for (const [archivo, nombre] of GRUPOS) {
            orden++;
            const lib = libros.get(archivo);
            const ids = new Set(); const sinResolver = [];
            for (const d of lib.docs) { const id = clientePorDoc.get(d); if (id) ids.add(id); else sinResolver.push(d); }
            for (const m of manuales) if (lib.nombres.has(normNombre(m.clienteTexto))) ids.add(m.clienteId);
            if (archivo === 'CXC_VENDEDORES') for (const id of vendedoresVentas) ids.add(id);
            console.log(`\n${nombre}: ${ids.size} cliente(s) (${lib.docs.size} documentos del libro; ${sinResolver.length} no están en el sistema${sinResolver.length ? ': ' + sinResolver.slice(0, 8).join(', ') + (sinResolver.length > 8 ? '…' : '') : ''})${existentes.has(nombre) ? '  [YA EXISTE: no se toca]' : ''}`);
            if (process.argv.includes('--detalle')) console.log('   ' + [...ids].map((i) => nombres.get(i)).sort().join(' | '));
            if (!APLICAR || existentes.has(nombre)) continue;
            const { rows: [g] } = await db.query(`INSERT INTO "GruposCobranza" (nombre, orden) VALUES ($1, $2) RETURNING id`, [nombre, orden]);
            for (const id of ids) await db.query(`INSERT INTO "GrupoCobranzaClientes" ("grupoId", "clienteId") VALUES ($1, $2) ON CONFLICT DO NOTHING`, [g.id, id]);
        }
        if (APLICAR) { await db.query('COMMIT'); console.log('\n✅ Grupos sembrados'); }
        else { await db.query('COMMIT'); console.log('\n🧪 SIMULACIÓN: tablas listas, sin sembrar grupos. Para sembrar: --aplicar (con --detalle ves los clientes de cada uno)'); }
    } catch (e) {
        await db.query('ROLLBACK').catch(() => {});
        console.error('❌', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
