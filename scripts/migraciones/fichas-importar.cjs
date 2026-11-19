// Importa las fichas de la tienda (descripcion, puntosClave, fichaTecnica, infoAdicional) a "Productos".
// Cada lote (datos/fichas/lote-NN.json) tiene un registro por TIPO de producto (ver datos/fichas/tipos.json: el mismo producto de varias marcas
// o medidas comparte tipo). Del registro se arma la ficha de cada producto del tipo; la medida o talla de cada uno se saca de su nombre.
// Solo llena productos que todavía NO tienen descripción (no pisa lo que alguien escribió a mano); con --forzar sí los reescribe.
//
//   node scripts/migraciones/fichas-importar.cjs lote-01.json            -> SIMULA y muestra ejemplos (no toca nada)
//   node scripts/migraciones/fichas-importar.cjs lote-01.json --aplicar  -> guarda
//
// Registro: { t: N, tipo: "Aguja hipodérmica", d: "descripción", u: ["viñeta", …], m: "material", e: 1|0 (estéril o no; omitir si no aplica),
//   uu: 1|0 (desechable o reutilizable; omitir si no aplica), ml: "Calibre y longitud" (cómo se llama la medida), mo: "modo de uso",
//   a: "advertencia propia", x: [["Etiqueta", "valor"]] filas extra de la ficha, nomedida: 1 (no mostrar medida), talla: 1 (la medida es talla) }
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const DIR = path.join(__dirname, 'datos', 'fichas');
const APLICAR = process.argv.includes('--aplicar');
const FORZAR = process.argv.includes('--forzar');
const archivos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!archivos.length) { console.error('Indica el lote, p. ej.: node scripts/migraciones/fichas-importar.cjs lote-01.json'); process.exit(1); }

const tipos = new Map(JSON.parse(fs.readFileSync(path.join(DIR, 'tipos.json'), 'utf8')).map((t) => [t.t, t]));

// Medida o talla que dice el nombre de ESTE producto ("Jeringa 3CC 21G X 1 1/2" -> "3CC · 21G X 1 1/2")
function medidaDe(nombre) {
    const limpio = String(nombre).replace(/\([^)]*\)/g, ' ').replace(/\b(paq|paquete|caja|cx|sobre)\s*x\s*\d+/gi, ' ');
    const trozos = limpio.match(/(?:n[º°o]\.?\s*|#\s*)?\d[\d.,/]*(?:\s+\d\/\d)?(?:\s*(?:x|×)\s*\d[\d.,/]*(?:\s+\d\/\d)?)*\s*(?:mm|cm|mts?|ml|cc|gr|g|fr|oz|yds?|lbs?|"|%)?/gi) || [];
    const v = [...new Set(trozos.map((t) => t.trim().replace(/\s+/g, ' ')).filter((t) => /\d/.test(t)))];
    return v.join(' · ');
}
function tallaDe(nombre) {
    const m = String(nombre).match(/\btalla\s+(xxs|xs|s|m|l|xl|xxl|xxxl|[0-9]+(?:\.[0-9])?)\b/i) || String(nombre).match(/\b(XXS|XS|XL|XXL|XXXL)\b/) || String(nombre).match(/\s(S|M|L)\s*$/);
    return m ? m[1].toUpperCase() : '';
}

const CONSERVACION = 'Almacenar en un lugar fresco y seco, protegido de la luz solar directa y de la humedad.';

function armar(rec, prod) {
    const filas = [];
    const fila = (etiqueta, valor) => { if (valor) filas.push({ etiqueta, valor: String(valor) }); };
    fila('Tipo de producto', rec.tipo);
    fila('Material', rec.m);
    if (!rec.nomedida) {
        if (rec.talla) fila('Talla', tallaDe(prod.nombre) || medidaDe(prod.nombre));
        else { const t = tallaDe(prod.nombre); fila(rec.ml || 'Medida', medidaDe(prod.nombre)); if (t && !rec.ml) fila('Talla', t); }
    }
    if (rec.e === 1) fila('Esterilidad', 'Estéril'); else if (rec.e === 0) fila('Esterilidad', 'No estéril');
    if (rec.uu === 1) fila('Uso', 'Desechable (un solo uso)'); else if (rec.uu === 0) fila('Uso', 'Reutilizable');
    for (const [e, v] of rec.x || []) fila(e, v);

    const puntos = [...(rec.u || [])];
    if (rec.e === 1) puntos.push('Se presenta estéril: no lo use si el empaque está abierto o dañado.');
    if (rec.uu === 1) puntos.push('Producto de un solo uso: deséchelo después de utilizarlo.');

    const adicional = [];
    if (rec.mo) adicional.push({ titulo: 'Modo de uso', texto: rec.mo });
    const adv = [rec.a, rec.uu === 1 ? 'No reutilizar ni reesterilizar.' : '', 'Ante cualquier duda sobre su uso, consulte a un profesional de la salud.'].filter(Boolean).join(' ');
    adicional.push({ titulo: 'Advertencias y precauciones', texto: adv });
    adicional.push({ titulo: 'Conservación', texto: rec.cons || CONSERVACION });

    return { descripcion: rec.d, puntosClave: puntos.length ? puntos : null, fichaTecnica: filas.length ? filas : null, infoAdicional: adicional };
}

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        const { rows } = await db.query('SELECT id, nombre, descripcion FROM "Productos"');
        const porId = new Map(rows.map((r) => [r.id, r]));
        let total = 0, saltados = 0, ejemplos = 0;
        await db.query('BEGIN');
        for (const archivo of archivos) {
            const recs = JSON.parse(fs.readFileSync(path.join(DIR, archivo), 'utf8'));
            for (const rec of recs) {
                const tipo = tipos.get(rec.t);
                if (!tipo) { console.warn(`  tipo ${rec.t}: no existe`); continue; }
                if (!rec.d || String(rec.d).length < 25) { console.warn(`  tipo ${rec.t}: sin descripción`); continue; }
                for (const id of tipo.ids) {
                    const prod = porId.get(id);
                    if (!prod) continue;
                    if (prod.descripcion && !FORZAR) { saltados++; continue; }
                    const f = armar(rec, prod);
                    total++;
                    if (!APLICAR && ejemplos < 6 && prod.id === tipo.ids[0]) { ejemplos++; console.log(`\n[${prod.id}] ${prod.nombre}\n${JSON.stringify(f, null, 1)}`); }
                    if (APLICAR) {
                        await db.query(
                            `UPDATE "Productos" SET "descripcion" = $1, "puntosClave" = $2::jsonb, "fichaTecnica" = $3::jsonb, "infoAdicional" = $4::jsonb, "fichaActualizadaAt" = now() WHERE id = $5`,
                            [f.descripcion, JSON.stringify(f.puntosClave), JSON.stringify(f.fichaTecnica), JSON.stringify(f.infoAdicional), id]
                        );
                    }
                }
            }
        }
        await db.query(APLICAR ? 'COMMIT' : 'ROLLBACK');
        console.log(`\n${APLICAR ? 'Guardadas' : 'Se guardarían'} ${total} fichas (${saltados} productos ya tenían ficha y se respetaron).`);
    } catch (e) {
        await db.query('ROLLBACK');
        console.error('Error, se revirtió todo:', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
