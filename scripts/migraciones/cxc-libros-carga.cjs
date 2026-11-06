// Carga de las cuentas por cobrar tal como las lleva la administradora en Excel (datos/privado/cxc-excel.json, volcado de los 5 libros):
//   · Libros por cliente (Droguesi y Grupo Farmasi, Plan Médico y Medik, Clientes Varios, Maraplus): cada factura (14xxxx) o nota de entrega antigua (0000-5666)
//     con sus ABONOS, notas de crédito y retenciones. Cada abono se aplica a la factura más antigua con saldo de ese cliente (o a la que dice "FACT 146288").
//     · Facturas que ya están en el sistema: pasan a por cobrar con el saldo real del Excel (la cuenta en dólares) y sus abonos quedan como abonos de esa factura.
//     · Notas de entrega que no existen: se crean (NE-05666, en dólares, sin IVA) con su cliente, su cuenta por cobrar y sus abonos.
//   · Hojas de vendedores (EDDY, MICHAEL, EDGAR JIMENEZ, ALEX VILORIA, JUAN GUTIERREZ): vendedores a comisión y una ComisionVenta por línea, ligada a su factura.
//   node scripts/migraciones/cxc-libros-carga.cjs            -> SIMULACIÓN (no escribe)
//   node scripts/migraciones/cxc-libros-carga.cjs --probar   -> carga completa dentro de una transacción que se REVIERTE
//   node scripts/migraciones/cxc-libros-carga.cjs --aplicar  -> carga de verdad
// No crea movimientos de caja (los ingresos de esas facturas ya se asentaron al emitirlas; los abonos no los duplican).
const fs = require('fs');
const path = require('path');
const PROBAR = process.argv.includes('--probar');
const APLICAR = process.argv.includes('--aplicar') || PROBAR;
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');
const { randomUUID } = require('crypto');

const DIR = path.join(__dirname, 'datos', 'privado');
const L = JSON.parse(fs.readFileSync(path.join(DIR, 'cxc-excel.json'), 'utf8'));
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const sinAcentos = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const normNombre = (s) => sinAcentos(s).toUpperCase().replace(/\bFCIA\b/g, 'FARMACIA').replace(/\bC\.?\s?A\.?\b|\bS\.?\s?A\.?\b|\bCOMPA(N|Ñ)IA ANONIMA\b/g, ' ').replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
const tokens = (s) => new Set(normNombre(s).split(' ').filter((t) => t.length > 2));
const jaccard = (a, b) => { const A = tokens(a), B = tokens(b); if (!A.size || !B.size) return 0; let i = 0; for (const t of A) if (B.has(t)) i++; return i / (A.size + B.size - i); };

