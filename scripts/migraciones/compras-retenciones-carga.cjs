// Carga (desde 2023) de: (A) las retenciones de IVA que los clientes contribuyentes especiales le hicieron a Mediquir, relacionadas con sus facturas
// de venta, y (B) las facturas de compra con las retenciones que Mediquir le hizo a sus proveedores.
//   Fuentes (datos/privado/, no van al repositorio):
//     libro-ventas.json   Excel "RETENCIONES RECIBIDAS" (libro de ventas: líneas RET- con el comprobante y el monto retenido)
//     facturas-origen.json Excel "FACTURACION DESDE 2020" (cada factura con su RETENCION)
//     libro-compras.json  PDF "compras 2020" (libro de compras), leído con lib/leer-compras-pdf.py
//     retenciones2020.txt TXT de retenciones de compra (SENIAT): base, retenido y comprobante de cada una (en Descargas)
//   node scripts/migraciones/compras-retenciones-carga.cjs            -> SIMULACIÓN (no escribe)
//   node scripts/migraciones/compras-retenciones-carga.cjs --probar   -> carga completa dentro de una transacción que se REVIERTE
//   node scripts/migraciones/compras-retenciones-carga.cjs --aplicar  -> carga de verdad
// Reglas: todo en bolívares tal cual se registró (moneda BS) con la tasa BCV de la fecha; NO se mueve inventario (las compras no traen renglones);
// las compras se cargan como pagadas (el libro no dice nada de pagos pendientes).
const fs = require('fs');
const path = require('path');
const PROBAR = process.argv.includes('--probar');
const APLICAR = process.argv.includes('--aplicar') || PROBAR;
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');
const { randomUUID } = require('crypto');
const { formatearIdentificacion, claveIdentificacion, formatearNombre, PREFIJO_SIN_RIF, esSinRif } = require('../../app/constants/identificacion.js');

const DESDE = '2023-01-01';
const DIR = path.join(__dirname, 'datos', 'privado');
const leer = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
const TXT = path.join(process.env.USERPROFILE || '', 'Downloads', 'retenciones2020.txt');
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const cl = claveIdentificacion;
const iso = (d) => d.split('/').reverse().join('-');
const pct = (retenido, iva) => (iva > 0 && Math.abs(retenido / iva - 1) < Math.abs(retenido / iva - 0.75) ? 100 : 75);
const quitarCeros = (s) => { const t = String(s ?? '').trim(); const q = t.replace(/^0+(?=.)/, ''); return q || t; };

