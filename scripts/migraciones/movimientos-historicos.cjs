// Movimientos de caja HISTÓRICOS (desde 2023) a partir de los documentos que se cargaron, para que el balance (ingresos, gastos, utilidad) tenga datos.
// El sistema anterior no dice con qué método ni qué día se cobró cada cosa: son ingresos y gastos "por devengado" (según la fecha del documento), método "No especificado".
//   · VENTAS: cada factura de contado -> un ingreso "Ingresos por Ventas" (subtotal) y otro "IVA Recaudado" (IVA), con la fecha de emisión.
//     Las de crédito ya pagadas -> "Ingreso por Cobranza (CxC)" + IVA, con la fecha del último pago. Las de crédito pendientes no generan nada (siguen por cobrar).
//     Se descuentan las notas de crédito de esa factura (devoluciones): el ingreso es neto de lo devuelto.
//   · COMPRAS: cada factura de compra -> un gasto "Compras de Mercancía" por lo realmente pagado (total menos la retención de IVA), con la fecha de la factura.
//   · Lo que ya tiene movimientos (por ejemplo la venta de ayer) no se toca; se puede ejecutar varias veces.
//   node scripts/migraciones/movimientos-historicos.cjs            -> SIMULACIÓN (no escribe)
//   node scripts/migraciones/movimientos-historicos.cjs --probar   -> carga completa dentro de una transacción que se REVIERTE
//   node scripts/migraciones/movimientos-historicos.cjs --aplicar  -> carga de verdad
const fs = require('fs');
const path = require('path');
const PROBAR = process.argv.includes('--probar');
const APLICAR = process.argv.includes('--aplicar') || PROBAR;
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

