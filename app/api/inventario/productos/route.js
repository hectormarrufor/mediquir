import { NextResponse } from 'next/server';
import { Producto } from '@/models';
import { costoPorCaja, costoPorBulto } from '@/app/constants/inventarioCampos';
import { INCLUDES, filaProducto, tagsPorProducto, requerirStaff, puedeEditarInventario } from '../_lib';
import { leerParametros, construirWhere } from './_consulta';
import { obtenerEntradas, idsDeEntradas, contarProductos } from './_entradas';
import { aplicarLote } from './_lote';

const TOPE_CSV = 5000;

const filasCompletas = async (ids) => {
    const [productos, tags] = await Promise.all([
        Producto.findAll({ include: INCLUDES, where: { id: ids }, subQuery: false }),
        tagsPorProducto(ids),
    ]);
    return new Map(productos.map((p) => [p.id, filaProducto(p, tags.get(p.id) || [])]));
};

// GET /api/inventario/productos
//   ?page=1&pageSize=50&q=papel&categoriaId=&marcaId=&grupoId=&tagId=&oferta=con&stock=bajo&sort=stockAlmacen&dir=asc
//   &formato=csv  -> descarga todo el resultado filtrado (hasta 5000 filas) como CSV para Excel
//
// Se pagina por ENTRADAS: un grupo de equivalencia con sus hermanos cuenta como una sola entrada.
export async function GET(request) {
    try {
        const { sesion, error } = await requerirStaff();
        if (error) return error;

        const url = new URL(request.url);
        const f = leerParametros(url.searchParams);
        const entradas = await obtenerEntradas(f, construirWhere(f));

        if (url.searchParams.get('formato') === 'csv') return await exportarCsv(entradas);

        const total = entradas.length;
        const totalPages = Math.max(1, Math.ceil(total / f.pageSize));
        const pagina = entradas.slice((f.page - 1) * f.pageSize, f.page * f.pageSize);

        const [filas, puedeEditar] = await Promise.all([filasCompletas(idsDeEntradas(pagina)), puedeEditarInventario(sesion)]);

        const resultado = pagina.map((e) => {
            if (e.tipo === 'producto') return { tipo: 'producto', fila: filas.get(e.producto.id) };
            const g = e.grupo;
            return {
                tipo: 'grupo',
                grupo: { id: g.id, nombre: g.nombre, imagen: g.imagen, categoriaId: g.categoriaId, categoria: g.categoria, stockMinimoGlobal: g.stockMinimoGlobal, stockTotal: g.stockTotal, nProductos: g.nProductos, estado: g.estado },
                filas: e.hijos.map((h) => filas.get(h.id)).filter(Boolean),
            };
        });

        return NextResponse.json({
            entries: resultado,
            total,                                   // entradas (grupos + productos sueltos)
            totalProductos: contarProductos(entradas), // productos que cumplen los filtros
            page: f.page,
            pageSize: f.pageSize,
            totalPages,
            permisos: { editar: puedeEditar },
        });
    } catch (err) {
        console.error('Error listando inventario:', err);
        return NextResponse.json({ error: 'Error al cargar el inventario' }, { status: 500 });
    }
}

// PATCH /api/inventario/productos   { items: [{ id, cambios: { campo: valor }, esperado?: { stockAlmacen } }] }
// Edición masiva (pegar un bloque desde Excel). Una sola sentencia UPDATE por conjunto de campos.
export async function PATCH(request) {
    try {
        const { sesion, error } = await requerirStaff();
        if (error) return error;
        if (!(await puedeEditarInventario(sesion))) {
            return NextResponse.json({ error: 'No tienes permiso para editar el inventario' }, { status: 403 });
        }

        const { items } = await request.json();
        const resultado = await aplicarLote(items);
        if (resultado.error) return NextResponse.json({ error: resultado.error }, { status: resultado.status || 400 });
        return NextResponse.json(resultado);
    } catch (err) {
        console.error('Error en edición masiva de inventario:', err);
        return NextResponse.json({ error: 'Error al actualizar el inventario' }, { status: 500 });
    }
}

const celdaCsv = (v) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'number' ? String(Math.round(v * 100000) / 100000).replace('.', ',') : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function exportarCsv(entradas) {
    const ids = idsDeEntradas(entradas).slice(0, TOPE_CSV);
    const filas = await filasCompletas(ids);
    const cab = ['Código', 'Producto', 'Categoría', 'Marca', 'Grupo', 'Stock', 'Stock mínimo (grupo o propio)', 'Costo por unidad USD', 'Precio 6', 'Precio 7', '% Descuento', '% IVA', 'Presentación', 'Und por caja', 'Cajas por bulto', 'Und por bulto', 'Costo por caja', 'Costo por bulto', 'Modificado'];
    const lineas = [];
    entradas.forEach((e) => {
        const ids2 = e.tipo === 'grupo' ? e.hijos.map((h) => h.id) : [e.producto.id];
        ids2.forEach((id) => {
            const r = filas.get(id);
            if (!r) return;
            const minimo = e.tipo === 'grupo' ? e.grupo.stockMinimoGlobal : r.stockMinimo;
            lineas.push([r.codigo, r.nombre, r.categoria?.nombre, r.marca?.nombre, r.grupo?.nombre, r.stockAlmacen, minimo, r.costoUsd, r.precio6, r.precio7, r.porcentajeDescuento, r.porcentajeIva, r.presentacion, r.unidadesPorCaja, r.cajasPorBulto, r.unidadesPorBulto, costoPorCaja(r), costoPorBulto(r), new Date(r.updatedAt).toISOString().slice(0, 16).replace('T', ' ')]
                .map(celdaCsv).join(';'));
        });
    });
    // BOM + ';' para que Excel en español lo abra con columnas y acentos correctos
    const cuerpo = '﻿' + [cab.join(';'), ...lineas].join('\r\n');
    return new NextResponse(cuerpo, {
        headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="inventario-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
    });
}
