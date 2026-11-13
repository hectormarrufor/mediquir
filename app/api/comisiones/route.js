import { NextResponse } from 'next/server';
import sequelize from '@/sequelize';
import db from '@/models';
import { requerirNoVendedor } from '../_lib/acceso';
import { tasaVigente } from '../_lib/tasaBcv';

export const dynamic = 'force-dynamic';
const { ComisionVenta, VendedorComision, Venta } = db;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const numOpt = (v) => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : r2(v));
const fechaOpt = (v) => (FECHA.test(String(v || '')) ? v : null);
// La comisión por venta va del 2 % al 10 %
export const PCT_MIN = 2;
export const PCT_MAX = 10;
export const porcentajeValido = (v) => Number.isFinite(Number(v)) && Number(v) >= PCT_MIN && Number(v) <= PCT_MAX;

// Número de documento escrito por la persona ("146288", "F-146288", "0000-5666", "NE-05666") -> el número con el que está guardado en Ventas
export function numeroDeDocumento(texto) {
    const t = String(texto || '').trim();
    if (/^F-\d+$/i.test(t)) return t.toUpperCase();
    if (/^NE-\d+$/i.test(t)) return `NE-${t.slice(3).padStart(5, '0')}`;
    if (/^\d{5,6}$/.test(t)) return `F-${t}`;
    if (/^\d{4}-\d{4}$/.test(t)) return `NE-${t.slice(5).padStart(5, '0')}`;
    if (/^\d{4}$/.test(t)) return `NE-${t.padStart(5, '0')}`;
    return null;
}

// La factura (o nota de entrega) a la que pertenece un abono: su monto, su base sin IVA y su porcentaje
export async function padreDe(vendedorId, documento) {
    if (!documento) return null;
    const [padre] = await sequelize.query(
        `SELECT "montoUsd"::float AS monto, "baseUsd"::float AS base, porcentaje::float AS pct FROM "ComisionesVenta"
          WHERE "vendedorId" = :v AND "documentoTexto" = :d AND concepto = 'FACTURA' AND "montoUsd" > 0 ORDER BY id LIMIT 1`,
        { replacements: { v: vendedorId, d: documento }, type: sequelize.QueryTypes.SELECT },
    );
    return padre || null;
}
// Un abono genera su comisión sobre la parte SIN IVA de lo abonado: se toma la proporción sin IVA de su factura (a comisionar / monto de la factura)
export async function baseDePago(vendedorId, documento, montoPago) {
    const importe = Math.abs(Number(montoPago));
    if (!Number.isFinite(importe)) return null;
    const padre = await padreDe(vendedorId, documento);
    const razon = padre && padre.monto > 0 && padre.base !== null ? Math.min(1, padre.base / padre.monto) : 1;
    return r2(importe * razon);
}

