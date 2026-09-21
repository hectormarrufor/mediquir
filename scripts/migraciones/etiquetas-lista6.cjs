// Etiquetas de búsqueda para los productos cargados con lista6-carga.cjs (los clientes buscan con sus propias palabras:
// "tapabocas", "chata", "sacaleches", "sonda de foley"...). Igual que etiquetas-populares.cjs: solo AGREGA, singular y plural.
// Diccionario ampliado a las familias nuevas (sondas, suturas, ortopedia, bebés, aseo, equipos...) + palabras del nombre + categoría.
//   node scripts/migraciones/etiquetas-lista6.cjs             -> simula (rollback) y muestra el resultado
//   node scripts/migraciones/etiquetas-lista6.cjs --aplicar   -> guarda etiquetas y asignaciones
//   node scripts/migraciones/etiquetas-lista6.cjs --revertir  -> quita las asignaciones de estos productos (y las etiquetas que queden sin uso)
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const db = require('../../models');

const APLICAR = process.argv.includes('--aplicar');
const REVERTIR = process.argv.includes('--revertir');
class Simulacion extends Error {}

// Sin tildes ni ñ, minúsculas: así se comparan los nombres y así se guardan las etiquetas (el buscador ignora tildes)
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9/.\s]+/g, ' ').replace(/\s+/g, ' ').trim();

