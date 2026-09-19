// Etiquetas "populares" para que los clientes encuentren los productos con las palabras que usan de verdad
// (inyectadora = jeringa, tapabocas = mascarilla quirúrgica, curitas = tiritas...).
// Cada etiqueta se guarda en singular Y en plural. Solo AGREGA etiquetas: no quita ni cambia las que ya existen.
//   node scripts/migraciones/etiquetas-populares.cjs            -> simula y muestra el resultado
//   node scripts/migraciones/etiquetas-populares.cjs --aplicar  -> guarda las etiquetas y las asigna
require('dotenv').config();
const db = require('../../models');

const APLICAR = process.argv.includes('--aplicar');

// Sin tildes, minúsculas: así se comparan los nombres y así se guardan las etiquetas (el buscador ignora tildes)
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9/.\s]+/g, ' ').replace(/\s+/g, ' ').trim();

// [expresión sobre el nombre normalizado, etiquetas (en singular)]
const REGLAS = [
    // ---- Inyección y punción
    [/\bjeringa/, ['jeringa', 'inyectadora', 'jeringuilla', 'inyeccion']],
    [/\bjeringa.*insulina|insulina/, ['insulina', 'diabetes', 'diabetico']],
    [/\bjeringa.*(60cc|luer)|tommy/, ['alimentacion', 'irrigacion', 'sonda']],
    [/\basepto/, ['irrigacion', 'lavado', 'pera']],
    [/\baguja/, ['aguja', 'inyeccion']],
    [/aguja hipodermica/, ['hipodermica', 'hipo', 'intramuscular', 'subcutanea']],
    [/aguja (espinal|epidural)|tru ?- ?cut/, ['punzocat', 'anestesia']],
    [/aguja espinal/, ['raqui', 'raquidea', 'espinal', 'anestesiaraquidea']],
    [/aguja epidural|cateter epidural/, ['peridural', 'epidural', 'anestesia']],
    [/aguja odontologica|anestesia odontologica/, ['dental', 'dentista', 'odontologo', 'odontologia', 'anestesia']],
    [/aguja tru/, ['biopsia', 'trucut', 'semiautomatica']],
    [/aguja para lapiz de insulina/, ['pen', 'lapicero', 'insulina', 'diabetes']],
    // ---- Protección
    [/\bguantes? de examen|\bguantes? de nitrilo/, ['guante', 'manopla', 'examen', 'exploracion', 'proteccion']],
    [/\bguantes? esteril|guante esteril/, ['guante', 'manopla', 'quirurgico', 'esteril', 'cirugia', 'proteccion']],
    [/\blatex\b/, ['latex']],
    [/nitrilo/, ['nitrilo']],
    [/mascarilla (quirurgica|de liga)|mascarilla kn95/, ['mascarilla', 'tapaboca', 'cubreboca', 'barbijo', 'mascara', 'proteccion', 'facial']],
    [/kn95/, ['n95', 'respirador', 'kn95']],
    [/mascarilla (con reservorio|p\/oxigeno)|reservorio|venturi/, ['mascarilla', 'oxigeno', 'respiracion', 'reservorio']],
    [/nebulizar|micronebulizador/, ['nebulizador', 'nebulizacion', 'asma', 'mascarilla']],
    [/aerochamber/, ['aerocamara', 'camara', 'inhalador', 'espaciador', 'asma']],
    [/canula nasal/, ['bigote', 'oxigeno', 'nasal', 'canula']],
    [/canula de mayo/, ['guedel', 'orofaringea', 'via aerea', 'canula']],
    [/yankauer/, ['succion', 'aspirador', 'aspiracion', 'canula']],
    [/mascara laringea/, ['laringea', 'intubacion', 'via aerea', 'mascara']],
    // ---- Cirugía
    [/hojilla de bisturi/, ['hojilla', 'bisturi', 'cuchilla', 'navaja', 'cirugia']],
    [/bisturi con mango/, ['bisturi', 'mango', 'cuchilla', 'cirugia']],
    [/cepillo quir/, ['cepillo', 'quirurgico', 'lavado', 'antisepsia', 'cirugia']],
    [/grapadora de piel/, ['grapadora', 'grapa', 'sutura', 'cirugia']],
    [/electrocauterio/, ['cauterio', 'electrobisturi', 'bisturi electrico', 'cirugia']],
    [/hemostatico|gelfoam|surgicel/, ['hemostatico', 'esponja', 'sangrado', 'cirugia']],
    [/liga clip/, ['clip', 'ligadura', 'cirugia']],
    [/cotonoide/, ['cotonoide', 'neurocirugia', 'algodon', 'cirugia']],
    [/cemento oseo/, ['traumatologia', 'ortopedia', 'protesis', 'cemento']],
    [/cincha vaginal/, ['incontinencia', 'malla', 'urologia', 'sling']],
    [/drenaje/, ['drenaje', 'sonda', 'herida']],
    [/jackson pratt|porto vac|penrose/, ['drenaje', 'cirugia']],
    [/toraxico|pleure/, ['torax', 'pleurevac', 'pulmon']],
    // ---- Curación
    [/^gasa|\bgasa\b/, ['gasa', 'compresa', 'aposito', 'curacion']],
    [/kerlix|quemados/, ['venda', 'quemadura', 'vendaje', 'curacion']],
    [/(?<!no )esteril/, ['esteril']], // "no esteril" NO lleva la etiqueta
    [/^algodon|\balgodon\b/, ['algodon', 'torunda', 'curacion']],
    [/aplicadores c\/algodon/, ['hisopo', 'copito', 'cotonete', 'aplicador']],
    [/adhesivo|micropore|durapore|transpore/, ['esparadrapo', 'cinta', 'tela', 'adhesivo', 'pega', 'tape']],
    [/hypafix/, ['fijador', 'esparadrapo', 'tela', 'aposito', 'adhesivo']],
    [/curitas/, ['curita', 'tirita', 'bandita', 'bandaid', 'adhesiva', 'herida']],
    [/goma latex/, ['torniquete', 'ligadura', 'banda', 'liga', 'goma']],
    [/guata/, ['guata', 'ortopedia', 'venda', 'yeso', 'vendaje', 'algodon laminado']],
    [/traccion/, ['traccion', 'ortopedia', 'fractura']],
    [/compresas friopack|bolsas frias para hielo/, ['frio', 'calor', 'compresa', 'hielo', 'golpe', 'bolsa de hielo']],
    // ---- Antisépticos y líquidos
    [/^alcohol|\balcohol\b/, ['alcohol', 'antiseptico', 'desinfectante', 'limpieza']],
    [/agua oxigenada/, ['peroxido', 'oxigenada', 'desinfectante', 'herida', 'antiseptico']],
    [/agua destilada/, ['destilada', 'agua', 'esterilizacion']],
    [/formol/, ['formalina', 'formaldehido', 'patologia', 'muestra']],
    [/gel de ultrasonido/, ['gel', 'ecografia', 'sonografia', 'ecosonograma', 'ultrasonido']],
    [/lubrix/, ['lubricante', 'gel', 'intimo']],
    [/alka-?seltzer/, ['antiacido', 'estomago', 'indigestion', 'efervescente']],
    [/amprolene|cinta testigo|papel resma para envolver/, ['esterilizacion', 'autoclave', 'esterilizar']],
    [/cinta testigo/, ['testigo', 'indicador', 'vapor']],
    [/calsodada|litholyme/, ['cal sodada', 'anestesia', 'absorbente']],
    // ---- Vías, sueros, sondas
    [/cateter iv|jelco/, ['cateter', 'yelco', 'jelco', 'abocath', 'via', 'intravenoso', 'venoso']],
    [/macrogotero|microgotero|equipo de/, ['equipo de suero', 'suero', 'venoclisis', 'goteo', 'normogotero']],
    [/buret/, ['bureta', 'buretrol', 'pediatrico', 'suero']],
    [/llave 3 vias/, ['llave', 'tres vias', 'trespasos', 'triple']],
    [/conector/, ['conector', 'empalme', 'union']],
    [/obturador/, ['tapon', 'obturador', 'heparina', 'bioseguro']],
    [/filtro/, ['filtro', 'bacteriano', 'quimioterapia', 'oncologia']],
    [/bomba elastomerica/, ['infusion', 'dolor', 'analgesia', 'bomba']],
    [/transfusion|bolsa de donacion/, ['transfusion', 'sangre', 'banco de sangre', 'donacion', 'hemoderivado']],
    [/bolsa de orina/, ['colector', 'urinario', 'orina', 'bolsa colectora', 'sonda']],
    [/bolsa (enteral|parenteral)/, ['nutricion', 'alimentacion', 'bolsa', 'sonda']],
    [/bolsa para enema|enema|fomentera de agua/, ['enema', 'lavativa', 'purga', 'lavado']],
    [/fomentera electrica/, ['calentador', 'fomentacion', 'calor', 'electrica']],
    [/ducha vaginal/, ['ducha', 'lavado', 'intimo']],
    [/bolsas? .*colostomia|base colostomia|pasta adhesiva/, ['ostomia', 'colostomia', 'ileostomia', 'estoma', 'bolsa']],
    [/bolsa de anestesia/, ['bolsa respiratoria', 'anestesia', 'reservorio']],
    [/bolsas para desechos/, ['basura', 'desecho', 'residuo', 'biologico', 'biosanitario', 'peligroso']],
    // ---- Respiratorio y monitoreo
    [/circuito/, ['circuito', 'ventilador', 'respirador', 'respiratorio', 'ventilacion']],
    [/cpap/, ['cpap', 'neonatal', 'respirador']],
    [/circuito de anestesia/, ['anestesia', 'maquina de anestesia']],
    [/espirometro|boquillas para espirometro/, ['espirometro', 'espirometria', 'ejercitador', 'inspirometro', 'pulmon']],
    [/manguera corrugada/, ['corrugada', 'manguera', 'tubo', 'oxigeno']],
    [/electrodo ecg/, ['electrodo', 'ecg', 'ekg', 'electrocardiograma', 'parche', 'monitor']],
    [/papel (p\/ecg|para ekg|upp)/, ['papel', 'ecg', 'ekg', 'electrocardiograma', 'termico']],
    [/papel upp/, ['ultrasonido', 'ecografo', 'impresora']],
    // ---- Ginecología y otros
    [/especulo/, ['especulo', 'ginecologia', 'papanicolau', 'vaginal']],
    [/citolog|ayre/, ['citologia', 'papanicolau', 'pap', 'ginecologia', 'cervical']],
    [/fijador celular/, ['citologia', 'papanicolau', 'fijador', 'muestra']],
    [/culturete/, ['hisopo', 'cultivo', 'muestra', 'transporte']],
    [/diu|dispositivo intrauterino/, ['diu', 'anticonceptivo', 'planificacion', 't de cobre', 'intrauterino']],
    [/bandeja puncion lumbar|puncion lumbar/, ['puncion', 'lumbar', 'raqui', 'kit', 'bandeja']],
    [/clamp umbilical/, ['pinza', 'cordon', 'umbilical', 'recien nacido', 'neonato']],
    [/brazalete de identificacion/, ['pulsera', 'manilla', 'identificacion', 'brazalete', 'pediatrico']],
    [/kit de admision/, ['admision', 'hospitalizacion', 'paciente', 'kit']],
    [/centro de cama|papel camilla/, ['sabana', 'empapador', 'protector', 'camilla', 'cama', 'absorbente', 'desechable']],
    [/baja lengua/, ['bajalengua', 'depresor', 'paleta', 'palillo', 'lengua']],
    [/corta unas/, ['cortauñas', 'tijera', 'unas', 'podologia']],
    [/corta pastillas/, ['partidor', 'pastilla', 'tableta']],
    [/equipo para rasurar/, ['afeitar', 'rasuradora', 'maquinilla', 'pelo', 'rasurar']],
    // ---- Pañales
    [/pa(n|ñ)al/, ['panal', 'pampers', 'incontinencia']],
    [/pa(n|ñ)al.*(adulto)/, ['adulto', 'geriatrico', 'incontinencia']],
    [/pa(n|ñ)al.*(ninos|huggies)/, ['bebe', 'nino', 'infantil', 'huggies']],
    // ---- Rasgos generales
    [/\bped(iatric|-)|pediatric/, ['pediatrico', 'nino', 'infantil']],
    [/neonatal/, ['neonatal', 'recien nacido', 'neonato']],
    [/\badulto/, ['adulto']],
    [/kit /, ['kit', 'set']],
];