// ---------- tipo de documento por el texto de la columna "NRO DE NOTA/FACT"
function clasificar(doc) {
    const t = String(doc ?? '').trim();
    if (/^\d{5,6}$/.test(t)) return { tipo: 'F', numero: Number(t) };
    if (/^\d{4}-\d{4}$/.test(t)) return { tipo: 'NE', numero: Number(t.slice(5)) };
    if (/^\d{4}$/.test(t)) return { tipo: 'NE', numero: Number(t) };
    if (/^RETENCION$/i.test(t)) return { tipo: 'PAGO', metodo: 'Retención IVA' };
    if (/^N\/C/i.test(t)) return { tipo: 'PAGO', metodo: 'Nota de crédito' };
    if (/^ABONO/i.test(t)) return { tipo: 'PAGO', metodo: /ZELLE/i.test(t) ? 'Zelle' : /CASH/i.test(t) ? 'Efectivo ($)' : 'Abono (sistema anterior)' };
    if (/^PAGO/i.test(t)) return { tipo: 'PAGO', metodo: 'Pago (sistema anterior)' };
    if (/DEUDA|PRESTAMO/i.test(t)) return { tipo: 'MANUAL' };
    return { tipo: 'OTRO' };
}
const textoObs = (v, desde = 4) => v.slice(desde).filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()).join(' · ');

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    const q = async (sql, p) => (await db.query(sql, p)).rows;
    try {
        const tasas = await q(`SELECT fecha::text AS f, monto::float AS m FROM "BcvPreciosHistoricos" ORDER BY fecha`);
        const tasaDe = (fecha) => { let t = null; for (const x of tasas) { if (x.f <= fecha) t = x.m; else break; } return t || 1; };
        const ventas = new Map((await q(`SELECT id, "numeroDocumento" AS num, "clienteId", "tasaCambio"::float AS tasa, moneda::text AS moneda, "totalFinal"::float AS total, "statusPago"::text AS pago,
            (COALESCE("fechaEmision", "createdAt") AT TIME ZONE 'America/Caracas')::date::text AS emision FROM "Ventas" WHERE "numeroDocumento" ~ '^(F|NE)-'`)).map((v) => [v.num, v]));
        const clientes = await q(`SELECT id, nombre, identificacion, "diasCredito" FROM "Clientes"`);
        const clientePorNombre = (nombre) => {
            const n = normNombre(nombre);
            const exacto = clientes.find((c) => normNombre(c.nombre) === n);
            if (exacto) return exacto;
            let mejor = null, pt = 0;
            for (const c of clientes) { const s = jaccard(nombre, c.nombre); if (s > pt) { mejor = c; pt = s; } }
            return pt >= 0.75 ? mejor : null;
        };
        const rep = { manuales: [], sinCliente: [], excedentes: [], sinFactura: [], dobles: [], pagoSinDestino: [], retSinFecha: 0 };

        // ===================== 1. LIBROS POR CLIENTE =====================
        const docs = new Map(); // clave 'F-146288' | 'NE-05666' -> documento
        const clave = (tipo, n) => (tipo === 'F' ? `F-${n}` : `NE-${String(n).padStart(5, '0')}`);
        const ordenPorCliente = new Map(); // cliente normalizado -> [claves en orden]
        const pagos = []; // { fecha, metodo, texto, monto, cliente, destino? }
        const ultimoCliente = new Map(); // por hoja: cliente de la última factura listada (los ABONO a veces no repiten el nombre)
        for (const r of L.filter((x) => x.archivo !== 'CXC_VENDEDORES')) {
            const v = r.v;
            const sheetKey = `${r.archivo}/${r.hoja}`;
            // "Ret 142397 | RETENCION | -27.65": retención de esa factura, sin cliente ni fecha en la fila
            const mRet = /^Ret\s*(\d{5,6})/i.exec(String(v[0] ?? ''));
            if (mRet) {
                const importe = v.slice(1).find((x) => typeof x === 'number');
                pagos.push({ fecha: null, metodo: 'Retención IVA', texto: `Ret ${mRet[1]}`, monto: typeof importe === 'number' ? Math.abs(importe) : null, cliente: docs.get(`F-${mRet[1]}`)?.cliente || ultimoCliente.get(sheetKey) || '', destino: `F-${mRet[1]}`, orden: docs.size, esRet: true, obs: '' });
                continue;
            }
            const esRet = /^RETENCION$/i.test(String(v[0] ?? '').trim());
            const fecha = esRet ? null : (ES_FECHA.test(String(v[0])) ? v[0] : null);
            if (!esRet && !fecha) continue;
            const docTxt = esRet ? 'RETENCION' : v[1];
            let cli = String(v[2] ?? '').trim();
            if (/^ABONO$/i.test(cli)) cli = ultimoCliente.get(sheetKey) || cli; // el cliente de un ABONO es el del bloque de arriba
            const monto = typeof v[3] === 'number' ? v[3] : null;
            if (!cli) continue;
            const c = esRet ? { tipo: 'PAGO', metodo: 'Retención IVA' } : clasificar(docTxt);
            if (c.tipo === 'F' || c.tipo === 'NE') {
                if (monto === null) continue;
                const k = clave(c.tipo, c.numero);
                if (docs.has(k)) { rep.dobles.push({ doc: k, archivo: r.archivo }); continue; }
                ultimoCliente.set(sheetKey, cli);
                docs.set(k, { k, tipo: c.tipo, numero: c.numero, fecha, cliente: cli, monto: r2(monto), obs: textoObs(v), pagos: [], abonado: 0, fuente: `${r.archivo}/${r.hoja}` });
                const nk = normNombre(cli); (ordenPorCliente.get(nk) || ordenPorCliente.set(nk, []).get(nk)).push(k);
            } else if (c.tipo === 'PAGO') {
                const destinoTxt = esRet ? String(v[1] ?? '') : String(docTxt);
                const fact = /FACT\s*(\d{5,6})/i.exec(destinoTxt)?.[1] || (esRet && /^\d{5,6}$/.test(destinoTxt.trim()) ? destinoTxt.trim() : null);
                const pagoNE = /^PAGO\s*(\d{3,5})/i.exec(destinoTxt)?.[1];
                const importe = monto === null ? null : Math.abs(monto);
                pagos.push({ fecha, metodo: c.metodo, texto: String(docTxt), monto: importe, cliente: cli, destino: fact ? `F-${fact}` : pagoNE ? clave('NE', Number(pagoNE)) : null, orden: docs.size, esRet, obs: textoObs(v) });
            } else if (c.tipo === 'MANUAL') rep.manuales.push({ fecha, doc: String(docTxt), cliente: cli, monto });
        }
        // aplicar pagos: a su factura si la nombra; si no, a la más antigua con saldo de ese cliente (solo entre las listadas ANTES del pago)
        for (const p of pagos) {
            if (p.monto === null) { if (p.esRet) rep.retSinFecha++; continue; }
            const lista = ordenPorCliente.get(normNombre(p.cliente)) || [];
            const candidatos = p.destino && docs.has(p.destino) ? [p.destino] : lista;
            let resto = p.monto;
            for (const k of candidatos) {
                const d = docs.get(k); const libre = r2(d.monto - d.abonado);
                if (libre <= 0.005) continue;
                const aplicar = Math.min(libre, resto);
                d.abonado = r2(d.abonado + aplicar); d.pagos.push({ ...p, monto: aplicar }); resto = r2(resto - aplicar);
                if (resto <= 0.005) break;
            }
            if (resto > 0.005) rep.excedentes.push({ cliente: p.cliente, texto: p.texto, monto: resto });
            if (!candidatos.length) rep.pagoSinDestino.push({ cliente: p.cliente, texto: p.texto, monto: p.monto });
        }

        // ===================== 2. HOJAS DE VENDEDORES =====================
        const vendedores = new Map(); // nombre -> { nombre, porcentaje, lineas: [] }
        for (const hoja of [...new Set(L.filter((x) => x.archivo === 'CXC_VENDEDORES' && !/BANCARIAS/i.test(x.hoja)).map((x) => x.hoja))]) {
            const filas = L.filter((x) => x.archivo === 'CXC_VENDEDORES' && x.hoja === hoja);
            const cab = filas.find((x) => String(x.v[2] ?? '').toUpperCase().includes('NRO DE FACT'))?.v || [];
            const pct = Number(/(\d+)\s*%/.exec(String(cab[6] || ''))?.[1]) || 5;
            const hayEstatusComision = /COMISION/i.test(String(cab[8] || ''));
            const nombre = hoja.replace(/^CXC\s+/i, '').replace(/\s+SEP\s+\d{2,4}\s*$/i, '').trim();
            const lineas = [];
            for (const r of filas) {
                const v = r.v; const c = clasificar(v[2]);
                if (c.tipo !== 'F' && c.tipo !== 'NE') continue;
                const concepto = /^ABONO/i.test(String(v[1])) ? 'ABONO' : /^N\/C/i.test(String(v[1])) ? 'NOTA' : 'FACTURA';
                const base = typeof v[5] === 'number' ? r2(v[5]) : null;
                const com = typeof v[6] === 'number' ? r2(v[6]) : null;
                const estCom = hayEstatusComision ? String(v[8] ?? '') : '';
                const obsTxt = [typeof v[5] === 'string' ? v[5] : '', hayEstatusComision ? '' : v[8], v[9], /FALTARON/i.test(estCom) ? estCom : ''].filter((x) => x && String(x).trim()).join(' · ');
                lineas.push({
                    concepto, fecha: ES_FECHA.test(String(v[0])) ? v[0] : null, vencimiento: concepto === 'FACTURA' && ES_FECHA.test(String(v[1])) ? v[1] : null,
                    doc: clave(c.tipo, c.numero), docTxt: String(v[2]), cliente: String(v[3] ?? '').trim(), monto: typeof v[4] === 'number' ? r2(v[4]) : null, base, com,
                    pct: base && com && base > 0 ? r2((com / base) * 100) : pct, estCliente: String(v[7] ?? '').trim() || null, pagada: /PAGAD/i.test(estCom), obs: obsTxt || null,
                });
            }
            vendedores.set(nombre, { nombre, porcentaje: pct, lineas });
            // las notas de entrega que solo están en la hoja del vendedor también se crean
            for (const l of lineas.filter((x) => x.concepto === 'FACTURA' && x.doc.startsWith('NE-') && x.monto !== null)) {
                if (!docs.has(l.doc) && !ventas.has(l.doc)) docs.set(l.doc, { k: l.doc, tipo: 'NE', numero: Number(l.doc.slice(3)), fecha: l.fecha || l.vencimiento || new Date().toISOString().slice(0, 10), cliente: l.cliente, monto: l.monto, obs: '', pagos: [], abonado: 0, fuente: `vendedor ${nombre}`, soloVendedor: true, venc: l.vencimiento });
            }
        }

        // Lo que NO figura en estos libros ya está cobrado (lo confirmó administración): cuentas abiertas de facturas migradas que no están en el Excel
        const enExcel = new Set([...docs.keys()]);
        const abiertas = (await q(`SELECT c.id AS cxc, v.id AS venta, v."numeroDocumento" AS num, c."saldoPendiente"::float AS saldo, c.moneda::text AS moneda, c."tasaCambio"::float AS tasa
            FROM "CuentasPorCobrar" c JOIN "Ventas" v ON v.id = c."ventaId" WHERE c.estado <> 'Pagado' AND v."numeroDocumento" ~ '^F-[0-9]+$' AND CAST(substring(v."numeroDocumento" from 3) AS bigint) <= 146865`)).filter((c) => !enExcel.has(c.num));
        const ventasPendientesSinCuenta = (await q(`SELECT v.id, v."numeroDocumento" AS num FROM "Ventas" v WHERE v."statusPago" = 'Pendiente' AND v."statusDespacho" <> 'Cancelado' AND v."numeroDocumento" ~ '^F-[0-9]+$'
            AND CAST(substring(v."numeroDocumento" from 3) AS bigint) <= 146865 AND NOT EXISTS (SELECT 1 FROM "CuentasPorCobrar" c WHERE c."ventaId" = v.id)`)).filter((v) => !enExcel.has(v.num));
        // Notas de entrega que SOLO están en la hoja de un vendedor: su estado sale de esa hoja (abonos de la hoja y "PAGADO" del cliente)
        for (const [nombreV, vv] of vendedores) {
            for (const l of vv.lineas) {
                const d = docs.get(l.doc); if (!d || !d.soloVendedor) continue;
                if (l.concepto === 'ABONO' && l.monto !== null && l.monto < 0) {
                    const libre = r2(d.monto - d.abonado); const aplicar = Math.min(libre, Math.abs(l.monto));
                    if (aplicar > 0.005) { d.abonado = r2(d.abonado + aplicar); d.pagos.push({ fecha: l.fecha, metodo: 'Abono (hoja de vendedor)', texto: `ABONO ${nombreV}`, monto: aplicar, cliente: l.cliente, esRet: false, obs: '' }); }
                } else if (l.concepto === 'FACTURA' && /PAGAD|COMPLETO/i.test(l.estCliente || '')) d.forzarPagado = true;
            }
        }
        // ===================== 3. PLAN =====================
        const facturasEnBD = [...docs.values()].filter((d) => d.tipo === 'F' && ventas.has(d.k));
        const sinFactura = [...docs.values()].filter((d) => d.tipo === 'F' && !ventas.has(d.k));
        const neNuevas = [...docs.values()].filter((d) => d.tipo === 'NE' && !ventas.has(d.k));
        for (const d of sinFactura) rep.sinFactura.push({ doc: d.k, cliente: d.cliente, monto: d.monto });
        const venc = new Map(); for (const [, vv] of vendedores) for (const l of vv.lineas) if (l.vencimiento) venc.set(l.doc, l.vencimiento);
        const dias = (f, n) => new Date(new Date(`${f}T12:00:00Z`).getTime() + n * 864e5).toISOString().slice(0, 10);
        const pendientes = [...docs.values()].filter((d) => (d.tipo === 'F' ? ventas.has(d.k) : true) && !d.forzarPagado && r2(d.monto - d.abonado) > 0.005 && d.monto > 0);
        const saldoTotal = r2(pendientes.reduce((s, d) => s + (d.monto - d.abonado), 0));
        const comisionesN = [...vendedores.values()].reduce((s, v) => s + v.lineas.length, 0);
        // clientes de las notas de entrega
        for (const d of neNuevas) { d.clienteDb = clientePorNombre(d.cliente); if (!d.clienteDb) rep.sinCliente.push({ doc: d.k, cliente: d.cliente }); }

        console.log(`\nLibros por cliente: ${docs.size} documentos (${facturasEnBD.length} facturas ya en el sistema, ${neNuevas.length} notas de entrega por crear, ${rep.sinFactura.length} facturas que no están en el sistema)`);
        console.log(`   pagos/abonos/N/C/retenciones: ${pagos.length} · aplicados a facturas · excedentes sin destino: ${rep.excedentes.length} · partidas manuales (DEUDA/PRESTAMO): ${rep.manuales.length}`);
        console.log(`   por cobrar tras aplicar los abonos: ${pendientes.length} documentos, USD ${saldoTotal.toLocaleString('en-US')}`);
        const distintosSinFicha = [...new Set(neNuevas.filter((d) => !d.clienteDb).map((d) => normNombre(d.cliente)))];
        console.log(`   clientes de notas de entrega sin ficha (se crean con RIF provisional SIN-RIF): ${distintosSinFicha.length} distintos`);
        const totalDocs = r2([...docs.values()].reduce((a, d) => a + d.monto, 0)); const totalPagos = r2(pagos.reduce((a, p) => a + (p.monto || 0), 0));
        console.log(`   cuadre: documentos USD ${totalDocs.toLocaleString('en-US')} - pagos USD ${totalPagos.toLocaleString('en-US')} = ${r2(totalDocs - totalPagos).toLocaleString('en-US')} (Excel neto de los 4 libros: 73,437)`);
        console.log(`Cuentas abiertas que no figuran en el Excel (ya cobradas, se cierran): ${abiertas.length} cuentas por cobrar y ${ventasPendientesSinCuenta.length} facturas pendientes sin cuenta`);
        console.log(`Vendedores a comisión: ${vendedores.size} (${[...vendedores.values()].map((v) => `${v.nombre} ${v.porcentaje}% · ${v.lineas.length} líneas`).join('; ')}); ${comisionesN} líneas de comisión`);
        const sinVenta = [...vendedores.values()].flatMap((v) => v.lineas).filter((l) => !ventas.has(l.doc) && !docs.has(l.doc));
        console.log(`   líneas de comisión cuya factura no está en el sistema: ${sinVenta.length}`);
        fs.writeFileSync(path.join(DIR, 'excepciones-cxc.json'), JSON.stringify({ ...rep, comisionesSinFactura: sinVenta.map((l) => ({ doc: l.doc, cliente: l.cliente, monto: l.monto })) }, null, 1));
        console.log('Detalle en datos/privado/excepciones-cxc.json');
        if (!APLICAR) { console.log('\nSimulación: no se escribió nada.'); return; }

        // ===================== 4. CARGA =====================
        await db.query('BEGIN');
        let nCxc = 0, nAbonos = 0, nNE = 0, nClientes = 0, nCom = 0;
        // clientes nuevos de las notas de entrega
        for (const d of neNuevas) {
            if (d.clienteDb) continue;
            const ident = `SIN-RIF-${normNombre(d.cliente).replace(/ /g, '').slice(0, 30)}`;
            const r = await db.query(`INSERT INTO "Clientes" (identificacion, nombre, "createdAt", "updatedAt") VALUES ($1,$2,$3::timestamptz,now()) ON CONFLICT (identificacion) DO UPDATE SET identificacion = EXCLUDED.identificacion RETURNING id, nombre, "diasCredito"`,
                [ident, d.cliente.slice(0, 255), `${d.fecha}T12:00:00-04:00`]);
            d.clienteDb = r.rows[0]; nClientes++;
        }
        // notas de entrega
        for (const d of neNuevas) {
            const id = randomUUID(); const ts = `${d.fecha || new Date().toISOString().slice(0, 10)}T12:00:00-04:00`; const tasa = tasaDe(d.fecha);
            await db.query(`INSERT INTO "Ventas" (id, "clienteId", "tipoVenta", "tipoDocumento", "numeroDocumento", "condicionPago", "statusPago", "fechaVencimiento", moneda, "tasaCambio", subtotal, "montoIva", "totalDescuento", "totalFinal",
                "statusDespacho", "tipoEntrega", "fechaEmision", "createdAt", "updatedAt") VALUES ($1,$2,'MAYOR'::"enum_Ventas_tipoVenta",'NOTA_ENTREGA'::"enum_Ventas_tipoDocumento",$3,'Credito'::"enum_Ventas_condicionPago",'Pendiente'::"enum_Ventas_statusPago",$4::timestamptz,'USD'::"enum_Ventas_moneda",$5,$6,0,0,$6,'Completado','pickup',$7::timestamptz,$7::timestamptz,$7::timestamptz)`,
                [id, d.clienteDb.id, d.k, `${venc.get(d.k) || dias(d.fecha, d.clienteDb.diasCredito || 7)}T12:00:00-04:00`, tasa, d.monto, ts]);
            ventas.set(d.k, { id, num: d.k, clienteId: d.clienteDb.id, tasa, moneda: 'USD', total: d.monto, pago: 'Pendiente', emision: d.fecha }); nNE++;
        }
        // cuentas por cobrar y abonos de cada documento (facturas del sistema + notas de entrega nuevas)
        const retPorVenta = new Map((await q(`SELECT "ventaId", id, comprobante, fecha::text AS fecha FROM "RetencionesIva" WHERE tipo = 'VENTA' AND "ventaId" IS NOT NULL`)).map((r) => [r.ventaId, r]));
        const idsVentas = [...docs.values()].map((d) => ventas.get(d.k)?.id).filter(Boolean);
        await db.query(`DELETE FROM "Abonos" WHERE "ventaId" = ANY($1::uuid[]) AND notas LIKE 'Migrado del Excel%'`, [idsVentas]);
        await db.query(`DELETE FROM "CuentasPorCobrar" WHERE "ventaId" = ANY($1::uuid[])`, [idsVentas]);
        for (const d of docs.values()) {
            const v = ventas.get(d.k); if (!v) continue;
            const saldo = d.forzarPagado ? 0 : r2(d.monto - d.abonado); const pendiente = saldo > 0.005 && d.monto > 0;
            const cli = v.clienteId; if (!cli) continue;
            const vence = venc.get(d.k) || dias(d.fecha || v.emision, 7);
            if (d.monto > 0 || d.pagos.length) {
                await db.query(`INSERT INTO "CuentasPorCobrar" ("clienteId", "ventaId", "montoTotal", "saldoPendiente", moneda, "tasaCambio", "fechaVencimiento", estado, observacion, "createdAt", "updatedAt")
                    VALUES ($1,$2,$3,$4,'USD',$5,$6,$7::"enum_CuentasPorCobrar_estado",$8,$9::timestamptz,now())`,
                    [cli, v.id, d.monto, Math.max(0, saldo), v.tasa || 1, vence, pendiente ? 'Pendiente' : 'Pagado', d.obs || null, `${d.fecha || v.emision}T12:00:00-04:00`]);
                nCxc++;
            }
            for (const p of d.pagos) {
                const fechaPago = p.fecha || retPorVenta.get(v.id)?.fecha || d.fecha || v.emision; const tasaP = tasaDe(fechaPago);
                const ret = p.esRet ? retPorVenta.get(v.id) : null;
                const r = await db.query(`INSERT INTO "Abonos" ("fechaPago", "metodoPago", referencia, "montoUsd", "tasaBcvAplicada", "montoVes", "montoBs", "tasaCambio", notas, "ventaId", "createdAt", "updatedAt")
                    VALUES ($1::date,$2,$3,$4,$5,$6,$6,$5,$7,$8::uuid,($1::date + interval '12 hours')::timestamptz,now()) RETURNING id`,
                    [fechaPago, p.metodo, (ret?.comprobante || p.texto).slice(0, 100), p.monto, tasaP, r2(p.monto * tasaP), `Migrado del Excel de cuentas por cobrar${p.obs ? ` (${p.obs})` : ''}`, v.id]);
                if (ret) await db.query(`UPDATE "RetencionesIva" SET "abonoId" = $1 WHERE id = $2 AND "abonoId" IS NULL`, [r.rows[0].id, ret.id]);
                nAbonos++;
            }
            // estado de la factura
            await db.query(`UPDATE "Ventas" SET "statusPago" = $1::"enum_Ventas_statusPago", "condicionPago" = CASE WHEN $2 THEN 'Credito'::"enum_Ventas_condicionPago" ELSE "condicionPago" END, "updatedAt" = now() WHERE id = $3`, [pendiente ? 'Pendiente' : 'Pagado', pendiente, v.id]);
        }
        // cerrar lo que no figura en el Excel
        if (abiertas.length) {
            await db.query(`UPDATE "CuentasPorCobrar" SET "saldoPendiente" = 0, estado = 'Pagado', observacion = left(COALESCE(observacion || ' ', '') || '[Cobrada: no figura en las cuentas por cobrar de la administración]', 500), "updatedAt" = now() WHERE id = ANY($1::int[])`, [abiertas.map((c) => c.cxc)]);
            await db.query(`UPDATE "Ventas" SET "statusPago" = 'Pagado'::"enum_Ventas_statusPago", "updatedAt" = now() WHERE id = ANY($1::uuid[])`, [abiertas.map((c) => c.venta)]);
        }
        if (ventasPendientesSinCuenta.length) await db.query(`UPDATE "Ventas" SET "statusPago" = 'Pagado'::"enum_Ventas_statusPago", "updatedAt" = now() WHERE id = ANY($1::uuid[])`, [ventasPendientesSinCuenta.map((v) => v.id)]);
        // vendedores y comisiones
        for (const vv of vendedores.values()) {
            const r = await db.query(`INSERT INTO "VendedoresComision" (nombre, porcentaje) VALUES ($1,$2) ON CONFLICT (nombre) DO UPDATE SET porcentaje = EXCLUDED.porcentaje RETURNING id`, [vv.nombre, vv.porcentaje]);
            const vid = r.rows[0].id;
            if ((await db.query(`SELECT 1 FROM "ComisionesVenta" WHERE "vendedorId" = $1 LIMIT 1`, [vid])).rowCount) continue; // ya cargado
            for (const l of vv.lineas) {
                const venta = ventas.get(l.doc);
                await db.query(`INSERT INTO "ComisionesVenta" ("vendedorId", "ventaId", concepto, fecha, vencimiento, "documentoTexto", "clienteTexto", "montoUsd", "baseUsd", porcentaje, "comisionUsd", "estatusCliente", "estatusComision", "fechaPagoComision", observacion)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NULL,$14)`,
                    [vid, venta?.id || null, l.concepto, l.fecha, l.vencimiento, l.docTxt, l.cliente.slice(0, 200), l.monto, l.base, l.pct, l.com, l.estCliente, l.pagada ? 'PAGADA' : 'PENDIENTE', l.obs]);
                nCom++;
            }
        }
        const resumen = `${abiertas.length + ventasPendientesSinCuenta.length} cuentas cerradas por ya estar cobradas, ${nNE} notas de entrega, ${nClientes} clientes nuevos, ${nCxc} cuentas por cobrar, ${nAbonos} abonos, ${vendedores.size} vendedores con ${nCom} comisiones`;
        if (PROBAR) { await db.query('ROLLBACK'); console.log(`\nPRUEBA OK (revertida, no quedó nada): ${resumen}.`); return; }
        await db.query('COMMIT');
        console.log(`\nCargado: ${resumen}.`);
    } catch (e) {
        await db.query('ROLLBACK').catch(() => {});
        console.error('Falló (se revirtió todo):', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
