import { NextResponse } from 'next/server';
import sequelize from '@/sequelize';
import db from '@/models';
import { requerirNoVendedor } from '../_lib/acceso';

export const dynamic = 'force-dynamic';
const { ComisionVenta, VendedorComision, Venta } = db;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const numOpt = (v) => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : r2(v));
const fechaOpt = (v) => (FECHA.test(String(v || '')) ? v : null);

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

// Hojas de los vendedores a comisión: sus líneas (facturas, abonos y notas de crédito) con la comisión de cada una y el resumen de lo pendiente y lo pagado
export async function GET() {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    try {
        const vendedores = await VendedorComision.findAll({ order: [['nombre', 'ASC']], raw: true });
        const lineas = await sequelize.query(
            `SELECT cv.*, v."numeroDocumento" AS "numeroVenta", v."statusPago"::text AS "pagoVenta"
               FROM "ComisionesVenta" cv LEFT JOIN "Ventas" v ON v.id = cv."ventaId" ORDER BY cv."vendedorId", cv.fecha NULLS LAST, cv.id`,
            { type: sequelize.QueryTypes.SELECT },
        );
        const por = new Map();
        for (const l of lineas) (por.get(l.vendedorId) || por.set(l.vendedorId, []).get(l.vendedorId)).push({
            ...l, montoUsd: l.montoUsd === null ? null : Number(l.montoUsd), baseUsd: l.baseUsd === null ? null : Number(l.baseUsd), porcentaje: l.porcentaje === null ? null : Number(l.porcentaje),
            comisionUsd: l.comisionUsd === null ? null : Number(l.comisionUsd), fecha: l.fecha ? new Date(l.fecha).toISOString().slice(0, 10) : null,
            vencimiento: l.vencimiento ? new Date(l.vencimiento).toISOString().slice(0, 10) : null, fechaPagoComision: l.fechaPagoComision ? new Date(l.fechaPagoComision).toISOString().slice(0, 10) : null,
        });
        const salida = vendedores.map((v) => {
            const ls = por.get(v.id) || [];
            const suma = (lista) => r2(lista.reduce((a, l) => a + (Number(l.comisionUsd) || 0), 0));
            return {
                ...v, porcentaje: Number(v.porcentaje), lineas: ls,
                resumen: { lineas: ls.length, comisionPendiente: suma(ls.filter((l) => l.estatusComision !== 'PAGADA')), comisionPagada: suma(ls.filter((l) => l.estatusComision === 'PAGADA')) },
            };
        });
        return NextResponse.json({ vendedores: salida });
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
        const base = numOpt(b.baseUsd);
        const pct = numOpt(b.porcentaje) ?? Number(vendedor.porcentaje);
        const concepto = ['FACTURA', 'ABONO', 'NOTA'].includes(b.concepto) ? b.concepto : 'FACTURA';
        const linea = await ComisionVenta.create({
            vendedorId: vendedor.id, ventaId: venta?.id || null, concepto, fecha: fechaOpt(b.fecha), vencimiento: fechaOpt(b.vencimiento),
            documentoTexto: String(b.documento || '').trim().slice(0, 60) || null, clienteTexto: String(b.cliente || '').trim().slice(0, 200) || null,
            montoUsd: numOpt(b.montoUsd), baseUsd: base, porcentaje: pct, comisionUsd: numOpt(b.comisionUsd) ?? (base !== null ? r2((base * pct) / 100) : null),
            estatusCliente: String(b.estatusCliente || '').trim().slice(0, 120) || null, estatusComision: 'PENDIENTE', observacion: String(b.observacion || '').trim() || null,
        });
        return NextResponse.json({ ok: true, linea, enlazada: Boolean(venta) }, { status: 201 });
    } catch (error) {
        console.error('Agregar comisión:', error);
        return NextResponse.json({ error: 'No se pudo agregar la línea' }, { status: 500 });
    }
}