// [expresión sobre el nombre normalizado, etiquetas]
const REGLAS = [
    // ---- Sondas, tubos, catéteres, drenajes
    [/sonda foley/, ['sonda', 'foley', 'vesical', 'urinaria', 'cateter urinario', 'orina', 'urologia']],
    [/sonda nelaton/, ['sonda', 'nelaton', 'vesical', 'cateterismo', 'urinaria', 'orina']],
    [/sonda levin/, ['sonda', 'levin', 'nasogastrica', 'gastrica', 'alimentacion', 'lavado gastrico']],
    [/sonda alimentacion/, ['sonda', 'alimentacion', 'enteral', 'neonato', 'pediatrica']],
    [/sonda (de )?succion|sonda de aspiracion/, ['sonda', 'succion', 'aspiracion', 'aspirador', 'secreciones']],
    [/tubo endotraqueal/, ['tubo', 'endotraqueal', 'intubacion', 'via aerea', 'intubar', 'tet']],
    [/cateter (bilumen|trilumen|venoso central)|via central/, ['cateter', 'via central', 'venoso central', 'cvc', 'trilumen', 'bilumen']],
    [/cateter doble j|doble j/, ['cateter', 'doble j', 'ureteral', 'stent', 'urologia']],
    [/cateter toraxico|trocar/, ['cateter', 'toracico', 'drenaje', 'pleural', 'trocar']],
    [/pericraneal/, ['pericraneal', 'mariposa', 'palomita', 'venoclisis', 'canalizar']],
    [/drenaje|jackson|penrose/, ['drenaje', 'herida', 'cirugia', 'quirurgico']],
    [/traqueotomo|traqueostomia/, ['traqueotomia', 'traqueostomia', 'canula', 'via aerea']],
    [/sharp container|guardian|punzo/, ['guardian', 'punzocortantes', 'desecho', 'bioseguridad', 'contenedor']],
    [/pito plastico/, ['pito', 'silbato', 'urgencias']],
    [/trampa de lukens|lukens|luckens/, ['trampa', 'lukens', 'secreciones', 'muestra', 'recolector']],
    // ---- Laboratorio y diagnóstico
    [/lamina (cubre|porta)|portaobjeto|cubreobjeto/, ['laminas', 'portaobjetos', 'cubreobjetos', 'microscopio', 'laboratorio']],
    [/tubo de extraccion|vacutainer|recoleccion de sangre/, ['tubo', 'extraccion', 'vacutainer', 'sangre', 'laboratorio', 'muestra']],
    [/lanceta/, ['lanceta', 'glucosa', 'glucometro', 'diabetes', 'pinchazo', 'azucar']],
    [/tirilla|tiras reactivas/, ['tirillas', 'glucometro', 'glucosa', 'diabetes', 'azucar']],
    [/glucometro/, ['glucometro', 'glucosa', 'diabetes', 'azucar', 'diabetico']],
    [/tensiometro|presion arterial|esfigmo|baumanometro|brazalete p\/tensiometro/, ['tensiometro', 'tension', 'presion arterial', 'baumanometro', 'esfigmomanometro']],
    [/termometro/, ['termometro', 'temperatura', 'fiebre', 'calentura']],
    [/estetoscopio|fonendo|littmann|litmann/, ['estetoscopio', 'fonendoscopio', 'fonendo', 'auscultacion']],
    [/otoscopio|oftalmoscopio|orl/, ['otoscopio', 'oido', 'diagnostico', 'oftalmoscopio', 'orl']],
    [/oximetro|pulsioximetro/, ['oximetro', 'saturacion', 'oxigeno', 'pulso']],
    [/electrocardiografo|ecg|ekg/, ['electrocardiograma', 'electrocardiografo', 'ecg', 'ekg', 'corazon']],
    [/bascula|tallimetro|peso corporal|pesa/, ['bascula', 'peso', 'balanza', 'talla']],
    [/prueba de embarazo/, ['embarazo', 'gestacion', 'test', 'prueba', 'hcg']],
    [/mapa presion/, ['presion arterial', 'holter', 'monitoreo']],
    // ---- Cirugía y curación
    [/sutura|nylon|seda\b|prolene|vicryl|cromico|catgut|ethilon|polipropileno|poliglactina/, ['sutura', 'hilo', 'cirugia', 'puntos', 'aguja', 'quirurgico']],
    [/nylon|ethilon/, ['nylon', 'monofilamento', 'piel']],
    [/vicryl|poliglactina/, ['vicryl', 'absorbible', 'sintetica']],
    [/cromico|catgut/, ['cromico', 'catgut', 'absorbible']],
    [/prolene/, ['prolene', 'polipropileno', 'vascular']],
    [/aposito|tegaderm|xeroform|alginato|hidrogel|leukomed|leucomed|cutimed|cuticell|bactigras/, ['aposito', 'curacion', 'herida', 'cicatrizacion', 'ulcera', 'quemadura']],
    [/gasa|compresa|laparatomia|laparotomia/, ['gasa', 'compresa', 'curacion', 'herida']],
    [/malla/, ['malla', 'hernia', 'quirurgica', 'cirugia']],
    [/electrobisturi|placa de electro/, ['electrobisturi', 'cauterio', 'bisturi electrico']],
    [/sierra de giglie|instrumental|pinza|tijera|porta agujas|bisturi|kit de cirugia|kit de sutura|riñonera|ri.onera/, ['instrumental', 'quirurgico', 'cirugia']],
    [/solucion (fisiologica|cloruro|ringer|dextrosa|salina)|suero/, ['suero', 'solucion', 'fisiologica', 'salina', 'hidratacion', 'cloruro de sodio']],
    [/yodada|yodine|povidona|betadine|soluhex/, ['yodo', 'povidona', 'antiseptico', 'herida', 'desinfectante']],
    [/hibiclen|clorhexidina/, ['clorhexidina', 'antiseptico', 'desinfectante', 'lavado quirurgico']],
    [/pato fracturado|chata|urinal|orinal/, ['chata', 'pato', 'urinal', 'orinal', 'cama', 'encamado']],
    [/pera (rectal|vaginal)|ducha vaginal|enema/, ['pera', 'enema', 'lavado', 'irrigacion']],
    [/recolector de orina|colector|bolsa recolectora|suspensorio/, ['recolector', 'orina', 'urocultivo', 'bolsa colectora', 'incontinencia']],
    [/recolector de heces/, ['heces', 'coprocultivo', 'muestra', 'recolector']],
    [/oxigeno|bombona|flujometro|humidificador|ambu|resucitador|resuscitador|laringoscopio/, ['oxigeno', 'respiracion', 'emergencia', 'reanimacion']],
    [/ambu|resucitador|resucutador/, ['ambu', 'reanimacion', 'resucitador', 'bolsa de reanimacion']],
    [/preservativo|condon/, ['preservativo', 'condon', 'anticonceptivo', 'proteccion']],
    [/vagicover|especulo/, ['ginecologia', 'vaginal', 'especulo', 'papanicolau']],
    // ---- Ortopedia
    [/rodillera/, ['rodilla', 'rodillera', 'ortopedico', 'soporte', 'lesion', 'menisco']],
    [/tobillera/, ['tobillo', 'tobillera', 'ortopedico', 'esguince']],
    [/munequera|brace de mune/, ['muneca', 'munequera', 'tunel carpiano', 'ortopedico', 'esguince']],
    [/faja/, ['faja', 'lumbar', 'espalda', 'abdominal', 'soporte', 'ortopedico', 'postoperatoria']],
    [/collarin|cervical/, ['collarin', 'cervical', 'cuello', 'ortopedico', 'cervicalgia']],
    [/ferula/, ['ferula', 'inmovilizador', 'dedo', 'fractura', 'ortopedico']],
    [/bota walker|\bbota\b|zapato para yeso/, ['bota', 'walker', 'fractura', 'pie', 'ortopedica', 'yeso']],
    [/cabestrillo|inmovilizador|clavicula|hombro/, ['cabestrillo', 'hombro', 'brazo', 'inmovilizador', 'fractura']],
    [/media (de )?compresion|antiemb|media para diabetic|medias/, ['media', 'medias', 'compresion', 'varices', 'antiembolica', 'circulacion']],
    [/plantilla|talonera|juanete|metatars|puntera|smart feet/, ['plantilla', 'pie', 'podologia', 'ortopedica', 'calzado']],
    [/andadera|muleta|baston|axilera|tacos para/, ['movilidad', 'andadera', 'muleta', 'baston', 'caminador']],
    [/silla (de ruedas|poceta|sanitaria|neurologica)|coche ortopedico|coche/, ['silla', 'ruedas', 'movilidad', 'poceta', 'coche']],
    [/corrector de postura/, ['postura', 'espalda', 'enderezador', 'ortopedico']],
    [/venda|vendaje|hypafix|tensoplast|kinesiolog|neuromuscular|actimove/, ['venda', 'vendaje', 'cinta', 'kinesiologia', 'esguince']],
    [/yeso|gypsona|ortoban|guata/, ['yeso', 'fractura', 'escayola', 'inmovilizacion', 'guata']],
    [/kirschner|alambre/, ['alambre', 'kirschner', 'traumatologia', 'fijacion']],
    [/almohada|cojin|donut|antiescara/, ['almohada', 'cojin', 'escaras', 'comodidad']],
    // ---- Bebés y niños
    [/tetero|biberon/, ['biberon', 'tetero', 'mamadera', 'bebe', 'lactancia']],
    [/chupon|chupete|mordedor|sonajero|juguete|sensorial|xilofono|clicker|volante/, ['bebe', 'chupon', 'chupete', 'juguete', 'sonajero', 'estimulacion', 'infantil']],
    [/tira leche|extractor de leche|leche materna|sacaleche/, ['sacaleches', 'extractor', 'tiraleche', 'lactancia', 'leche materna', 'bomba']],
    [/aspirador nasal/, ['aspirador', 'nasal', 'bebe', 'mocos', 'congestion']],
    [/mochila|corral|cuna|termo plastico|set de alimentacion|plato/, ['bebe', 'nino', 'infantil', 'accesorios']],
    [/babero|cortaunas de bebe|set de cepillo/, ['bebe', 'cuidado', 'infantil']],
    [/johnson|chicco|melody|mimadito/, ['bebe', 'nino', 'infantil', 'cuidado de bebe']],
    // ---- Cuidado personal y hogar
    [/shampoo|champu|acondicionador|pantene|head and shoulders|h&s|savital/, ['shampoo', 'champu', 'cabello', 'pelo', 'cuidado personal']],
    [/jabon/, ['jabon', 'aseo', 'higiene', 'lavado de manos']],
    [/detergente|suavizante|limpiador|cloro|desinfectante|ajax|fabuloso|vanish|downy|ariel|vel rosita|multiuso|blancox|calidex/, ['limpieza', 'hogar', 'desinfectante', 'lavado', 'ropa']],
    [/desodorante|speed stick|rexona|gillette|nivea|dove/, ['desodorante', 'axila', 'aseo', 'higiene personal']],
    [/crema dental|pasta dental|colgate|cepillo dental|enjuague bucal|listerine/, ['dental', 'bucal', 'dientes', 'higiene bucal', 'boca']],
    [/toalla(s)? sanitaria|protectores diarios|stayfree|carefree|toalla clinica|post-?parto/, ['toalla sanitaria', 'menstruacion', 'higiene femenina', 'femenina', 'postparto']],
    [/papel sanitario|papel higienico|caricias/, ['papel higienico', 'higienico', 'sanitario', 'bano']],
    [/toallas humedas|toallitas|toallin|motas de algodon/, ['toallitas', 'humedas', 'limpieza', 'bebe', 'higiene']],
    [/bateria|pila\b|duracell|philips/, ['pila', 'bateria', 'aaa', 'aa']],
    [/arnica|rollon|roll-on|dencorub|mentol|vick|vaporub|pomada|unguento|artri|boro/, ['dolor muscular', 'analgesico', 'pomada', 'golpes', 'topico']],
    [/leche de magnesia|alka|acetaminofen|bacitracina|tamtun|solumar|wampole/, ['farmacia', 'medicamento', 'malestar']],
    [/cortauna|corta una|tijera|lima de una|pinza para (cabello|cejas)|cepillo|peine|secador|redecilla|quita esmalte/, ['belleza', 'cuidado personal', 'aseo']],
    [/lentes|gafas/, ['lentes', 'gafas', 'proteccion']],
    // ---- Rasgos generales
    [/\bped(iatric|-)|pediatric/, ['pediatrico', 'nino', 'infantil']],
    [/neonatal|infante/, ['neonatal', 'recien nacido', 'neonato']],
    [/\badulto/, ['adulto']],
    [/uniforme|filipina|\bbata\b|gorro|zapato|crocs|lenceria|sabana|enfermera/, ['uniforme', 'ropa', 'medico', 'enfermera', 'lenceria']],
    [/kit /, ['kit', 'set']],
];

