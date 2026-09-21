import { NextResponse } from 'next/server';
import { sequelize } from '@/models';
import { puedeEditarInventario, requerirStaff } from '../_lib';
import { aplicarLote } from '../productos/_lote';

export const dynamic = 'force-dynamic';

const CAMPOS_EDITABLES = ['costoUsd', 'precio6', 'precio7', 'porcentajeIva', 'presentacion', 'unidadesPorCaja', 'cajasPorBulto', 'unidadesPorBulto'];
const BLOB = process.env.NEXT_PUBLIC_BLOB_BASE_URL;
const consulta = (sql, replacements) => sequelize.query(sql, { replacements });
const num = (v) => (v === null || v === undefined ? 0 : Number(v));
const baseDe = (codigo) => String(codigo).split('-')[0];

// Peso de cada alerta para ordenar la cola: lo dudoso primero. "Sin costo" pesa poco porque hoy ningún producto nuevo lo tiene.
const PESO = { DIF_REPORTE: 3, POSIBLE_CAJA: 3, P7_MENOR_P6: 3, P6_MENOR_COSTO: 3, SIN_P7: 3, NOTA: 2, SIN_COSTO: 0.5 };

function alertasDe(f, ref, notas) {
    const a = [];
    const p6 = num(f.precio6), p7 = num(f.precio7), costo = num(f.costoUsd), upc = num(f.upc);
    if (costo <= 0) a.push('SIN_COSTO');
    if (p7 <= 0) a.push('SIN_P7');
    if (p7 > 0 && p6 > 0 && p7 < p6) a.push('P7_MENOR_P6');
    if (costo > 0 && p6 > 0 && p6 < costo) a.push('P6_MENOR_COSTO');
    const paq = /^paqx(\d+)$/.exec(f.presentacion || '');
    if ((upc >= 20 && p6 >= 1) || (paq && +paq[1] >= 50 && p6 > 0 && p6 < 0.5)) a.push('POSIBLE_CAJA');
    if (ref && num(ref.p6) > 0 && p6 > 0 && Math.abs(num(ref.p6) - p6) / p6 > 0.05) a.push('DIF_REPORTE');
    if (notas?.length) a.push('NOTA');
    return a;
}

// Cola de auditoría: una ficha por PRODUCTO BASE (el código sin sufijo); las marcas del mismo producto (-01, -02...) comparten la ficha
// y cualquier cambio se aplica a todas.
export async function GET(request) {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;
    if (!(await puedeEditarInventario(acceso.sesion))) return NextResponse.json({ error: 'No tienes permiso para ver costos ni editar el inventario' }, { status: 403 });
    try {
        const { searchParams } = new URL(request.url);
        const filtro = searchParams.get('filtro') || 'alertas';
        const excluir = new Set((searchParams.get('excluir') || '').split(',').filter(Boolean));
        const limite = Math.min(Number(searchParams.get('limite')) || 20, 50);

        const [filas] = await consulta(`
            SELECT p.id, p.codigo, p.nombre, p.imagen, m.nombre marca, c.nombre categoria, g.imagen gimagen, p."costoUsd", p.precio6, p.precio7, p."porcentajeIva" iva,
                   p.presentacion, p."unidadesPorCaja" upc, p."cajasPorBulto" cpb, p."unidadesPorBulto" upb, a.estado, a.referencia, a.notas
              FROM "DatoAuditoria" a JOIN "Productos" p ON p.id = a."productoId"
              LEFT JOIN "Marcas" m ON m.id = p."marcaId" LEFT JOIN "Categorias" c ON c.id = p."categoriaId" LEFT JOIN "GruposEquivalencia" g ON g.id = p."grupoEquivalenciaId"
             ORDER BY p.codigo`);
        const [[{ aprobados }]] = [await consulta(`SELECT count(*)::int aprobados FROM "DatoAuditoria" WHERE estado = 'APROBADO'`)].map((r) => r[0]);

        const porBase = new Map();
        for (const f of filas.filter((x) => x.estado === 'PENDIENTE')) {
            const b = baseDe(f.codigo);
            if (!porBase.has(b)) porBase.set(b, { base: b, rep: f, variantes: [] });
            porBase.get(b).variantes.push({ id: f.id, codigo: f.codigo, marca: f.marca });
        }
        const fichas = [...porBase.values()].map((x) => {
            const alertas = alertasDe(x.rep, x.rep.referencia, x.rep.notas);
            return { ...x, alertas, peso: alertas.reduce((s, k) => s + (PESO[k] || 0), 0) };
        });

        const conteo = { total: fichas.length, aprobados, alertas: fichas.filter((x) => x.peso >= 2).length };
        Object.keys(PESO).forEach((k) => { conteo[k] = fichas.filter((x) => x.alertas.includes(k)).length; });

        const elegidas = fichas
            .filter((x) => !excluir.has(x.base))
            .filter((x) => (filtro === 'todos' ? true : filtro === 'alertas' ? x.peso >= 2 : x.alertas.includes(filtro)))
            .sort((a, b) => b.peso - a.peso || a.base.localeCompare(b.base))
            .slice(0, limite);

        return NextResponse.json({
            conteo,
            items: elegidas.map((x) => ({
                base: x.base, id: x.rep.id, codigo: x.rep.codigo, nombre: x.rep.nombre, categoria: x.rep.categoria,
                imagen: x.rep.imagen || x.rep.gimagen ? `${BLOB}/${x.rep.imagen || x.rep.gimagen}` : null,
                marcas: x.variantes.map((v) => v.marca).filter(Boolean),
                variantes: x.variantes,
                datos: { costoUsd: num(x.rep.costoUsd), precio6: num(x.rep.precio6), precio7: num(x.rep.precio7), porcentajeIva: num(x.rep.iva), presentacion: x.rep.presentacion, unidadesPorCaja: x.rep.upc, cajasPorBulto: x.rep.cpb, unidadesPorBulto: x.rep.upb },
                referencia: x.rep.referencia, notas: x.rep.notas || [], alertas: x.alertas,
            })),
        });
    } catch (error) {
        console.error('Auditoría de datos:', error);
        return NextResponse.json({ error: 'No se pudo cargar la cola de auditoría' }, { status: 500 });
    }
}