// Formas de una etiqueta: singular y plural ("jeringa" -> jeringa, jeringas). Palabras invariables, siglas y marcas no se pluralizan.
const INVARIABLES = new Set(['ecg', 'ekg', 'cpap', 'diu', 'pap', 'kn95', 'n95', 'pen', 'gel', 'hipo', 'latex', 'pampers', 'huggies', 'bandaid', 'venoclisis', 'tapabocas', 'cubrebocas', 'cortauñas', 'ojo', 'mm']);
const STOP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'para', 'con', 'y', 'en', 'un', 'una']);
function formas(palabra) {
    const t = palabra.trim();
    if (!t || /d/.test(t) || t.length < 3) return t ? [t] : [];
    if (INVARIABLES.has(t)) return [t];
    // Ya viene en plural: se ofrece también el singular
    if (/[aeiou]s$/.test(t) && t.length > 4 && !/(is|us|sis)$/.test(t)) return [t.slice(0, -1), t];
    if (/(l|r|n|d|z)es$/.test(t) && t.length > 5) return [t.slice(0, -2), t];
    if (t.endsWith('s') || t.endsWith('x')) return [t];
    if (/[aeiou]$/.test(t)) return [t, t + 's'];
    return [t, t + 'es'];
}
// Una etiqueta puede ser una frase: se guarda pegada (como ya hace el formulario: "bolsatriple") y también cada palabra importante suelta
function etiquetasDe(tag) {
    const limpia = norm(tag);
    const palabras = limpia.split(' ').filter(Boolean);
    if (palabras.length === 1) return formas(palabras[0]);
    const suelta = palabras.filter((w) => !STOP.has(w) && w.length >= 4).flatMap((w) => formas(w));
    return [...new Set([palabras.join(''), ...suelta])];
}

