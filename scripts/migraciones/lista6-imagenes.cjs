// Imágenes de lo cargado con lista6-carga.cjs: logos de marcas nuevas, fotos de grupos de equivalencia nuevos y de productos únicos (sin grupo).
// Busca en Google Imágenes (con tu Chrome), descarta lo que no sirve, comprime a ~100 kB (sharp), sube a Vercel Blob y guarda el nombre en la base.
// Cada imagen queda anotada en datos/lista6-imagenes-log.json (fuente, tamaño, puntaje de coincidencia) para revisarla o revertirla.
//
//   node scripts/migraciones/lista6-imagenes.cjs --tipo=marcas|grupos|productos [--limite=N] [--seco]   (--seco: solo guarda muestras locales, no sube ni cambia nada)
//   node scripts/migraciones/lista6-imagenes.cjs --revertir [--tipo=...]                                   (borra del Blob y deja imagen = NULL)
//   node scripts/migraciones/lista6-imagenes.cjs --rehacer=marcas:123,grupos:45                            (vuelve a buscar esos ids, con otra imagen)
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { put, del } = require('@vercel/blob');
const db = require('../../models');

const arg = (k) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : null; };
const SECO = process.argv.includes('--seco');
const REVERTIR = process.argv.includes('--revertir');
const TIPO = arg('tipo');
const LIMITE = Number(arg('limite')) || Infinity;
const REHACER = (arg('rehacer') || '').split(',').filter(Boolean);
const LOG = path.join(__dirname, 'datos', 'lista6-imagenes-log.json');
const MUESTRAS = path.join(__dirname, 'datos', 'lista6-muestras');
const OBJETIVO_KB = 100;
const MAXIMO_KB = 150;
const HILOS = 1;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const log = fs.existsSync(LOG) ? JSON.parse(fs.readFileSync(LOG, 'utf8')) : { items: {} };
const guardarLog = () => fs.writeFileSync(LOG, JSON.stringify(log, null, 1));
let contador = 0;
// Ritmo conservador: Google pone captcha si busca rápido. Cada vez que aparece uno, el ritmo se vuelve más lento (x1,7, hasta x8).
let ritmo = 1;
const pausa = (base, extra) => espera((base + Math.random() * extra) * ritmo);

// ---------- búsqueda: Google Imágenes en TU Chrome (ventana visible, perfil temporal) ----------
// Google solo entrega resultados con JavaScript, así que se abre Chrome y se lee la página ya renderizada.
// Si Google pide verificación ("tráfico inusual"), se espera a que la resuelvas en la ventana de Chrome.
const { lanzar } = require('./lib/chrome-cdp.cjs');
let navegador = null;

function parsearGoogle(html) {
    const out = [];
    const vistos = new Set();
    const re = /\["https:\/\/encrypted-tbn0\.gstatic\.com[^"]*",\d+,\d+\],\["(https?:\/\/[^"]+)",(\d+),(\d+)\]/g;
    let m;
    while ((m = re.exec(html))) {
        const image = JSON.parse(`"${m[1]}"`);
        if (vistos.has(image)) continue;
        vistos.add(image);
        const t = /"2003":\[null,"[^"]*","(https?:\/\/[^"]*)","((?:[^"\\]|\\.)*)"/.exec(html.slice(m.index, m.index + 3000));
        out.push({ image, height: +m[2], width: +m[3], url: t ? JSON.parse(`"${t[1]}"`) : '', title: t ? JSON.parse(`"${t[2]}"`) : '' });
    }
    return out;
}