const DESDE = '2023-01-01';
const DIR = path.join(__dirname, 'datos', 'privado');
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    const q = async (sql, p) => (await db.query(sql, p)).rows;
    try {
        const tasas = await q(`SELECT fecha::text AS f, monto::float AS m FROM "BcvPreciosHistoricos" ORDER BY fecha`);
        const tasaDe = (fecha) => { let t = null; for (const x of tasas) { if (x.f <= fecha) t = x.m; else break; } return t; };
        // Fecha del último pago de cada factura a crédito (Excel del sistema anterior)
        const ultimoPago = new Map();
        const archivo = path.join(DIR, 'facturas-origen.json');
        if (fs.existsSync(archivo)) for (const f of JSON.parse(fs.readFileSync(archivo, 'utf8'))) if (f.DOCUMENTO) ultimoPago.set(`F-${f.DOCUMENTO}`, f.ULTIMOPAG);

        const cat = new Map((await q(`SELECT id, nombre FROM "CategoriasFinancieras"`)).map((c) => [c.nombre, c.id]));
        const exigir = (n) => { if (!cat.has(n)) throw new Error(`Falta la categoría financiera "${n}"`); return cat.get(n); };
        const C_VENTAS = exigir('Ingresos por Ventas'), C_IVA = exigir('IVA Recaudado'), C_CXC = exigir('Ingreso por Cobranza (CxC)'), C_COMPRAS = exigir('Compras de Mercancía');

        // ---------- ventas ----------
        const ventas = await q(`SELECT v.id, v."numeroDocumento" AS num, v."condicionPago"::text AS cond, v."statusPago"::text AS pago, v.subtotal::float AS sub, v."montoIva"::float AS iva, v."tasaCambio"::float AS tasa,
                (COALESCE(v."fechaEmision", v."createdAt") AT TIME ZONE 'America/Caracas')::date::text AS emision,
                COALESCE((SELECT SUM(n.subtotal) FROM "NotasFiscales" n WHERE n."ventaId" = v.id AND n.tipo = 'CREDITO' AND n.estado = 'EMITIDA'), 0)::float AS nc_sub,
                COALESCE((SELECT SUM(n."montoIva") FROM "NotasFiscales" n WHERE n."ventaId" = v.id AND n.tipo = 'CREDITO' AND n.estado = 'EMITIDA'), 0)::float AS nc_iva
            FROM "Ventas" v WHERE v."tipoDocumento" = 'FACTURA' AND v."statusDespacho" <> 'Cancelado' AND v.moneda = 'BS'
              AND (COALESCE(v."fechaEmision", v."createdAt") AT TIME ZONE 'America/Caracas')::date >= $1
              AND NOT EXISTS (SELECT 1 FROM "MovimientosFinancieros" m WHERE m."ventaId" = v.id)`, [DESDE]);
        const filas = []; const resumen = { contado: 0, cobranza: 0, pendientes: 0, sinNeto: 0, ingresoUsd: 0, ivaUsd: 0, gastoUsd: 0 };
        const mov = (tipo, fecha, usd, bs, tasa, desc, categoriaId, ventaId, facturaId, ref) => filas.push([tipo, fecha, 'No especificado', ref, r2(usd), r2(tasa), r2(bs), desc, categoriaId, ventaId, facturaId]);
        for (const v of ventas) {
            const credito = v.cond === 'Credito';
            if (credito && v.pago !== 'Pagado') { resumen.pendientes++; continue; }
            let fecha = v.emision; let tasa = v.tasa;
            if (credito) {
                const up = ultimoPago.get(v.num);
                if (up && up >= v.emision && up <= new Date().toISOString().slice(0, 10)) { fecha = up; tasa = tasaDe(up) || tasa; }
            }
            const sub = Math.max(0, r2(v.sub - v.nc_sub)); const iva = Math.max(0, r2(v.iva - v.nc_iva));
            if (sub < 0.01 && iva < 0.01) { resumen.sinNeto++; continue; }
            const catIngreso = credito ? C_CXC : C_VENTAS;
            const etiqueta = credito ? 'Cobranza' : 'Venta';
            if (sub >= 0.01) { mov('INGRESO', fecha, sub / tasa, sub, tasa, `${etiqueta} ${v.num} (migrada del sistema anterior${v.nc_sub > 0 ? ', neta de devoluciones' : ''})`, catIngreso, v.id, null, v.num); resumen.ingresoUsd += sub / tasa; }
            if (iva >= 0.01) { mov('INGRESO', fecha, iva / tasa, iva, tasa, `IVA de ${etiqueta.toLowerCase() === 'venta' ? 'Venta' : 'Cobranza'} ${v.num} (Impuesto SENIAT, migrada del sistema anterior)`, C_IVA, v.id, null, v.num); resumen.ivaUsd += iva / tasa; }
            if (credito) resumen.cobranza++; else resumen.contado++;
        }
        // ---------- compras ----------
        const compras = await q(`SELECT f.id, f."numeroDocumento" AS num, f."totalFinal"::float AS total, f."montoRetencion"::float AS ret, f."tasaCambio"::float AS tasa, f."fechaFactura"::text AS fecha
            FROM "FacturasCompras" f WHERE f.moneda = 'BS' AND f."tipoDocumento" = 'FACTURA' AND f."fechaFactura" >= $1
              AND NOT EXISTS (SELECT 1 FROM "MovimientosFinancieros" m WHERE m."facturaCompraId" = f.id)`, [DESDE]);
        let nCompras = 0;
        for (const f of compras) {
            const bs = r2(f.total - (f.ret || 0)); if (bs < 0.01) continue;
            const tasa = f.tasa > 1 ? f.tasa : (tasaDe(f.fecha) || 1);
            mov('GASTO', f.fecha, bs / tasa, bs, tasa, `Pago FACTURA Nro: ${f.num} (migrada del sistema anterior)`, C_COMPRAS, null, f.id, f.num);
            resumen.gastoUsd += bs / tasa; nCompras++;
        }

        console.log(`\nVentas: ${ventas.length} facturas revisadas -> ${resumen.contado} de contado, ${resumen.cobranza} a crédito ya cobradas; ${resumen.pendientes} a crédito pendientes (no generan nada), ${resumen.sinNeto} sin neto tras devoluciones`);
        console.log(`Compras: ${nCompras} facturas`);
        console.log(`Movimientos a crear: ${filas.length} (ingresos USD ${Math.round(resumen.ingresoUsd).toLocaleString('en-US')}, IVA recaudado USD ${Math.round(resumen.ivaUsd).toLocaleString('en-US')}, gastos USD ${Math.round(resumen.gastoUsd).toLocaleString('en-US')})`);
        if (!APLICAR) { console.log('\nSimulación: no se escribió nada.'); return; }

        await db.query('BEGIN');
        const COL = ['tipo', 'fecha', 'metodoPago', 'referencia', 'montoUsd', 'tasaBcvAplicada', 'montoVes', 'descripcion', 'categoriaId', 'ventaId', 'facturaCompraId'];
        for (let i = 0; i < filas.length; i += 500) {
            const lote = filas.slice(i, i + 500); const v = [];
            const m = lote.map((f, j) => { v.push(...f); const b = j * f.length; return `($${b + 1}::"enum_MovimientosFinancieros_tipo", $${b + 2}::date, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8}, $${b + 9}, $${b + 10}::uuid, $${b + 11}::uuid, $${b + 2}::timestamptz + interval '12 hours', $${b + 2}::timestamptz + interval '12 hours')`; }).join(', ');
            await db.query(`INSERT INTO "MovimientosFinancieros" (${COL.map((c) => `"${c}"`).join(', ')}, "createdAt", "updatedAt") VALUES ${m}`, v);
        }
        if (PROBAR) { await db.query('ROLLBACK'); console.log(`\nPRUEBA OK (revertida, no quedó nada): ${filas.length} movimientos.`); return; }
        await db.query('COMMIT');
        console.log(`\nCargado: ${filas.length} movimientos.`);
    } catch (e) {
        await db.query('ROLLBACK').catch(() => {});
        console.error('Falló (se revirtió todo):', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