// Hojas de los vendedores a comisión: sus líneas (facturas, abonos y notas de crédito) con la comisión de cada una y el resumen de lo pendiente y lo pagado
export async function GET() {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    try {
        const vendedores = await VendedorComision.findAll({ order: [['nombre', 'ASC']], raw: true });
        // De la factura enlazada también: su cliente en el sistema y lo que todavía debe (saldo de su cuenta por cobrar, en USD),
        // para que la hoja muestre cuánto debe cada cliente y si cada factura ya se cobró
        const lineas = await sequelize.query(
            `SELECT cv.*, v."numeroDocumento" AS "numeroVenta", v."statusPago"::text AS "pagoVenta",
                    v."clienteId" AS "clienteIdVenta", cl.nombre AS "clienteNombre",
                    (SELECT (CASE WHEN c.moneda::text = 'BS' THEN c."saldoPendiente" / NULLIF(c."tasaCambio", 0) ELSE c."saldoPendiente" END)::float
                       FROM "CuentasPorCobrar" c WHERE c."ventaId" = cv."ventaId" ORDER BY c.id DESC LIMIT 1) AS "saldoCxc"
               FROM "ComisionesVenta" cv LEFT JOIN "Ventas" v ON v.id = cv."ventaId" LEFT JOIN "Clientes" cl ON cl.id = v."clienteId"
              ORDER BY cv."vendedorId", cv.fecha NULLS LAST, cv.id`,
            { type: sequelize.QueryTypes.SELECT },
        );
        const por = new Map();
        for (const l of lineas) (por.get(l.vendedorId) || por.set(l.vendedorId, []).get(l.vendedorId)).push({
            ...l, montoUsd: l.montoUsd === null ? null : Number(l.montoUsd), baseUsd: l.baseUsd === null ? null : Number(l.baseUsd), porcentaje: l.porcentaje === null ? null : Number(l.porcentaje),
            comisionUsd: l.comisionUsd === null ? null : Number(l.comisionUsd), fecha: l.fecha ? new Date(l.fecha).toISOString().slice(0, 10) : null,
            vencimiento: l.vencimiento ? new Date(l.vencimiento).toISOString().slice(0, 10) : null, fechaPagoComision: l.fechaPagoComision ? new Date(l.fechaPagoComision).toISOString().slice(0, 10) : null,
        });
        // Préstamos: movimientos por vendedor (si la migración prestamos-vendedores aún no corrió, se ven como sin préstamos)
        const movs = new Map();
        const pagosPor = new Map();
        try {
            const m = await sequelize.query(`SELECT id, "vendedorId", tipo, "montoUsd"::float AS "montoUsd", fecha::text AS fecha, nota, "pagoComisionId" FROM "MovimientosPrestamoVendedor" ORDER BY fecha DESC, id DESC`, { type: sequelize.QueryTypes.SELECT });
            for (const x of m) (movs.get(x.vendedorId) || movs.set(x.vendedorId, []).get(x.vendedorId)).push(x);
            const p = await sequelize.query(`SELECT id, "vendedorId", fecha::text AS fecha, "totalComisionUsd"::float AS "totalComisionUsd", "abonoPrestamoUsd"::float AS "abonoPrestamoUsd", "pagadoUsd"::float AS "pagadoUsd" FROM "PagosComision" ORDER BY fecha DESC, id DESC`, { type: sequelize.QueryTypes.SELECT });
            for (const x of p) (pagosPor.get(x.vendedorId) || pagosPor.set(x.vendedorId, []).get(x.vendedorId)).push(x);
        } catch { /* sin tablas todavía */ }
        const salida = vendedores.map((v) => {
            const ls = por.get(v.id) || [];
            const ms = movs.get(v.id) || [];
            const prestado = r2(ms.filter((x) => x.tipo === 'PRESTAMO').reduce((a, x) => a + x.montoUsd, 0));
            const abonado = r2(ms.filter((x) => x.tipo === 'ABONO').reduce((a, x) => a + x.montoUsd, 0));
            const suma = (lista) => r2(lista.reduce((a, l) => a + (Number(l.comisionUsd) || 0), 0));
            return {
                ...v, porcentaje: Number(v.porcentaje), comisionAbonadaUsd: Number(v.comisionAbonadaUsd) || 0, lineas: ls,
                prestamo: { saldo: r2(prestado - abonado), prestado, abonado, movimientos: ms }, pagos: (pagosPor.get(v.id) || []).slice(0, 20),
                resumen: { lineas: ls.length, comisionPendiente: suma(ls.filter((l) => l.estatusComision !== 'PAGADA')), comisionPagada: suma(ls.filter((l) => l.estatusComision === 'PAGADA')) },
            };
        });
        // La comisión se paga en bolívares: la pantalla la convierte con la tasa BCV del día (null si no hay ninguna registrada)
        const tasaBcv = await tasaVigente().catch(() => null);
        return NextResponse.json({ vendedores: salida, tasaBcv });
    } catch (error) {
        console.error('Comisiones:', error);
        return NextResponse.json({ error: 'No se pudieron cargar las comisiones' }, { status: 500 });
    }
}

// Agrega una línea a la hoja de un vendedor: { vendedorId, concepto, fecha, documento, cliente, montoUsd, baseUsd, porcentaje, estatusCliente, observacion }
export async function POST(request) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    try {
        const b = await request.json();
        const vendedor = await VendedorComision.findByPk(Number(b.vendedorId));
        if (!vendedor) return NextResponse.json({ error: 'Elige un vendedor' }, { status: 400 });
        const numero = numeroDeDocumento(b.documento);
        const venta = numero ? await Venta.findOne({ where: { numeroDocumento: numero }, attributes: ['id'] }) : null;
        const concepto = ['FACTURA', 'ABONO', 'NOTA'].includes(b.concepto) ? b.concepto : 'FACTURA';
        const documentoTexto = String(b.documento || '').trim().slice(0, 60) || null;
        // el porcentaje se fija en la factura: un abono toma el de su factura
        const padre = concepto === 'ABONO' ? await padreDe(vendedor.id, documentoTexto) : null;
        const pct = padre && padre.pct !== null ? padre.pct : (numOpt(b.porcentaje) ?? Number(vendedor.porcentaje));
        if (!porcentajeValido(pct)) return NextResponse.json({ error: `El porcentaje de comisión debe estar entre ${PCT_MIN}% y ${PCT_MAX}%` }, { status: 400 });
        let monto = numOpt(b.montoUsd);
        if (concepto === 'ABONO' && monto !== null) monto = -Math.abs(monto); // un abono baja lo que debe el cliente: se guarda restando
        let base = numOpt(b.baseUsd);
        if (base === null && concepto === 'ABONO' && monto !== null) base = await baseDePago(vendedor.id, documentoTexto, monto);
        const linea = await ComisionVenta.create({
            vendedorId: vendedor.id, ventaId: venta?.id || null, concepto, fecha: fechaOpt(b.fecha), vencimiento: fechaOpt(b.vencimiento),
            documentoTexto, clienteTexto: String(b.cliente || '').trim().slice(0, 200) || null,
            montoUsd: monto, baseUsd: base, porcentaje: pct, comisionUsd: numOpt(b.comisionUsd) ?? (base !== null ? r2((base * pct) / 100) : null),
            estatusCliente: String(b.estatusCliente || '').trim().slice(0, 120) || null, estatusComision: 'PENDIENTE', observacion: String(b.observacion || '').trim() || null,
        });
        return NextResponse.json({ ok: true, linea, enlazada: Boolean(venta) }, { status: 201 });
    } catch (error) {
        console.error('Agregar comisión:', error);
        return NextResponse.json({ error: 'No se pudo agregar la línea' }, { status: 500 });
    }
}