async function buscar(consulta) {
    navegador ??= await lanzar(9333, true);
    await navegador.ir(`https://www.google.com/search?q=${encodeURIComponent(consulta)}&udm=2&hl=es`);
    let huboCaptcha = false;
    for (let i = 0; i < 180; i++) { // hasta 30 min esperando una verificación manual
        const info = await navegador.evaluar('location.href + " | " + document.title');
        if (!/\/sorry\/|tr[aá]fico inusual|unusual traffic/i.test(info || '')) break;
        if (i === 0) { huboCaptcha = true; ritmo = Math.min(ritmo * 1.5, 3); console.log(`… Google pide verificación: resuélvela en la ventana de Chrome (espero hasta 30 min). Ritmo ahora x${ritmo.toFixed(1)}`); }
        await espera(10000);
    }
    if (huboCaptcha) await espera(60000); // ya resuelto: descansa 1 min antes de seguir
    for (let i = 0; i < 12; i++) { // en vez de esperar a ciegas, revisa cada 0,5 s si ya aparecieron los resultados (máx. 6 s)
        if (await navegador.evaluar("document.documentElement.outerHTML.includes(\"encrypted-tbn0\")")) break;
        await espera(500);
    }
    return parsearGoogle((await navegador.evaluar('document.documentElement.outerHTML')) || '');
}

async function descargar(url) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 12000);
    try {
        const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'image/*' }, signal: ctl.signal });
        if (!r.ok || !/image\/(jpeg|png|webp|avif|gif)/.test(r.headers.get('content-type') || '')) return null;
        const b = Buffer.from(await r.arrayBuffer());
        return b.length > 4000 && b.length < 12e6 ? b : null;
    } catch { return null; } finally { clearTimeout(t); }
}

// ---------- compresión a ~100 kB ----------
async function comprimir(buf, lado) {
    let dim = lado;
    for (let vuelta = 0; vuelta < 4; vuelta++) {
        const base = sharp(buf, { failOn: 'none' }).rotate().flatten({ background: '#ffffff' }).resize({ width: dim, height: dim, fit: 'inside', withoutEnlargement: true });
        for (const q of [86, 78, 70, 62, 54, 46, 40]) {
            const out = await base.clone().jpeg({ quality: q, mozjpeg: true }).toBuffer();
            if (out.length <= OBJETIVO_KB * 1024) return out;
            if (q === 40 && out.length <= MAXIMO_KB * 1024) return out;
        }
        dim = Math.round(dim * 0.8);
    }
    return null;
}

// ---------- puntaje: cuántas palabras significativas de la consulta aparecen en el título ----------
const PARADA = new Set(['DE', 'DEL', 'LA', 'EL', 'CON', 'PARA', 'Y', 'EN', 'LOGO', 'PRODUCTO', 'INSUMO', 'MEDICO', 'X', 'CX', 'PROMOCION', 'E', 'REF']);
const puntaje = (consulta, titulo) => {
    const pal = norm(consulta).split(' ').filter((w) => w.length >= 2 && !PARADA.has(w));
    if (!pal.length) return 0;
    const t = ` ${norm(titulo)} `;
    return pal.filter((w) => t.includes(` ${w} `)).length / pal.length; // palabras COMPLETAS (HANEL no debe coincidir con CHANEL)
};

// Prueba varias consultas hasta que una devuelva una imagen que coincida bien; si ninguna, es mejor no poner imagen que una equivocada
async function conseguir(o) {
    for (const consulta of o.consultas) {
        const r = await conseguirCon({ ...o, consulta });
        if (r) return r;
        await pausa(4000, 3000); // entre consultas del mismo producto
    }
    return null;
}

// ¿Tiene contenido la imagen? Rechaza las casi en blanco o de un solo color
async function conContenido(buf) {
    const { channels } = await sharp(buf).stats();
    if (channels.reduce((s, c) => s + c.stdev, 0) / channels.length <= 12) return false;
    // al menos ~6% de la imagen debe ser "tinta" (no casi blanco): descarta dibujos fantasma y fondos vacíos
    const px = await sharp(buf).flatten({ background: '#ffffff' }).resize(64, 64, { fit: 'fill' }).greyscale().raw().toBuffer();
    return px.filter((v) => v < 235).length / px.length >= 0.06;
}
// Imágenes de relleno de las tiendas, fachadas, banners...
const BASURA = /placeholder|no[-_ ]?disponible|sin[-_ ]?imagen|no[-_ ]?image|noimage|imagen[-_ ]?no|coming[-_ ]?soon|sucursal|fachada|banner|farmacia[-_ ]?(?:santa|paz)|storefront/i;