(async () => {
    const [productos] = await db.sequelize.query('SELECT id, nombre FROM "Productos" ORDER BY id');
    const [existentes] = await db.sequelize.query('SELECT "productoId", "tagId" FROM "ProductoTags"');
    const [tagsBD] = await db.sequelize.query('SELECT id, nombre FROM "Tags"');
    const idTag = new Map(tagsBD.map((t) => [t.nombre, t.id]));
    const yaTiene = new Set(existentes.map((e) => `${e.productoId}:${e.tagId}`));

    const asignaciones = new Map(); // productoId -> Set(etiquetas)
    const sinReglas = [];
    for (const p of productos) {
        const n = norm(p.nombre);
        const set = new Set();
        REGLAS.forEach(([re, tags]) => { if (re.test(n)) tags.forEach((t) => etiquetasDe(t).forEach((f) => set.add(f))); });
        // La palabra principal del nombre (jeringa, aguja, algodon...) también, en singular y plural
        const cabeza = n.split(' ').find((w) => w.length > 3 && /^[a-z]+$/.test(w) && !['kit', 'para', 'tipo'].includes(w));
        if (cabeza) formas(cabeza).forEach((f) => set.add(f));
        if (set.size <= 2) sinReglas.push(p.nombre.trim());
        asignaciones.set(p.id, set);
    }

    const todas = new Set([...asignaciones.values()].flatMap((s) => [...s]));
    const nuevasEtiquetas = [...todas].filter((t) => !idTag.has(t));
    let nuevasAsignaciones = 0;
    asignaciones.forEach((set, id) => set.forEach((t) => { if (!idTag.has(t) || !yaTiene.has(`${id}:${idTag.get(t)}`)) nuevasAsignaciones++; }));

    console.log(`Productos: ${productos.length} | etiquetas distintas: ${todas.size} (nuevas: ${nuevasEtiquetas.length}) | asignaciones nuevas: ${nuevasAsignaciones}`);
    console.log(`Productos con pocas etiquetas (revisar): ${[...new Set(sinReglas)].length}`);
    [...new Set(sinReglas)].slice(0, 40).forEach((n) => console.log('   ' + n));
    const muestra = (buscar) => { const p = productos.find((x) => norm(x.nombre).includes(buscar)); if (p) console.log(`  ${p.nombre.trim()} -> ${[...asignaciones.get(p.id)].join(', ')}`); };
    ['jeringa 10cc', 'guantes de examen latex talla l', 'mascarilla quirurgica 4', 'aguja hipodermica 18g x 1 ', 'curitas adhesivas circulares', 'macrogotero', 'cateter iv jelco #14', 'panal para adulto talla l pqte x 6'].forEach(muestra);

    if (!APLICAR) { console.log('\nSIMULACIÓN: no se cambió nada. Usa --aplicar.'); await db.sequelize.close(); return; }

    await db.sequelize.transaction(async (transaction) => {
        for (const nombre of nuevasEtiquetas) {
            const [r] = await db.sequelize.query('INSERT INTO "Tags" (nombre, "createdAt", "updatedAt") VALUES (:n, NOW(), NOW()) ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id', { replacements: { n: nombre }, transaction });
            idTag.set(nombre, r[0].id);
        }
        for (const [productoId, set] of asignaciones) {
            for (const t of set) {
                await db.sequelize.query('INSERT INTO "ProductoTags" ("tagId", "productoId", "createdAt", "updatedAt") VALUES (:t, :p, NOW(), NOW()) ON CONFLICT DO NOTHING', { replacements: { t: idTag.get(t), p: productoId }, transaction });
            }
        }
    });
    console.log('\nAplicado.');
    await db.sequelize.close();
})().catch((e) => { console.error(e); process.exit(1); });
