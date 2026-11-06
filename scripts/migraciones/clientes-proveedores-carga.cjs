// Carga de clientes y proveedores desde las listas del sistema anterior (exportadas a JSON en datos/privado/, que no va al repositorio).
//   node scripts/migraciones/clientes-proveedores-carga.cjs            -> SIMULACIÓN: resumen y casos dudosos, no toca la base
//   node scripts/migraciones/clientes-proveedores-carga.cjs --aplicar  -> carga de verdad (necesita antes proveedores-contacto-credito.cjs)
// Reglas:
//   · La identificación sale de CODIGO/NRORIF/CEDULA (proveedores: CODIGO1/NRORIF) y se lleva al formato único (app/constants/identificacion.js).
//   · Dos filas con la misma identificación se juntan en una (la más reciente manda; lo que le falte se completa con la otra).
//   · Lo que ya existe en la base (por identificación) NO se toca.
//   · Clientes: no llevan retención de IVA ni persona de contacto. Proveedores: CODIGO 1 = contado (sin crédito), 3 = contribuyente 75 %, 4 = 100 %.
//   · FECHA pasa a createdAt.
const fs = require('fs');
const path = require('path');
if (process.argv.includes('--aplicar')) require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') }); // la simulación no necesita la base
const { formatearIdentificacion, formatearTelefono, formatearDireccion, formatearNombre, claveIdentificacion, rifTieneDigitoValido } = require('../../app/constants/identificacion.js');

const DIR = path.join(__dirname, 'datos', 'privado');
const APLICAR = process.argv.includes('--aplicar');
const leer = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));

// Primera identificación que se pueda formatear entre los candidatos; avisa si los candidatos no coinciden
function identificar(candidatos) {
    const buenos = [];
    for (const c of candidatos) {
        const f = formatearIdentificacion(c);
        if (f.valor && !buenos.some((b) => b.valor === f.valor)) buenos.push(f);
    }
    if (!buenos.length) return { valor: null, motivo: `ninguna válida: ${candidatos.filter((c) => c != null && c !== '').join(' | ') || 'vacío'}` };
    return { valor: buenos[0].valor, tipo: buenos[0].tipo, otras: buenos.slice(1).map((b) => b.valor) };
}

const dvOk = (valor) => {
    const m = /^([A-Z])-(\d{8})-(\d)$/.exec(valor);
    return m ? rifTieneDigitoValido(m[1], m[2], m[3]) : true; // las cédulas no tienen dígito verificador
};

// Junta las filas que resultaron con la misma identificación: la más reciente manda, y completa lo que le falte
function juntar(filas) {
    const porClave = new Map();
    for (const f of filas) {
        const k = claveIdentificacion(f.identificacion);
        if (!porClave.has(k)) porClave.set(k, []);
        porClave.get(k).push(f);
    }
    const unicas = []; const repetidas = [];
    for (const grupo of porClave.values()) {
        grupo.sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));
        const base = { ...grupo[0] };
        for (const otro of grupo.slice(1)) for (const k of Object.keys(otro)) if (base[k] == null && otro[k] != null) base[k] = otro[k];
        if (grupo.length > 1) repetidas.push({ identificacion: base.identificacion, nombres: grupo.map((g) => g.nombre) });
        unicas.push(base);
    }
    return { unicas, repetidas };
}

