// Carga (desde 2023) de las notas de crédito y de débito del sistema anterior:
//   · VENTA  (las que Mediquir emitió a sus clientes): libro-ventas.json (Excel "RETENCIONES RECIBIDAS" = libro de ventas). Cada nota de crédito se relaciona con
//     la factura cuyo "monto devuelto" (PDF de ventas) coincide con la base de la nota, y sus renglones salen de esas devoluciones.
//   · COMPRA (las que Mediquir recibió de proveedores): libro-compras.json (PDF "compras 2020").
//   node scripts/migraciones/notas-carga.cjs            -> SIMULACIÓN (no escribe)
//   node scripts/migraciones/notas-carga.cjs --probar   -> carga completa dentro de una transacción que se REVIERTE
//   node scripts/migraciones/notas-carga.cjs --aplicar  -> carga de verdad
// Reglas: todo en bolívares (moneda BS) con la tasa de la factura afectada (o la del día); NO se mueve inventario ni nroVentas (las facturas ya se cargaron con su
// cantidad original y nroVentas ya descuenta lo devuelto): devuelveInventario = false y saldoAFavorUsd = 0.
const fs = require('fs');
const path = require('path');
const PROBAR = process.argv.includes('--probar');
const APLICAR = process.argv.includes('--aplicar') || PROBAR;
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');
const { randomUUID } = require('crypto');
const { formatearIdentificacion, claveIdentificacion, PREFIJO_SIN_RIF } = require('../../app/constants/identificacion.js');