// RIF del libro de compras ("J-00220608-0", "J-000202001", "V05727818-4"): se lleva al formato único
function rifDeLibro(crudo) {
    const t = String(crudo ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const m = /^([A-Z])0*(\d{9})$/.exec(t) || /^([A-Z])(\d{9,10})$/.exec(t);
    return formatearIdentificacion(m ? `${m[1]}${m[2].slice(-9)}` : t).valor;
}

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    const rep = { ventaSinFactura: [], ventaAmbigua: [], compraSinRif: [], sinRifRecuperado: [], compraNoCarga: [], retSinFactura: [], retAmbigua: [] };
    const tasas = (await db.query(`SELECT fecha::text AS f, monto::float AS m FROM "BcvPreciosHistoricos" ORDER BY fecha`)).rows;
    const tasaDe = (fecha) => { let t = null; for (const x of tasas) { if (x.f <= fecha) t = x; else break; } return t?.m ?? null; };

    // ================= A. RETENCIONES DE VENTA =================
    const ventas = new Map((await db.query(`SELECT v.id, v."numeroDocumento" AS num, v."numeroControl" AS control, v."montoIva"::float AS iva, v."tasaCambio"::float AS tasa, v."clienteId",
        c.identificacion AS rif, c.nombre FROM "Ventas" v LEFT JOIN "Clientes" c ON c.id = v."clienteId" WHERE v."numeroDocumento" ~ '^F-[0-9]+$'`)).rows.map((v) => [v.num, v]));
    const yaVenta = new Set((await db.query(`SELECT "ventaId" FROM "RetencionesIva" WHERE tipo = 'VENTA' AND "ventaId" IS NOT NULL`)).rows.map((r) => r.ventaId));
    const facturas = leer('facturas-origen.json').filter((x) => x.DOCUMENTO && x.EMISION >= DESDE && x.RETENCION > 0 && ventas.has(`F-${x.DOCUMENTO}`));
    const filasRet = leer('libro-ventas.json').filter((x) => String(x.DOCUMENTO).startsWith('RET-') && (x.RETENCION_IVA || 0) > 0 && x.RETENCION_NRO && x.FECHA >= DESDE)
        .sort((a, b) => a.FECHA.localeCompare(b.FECHA));
    const porRif = new Map();
    for (const f of facturas) (porRif.get(cl(f.CODCLIENTE)) || porRif.set(cl(f.CODCLIENTE), []).get(cl(f.CODCLIENTE))).push(f);
    const usadas = new Set(); const retVenta = [];
    for (const t of filasRet) {
        const cand = (porRif.get(cl(t.RIF)) || []).filter((f) => !usadas.has(f.DOCUMENTO) && Math.abs(f.RETENCION - t.RETENCION_IVA) <= 0.02 && f.EMISION <= t.FECHA);
        if (!cand.length) { rep.ventaSinFactura.push({ fecha: t.FECHA, rif: t.RIF, cliente: t.RAZON_SOCIAL, retenido: t.RETENCION_IVA, comprobante: t.RETENCION_NRO }); continue; }
        if (cand.length > 1) rep.ventaAmbigua.push({ comprobante: t.RETENCION_NRO, candidatas: cand.map((c) => c.DOCUMENTO) });
        cand.sort((a, b) => b.EMISION.localeCompare(a.EMISION)); // la factura más reciente anterior a la retención
        usadas.add(cand[0].DOCUMENTO);
        retVenta.push({ t, f: cand[0], v: ventas.get(`F-${cand[0].DOCUMENTO}`) });
    }
    const nuevasVenta = retVenta.filter((r) => !yaVenta.has(r.v.id));

    // ================= B. COMPRAS =================
    const libro = leer('libro-compras.json').filter((l) => /^\d{2}\/\d{2}\/20(2[3-9])$/.test(l.fecha) && iso(l.fecha) >= DESDE);
    const facCompra = libro.filter((l) => l.tipo === 'FAC' && l.total > 0);
    for (const l of libro.filter((x) => x.tipo !== 'FAC' && x.tipo !== 'RET')) rep.compraNoCarga.push({ tipo: l.tipo, fecha: l.fecha, nombre: l.nombre, total: l.total });
    const txt = fs.existsSync(TXT) ? fs.readFileSync(TXT, 'latin1').split(/\r?\n/).filter(Boolean).map((l) => l.split('\t').map((x) => x.trim())).filter((r) => r[2] >= DESDE) : [];

    const proveedores = new Map((await db.query(`SELECT id, identificacion FROM "Proveedores"`)).rows.map((p) => [cl(p.identificacion), p.id]));
    const retPorProv = new Map(); // RIF -> % de retención (para marcar contribuyentes especiales)
    for (const r of txt) { const rif = cl(r[5]); const p = pct(Number(r[10]), Number(r[9]) * 0.16); retPorProv.set(rif, Math.max(retPorProv.get(rif) || 0, p)); }

    const comprasPlan = []; const provNuevos = new Map();
    // RIF de un proveedor sin RIF en el libro que sí aparece (por control y total) en el TXT: vale para todas sus facturas (mismo nombre)
    const rifPorNombre = new Map();
    for (const l of facCompra) {
        if (rifDeLibro(l.rif) || !l.control) continue;
        const t = txt.find((r) => cl(r[7]) === cl(l.control) && Math.abs(Number(r[8]) - l.total) <= 0.02);
        const rt = t ? (formatearIdentificacion(t[5]).valor || (/^\d{9}$/.test(cl(t[5])) ? formatearIdentificacion(`J${cl(t[5])}`).valor : null)) : null;
        if (rt) rifPorNombre.set(cl(l.nombre), rt);
    }
    for (const l of facCompra) {
        let id = rifDeLibro(l.rif);
        if (!id) {
            // Sin RIF en el libro: se busca en el TXT de retenciones (misma factura por control y total); si no está, RIF provisional "SIN-RIF-<nombre>"
            const rt = rifPorNombre.get(cl(l.nombre)) || null;
            if (rt) { id = rt; rep.sinRifRecuperado.push({ nombre: l.nombre, factura: l.factura, rif: rt }); }
            else { id = `${PREFIJO_SIN_RIF}${cl(l.nombre).slice(0, 30)}`; rep.compraSinRif.push({ fecha: l.fecha, nombre: l.nombre, factura: l.factura, total: l.total }); }
        }
        if (!proveedores.has(cl(id)) && !provNuevos.has(cl(id))) provNuevos.set(cl(id), { identificacion: id, nombre: (formatearNombre(l.nombre) || 'PROVEEDOR').slice(0, 200) });
        const fecha = iso(l.fecha);
        const exento = l.exento || 0; const base = l.base || 0;
        comprasPlan.push({ l, id, fecha, tasa: tasaDe(fecha), numero: quitarCeros(l.factura), control: l.control ? String(l.control).slice(0, 30) : null,
            subtotal: r2(base + exento), iva: r2(l.total - exento - base), exento: r2(exento), total: r2(l.total) });
    }
    // retenciones de compra (TXT) -> su factura por RIF + control + total (luego solo RIF + total)
    const porCtrl = new Map(); const porTot = new Map();
    for (const c of comprasPlan) {
        const k1 = `${cl(c.id)}|${cl(c.control)}`; (porCtrl.get(k1) || porCtrl.set(k1, []).get(k1)).push(c);
        const k2 = cl(c.id); (porTot.get(k2) || porTot.set(k2, []).get(k2)).push(c);
    }
    const retCompra = []; const usadasC = new Set(); // la base permite UNA retención por factura de compra
    for (const r of txt) {
        const rifId = rifDeLibro(r[5]) || formatearIdentificacion(r[5]).valor;
        const total = Number(r[8]);
        let c = (porCtrl.get(`${cl(rifId)}|${cl(r[7])}`) || []).filter((x) => !usadasC.has(x) && Math.abs(x.total - total) <= 0.02);
        if (!c.length) c = (porTot.get(cl(rifId)) || []).filter((x) => !usadasC.has(x) && Math.abs(x.total - total) <= 0.02 && x.fecha <= r[2]).sort((x, y) => y.fecha.localeCompare(x.fecha));
        if (c.length > 1) rep.retAmbigua.push({ comprobante: r[12], facturas: c.map((x) => x.numero) });
        if (!c.length) rep.retSinFactura.push({ fecha: r[2], rif: r[5], factura: r[6], control: r[7], total, comprobante: r[12], tipoDoc: r[4] });
        else usadasC.add(c[0]);
        const base = Number(r[9]); const iva = r2(base * 0.16);
        retCompra.push({ r, c: c[0] || null, rifId, base, iva, retenido: Number(r[10]), pct: pct(Number(r[10]), iva) });
    }
    const retPorFactura = new Map(); for (const x of retCompra) if (x.c) retPorFactura.set(x.c, r2((retPorFactura.get(x.c) || 0) + x.retenido));

    // ---- resumen
    const yaCompra = new Set((await db.query(`SELECT "proveedorId", "numeroDocumento" FROM "FacturasCompras"`)).rows.map((r) => `${r.proveedorId}|${r.numeroDocumento}`));
    console.log(`\nA. RETENCIONES DE VENTA (desde ${DESDE}): ${filasRet.length} en el libro, ${facturas.length} facturas con retención`);
    console.log(`   relacionadas con su factura: ${retVenta.length} (${rep.ventaAmbigua.length} con varias candidatas) · sin factura: ${rep.ventaSinFactura.length} · ya cargadas: ${retVenta.length - nuevasVenta.length}`);
    console.log(`   clientes que se marcan contribuyente especial: ${new Set(nuevasVenta.map((x) => x.v.clienteId)).size}`);
    console.log(`B. COMPRAS: ${comprasPlan.length} facturas (${rep.sinRifRecuperado.length} sin RIF en el libro cuyo RIF salió del TXT, ${rep.compraSinRif.length} con RIF provisional SIN-RIF para que lo consigas, ${rep.compraNoCarga.length} notas de crédito/débito sin cargar)`);
    console.log(`   proveedores: ${new Set(comprasPlan.map((c) => cl(c.id))).size} distintos, ${provNuevos.size} sin ficha (se crean)`);
    console.log(`   retenciones de compra: ${retCompra.length} en el TXT · con su factura: ${retCompra.filter((x) => x.c).length} · sin factura: ${rep.retSinFactura.length} (${rep.retAmbigua.length} ambiguas)`);
    console.log(`   facturas con retención: ${retPorFactura.size}`);
    fs.writeFileSync(path.join(DIR, 'excepciones-compras.json'), JSON.stringify(rep, null, 1));
    console.log('Detalle en datos/privado/excepciones-compras.json');
    if (!APLICAR) { await db.end(); console.log('\nSimulación: no se escribió nada.'); return; }

    // ================= CARGA =================
    const lotes = async (tabla, columnas, filas, tam, extra = {}) => {
        for (let i = 0; i < filas.length; i += tam) {
            const lote = filas.slice(i, i + tam); const valores = [];
            const marcas = lote.map((f, j) => { valores.push(...f); return `(${f.map((_, k) => extra[k] ? extra[k](j * f.length + k + 1) : `$${j * f.length + k + 1}`).join(', ')})`; }).join(', ');
            await db.query(`INSERT INTO "${tabla}" (${columnas.map((c) => `"${c}"`).join(', ')}) VALUES ${marcas}`, valores);
        }
    };
    try {
        await db.query('BEGIN');
        // proveedores nuevos
        for (const p of provNuevos.values()) {
            const rp = retPorProv.get(cl(p.identificacion));
            const r = await db.query(`INSERT INTO "Proveedores" (identificacion, nombre, "esContribuyenteEspecial", "retencionIvaPorDefecto", activo, notas, "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,true,$5,now(),now())
                ON CONFLICT (identificacion) DO UPDATE SET identificacion = EXCLUDED.identificacion RETURNING id`, [p.identificacion, p.nombre, Boolean(rp), rp || 75, esSinRif(p.identificacion) ? 'RIF pendiente: el libro de compras no lo traía. Consíguelo con el proveedor y complétalo en su ficha.' : null]);
            proveedores.set(cl(p.identificacion), r.rows[0].id);
        }
        // proveedores que ya existían pero le retenemos: se marcan contribuyentes especiales
        const marcados = await db.query(`UPDATE "Proveedores" SET "esContribuyenteEspecial" = true, "updatedAt" = now() WHERE NOT "esContribuyenteEspecial" AND regexp_replace(upper(identificacion), '[^A-Z0-9]', '', 'g') = ANY($1::text[])`, [[...retPorProv.keys()]]);
        // facturas de compra
        const idPorCompra = new Map(); const filasCompra = [];
        for (const c of comprasPlan) {
            const provId = proveedores.get(cl(c.id));
            if (yaCompra.has(`${provId}|${c.numero}`)) continue;
            const id = randomUUID(); idPorCompra.set(c, id);
            filasCompra.push([id, provId, c.numero, c.tasa, c.subtotal, c.iva, retPorFactura.get(c) || 0, c.total, c.fecha, c.control, c.exento, c.l.trans || '01', `${c.fecha}T12:00:00-04:00`, `${c.fecha}T12:00:00-04:00`]);
        }
        await lotes('FacturasCompras', ['id', 'proveedorId', 'numeroDocumento', 'tasaCambio', 'subtotal', 'montoIva', 'montoRetencion', 'totalFinal', 'fechaFactura', 'numeroControl', 'montoExento', 'tipoTransaccion', 'createdAt', 'updatedAt'],
            filasCompra, 500);
        await db.query(`UPDATE "FacturasCompras" SET moneda = 'BS', "tipoDocumento" = 'FACTURA', "condicionPago" = 'Contado', "statusPago" = 'Pagado', "fechaRecepcion" = "fechaFactura", "alicuotaIva" = 16, "esGasto" = false
            WHERE id = ANY($1::uuid[])`, [[...idPorCompra.values()]]);
        // retenciones de compra
        const provPorRif = new Map((await db.query(`SELECT id, identificacion, nombre FROM "Proveedores"`)).rows.map((p) => [cl(p.identificacion), p]));
        const filasRC = retCompra.map((x) => {
            const prov = provPorRif.get(cl(x.rifId)) || provPorRif.get(cl(x.r[5]));
            const fecha = x.r[2];
            return ['COMPRA', 'REGISTRADA', fecha, fecha.slice(0, 7), x.r[12], x.c ? x.c.numero : quitarCeros(x.r[6]), x.r[7] || null, prov?.identificacion || x.rifId, prov?.nombre || null, x.base, 16, x.iva, x.pct, x.retenido,
                tasaDe(fecha) || 1, x.c ? idPorCompra.get(x.c) || null : null, `${fecha}T12:00:00-04:00`];
        });
        await lotes('RetencionesIva', ['tipo', 'estado', 'fecha', 'periodo', 'comprobante', 'facturaAfectada', 'numeroControlFactura', 'contraparteRif', 'contraparteNombre', 'baseImponible', 'alicuota', 'montoIva', 'porcentajeRetencion', 'ivaRetenido', 'tasaCambio', 'facturaCompraId', 'createdAt'],
            filasRC, 500);
        await db.query(`UPDATE "RetencionesIva" SET "updatedAt" = "createdAt" WHERE tipo = 'COMPRA' AND "updatedAt" IS NULL`);
        // retenciones de venta
        const filasRV = nuevasVenta.map(({ t, f, v }) => {
            const fechaRet = /^\d{4}-\d{2}-\d{2}$/.test(String(t.RETENCION_FECHA)) ? t.RETENCION_FECHA : t.FECHA;
            const iva = f.TOTIMPUEST;
            return ['VENTA', 'REGISTRADA', fechaRet, fechaRet.slice(0, 7), String(t.RETENCION_NRO).slice(0, 30), v.num, v.control, v.rif, v.nombre, r2(iva / 0.16), 16, iva, pct(f.RETENCION, iva), f.RETENCION, v.tasa, v.id, `${fechaRet}T12:00:00-04:00`];
        });
        await lotes('RetencionesIva', ['tipo', 'estado', 'fecha', 'periodo', 'comprobante', 'facturaAfectada', 'numeroControlFactura', 'contraparteRif', 'contraparteNombre', 'baseImponible', 'alicuota', 'montoIva', 'porcentajeRetencion', 'ivaRetenido', 'tasaCambio', 'ventaId', 'createdAt'],
            filasRV, 500);
        await db.query(`UPDATE "RetencionesIva" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL`);
        // clientes que retienen: contribuyentes especiales con su porcentaje
        const porCliente = new Map();
        for (const { f, v } of nuevasVenta) if (v.clienteId) porCliente.set(v.clienteId, pct(f.RETENCION, f.TOTIMPUEST));
        for (const [cid, p] of porCliente) await db.query(`UPDATE "Clientes" SET "esContribuyenteEspecial" = true, "retencionIvaPorDefecto" = $1, "updatedAt" = now() WHERE id = $2 AND NOT "esContribuyenteEspecial"`, [p, cid]);
        const resumen = `${provNuevos.size} proveedores nuevos (${marcados.rowCount} marcados contribuyente especial), ${filasCompra.length} facturas de compra, ${filasRC.length} retenciones de compra, ${filasRV.length} retenciones de venta, ${porCliente.size} clientes marcados`;
        if (PROBAR) { await db.query('ROLLBACK'); console.log(`\nPRUEBA OK (revertida, no quedó nada): ${resumen}.`); return; }
        await db.query('COMMIT');
        console.log(`\nCargado: ${resumen}.`);
    } catch (e) {
        await db.query('ROLLBACK').catch(() => {});
        console.error('Falló la carga (se revirtió todo):', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