function planClientes() {
    const dudosos = []; const filas = [];
    for (const r of leer('clientes-origen.json')) {
        const id = identificar([r.CODIGO, r.NRORIF, r.CEDULA]);
        const nombre = formatearNombre(r.NOMBRE);
        if (!id.valor) { dudosos.push({ motivo: id.motivo, nombre: r.NOMBRE, codigo: r.CODIGO }); continue; }
        if (!nombre) { dudosos.push({ motivo: 'sin nombre', identificacion: id.valor }); continue; }
        if (id.otras.length) dudosos.push({ motivo: 'las columnas dan identificaciones distintas (se usó la primera)', nombre, usada: id.valor, otras: id.otras });
        if (!dvOk(id.valor)) dudosos.push({ motivo: 'RIF con dígito verificador que no cuadra (se carga igual)', nombre, identificacion: id.valor });
        const tel = formatearTelefono(r.TELEFONOS);
        if (r.TELEFONOS && !tel.valor) dudosos.push({ motivo: `teléfono descartado (${tel.motivo})`, nombre, telefono: r.TELEFONOS });
        filas.push({ identificacion: id.valor, nombre: nombre.slice(0, 255), telefono: tel.valor, direccion: formatearDireccion(r.DIRECCION), fecha: r.FECHA });
    }
    const { unicas, repetidas } = juntar(filas);
    return { filas: unicas, dudosos, repetidas, total: leer('clientes-origen.json').length };
}

function planProveedores() {
    const dudosos = []; const filas = [];
    const origen = leer('proveedores-origen.json');
    let basura = 0;
    for (const r of origen) {
        if (r.CODIGO1 == null && r.NOMBRE1 == null) { basura++; continue; }
        const id = identificar([r.CODIGO1, r.NRORIF]);
        const nombre = formatearNombre(r.NOMBRE1);
        if (!id.valor) { dudosos.push({ motivo: id.motivo, nombre: r.NOMBRE1 }); continue; }
        if (!nombre) { dudosos.push({ motivo: 'sin razón social', identificacion: id.valor }); continue; }
        if (id.otras.length) dudosos.push({ motivo: 'CODIGO1 y NRORIF dan identificaciones distintas (se usó CODIGO1)', nombre, usada: id.valor, otras: id.otras });
        if (!dvOk(id.valor)) dudosos.push({ motivo: 'RIF con dígito verificador que no cuadra (se carga igual)', nombre, identificacion: id.valor });
        const tel = formatearTelefono(r.TELEFONOS);
        if (r.TELEFONOS && !tel.valor) dudosos.push({ motivo: `teléfono descartado (${tel.motivo})`, nombre, telefono: r.TELEFONOS });
        const cond = Number(r.CODIGO); // 1 contado, 3 retención 75 %, 4 retención 100 %
        if (![1, 3, 4].includes(cond)) dudosos.push({ motivo: `condición ${r.CODIGO} desconocida (se trata como contado)`, nombre });
        filas.push({
            identificacion: id.valor, nombre: nombre.slice(0, 200), telefono: tel.valor, direccion: formatearDireccion(r.DIRECCION), fecha: r.FECHA,
            esContribuyenteEspecial: cond === 3 || cond === 4,
            retencionIvaPorDefecto: cond === 4 ? 100 : 75,
            maxCreditos: cond === 3 || cond === 4 ? 3 : 0, diasCredito: 7,
            contactoNombre: r.PERSCONT ? String(r.PERSCONT).trim() : null,
        });
    }
    const { unicas, repetidas } = juntar(filas);
    return { filas: unicas, dudosos, repetidas, total: origen.length, basura };
}

const fechaISO = (f) => (f ? `${f}T12:00:00-04:00` : null);

async function insertar(db, tabla, columnas, filas) {
    let nuevos = 0;
    for (let i = 0; i < filas.length; i += 200) {
        const lote = filas.slice(i, i + 200);
        const valores = []; const marcas = [];
        lote.forEach((f, j) => {
            const base = j * (columnas.length + 1);
            marcas.push(`(${columnas.map((_, k) => `$${base + k + 1}`).join(', ')}, COALESCE($${base + columnas.length + 1}::timestamptz, now()), now())`);
            valores.push(...columnas.map((c) => f[c] ?? null), fechaISO(f.fecha));
        });
        const sql = `INSERT INTO "${tabla}" (${columnas.map((c) => `"${c}"`).join(', ')}, "createdAt", "updatedAt") VALUES ${marcas.join(', ')} ON CONFLICT ("identificacion") DO NOTHING`;
        const r = await db.query(sql, valores);
        nuevos += r.rowCount;
    }
    return nuevos;
}

