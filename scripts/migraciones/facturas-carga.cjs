// Carga de las facturas de venta del sistema anterior (desde 2023) con sus renglones.
//   Fuentes (en datos/privado/, no van al repositorio):  facturas-origen.json (Excel "FACTURACION DESDE 2020")
//                                                        ventas-pdf.json     (PDF "ventas desde 2020", leído con lib/leer-ventas-pdf.py)
//                                                        bcv-dolarapi.json   (tasas; ya están en la base: se leen de ahí)
//   node scripts/migraciones/facturas-carga.cjs            -> SIMULACIÓN: resumen y casos dudosos (no escribe)
//   node scripts/migraciones/facturas-carga.cjs --probar   -> hace la carga completa y la revierte (no deja nada)
//   node scripts/migraciones/facturas-carga.cjs --aplicar  -> carga de verdad, en una transacción
// Reglas:
//   · DOCUMENTO = número de factura (F-146859), ORDEN = número de control (00-0122632). Solo desde DESDE (antes del 2023 hay reconversión).
//   · Todo en bolívares tal como se emitió (moneda BS) con la tasa BCV del día de la emisión.
//   · Los renglones salen del PDF: cantidad original = lo que quedó + lo devuelto. Cada uno se relaciona con el inventario por su código;
//     si no existe va como renglón "personalizado" (con su nombre). El precio es el que se cobró entonces, no el actual.
//   · NO se mueve stock: no se crean salidas de inventario y los renglones llevan afectaInventario = false.
//   · Clientes que no existen se crean con la identificación del PDF.
const fs = require('fs');
const path = require('path');
const PROBAR = process.argv.includes('--probar'); // hace toda la carga dentro de una transacción y la REVIERTE (valida el SQL con la base real)
const APLICAR = process.argv.includes('--aplicar') || PROBAR;
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');
const { randomUUID } = require('crypto');
const { formatearIdentificacion, claveIdentificacion, formatearNombre } = require('../../app/constants/identificacion.js');

const DESDE = '2023-01-01';
const DIR = path.join(__dirname, 'datos', 'privado');
const leer = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const norm = (s) => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/g, '');
const baseCodigo = (c) => String(c).replace(/-\d+$/, '');