const CATEGORIA = {
    Descartables: ['descartable'], 'Insumos Medicos': ['insumos'], Ortopedia: ['ortopedia', 'ortopedico'], 'Productos Farmaceuticos': ['farmacia', 'farmaceutico'],
    Ginecologia: ['ginecologia'], 'Equipos Medicos': ['equipos'], 'Bebes y Ninos': ['bebe', 'nino', 'infantil'], 'Cuidado Personal y Hogar': ['cuidado personal', 'hogar', 'aseo', 'higiene'],
};

// Formas de una etiqueta: singular y plural. Palabras invariables, siglas y marcas no se pluralizan.
const INVARIABLES = new Set(['ecg', 'ekg', 'cvc', 'tet', 'orl', 'hcg', 'aaa', 'aa', 'pap', 'diu', 'gel', 'hipo', 'latex', 'pampers', 'huggies', 'kn95', 'n95', 'tapabocas', 'cubrebocas', 'venoclisis', 'ambu', 'walker', 'foley', 'levin', 'nelaton', 'lukens', 'kirschner']);
const STOP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'para', 'con', 'sin', 'y', 'en', 'un', 'una', 'talla', 'tipo', 'promocion', 'unico', 'unica', 'venta', 'minima', 'linea', 'economica', 'ref', 'cada', 'pack', 'set', 'kit', 'x']);
function formas(palabra) {
    const t = palabra.trim();
    if (!t || /\d/.test(t) || t.length < 3) return t ? [t] : [];
    if (INVARIABLES.has(t)) return [t];
    if (/[aeiou]s$/.test(t) && t.length > 4 && !/(is|us|sis)$/.test(t)) return [t.slice(0, -1), t];
    if (/(l|r|n|d|z)es$/.test(t) && t.length > 5) return [t.slice(0, -2), t];
    if (t.endsWith('s') || t.endsWith('x')) return [t];
    if (/[aeiou]$/.test(t)) return [t, `${t}s`];
    return [t, `${t}es`];
}
// Una frase se guarda pegada ("bolsa de reanimacion" -> bolsadereanimacion) y también cada palabra importante suelta
function etiquetasDe(tag) {
    const palabras = norm(tag).split(' ').filter(Boolean);
    if (palabras.length === 1) return formas(palabras[0]);
    const sueltas = palabras.filter((w) => !STOP.has(w) && w.length >= 4).flatMap((w) => formas(w));
    return [...new Set([palabras.join(''), ...sueltas])];
}