(async () => {
    const clientes = planClientes();
    const proveedores = planProveedores();

    const resumen = (n, p) => console.log(`\n${n}: ${p.total} filas en el Excel${p.basura ? `, ${p.basura} filas basura descartadas` : ''}\n  · ${p.filas.length} únicas para cargar\n  · ${p.repetidas.length} identificaciones repetidas juntadas en una\n  · ${p.dudosos.length} casos dudosos o descartados`);
    resumen('CLIENTES', clientes); resumen('PROVEEDORES', proveedores);
    const sinCargar = (p) => p.dudosos.filter((d) => !/se carga|se usó|descartado \(|desconocida/.test(d.motivo)).length;
    console.log(`\nNo se pueden cargar (sin identificación válida): ${sinCargar(clientes)} clientes, ${sinCargar(proveedores)} proveedores`);
    const enAmbos = proveedores.filas.filter((p) => clientes.filas.some((c) => claveIdentificacion(c.identificacion) === claveIdentificacion(p.identificacion)));
    console.log(`Proveedores que también son clientes (se cargan en las dos tablas): ${enAmbos.length}`);

    fs.writeFileSync(path.join(DIR, 'excepciones.json'), JSON.stringify({ clientes: { dudosos: clientes.dudosos, repetidas: clientes.repetidas }, proveedores: { dudosos: proveedores.dudosos, repetidas: proveedores.repetidas } }, null, 1));
    console.log('Detalle de los casos dudosos en scripts/migraciones/datos/privado/excepciones.json');

    if (!APLICAR) { console.log('\nSimulación: no se tocó la base. Para cargar: --aplicar'); return; }

    const { Client } = require('pg');
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        const col = await db.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'Proveedores' AND column_name = 'maxCreditos'`);
        if (!col.rowCount) throw new Error('Falta correr antes scripts/migraciones/proveedores-contacto-credito.cjs');
        await db.query('BEGIN');
        const yaC = await db.query(`SELECT count(*)::int n FROM "Clientes"`); const yaP = await db.query(`SELECT count(*)::int n FROM "Proveedores"`);
        // La identificación existente puede estar con otro formato (V12345678): se compara por su forma normalizada
        const existentes = async (tabla) => new Set((await db.query(`SELECT "identificacion" FROM "${tabla}"`)).rows.flatMap((r) => [claveIdentificacion(r.identificacion), claveIdentificacion(formatearIdentificacion(r.identificacion).valor)]));
        const exC = await existentes('Clientes'); const exP = await existentes('Proveedores');
        const nuevosC = clientes.filas.filter((f) => !exC.has(claveIdentificacion(f.identificacion)));
        const nuevosP = proveedores.filas.filter((f) => !exP.has(claveIdentificacion(f.identificacion)));
        const nC = await insertar(db, 'Clientes', ['identificacion', 'nombre', 'telefono', 'direccion'], nuevosC);
        const nP = await insertar(db, 'Proveedores', ['identificacion', 'nombre', 'telefono', 'direccion', 'esContribuyenteEspecial', 'retencionIvaPorDefecto', 'maxCreditos', 'diasCredito', 'contactoNombre'], nuevosP);
        await db.query('COMMIT');
        console.log(`\nCargado. Clientes: ${nC} nuevos (ya había ${yaC.rows[0].n}; ${clientes.filas.length - nuevosC.length} ya existían y no se tocaron).`);
        console.log(`Proveedores: ${nP} nuevos (ya había ${yaP.rows[0].n}; ${proveedores.filas.length - nuevosP.length} ya existían y no se tocaron).`);
    } catch (e) {
        await db.query('ROLLBACK').catch(() => {});
        console.error('Falló la carga (se revirtió todo):', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