// Identificación del PDF/Excel con los errores de digitación del sistema anterior: letra de más al final (J301455100M) y RIF sin
// letra (se asume J si el nombre es de una empresa).
const ES_EMPRESA = /\b(C\.?A\.?|S\.?A\.?|COMPA|FARMACIA|CLINICA|HOSPITAL|CENTRO|SERVICIOS|MULTITIENDA|INSTITUTO|CUERPO|ASOCIACION|FUNDACION|DISTRIBUIDORA|INVERSIONES)\b/i;
function identificar(rif, cod, nombre) {
    for (const crudo of [rif, cod]) {
        let t = String(crudo ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const sobrante = /^([A-Z]\d{9})[A-Z]+$/.exec(t);
        if (sobrante) t = sobrante[1];
        if (/^\d{9}$/.test(t) && ES_EMPRESA.test(nombre)) t = `J${t}`;
        const f = formatearIdentificacion(t);
        if (f.valor) return f.valor;
    }
    // Identificación imposible de formatear (RIF con dígitos de más, etc.): se guarda tal cual para poder encontrar al cliente y corregirlo
    const crudo = String(rif ?? cod ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (crudo.length >= 6) return /^\d+$/.test(crudo) ? `${ES_EMPRESA.test(nombre) ? 'J' : 'V'}-${crudo}` : crudo;
    return null;
}

// Marca qué renglones llevan IVA para que el IVA de la factura coincida con el del sistema anterior (16 % de la base gravada).
// Parte de lo que dice cada producto y, si no cuadra, prueba cambiar uno o dos renglones hasta acertar.
function ajustarExentos(lineas, ivaFactura) {
    const cuadra = () => Math.abs(r2(lineas.filter((l) => !l.exento).reduce((s, l) => s + l.subtotal, 0) * 0.16) - ivaFactura) <= 0.05;
    if (!lineas.length || cuadra()) return;
    if (ivaFactura === 0) { lineas.forEach((l) => { l.exento = true; }); return; }
    const todos = lineas.map((l) => l.exento); lineas.forEach((l) => { l.exento = false; }); if (cuadra()) return;
    lineas.forEach((l, i) => { l.exento = todos[i]; });
    const n = lineas.length;
    for (let i = 0; i < n; i++) { lineas[i].exento = !lineas[i].exento; if (cuadra()) return; lineas[i].exento = !lineas[i].exento; }
    if (n <= 60) for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        lineas[i].exento = !lineas[i].exento; lineas[j].exento = !lineas[j].exento; if (cuadra()) return;
        lineas[i].exento = !lineas[i].exento; lineas[j].exento = !lineas[j].exento;
    }
}

(async () => {
    const excel = leer('facturas-origen.json').filter((x) => x.DOCUMENTO && x.EMISION >= DESDE && x.ESTATUSDOC !== 3);
    const pdfPorDoc = new Map(leer('ventas-pdf.json').map((d) => [d.doc, d]));
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    const rep = { sinPdf: [], sinRenglones: [], cuadre: [], iva: [], cantFraccion: [], controlCorregido: [], controlRaro: [], controlRepetido: [], clienteSinId: [], yaExiste: 0, tasaFaltante: [] };

    // ---- tasas (ya cargadas en la base): la vigente a cada fecha = la última con fecha valor <= emisión
    const tasas = (await db.query(`SELECT fecha::text AS f, monto::float AS m FROM "BcvPreciosHistoricos" ORDER BY fecha`)).rows;
    const tasaDe = (fecha) => { let t = null; for (const x of tasas) { if (x.f <= fecha) t = x; else break; } return t; };

    // ---- clientes y productos existentes
    const clientes = new Map((await db.query(`SELECT id, identificacion FROM "Clientes"`)).rows.map((c) => [claveIdentificacion(c.identificacion), c.id]));
    const productos = (await db.query(`SELECT id, codigo, nombre, "porcentajeIva"::float AS iva FROM "Productos"`)).rows;
    const ivaDe = new Map(productos.map((q) => [q.id, q.iva]));
    const porBase = new Map();
    for (const p of productos) { const b = baseCodigo(p.codigo); (porBase.get(b) || porBase.set(b, []).get(b)).push(p); }
    const buscarProducto = (codigo, desc) => {
        const cands = porBase.get(codigo) || porBase.get(String(codigo).padStart(4, '0')) || null;
        if (!cands) return null;
        if (cands.length === 1) return cands[0];
        // Varias marcas del mismo producto base: gana la que más se parece al nombre de la factura (por palabras en común)
        const palabras = new Set(String(desc).toUpperCase().split(/[^A-Z0-9]+/).filter((w) => w.length > 2));
        let mejor = cands[0], puntaje = -1;
        for (const c of cands) {
            const pc = String(c.nombre).toUpperCase().split(/[^A-Z0-9]+/).filter((w) => w.length > 2);
            const s = pc.filter((w) => palabras.has(w)).length;
            if (s > puntaje) { mejor = c; puntaje = s; }
        }
        return mejor;
    };
    const existentes = new Set((await db.query(`SELECT "numeroDocumento" FROM "Ventas"`)).rows.map((r) => r.numeroDocumento));

    // ---- número de control: normalizar los mal escritos usando a sus vecinos (el control sube casi parejo con el número de factura)
    const bien = excel.filter((x) => /^00-\d{7}$/.test(String(x.ORDEN))).map((x) => ({ doc: x.DOCUMENTO, n: Number(String(x.ORDEN).slice(3)) })).sort((a, b) => a.doc - b.doc);
    const esperado = (doc) => {
        const vec = bien.filter((b) => Math.abs(b.doc - doc) <= 25).map((b) => b.n - b.doc).sort((a, b) => a - b);
        return vec.length ? doc + vec[Math.floor(vec.length / 2)] : null;
    };
    const normalizarControl = (x) => {
        const crudo = x.ORDEN == null ? null : String(x.ORDEN);
        if (!crudo) return { valor: null };
        if (/^00-\d{7}$/.test(crudo)) return { valor: crudo };
        const exp = esperado(x.DOCUMENTO);
        const digitos = crudo.replace(/^\s*00\s*-?/, '').replace(/\D/g, '');
        const candidatos = new Set();
        if (digitos) { candidatos.add(digitos); candidatos.add(digitos.padStart(7, '0')); for (let i = 0; i < digitos.length; i++) candidatos.add(digitos.slice(0, i) + digitos.slice(i + 1)); }
        let elegido = null;
        for (const c of candidatos) { const n = Number(c); if (exp !== null && /^\d{1,7}$/.test(c) && Math.abs(n - exp) <= 30 && (!elegido || Math.abs(n - exp) < Math.abs(elegido - exp))) elegido = n; }
        return elegido !== null ? { valor: `00-${String(elegido).padStart(7, '0')}`, corregido: crudo } : { valor: crudo, raro: true };
    };

    // ---- armar cada factura
    const plan = []; const clientesNuevos = new Map();
    for (const x of excel.sort((a, b) => a.DOCUMENTO - b.DOCUMENTO)) {
        const numeroDocumento = `F-${x.DOCUMENTO}`;
        if (existentes.has(numeroDocumento)) { rep.yaExiste++; continue; }
        const pdf = pdfPorDoc.get(x.DOCUMENTO);
        if (!pdf) { rep.sinPdf.push(x.DOCUMENTO); }
        const ctrl = normalizarControl(x);
        if (ctrl.corregido) rep.controlCorregido.push({ doc: x.DOCUMENTO, antes: ctrl.corregido, despues: ctrl.valor });
        if (ctrl.raro) rep.controlRaro.push({ doc: x.DOCUMENTO, control: ctrl.valor });
        if (!ctrl.valor) rep.controlRaro.push({ doc: x.DOCUMENTO, control: null });

        // cliente: identificación del PDF (RIF - nombre) o la del Excel
        const nombre = formatearNombre(pdf?.cliente || x.NOMBRECLI) || 'CLIENTE';
        let id = identificar(pdf?.rif, x.CODCLIENTE, nombre);
        if (!id) { rep.clienteSinId.push({ doc: x.DOCUMENTO, rif: pdf?.rif, cod: x.CODCLIENTE, nombre }); id = null; }
        let clienteId = id ? clientes.get(claveIdentificacion(id)) : null;
        if (id && !clienteId && !clientesNuevos.has(claveIdentificacion(id))) clientesNuevos.set(claveIdentificacion(id), { identificacion: id, nombre: nombre.slice(0, 255), fecha: x.EMISION });

        const tasa = tasaDe(x.EMISION);
        if (!tasa) rep.tasaFaltante.push(x.DOCUMENTO);

        // renglones
        const lineas = [];
        for (const it of pdf?.items || []) {
            const precio = it.precio || 0;
            const devueltaUnid = precio > 0 ? (it.devuelto || 0) / precio : 0;
            const cant = r2((it.cant || 0) + devueltaUnid);
            if (Math.abs(cant - Math.round(cant)) > 0.01) rep.cantFraccion.push({ doc: x.DOCUMENTO, desc: it.desc, cant });
            const prod = buscarProducto(it.codigo, it.desc);
            const exento = /\(E\)/i.test(it.desc);
            lineas.push({ codigo: it.codigo, desc: it.desc, productoId: prod?.id ?? null, cantidad: Math.round(cant), precio, subtotal: r2((it.total || 0) + (it.devuelto || 0)), exento, devuelto: it.devuelto || 0, neta: it.cant || 0 });
        }
        if (pdf && !lineas.length) rep.sinRenglones.push(x.DOCUMENTO);
        ajustarExentos(lineas, x.TOTIMPUEST);
        const suma = r2(lineas.reduce((s, l) => s + l.subtotal, 0));
        if (lineas.length && Math.abs(suma - x.TOTNETO) > 0.05) rep.cuadre.push({ doc: x.DOCUMENTO, renglones: suma, excel: x.TOTNETO });
        const baseIva = r2(lineas.filter((l) => !l.exento).reduce((s, l) => s + l.subtotal, 0));
        if (lineas.length && Math.abs(r2(baseIva * 0.16) - x.TOTIMPUEST) > 0.05) rep.iva.push({ doc: x.DOCUMENTO, calculado: r2(baseIva * 0.16), excel: x.TOTIMPUEST });

        const credito = x.TIPO === 2;
        plan.push({ x, numeroDocumento, control: ctrl.valor, id, clienteId, nombre, tasa: tasa?.m, lineas, credito, pagada: !credito || x.ESTATUSDOC === 2 });
    }

    // ---- controles repetidos
    const porControl = new Map();
    for (const p of plan) if (p.control) (porControl.get(p.control) || porControl.set(p.control, []).get(p.control)).push(p.x.DOCUMENTO);
    for (const [c, docs] of porControl) if (docs.length > 1) rep.controlRepetido.push({ control: c, docs });

    // ---- resumen
    const totRen = plan.reduce((s, p) => s + p.lineas.length, 0);
    const conProd = plan.reduce((s, p) => s + p.lineas.filter((l) => l.productoId).length, 0);
    const devueltas = plan.filter((p) => p.lineas.some((l) => l.devuelto > 0));
    const pend = plan.filter((p) => !p.pagada);
    console.log(`\nFacturas desde ${DESDE}: ${excel.length} en el Excel; ya cargadas antes: ${rep.yaExiste}; a cargar: ${plan.length}`);
    console.log(`Renglones: ${totRen} (${conProd} relacionados con inventario por código, ${totRen - conProd} personalizados)`);
    console.log(`Clientes: ${plan.filter((p) => p.clienteId).length} facturas con cliente existente, ${clientesNuevos.size} clientes nuevos por crear, ${rep.clienteSinId.length} facturas sin identificación válida`);
    console.log(`Facturas con devoluciones en el sistema anterior: ${devueltas.length} (Bs ${r2(devueltas.reduce((s, p) => s + p.lineas.reduce((a, l) => a + l.devuelto, 0), 0))})`);
    console.log(`A crédito con saldo pendiente (se crea su cuenta por cobrar): ${pend.length}`);
    console.log(`Sin PDF: ${rep.sinPdf.length} · sin renglones: ${rep.sinRenglones.length} · tasa faltante: ${rep.tasaFaltante.length}`);
    console.log(`Cantidades con fracción: ${rep.cantFraccion.length} · renglones que no suman el neto: ${rep.cuadre.length} · IVA que no cuadra con exentos (E): ${rep.iva.length}`);
    console.log(`Control: ${rep.controlCorregido.length} corregidos con sus vecinos, ${rep.controlRaro.length} raros o vacíos, ${rep.controlRepetido.length} repetidos`);
    fs.writeFileSync(path.join(DIR, 'excepciones-facturas.json'), JSON.stringify({ ...rep, clientesNuevos: [...clientesNuevos.values()].length }, null, 1));
    console.log('Detalle en datos/privado/excepciones-facturas.json');

    if (!APLICAR) { await db.end(); console.log('\nSimulación: no se escribió nada. Para cargar: --aplicar'); return; }

    // ================= CARGA =================
    try {
        await db.query('BEGIN');
        // clientes nuevos
        for (const c of clientesNuevos.values()) {
            const r = await db.query(`INSERT INTO "Clientes" (identificacion, nombre, "createdAt", "updatedAt") VALUES ($1, $2, $3::timestamptz, now()) ON CONFLICT (identificacion) DO UPDATE SET identificacion = EXCLUDED.identificacion RETURNING id`, [c.identificacion, c.nombre, `${c.fecha}T12:00:00-04:00`]);
            clientes.set(claveIdentificacion(c.identificacion), r.rows[0].id);
        }
        let nVentas = 0, nDet = 0, nCxc = 0;
        const filasVentas = []; const filasDet = []; const filasCxc = [];
        for (const p of plan) {
            const x = p.x; const ts = `${x.EMISION}T12:00:00-04:00`;
            const clienteId = p.clienteId || (p.id ? clientes.get(claveIdentificacion(p.id)) : null) || null;
            const mayor = /^[JGC]/.test(p.id || '');
            const ventaId = randomUUID();
            filasVentas.push([ventaId, clienteId, mayor ? 'MAYOR' : 'DETAL', p.numeroDocumento, p.control, p.credito ? 'Credito' : 'Contado', p.pagada ? 'Pagado' : 'Pendiente', `${x.VENCE}T12:00:00-04:00`,
                p.tasa, x.TOTNETO, x.TOTIMPUEST, x.TOTDESCUEN || 0, x.TOTALFINAL, ts]);
            for (const l of p.lineas) filasDet.push([randomUUID(), ventaId, l.productoId, !l.productoId, l.productoId ? null : l.desc.slice(0, 250), l.cantidad, l.precio, !l.exento, l.subtotal]);
            if (!p.pagada && clienteId) {
                const saldo = r2(x.TOTALFINAL - (x.TOTPAGOS || 0) - (x.RETENCION || 0));
                if (saldo > 0.01) filasCxc.push([clienteId, ventaId, x.TOTALFINAL, saldo, p.tasa, x.VENCE, ts]);
            }
        }
        // Inserción por lotes (miles de filas una por una tardarían una eternidad por la red)
        const porLotes = async (filas, tam, sqlLote) => {
            for (let i = 0; i < filas.length; i += tam) {
                const lote = filas.slice(i, i + tam);
                await db.query(...sqlLote(lote));
            }
        };
        const marcas = (lote, plantilla) => {
            const n = lote[0].length; const valores = [];
            const texto = lote.map((f, j) => { valores.push(...f); return plantilla.replace(/\$(\d+)/g, (_, k) => `$${j * n + Number(k)}`); }).join(', ');
            return [texto, valores];
        };
        await porLotes(filasVentas, 500, (lote) => {
            const [texto, valores] = marcas(lote, `($1,$2,$3::"enum_Ventas_tipoVenta",'FACTURA',$4,$5,$6::"enum_Ventas_condicionPago",$7::"enum_Ventas_statusPago",$8::timestamptz,'BS',$9,$10,$11,$12,$13,'Completado','pickup',$14::timestamptz,$14::timestamptz,$14::timestamptz)`);
            return [`INSERT INTO "Ventas" (id, "clienteId", "tipoVenta", "tipoDocumento", "numeroDocumento", "numeroControl", "condicionPago", "statusPago", "fechaVencimiento", moneda, "tasaCambio",
                subtotal, "montoIva", "totalDescuento", "totalFinal", "statusDespacho", "tipoEntrega", "fechaEmision", "createdAt", "updatedAt") VALUES ${texto}`, valores];
        });
        nVentas = filasVentas.length;
        await porLotes(filasDet, 1000, (lote) => {
            const [texto, valores] = marcas(lote, '($1,$2,$3,$4,$5,$6,$7,$8,$9,false)');
            return [`INSERT INTO "VentaDetalles" (id, "ventaId", "productoId", "isFicticio", "nombreFicticio", cantidad, "precioUnitario", "aplicaIva", subtotal, "afectaInventario") VALUES ${texto}`, valores];
        });
        nDet = filasDet.length;
        await porLotes(filasCxc, 500, (lote) => {
            const [texto, valores] = marcas(lote, `($1,$2,$3,$4,'BS',$5,$6,'Pendiente',$7::timestamptz,now())`);
            return [`INSERT INTO "CuentasPorCobrar" ("clienteId", "ventaId", "montoTotal", "saldoPendiente", moneda, "tasaCambio", "fechaVencimiento", estado, "createdAt", "updatedAt") VALUES ${texto}`, valores];
        });
        nCxc = filasCxc.length;
        // Más vendidos de la tienda: Productos.nroVentas = unidades vendidas netas (lo vendido menos lo devuelto, igual que lo mueven las notas de crédito)
        const netas = new Map();
        for (const p of plan) for (const l of p.lineas) if (l.productoId && l.neta > 0) netas.set(l.productoId, (netas.get(l.productoId) || 0) + Math.round(l.neta));
        for (const [pid, n] of netas) await db.query(`UPDATE "Productos" SET "nroVentas" = COALESCE("nroVentas", 0) + $1 WHERE id = $2`, [n, pid]);
        // numeración: el siguiente número de factura y de control salen de lo ya usado
        await db.query(`UPDATE correlativos SET "siguienteNumero" = GREATEST("siguienteNumero", $1), configurado = true WHERE prefijo = 'F'`, [Math.max(...plan.map((p) => p.x.DOCUMENTO)) + 1]);
        const maxCtrl = Math.max(...plan.map((p) => (p.control && /^00-\d{7}$/.test(p.control) ? Number(p.control.slice(3)) : 0)));
        await db.query(`UPDATE correlativos SET "siguienteNumero" = GREATEST("siguienteNumero", $1), configurado = true WHERE prefijo = 'CONTROL'`, [maxCtrl + 1]);
        if (PROBAR) {
            await db.query('ROLLBACK');
            console.log(`\nPRUEBA OK (revertida, no quedó nada): ${nVentas} facturas, ${nDet} renglones, ${nCxc} cuentas por cobrar, ${clientesNuevos.size} clientes nuevos, ${netas.size} productos con ventas.`);
            return;
        }
        await db.query('COMMIT');
        console.log(`${netas.size} productos con ventas.`);
        console.log(`\nCargado: ${nVentas} facturas, ${nDet} renglones, ${nCxc} cuentas por cobrar, ${clientesNuevos.size} clientes nuevos.`);
    } catch (e) {
        await db.query('ROLLBACK').catch(() => {});
        console.error('Falló la carga (se revirtió todo):', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