// APROBAR { ids } · GUARDAR { ids, cambios } (aplica los cambios a todas las marcas del producto y lo da por revisado)
export async function POST(request) {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;
    if (!(await puedeEditarInventario(acceso.sesion))) return NextResponse.json({ error: 'No tienes permiso para editar el inventario' }, { status: 403 });
    try {
        const { accion, ids, cambios } = await request.json();
        const lista = [...new Set((ids || []).map(Number).filter(Number.isInteger))];
        if (!lista.length || lista.length > 60) return NextResponse.json({ error: 'Datos no válidos' }, { status: 400 });
        const [validos] = await consulta(`SELECT "productoId" FROM "DatoAuditoria" WHERE "productoId" IN (:ids)`, { ids: lista });
        if (validos.length !== lista.length) return NextResponse.json({ error: 'Alguno de los productos no está en la auditoría' }, { status: 404 });

        if (accion === 'GUARDAR') {
            const limpios = Object.fromEntries(Object.entries(cambios || {}).filter(([k]) => CAMPOS_EDITABLES.includes(k)));
            if (!Object.keys(limpios).length) return NextResponse.json({ error: 'No hay cambios' }, { status: 400 });
            // Con caja, el total del bulto se calcula solo (cajas x unidades por caja): no se envía
            const [[actual]] = await consulta(`SELECT "unidadesPorCaja" upc FROM "Productos" WHERE id = :id`, { id: lista[0] });
            const upcFinal = 'unidadesPorCaja' in limpios ? limpios.unidadesPorCaja : actual?.upc;
            if (Number(upcFinal) > 1) delete limpios.unidadesPorBulto; else if ('unidadesPorCaja' in limpios) limpios.cajasPorBulto = null;
            const r = await aplicarLote(lista.map((id) => ({ id, cambios: limpios })));
            if (r.error) return NextResponse.json({ error: r.error }, { status: r.status || 400 });
            if (r.errores?.length) return NextResponse.json({ error: r.errores[0].error }, { status: 400 });
        } else if (accion !== 'APROBAR') return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });

        await consulta(`UPDATE "DatoAuditoria" SET estado = 'APROBADO', "revisadoPor" = :uid, "revisadoEn" = NOW() WHERE "productoId" IN (:ids)`, { ids: lista, uid: Number(acceso.sesion.id) || null });
        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('Auditoría de datos (acción):', error);
        return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 });
    }
}