async function conseguirCon({ consulta, claves, contexto, lado, esLogo, minimo }) {
    const res = await buscar(consulta);
    // El puntaje se mide contra las palabras del NOMBRE (`claves`), no contra la marca: así "Adhesivo Transpore Rospital" no acepta un kit de drenaje Rospital
    const cand = res.filter((r) => r.width >= (esLogo ? 150 : 300) && r.height >= (esLogo ? 100 : 300) && !/\.(svg|gif)(\?|$)/i.test(r.image) && r.width / r.height < 3.2 && r.height / r.width < 3.2)
        .map((r) => ({ ...r, pt: puntaje(claves || consulta, r.title + ' ' + r.url + ' ' + r.image) }))
        .filter((r) => r.pt >= minimo)
        .filter((r) => esLogo || !BASURA.test(`${r.image} ${r.title}`))
        .filter((r) => !contexto || contexto.some((c) => norm(`${r.title} ${r.url} ${r.image}`).includes(c)))
        .sort((a, b) => b.pt - a.pt || b.width * b.height - a.width * a.height)
        .slice(0, 6);
    for (const c of cand) {
        const buf = await descargar(c.image);
        if (!buf) continue;
        if (!(await conContenido(buf).catch(() => false))) continue;
        const out = await comprimir(buf, lado).catch(() => null);
        if (out) return { out, fuente: c.image, pagina: c.url, titulo: c.title, puntaje: Number(c.pt.toFixed(2)) };
    }
    return null;
}

// ---------- objetivos ----------
// Quita lo que no describe al producto: (E), (Promoción), (Venta mínima CX8), (Línea económica), Ref. XXX, CX50, PAQX10...
const limpiarNombre = (n) => n
    .replace(/\(\s*(E|promoci[oó]n|venta m[ií]nima[^)]*|l[ií]nea econ[oó]mica|oferta[^)]*)\s*\)/gi, ' ')
    .replace(/\bRef\.?\s*\S+/gi, ' ').replace(/\b(cx|paq ?x|caja x)\s*\d+\b/gi, ' ').replace(/\s+/g, ' ').trim();
const SIN_MARCA = new Set(['GENERICA', 'IMPORTADO', 'NACIONAL']);
const GENERICAS = ['MEDIC', 'SALUD', 'HEALTH', 'PHARM', 'FARMA', 'HOSPITAL', 'SURGIC', 'QUIRURG', 'DENTAL', 'ORTOP', 'LABORATORIO', 'INSUMOS'];
// Las 3 palabras más repetidas en los nombres de los productos de una marca
const contextoDe = (texto) => {
    const cuenta = {};
    norm(texto).split(' ').filter((w) => w.length >= 4 && !PARADA.has(w) && !/\d/.test(w)).forEach((w) => { cuenta[w] = (cuenta[w] || 0) + 1; });
    return Object.entries(cuenta).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([w]) => w);
};
// Consultas de respaldo, de más a menos específica
const variantes = (nombre, marca = '') => {
    const corto = nombre.split(' ').slice(0, 5).join(' ');
    return [...new Set([`${nombre} ${marca}`.trim(), nombre, `${corto} ${marca}`.trim(), `${corto} insumo médico`])];
};

