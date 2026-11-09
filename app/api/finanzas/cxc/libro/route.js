import { NextResponse } from 'next/server';
import sequelize from '@/sequelize';
import { requerirNoVendedor } from '../../../_lib/acceso';
import { listarGrupos } from '../../../_lib/cxcGrupos';

export const dynamic = 'force-dynamic';

const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const usd = (v, moneda, tasa) => (moneda === 'BS' ? r2(Number(v) / (Number(tasa) || 1)) : r2(v));

// Cuentas por cobrar como las lleva la administradora en Excel: una fila por documento con su monto, lo abonado, el saldo, el vencimiento, la observación,
// sus abonos y el vendedor a comisión. ?pagadas=1 incluye también las ya cobradas.
export async function GET(request) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    try {
        const pagadas = new URL(request.url).searchParams.get('pagadas') === '1';
        const q = (sql) => sequelize.query(sql, { type: sequelize.QueryTypes.SELECT });
        const filtro = pagadas ? '' : `WHERE c.estado <> 'Pagado'`;
        const filtroSub = pagadas ? '' : `WHERE estado <> 'Pagado'`;
        const [cuentas, abonos, comisiones, manuales] = await Promise.all([
            q(`SELECT c.id, c."ventaId", c."clienteId", c."montoTotal"::float AS monto, c."saldoPendiente"::float AS saldo, c.moneda::text AS moneda, c."tasaCambio"::float AS tasa,
                    c."fechaVencimiento" AS vence, c.estado::text AS estado, c.observacion, v."numeroDocumento" AS documento, v."tipoDocumento"::text AS "tipoDoc",
                    (COALESCE(v."fechaEmision", v."createdAt") AT TIME ZONE 'America/Caracas')::date AS emision, cl.nombre AS cliente, cl.identificacion AS rif
               FROM "CuentasPorCobrar" c JOIN "Ventas" v ON v.id = c."ventaId" JOIN "Clientes" cl ON cl.id = c."clienteId"
               ${filtro} ORDER BY cl.nombre, c."fechaVencimiento", v."numeroDocumento"`),
            q(`SELECT a.id, a."ventaId", a."fechaPago" AS fecha, a."montoUsd"::float AS monto, a."metodoPago" AS metodo, a.referencia, a.notas FROM "Abonos" a
               WHERE a."ventaId" IN (SELECT "ventaId" FROM "CuentasPorCobrar" ${filtroSub}) ORDER BY a."fechaPago", a.id`),
            q(`SELECT cv."ventaId", ve.nombre FROM "ComisionesVenta" cv JOIN "VendedoresComision" ve ON ve.id = cv."vendedorId" WHERE cv."ventaId" IS NOT NULL AND cv.concepto = 'FACTURA'`),
            q(`SELECT m.*, c.nombre AS "clienteNombre", c.identificacion AS rif FROM "CuentasManuales" m LEFT JOIN "Clientes" c ON c.id = m."clienteId" ORDER BY m.id`),
        ]);
        const abonosPorVenta = new Map();
        for (const a of abonos) (abonosPorVenta.get(a.ventaId) || abonosPorVenta.set(a.ventaId, []).get(a.ventaId)).push({ ...a, fecha: iso(a.fecha) });
        const vendedorPorVenta = new Map();
        for (const c of comisiones) vendedorPorVenta.set(c.ventaId, c.nombre);
        const hoy = new Date().toISOString().slice(0, 10);
        const filas = cuentas.map((c) => {
            const monto = usd(c.monto, c.moneda, c.tasa);
            const saldo = usd(c.saldo, c.moneda, c.tasa);
            const vence = iso(c.vence);
            return {
                id: c.id, ventaId: c.ventaId, clienteId: c.clienteId, cliente: c.cliente, rif: c.rif, documento: c.documento, tipoDoc: c.tipoDoc, emision: iso(c.emision), vence,
                monto, abonado: r2(monto - saldo), saldo, estado: c.estado, vencida: saldo > 0.005 && Boolean(vence) && vence < hoy, observacion: c.observacion || '',
                vendedor: vendedorPorVenta.get(c.ventaId) || null, abonos: abonosPorVenta.get(c.ventaId) || [],
            };
        });
        // Cuentas manuales (deudas, préstamos): mismas columnas que una factura; `manual: true` indica a la pantalla qué rutas usar
        for (const m of manuales) {
            const abs = (Array.isArray(m.abonos) ? m.abonos : []).map((a) => ({ ...a, cuentaId: m.id }));
            const monto = r2(m.montoUsd); const saldo = r2(monto - abs.reduce((a, x) => a + Number(x.monto), 0));
            if (!pagadas && saldo <= 0.005) continue;
            const vence = iso(m.vence);
            filas.push({
                id: `m${m.id}`, idReal: m.id, manual: true, ventaId: null, clienteId: m.clienteId || `m:${m.clienteTexto}`, cliente: m.clienteNombre || m.clienteTexto, rif: m.rif || '',
                documento: m.concepto, tipoDoc: 'MANUAL', emision: iso(m.fecha), vence, monto, abonado: r2(monto - saldo), saldo, estado: saldo <= 0.005 ? 'Pagado' : 'Pendiente',
                vencida: saldo > 0.005 && Boolean(vence) && vence < hoy, observacion: m.observacion || '', vendedor: null, abonos: abs,
            });
        }
        filas.sort((a, b) => String(a.cliente).localeCompare(String(b.cliente)) || String(a.vence || '').localeCompare(String(b.vence || '')));
        const pendientes = filas.filter((f) => f.saldo > 0.005);
        // Grupos (pestañas) con sus clientes; si todavía no existen las tablas el libro sigue funcionando, solo sin pestañas
        const grupos = await listarGrupos().catch(() => []);
        return NextResponse.json({
            filas, grupos,
            resumen: {
                documentos: pendientes.length, saldo: r2(pendientes.reduce((a, f) => a + f.saldo, 0)),
                vencido: r2(pendientes.filter((f) => f.vencida).reduce((a, f) => a + f.saldo, 0)), clientes: new Set(pendientes.map((f) => f.clienteId)).size,
            },
        });
    } catch (error) {
        console.error('Libro de cuentas por cobrar:', error);
        return NextResponse.json({ error: 'No se pudo cargar el libro de cuentas por cobrar' }, { status: 500 });
    }
}