const lotes = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, (i + 1) * n));

(async () => {
    try {
        await db.sequelize.transaction(async (transaction) => {
            const q = (sql, replacements) => db.sequelize.query(sql, { transaction, replacements });
            const [prods] = await q(`SELECT p.id, p.nombre, p."grupoEquivalenciaId" grupo, c.nombre categoria FROM "Productos" p JOIN "CargaLista6" l ON l.tipo = 'producto' AND l."refId" = p.id
                LEFT JOIN "Categorias" c ON c.id = p."categoriaId" ORDER BY p.id`);

            if (REVERTIR) {
                const ids = prods.map((p) => p.id);
                for (const t of lotes(ids, 500)) await q(`DELETE FROM "ProductoTags" WHERE "productoId" IN (:ids)`, { ids: t });
                const [{ rowCount }] = [await q(`DELETE FROM "Tags" WHERE id NOT IN (SELECT DISTINCT "tagId" FROM "ProductoTags")`)].map((r) => r[1] || {});
                console.log(`Asignaciones de ${ids.length} productos quitadas (etiquetas sin uso borradas: ${rowCount ?? '?'}).`);
                return;
            }

            const asignaciones = new Map();
            for (const p of prods) {
                const n = norm(p.nombre);
                const set = new Set();
                REGLAS.forEach(([re, tags]) => { if (re.test(n)) tags.forEach((t) => etiquetasDe(t).forEach((f) => set.add(f))); });
                // palabras del nombre (las que un cliente escribiría): singular y plural
                n.split(' ').filter((w) => w.length >= 4 && /^[a-z]+$/.test(w) && !STOP.has(w)).slice(0, 5).forEach((w) => formas(w).forEach((f) => set.add(f)));
                (CATEGORIA[p.categoria] || []).forEach((t) => etiquetasDe(t).forEach((f) => set.add(f)));
                asignaciones.set(p.id, set);
            }
            // Los productos de un mismo grupo de equivalencia comparten etiquetas
            const porGrupo = new Map();
            prods.forEach((p) => { if (p.grupo) (porGrupo.get(p.grupo) ?? porGrupo.set(p.grupo, new Set()).get(p.grupo)); });
            prods.forEach((p) => { if (p.grupo) asignaciones.get(p.id).forEach((t) => porGrupo.get(p.grupo).add(t)); });
            prods.forEach((p) => { if (p.grupo) porGrupo.get(p.grupo).forEach((t) => asignaciones.get(p.id).add(t)); });
            asignaciones.forEach((set, id) => { if (set.size > 22) asignaciones.set(id, new Set([...set].slice(0, 22))); });

            const todas = [...new Set([...asignaciones.values()].flatMap((s) => [...s]))];
            const [tagsBD] = await q(`SELECT id, nombre FROM "Tags"`);
            const idTag = new Map(tagsBD.map((t) => [t.nombre, t.id]));
            const nuevas = todas.filter((t) => !idTag.has(t));
            for (const trozo of lotes(nuevas, 300)) {
                const [r] = await q(`INSERT INTO "Tags" (nombre, "createdAt", "updatedAt") VALUES ${trozo.map((_, i) => `(:n${i}, NOW(), NOW())`).join(',')} ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id, nombre`,
                    Object.fromEntries(trozo.map((t, i) => [`n${i}`, t])));
                r.forEach((x) => idTag.set(x.nombre, x.id));
            }
            const pares = [];
            asignaciones.forEach((set, pid) => set.forEach((t) => pares.push([idTag.get(t), pid])));
            for (const trozo of lotes(pares, 800)) {
                await q(`INSERT INTO "ProductoTags" ("tagId", "productoId", "createdAt", "updatedAt") VALUES ${trozo.map(([t, p]) => `(${Number(t)}, ${Number(p)}, NOW(), NOW())`).join(',')} ON CONFLICT DO NOTHING`);
            }
            const pobres = prods.filter((p) => asignaciones.get(p.id).size <= 4);
            console.log(`Productos: ${prods.length} | etiquetas distintas: ${todas.length} (nuevas: ${nuevas.length}) | asignaciones: ${pares.length} | promedio por producto: ${(pares.length / prods.length).toFixed(1)}`);
            console.log(`Con pocas etiquetas (<=4): ${pobres.length}`);
            [...new Set(pobres.map((p) => p.nombre.trim()))].slice(0, 25).forEach((n) => console.log('   ' + n));
            ['Sonda Foley 2v Latex', 'Rodillera Estabilizadora', 'Tira Leche Manual', 'Pericraneal', 'Shampoo Pantene', 'Cromico 2-0', 'Pato Fracturado'].forEach((b) => {
                const p = prods.find((x) => x.nombre.toLowerCase().includes(b.toLowerCase()));
                if (p) console.log(`  ${p.nombre.trim()} -> ${[...asignaciones.get(p.id)].join(', ')}`);
            });
            if (!APLICAR) throw new Simulacion();
        });
        if (APLICAR || REVERTIR) console.log('\nListo.');
    } catch (e) {
        if (e instanceof Simulacion) console.log('\nSIMULACIÓN: rollback (no se cambió nada). Usa --aplicar.');
        else { console.error('Falló:', e.message); process.exitCode = 1; }
    } finally { await db.sequelize.close(); }
})();
