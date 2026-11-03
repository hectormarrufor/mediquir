import { NextResponse } from 'next/server';
import { Producto } from '@/models';
import { columnasPedidas } from '@/app/constants/inventarioExportacion';
import { exacto } from '@/app/helpers/sinRedondeo';
import { crearXlsx } from '@/app/api/_lib/xlsx';
import { INCLUDES, filaProducto, tagsPorProducto, requerirStaff, puedeEditarInventario } from '../_lib';
import { leerParametros, construirWhere } from './_consulta';
import { obtenerEntradas, idsDeEntradas, contarProductos } from './_entradas';
import { aplicarLote } from './_lote';

const TOPE_EXPORTACION = 5000;

const filasCompletas = async (ids) => {
    const [productos, tags] = await Promise.all([
        Producto.findAll({ include: INCLUDES, where: { id: ids }, subQuery: false }),
        tagsPorProducto(ids),
    ]);
    return new Map(productos.map((p) => [p.id, filaProducto(p, tags.get(p.id) || [])]));
};

// GET /api/inventario/productos
//   ?page=1&pageSize=50&q=papel&categoriaId=&marcaId=&grupoId=&tagId=&oferta=con&stock=bajo&sort=stockAlmacen&dir=asc
//   &formato=xlsx (o csv) &columnas=codigo,nombre,... -> descarga todo el resultado filtrado (hasta 5000 filas) para Excel,
//                                                       solo con las columnas elegidas (ver app/constants/inventarioExportacion.js)
//
// Se pagina por ENTRADAS: un grupo de equivalencia con sus hermanos cuenta como una sola entrada.
export async function GET(request) {
    try {
        const { sesion, error } = await requerirStaff();
        if (error) return error;

        const url = new URL(request.url);
        const f = leerParametros(url.searchParams);
        const entradas = await obtenerEntradas(f, construirWhere(f));

        const formato = url.searchParams.get('formato');
        if (formato === 'csv' || formato === 'xlsx') return await exportar(entradas, formato, url.searchParams.get('columnas'));

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

// Fecha de hoy en Caracas (UTC-4 todo el año) para el nombre del archivo
const hoyCaracas = () => new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10);

const celdaCsv = (v, tipo) => {
    if (v === null || v === undefined || v === '') return '';
    let s;
    if (tipo === 'numero') s = String(exacto(v)).replace('.', ',');
    else if (tipo === 'fecha') s = new Date(new Date(v).getTime() - 4 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ');
    else s = String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Solo las columnas que eligió la persona (&columnas=codigo,nombre,...), en el orden de la lista.
// Excel (.xlsx) por defecto; &formato=csv sigue funcionando para quien lo use.
async function exportar(entradas, formato, columnasTexto) {
    const columnas = columnasPedidas(columnasTexto);
    const ids = idsDeEntradas(entradas).slice(0, TOPE_EXPORTACION);
    const filas = await filasCompletas(ids);
    const datos = [];
    entradas.forEach((e) => {
        const idsEntrada = e.tipo === 'grupo' ? e.hijos.map((h) => h.id) : [e.producto.id];
        idsEntrada.forEach((id) => {
            const r = filas.get(id);
            if (r) datos.push(columnas.map((c) => c.valor(r, e)));
        });
    });

    if (formato === 'csv') {
        const lineas = datos.map((fila) => fila.map((v, i) => celdaCsv(v, columnas[i].tipo)).join(';'));
        // BOM + ';' para que Excel en español lo abra con columnas y acentos correctos
        const cuerpo = '﻿' + [columnas.map((c) => celdaCsv(c.label)).join(';'), ...lineas].join('\r\n');
        return new NextResponse(cuerpo, {
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="inventario-${hoyCaracas()}.csv"`,
            },
        });
    }

    const archivo = crearXlsx({ hoja: 'Inventario', columnas, filas: datos });
    return new NextResponse(archivo, {
        headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="inventario-${hoyCaracas()}.xlsx"`,
        },
    });
}