const DESDE = '2023-01-01';
const DIR = path.join(__dirname, 'datos', 'privado');
const leer = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const cl = claveIdentificacion;
const iso = (d) => d.split('/').reverse().join('-');
const dias = (a, b) => Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 864e5);
const numeroDe = (s) => String(s ?? '').replace(/\D/g, '').replace(/^0+(?=.)/, '');
const baseCodigo = (c) => String(c).replace(/-\d+$/, '');
function rifDeLibro(crudo) {
    const t = String(crudo ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const m = /^([A-Z])0*(\d{9})$/.exec(t) || /^([A-Z])(\d{9,10})$/.exec(t);
    return formatearIdentificacion(m ? `${m[1]}${m[2].slice(-9)}` : t).valor;
}
// Control: si viene mal escrito (más dígitos de la cuenta) se deja tal cual, pero un número absurdo no entra (ensuciaría el "siguiente control")
const controlDe = (c, rep, ref) => {
    if (!c) return null;
    const t = String(c).trim();
    const m = /^00-?\s*(\d+)$/.exec(t);
    if (m && Number(m[1]) > 123000 && /^\d{7}$/.test(m[1])) { rep.controlAbsurdo.push({ ref, control: t }); return null; }
    return t.slice(0, 30);
};

// Subconjuntos de renglones (hasta ~12) cuya suma de devuelto iguala `objetivo`
function subconjunto(lineas, objetivo) {
    const n = Math.min(lineas.length, 14);
    for (let tam = 1; tam <= Math.min(n, 4); tam++) {
        const rec = (ini, resto, elegidas) => {
            if (elegidas.length === tam) return Math.abs(resto) <= 0.05 ? elegidas : null;
            for (let i = ini; i < n; i++) { const r = rec(i + 1, resto - lineas[i].resto, [...elegidas, i]); if (r) return r; }
            return null;
        };
        const r = rec(0, objetivo, []);
        if (r) return r;
    }
    return null;
}

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    const rep = { ncSinFactura: [], ncParcialSinRenglones: [], ndSinCliente: [], controlAbsurdo: [], duplicadas: [], compraSinProveedor: [] };
    const tasas = (await db.query(`SELECT fecha::text AS f, monto::float AS m FROM "BcvPreciosHistoricos" ORDER BY fecha`)).rows;
    const tasaDe = (fecha) => { let t = null; for (const x of tasas) { if (x.f <= fecha) t = x; else break; } return t?.m ?? 1; };

    const ventas = new Map((await db.query(`SELECT id, "numeroDocumento" AS num, "tasaCambio"::float AS tasa, "clienteId", "fechaEmision"::date::text AS fecha FROM "Ventas" WHERE "numeroDocumento" ~ '^F-[0-9]+$'`)).rows.map((v) => [v.num, v]));
    const clientes = new Map((await db.query(`SELECT id, identificacion FROM "Clientes"`)).rows.map((c) => [cl(c.identificacion), c.id]));
    const proveedores = new Map((await db.query(`SELECT id, identificacion FROM "Proveedores"`)).rows.map((p) => [cl(p.identificacion), p.id]));
    const proveedoresPorNombre = new Map((await db.query(`SELECT id, nombre FROM "Proveedores"`)).rows.map((p) => [cl(p.nombre).slice(0, 30), p.id]));
    const productos = (await db.query(`SELECT id, codigo, nombre, "porcentajeIva"::float AS iva FROM "Productos"`)).rows;
    const porBase = new Map();
    for (const p of productos) { const b = baseCodigo(p.codigo); (porBase.get(b) || porBase.set(b, []).get(b)).push(p); }
    const buscarProducto = (codigo, desc) => {
        const c = porBase.get(codigo) || porBase.get(String(codigo).padStart(4, '0')) || null;
        if (!c) return null; if (c.length === 1) return c[0];
        const pal = new Set(String(desc).toUpperCase().split(/[^A-Z0-9]+/).filter((w) => w.length > 2));
        let mejor = c[0], pt = -1;
        for (const x of c) { const s = String(x.nombre).toUpperCase().split(/[^A-Z0-9]+/).filter((w) => w.length > 2).filter((w) => pal.has(w)).length; if (s > pt) { mejor = x; pt = s; } }
        return mejor;
    };
    const ya = new Set((await db.query(`SELECT "numeroDocumento", origen, tipo FROM "NotasFiscales"`)).rows.map((r) => `${r.origen}|${r.tipo}|${r.numeroDocumento}`));

    // ================= VENTAS: notas de crédito =================
    const libro = leer('libro-ventas.json').filter((x) => x.FECHA >= DESDE);
    const ncV = libro.filter((x) => String(x.DOCUMENTO).startsWith('N/C-')).sort((a, b) => a.FECHA.localeCompare(b.FECHA) || String(a.DOCUMENTO).localeCompare(String(b.DOCUMENTO)));
    const ndV = libro.filter((x) => String(x.DOCUMENTO).startsWith('N/D-'));
    const pdf = new Map(leer('ventas-pdf.json').map((d) => [d.doc, d]));
    const facturas = leer('facturas-origen.json').filter((x) => x.DOCUMENTO && x.EMISION >= DESDE && ventas.has(`F-${x.DOCUMENTO}`));
    const porRif = new Map();
    for (const f of facturas) {
        const p = pdf.get(f.DOCUMENTO); if (!p) continue;
        const lineas = p.items.filter((i) => (i.devuelto || 0) > 0.005).map((i) => ({ it: i, resto: r2(i.devuelto), usada: false }));
        if (!lineas.length) continue;
        const inv = { f, venta: ventas.get(`F-${f.DOCUMENTO}`), lineas, resto: r2(lineas.reduce((s, l) => s + l.resto, 0)) };
        (porRif.get(cl(f.CODCLIENTE)) || porRif.set(cl(f.CODCLIENTE), []).get(cl(f.CODCLIENTE))).push(inv);
    }
    const baseDe = (n) => r2(Math.abs((n.BASE_IMPONIBLE_1 || 0) + (n.BASE_IMPONIBLE_2 || 0) + (n.BASE_IMPONIBLE_3 || 0)) + Math.abs(n.TOTAL_EXENTO || 0));
    const planNC = []; let conRenglones = 0, sinRenglones = 0, sinFactura = 0;
    for (const n of ncV) {
        const b = baseDe(n);
        const numero = `NC-${String(numeroDe(n.DOCUMENTO)).padStart(5, '0')}`;
        const cands = (porRif.get(cl(n.RIF)) || []).filter((i) => i.f.EMISION <= n.FECHA && dias(i.f.EMISION, n.FECHA) <= 365 && i.resto >= b - 0.05)
            .sort((a, c) => dias(a.f.EMISION, n.FECHA) - dias(c.f.EMISION, n.FECHA));
        let inv = null; let lineasNota = null;
        // 1) la nota devuelve TODO lo que quedaba por devolver de una factura
        inv = cands.find((i) => Math.abs(i.resto - b) <= 0.05) || null;
        if (inv) {
            // solo vale si los renglones sin asignar suman exactamente lo de la nota (otra nota parcial pudo haber cubierto parte de la devolución)
            const libres = inv.lineas.filter((l) => !l.usada);
            if (Math.abs(libres.reduce((t, l) => t + l.resto, 0) - b) <= 0.05) lineasNota = libres; else inv = null;
        }
        // 2) devuelve un grupo de renglones de una factura que aún tiene devoluciones sin asignar
        if (!inv) for (const i of cands) { const libres = i.lineas.filter((l) => !l.usada); const s = subconjunto(libres, b); if (s) { inv = i; lineasNota = s.map((k) => libres[k]); break; } }
        if (inv && lineasNota) { for (const l of lineasNota) l.usada = true; inv.resto = r2(inv.resto - b); conRenglones++; }
        else if (cands.length) { inv = cands[0]; inv.resto = r2(inv.resto - b); sinRenglones++; rep.ncParcialSinRenglones.push({ nota: numero, fecha: n.FECHA, cliente: n.RAZON_SOCIAL, base: b, factura: `F-${inv.f.DOCUMENTO}` }); }
        else { sinFactura++; rep.ncSinFactura.push({ nota: numero, fecha: n.FECHA, cliente: n.RAZON_SOCIAL, base: b }); }
        planNC.push({ n, numero, b, inv, lineas: lineasNota });
    }
    // ================= COMPRAS =================
    const libroC = leer('libro-compras.json').filter((l) => /^\d{2}\/\d{2}\/20(2[3-9])$/.test(l.fecha) && iso(l.fecha) >= DESDE && (l.tipo === 'N/C' || l.tipo === 'N/D'));
    const planC = libroC.map((l) => {
        const id = rifDeLibro(l.rif);
        const provId = (id && proveedores.get(cl(id))) || proveedoresPorNombre.get(cl(l.nombre).slice(0, 30)) || null;
        if (!provId) rep.compraSinProveedor.push({ tipo: l.tipo, fecha: l.fecha, nombre: l.nombre, rif: l.rif, total: l.total });
        return { l, provId, fecha: iso(l.fecha) };
    });

    // ---- resumen
    const nuevosNC = planNC.filter((p) => !ya.has(`VENTA|CREDITO|${p.numero}`));
    console.log(`\nVENTAS — notas de crédito desde ${DESDE}: ${ncV.length}`);
    console.log(`   con su factura y sus renglones: ${conRenglones} · con su factura sin renglones (monto parcial): ${sinRenglones} · sin factura identificada: ${sinFactura}`);
    console.log(`VENTAS — notas de débito: ${ndV.length} (se cargan sin factura: el libro no dice cuál afectan)`);
    console.log(`COMPRAS — notas: ${planC.filter((p) => p.l.tipo === 'N/C').length} de crédito, ${planC.filter((p) => p.l.tipo === 'N/D').length} de débito · sin proveedor identificado: ${rep.compraSinProveedor.length}`);
    const cxc = new Map((await db.query(`SELECT "ventaId", id, "saldoPendiente"::float AS saldo FROM "CuentasPorCobrar"`)).rows.map((r) => [r.ventaId, r]));
    const ncConCxc = nuevosNC.filter((p) => p.inv && cxc.has(p.inv.venta.id));
    console.log(`Notas de crédito que afectan una cuenta por cobrar pendiente (se rebaja su saldo): ${ncConCxc.length}`);
    console.log(`Controles absurdos descartados: ${rep.controlAbsurdo.length} · ya cargadas: ${ncV.length - nuevosNC.length}`);
    fs.writeFileSync(path.join(DIR, 'excepciones-notas.json'), JSON.stringify(rep, null, 1));
    console.log('Detalle en datos/privado/excepciones-notas.json');
    if (!APLICAR) { await db.end(); console.log('\nSimulación: no se escribió nada.'); return; }

    // ================= CARGA =================
    try {
        await db.query('BEGIN');
        const notas = []; const detalles = [];
        const ivaMonto = (n) => r2(Math.abs((n.MONTO_IVA_1 || 0) + (n.MONTO_IVA_2 || 0) + (n.MONTO_IVA_3 || 0)));
        const fila = (o) => [o.id, o.tipo, o.origen, o.numero, o.control, o.fecha, o.ventaId, o.facturaCompraId, o.clienteId, o.proveedorId, o.tasa, o.subtotal, o.base, o.exento, o.iva, o.total, o.motivo, JSON.stringify(o.afectadas), `${o.fecha}T12:00:00-04:00`];
        for (const p of nuevosNC) {
            const n = p.n; const id = randomUUID();
            const venta = p.inv?.venta || null;
            const clienteId = venta?.clienteId || clientes.get(cl(n.RIF)) || null;
            notas.push(fila({ id, tipo: 'CREDITO', origen: 'VENTA', numero: p.numero, control: controlDe(n.NRO_CONTROL, rep, p.numero), fecha: n.FECHA, ventaId: venta?.id || null, facturaCompraId: null, clienteId, proveedorId: null,
                tasa: venta?.tasa || tasaDe(n.FECHA), subtotal: p.b, base: r2(Math.abs((n.BASE_IMPONIBLE_1 || 0) + (n.BASE_IMPONIBLE_2 || 0) + (n.BASE_IMPONIBLE_3 || 0))), exento: r2(Math.abs(n.TOTAL_EXENTO || 0)), iva: ivaMonto(n), total: r2(Math.abs(n.TOTAL_VENTAS)),
                motivo: p.lineas ? 'Devolución de mercancía (nota migrada del sistema anterior)' : 'Nota de crédito migrada del sistema anterior', afectadas: venta ? [{ ventaId: venta.id, numeroDocumento: venta.num, fecha: venta.fecha }] : [] }));
            for (const l of p.lineas || []) {
                const prod = buscarProducto(l.it.codigo, l.it.desc);
                const exento = prod ? !(prod.iva > 0) : /\(E\)/i.test(l.it.desc);
                const precio = l.it.precio || 0;
                detalles.push([id, prod?.id ?? null, String(l.it.desc || 'Producto').slice(0, 200), Math.max(1, Math.round(precio > 0 ? l.resto / precio : 1)), precio, !exento, exento ? 0 : 16, l.resto]);
            }
        }
        for (const n of ndV) {
            const numero = `ND-${String(numeroDe(n.DOCUMENTO)).padStart(5, '0')}`;
            if (ya.has(`VENTA|DEBITO|${numero}`)) continue;
            notas.push(fila({ id: randomUUID(), tipo: 'DEBITO', origen: 'VENTA', numero, control: controlDe(n.NRO_CONTROL, rep, numero), fecha: n.FECHA, ventaId: null, facturaCompraId: null, clienteId: clientes.get(cl(n.RIF)) || null, proveedorId: null,
                tasa: tasaDe(n.FECHA), subtotal: r2(Math.abs((n.BASE_IMPONIBLE_1 || 0) + (n.BASE_IMPONIBLE_2 || 0) + (n.BASE_IMPONIBLE_3 || 0)) + Math.abs(n.TOTAL_EXENTO || 0)),
                base: r2(Math.abs((n.BASE_IMPONIBLE_1 || 0) + (n.BASE_IMPONIBLE_2 || 0) + (n.BASE_IMPONIBLE_3 || 0))), exento: r2(Math.abs(n.TOTAL_EXENTO || 0)), iva: ivaMonto(n), total: r2(Math.abs(n.TOTAL_VENTAS)),
                motivo: 'Nota de débito migrada del sistema anterior (no indica la factura que afecta)', afectadas: [] }));
        }
        for (const p of planC) {
            const l = p.l; const numero = l.factura ? numeroDe(l.factura) : `S/N-${String(l.control || p.fecha).replace(/\s/g, '')}`;
            const exento = r2(Math.abs(l.exento || 0)), base = r2(Math.abs(l.base || 0)), total = r2(Math.abs(l.total || 0));
            notas.push(fila({ id: randomUUID(), tipo: l.tipo === 'N/C' ? 'CREDITO' : 'DEBITO', origen: 'COMPRA', numero: numero.slice(0, 50), control: controlDe(l.control, { controlAbsurdo: [] }, numero), fecha: p.fecha, ventaId: null, facturaCompraId: null, clienteId: null, proveedorId: p.provId,
                tasa: tasaDe(p.fecha), subtotal: r2(base + exento), base, exento, iva: r2(total - exento - base), total,
                motivo: `${l.tipo === 'N/C' ? 'Nota de crédito' : 'Nota de débito'} del proveedor migrada del sistema anterior`, afectadas: [] }));
        }
        const COL = ['id', 'tipo', 'origen', 'numeroDocumento', 'numeroControl', 'fecha', 'ventaId', 'facturaCompraId', 'clienteId', 'proveedorId', 'tasaCambio', 'subtotal', 'baseImponible', 'montoExento', 'montoIva', 'totalFinal', 'motivo', 'facturasAfectadas', 'createdAt'];
        for (let i = 0; i < notas.length; i += 400) {
            const lote = notas.slice(i, i + 400); const v = [];
            const m = lote.map((f, j) => { v.push(...f); return `(${f.map((_, k) => `$${j * f.length + k + 1}${k === 17 ? '::jsonb' : ''}`).join(', ')})`; }).join(', ');
            await db.query(`INSERT INTO "NotasFiscales" (${COL.map((c) => `"${c}"`).join(', ')}) VALUES ${m}`, v);
        }
        await db.query(`UPDATE "NotasFiscales" SET moneda = 'BS', estado = 'EMITIDA', "devuelveInventario" = false, "saldoAFavorUsd" = 0, "reintegradoUsd" = 0, "alicuotaIva" = 16, "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL OR "updatedAt" > now() - interval '1 hour'`);
        for (let i = 0; i < detalles.length; i += 1000) {
            const lote = detalles.slice(i, i + 1000); const v = [];
            const m = lote.map((f, j) => { v.push(...f); return `(${f.map((_, k) => `$${j * f.length + k + 1}`).join(', ')})`; }).join(', ');
            await db.query(`INSERT INTO "NotaFiscalDetalles" ("notaId", "productoId", descripcion, cantidad, "precioUnitario", "aplicaIva", "porcentajeIva", subtotal) VALUES ${m}`, v);
        }
        // Cuentas por cobrar pendientes: la nota de crédito baja lo que se debe (el saldo nunca queda negativo)
        for (const p of nuevosNC) {
            const c = p.inv && cxc.get(p.inv.venta.id); if (!c) continue;
            const total = r2(Math.abs(p.n.TOTAL_VENTAS));
            await db.query(`UPDATE "CuentasPorCobrar" SET "saldoPendiente" = GREATEST(0, "saldoPendiente" - $1), "updatedAt" = now() WHERE id = $2`, [total, c.id]);
        }
        // Las que quedaron sin saldo pasan a pagadas (la cuenta y su factura)
        await db.query(`UPDATE "Ventas" v SET "statusPago" = 'Pagado', "updatedAt" = now() FROM "CuentasPorCobrar" c WHERE c."ventaId" = v.id AND c."saldoPendiente" <= 0.005 AND v."statusPago" <> 'Pagado'`);
        await db.query(`UPDATE "CuentasPorCobrar" SET estado = 'Pagado', "updatedAt" = now() WHERE "saldoPendiente" <= 0.005 AND estado <> 'Pagado'`);
        // numeración: el siguiente número de NC y de ND sale de lo ya cargado
        for (const [pref, like] of [['NC', 'NC-%'], ['ND', 'ND-%']]) {
            const mx = (await db.query(`SELECT max(CAST(regexp_replace("numeroDocumento", '\\D', '', 'g') AS bigint)) m FROM "NotasFiscales" WHERE origen = 'VENTA' AND "numeroDocumento" LIKE $1`, [like])).rows[0].m;
            if (mx) await db.query(`UPDATE correlativos SET "siguienteNumero" = GREATEST("siguienteNumero", $1), configurado = true WHERE prefijo = $2`, [Number(mx) + 1, pref]);
        }
        const resumen = `${notas.length} notas (${notas.filter((f) => f[2] === 'VENTA' && f[1] === 'CREDITO').length} de crédito y ${notas.filter((f) => f[2] === 'VENTA' && f[1] === 'DEBITO').length} de débito de venta, ${notas.filter((f) => f[2] === 'COMPRA').length} de compra), ${detalles.length} renglones`;
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