async function objetivos(tipo) {
    const q = async (s) => (await db.sequelize.query(s))[0];
    if (tipo === 'marcas') {
        // Muchas marcas son poco conocidas y tienen homónimos (SELVA = financiera, DUO = Google Duo): el logo debe salir en una página
        // que también hable de lo que la marca vende (palabras de sus productos) o de temas médicos; si no, mejor sin imagen.
        const f = await q(`SELECT m.id, m.nombre, (SELECT string_agg(p.nombre, ' ') FROM "Productos" p WHERE p."marcaId" = m.id) productos
            FROM "Marcas" m JOIN "CargaLista6" c ON c.tipo = 'marca' AND c."refId" = m.id WHERE m.imagen IS NULL ORDER BY m.id`);
        return f.map((m) => {
            const ctx = contextoDe(m.productos || '');
            return { tipo, id: m.id, etiqueta: m.nombre, consultas: [`${m.nombre} logo ${ctx[0] || ''}`.trim(), `${m.nombre} logo`, `${m.nombre} marca ${ctx[0] || 'insumos médicos'}`],
                claves: m.nombre, contexto: [...ctx, ...GENERICAS], minimo: 1, lado: 500, esLogo: true, prefijo: 'marca' };
        });
    }
    if (tipo === 'grupos') {
        const f = await q(`SELECT g.id, g.nombre FROM "GruposEquivalencia" g JOIN "CargaLista6" c ON c.tipo = 'grupo' AND c."refId" = g.id WHERE g.imagen IS NULL ORDER BY g.id`);
        return f.map((g) => ({ tipo, id: g.id, etiqueta: g.nombre, consultas: variantes(limpiarNombre(g.nombre)), claves: limpiarNombre(g.nombre), minimo: 0.6, lado: 900, esLogo: false, prefijo: 'grupos' }));
    }
    const f = await q(`SELECT p.id, p.codigo, p.nombre, m.nombre marca FROM "Productos" p JOIN "CargaLista6" c ON c.tipo = 'producto' AND c."refId" = p.id
        LEFT JOIN "Marcas" m ON m.id = p."marcaId" WHERE p.imagen IS NULL AND p."grupoEquivalenciaId" IS NULL ORDER BY p.id`);
    return f.map((p) => ({ tipo, id: p.id, etiqueta: `${p.codigo} ${p.nombre}`, consultas: variantes(limpiarNombre(p.nombre), SIN_MARCA.has(p.marca) ? '' : p.marca), claves: limpiarNombre(p.nombre), minimo: 0.6, lado: 900, esLogo: false, prefijo: p.codigo }));
}

const TABLA = { marcas: 'Marcas', grupos: 'GruposEquivalencia', productos: 'Productos' };

async function procesar(o) {
    const clave = `${o.tipo}:${o.id}`;
    const r = await conseguir(o);
    if (!r) { log.items[clave] = { ...o, estado: 'sin-imagen' }; guardarLog(); console.log(`✗ ${o.etiqueta}  (sin imagen)`); return; }
    const nombre = `${o.prefijo}_${Date.now()}${contador++ % 10}.jpg`;
    if (SECO) {
        fs.mkdirSync(MUESTRAS, { recursive: true });
        fs.writeFileSync(path.join(MUESTRAS, `${o.tipo}-${o.id}.jpg`), r.out);
        console.log(`· ${o.etiqueta} -> ${(r.out.length / 1024).toFixed(0)} kB  pt=${r.puntaje}  ${r.fuente.slice(0, 80)}`);
        return;
    }
    const blob = await put(nombre, r.out, { access: 'public', contentType: 'image/jpeg', token: process.env.BLOB_READ_WRITE_TOKEN, addRandomSuffix: false });
    await db.sequelize.query(`UPDATE "${TABLA[o.tipo]}" SET imagen = :nombre, "updatedAt" = NOW() WHERE id = :id`, { replacements: { nombre, id: o.id } });
    // Queda pendiente de revisión en /superuser/inventario/imagenes-nuevas (si la tabla existe)
    await db.sequelize.query(`INSERT INTO "ImagenAuditoria" (tipo, "refId", estado, fuente, pagina, puntaje) VALUES (:tipo, :id, 'PENDIENTE', :fuente, :pagina, :puntaje)
        ON CONFLICT (tipo, "refId") DO UPDATE SET estado = 'PENDIENTE', fuente = :fuente, pagina = :pagina, puntaje = :puntaje`,
    { replacements: { tipo: { marcas: 'marca', grupos: 'grupo', productos: 'producto' }[o.tipo], id: o.id, fuente: r.fuente, pagina: r.pagina || null, puntaje: r.puntaje } }).catch(() => {});
    log.items[clave] = { tipo: o.tipo, id: o.id, etiqueta: o.etiqueta, consulta: o.consulta, estado: 'ok', imagen: nombre, url: blob.url, kb: Math.round(r.out.length / 1024), fuente: r.fuente, pagina: r.pagina, titulo: r.titulo, puntaje: r.puntaje };
    guardarLog();
    console.log(`✓ ${o.etiqueta} -> ${nombre} ${(r.out.length / 1024).toFixed(0)} kB pt=${r.puntaje}`);
}

async function correr(lista) {
    let i = 0;
    await Promise.all(Array.from({ length: HILOS }, async () => {
        while (i < lista.length) { const o = lista[i++]; try { await procesar(o); } catch (e) { console.log(`! ${o.etiqueta}: ${e.message}`); } await pausa(8000, 6000); } // entre un producto y el siguiente: 8 a 14 s (x ritmo)
    }));
}

async function revertir() {
    const items = Object.values(log.items).filter((x) => x.estado === 'ok' && (!TIPO || x.tipo === TIPO));
    for (const x of items) {
        try { await del(x.url, { token: process.env.BLOB_READ_WRITE_TOKEN }); } catch (e) { console.log('no se pudo borrar del Blob', x.imagen, e.message); }
        await db.sequelize.query(`UPDATE "${TABLA[x.tipo]}" SET imagen = NULL, "updatedAt" = NOW() WHERE id = :id AND imagen = :img`, { replacements: { id: x.id, img: x.imagen } });
        delete log.items[`${x.tipo}:${x.id}`];
    }
    guardarLog();
    console.log(`Revertidas ${items.length} imágenes.`);
}

(async () => {
    try {
        fs.mkdirSync(path.dirname(LOG), { recursive: true });
        if (REVERTIR) return await revertir();
        let lista = [];
        if (REHACER.length) {
            for (const r of REHACER) {
                const [t, id] = r.split(':');
                const previo = log.items[`${t}:${id}`];
                if (previo?.estado === 'ok') { try { await del(previo.url, { token: process.env.BLOB_READ_WRITE_TOKEN }); } catch { /* ya no está */ } }
                await db.sequelize.query(`UPDATE "${TABLA[t]}" SET imagen = NULL WHERE id = :id`, { replacements: { id } });
                delete log.items[`${t}:${id}`];
                lista.push(...(await objetivos(t)).filter((o) => String(o.id) === id));
            }
        } else {
            for (const t of (TIPO ? [TIPO] : ['marcas', 'grupos', 'productos'])) lista.push(...(await objetivos(t)).filter((o) => { const e = log.items[`${o.tipo}:${o.id}`]?.estado; return SECO || !(e === 'ok' || (e === 'sin-imagen' && !process.argv.includes('--reintentar'))); }));
        }
        lista = lista.slice(0, LIMITE);
        console.log(`A procesar: ${lista.length}${SECO ? ' (modo seco)' : ''}`);
        await correr(lista);
        const ok = Object.values(log.items).filter((x) => x.estado === 'ok').length;
        console.log(`\nListo. Imágenes registradas: ${ok}. Sin imagen: ${Object.values(log.items).filter((x) => x.estado === 'sin-imagen').length}.`);
    } finally { await navegador?.cerrar(); await db.sequelize.close(); }
})().catch((e) => { console.error('Falló:', e); process.exit(1); });
