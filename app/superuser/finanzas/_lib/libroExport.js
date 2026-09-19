import { MEMBRETE_MEDIQUIR } from '@/app/constants/empresa';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const nombreMes = (mes) => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;

const dinero = (v) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);
const fmtFecha = (v) => (v ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : '');

// Definición de cada libro: columnas y cómo se muestra cada valor. Las columnas que el sistema no guarda van vacías a propósito.
export const LIBROS = {
    ventas: {
        titulo: 'Libro de Ventas',
        columnas: [
            { clave: 'n', titulo: 'N° op.' }, { clave: 'fecha', titulo: 'Fecha', f: fmtFecha }, { clave: 'tipoDocumento', titulo: 'Tipo doc.' }, { clave: 'numero', titulo: 'N° documento' },
            { clave: 'control', titulo: 'N° control', vacia: true }, { clave: 'rif', titulo: 'RIF / C.I.' }, { clave: 'nombre', titulo: 'Nombre o razón social' },
            { clave: 'total', titulo: 'Total ventas (Bs)', num: true }, { clave: 'exento', titulo: 'Exentas (Bs)', num: true }, { clave: 'base', titulo: 'Base imponible (Bs)', num: true },
            { clave: 'alicuota', titulo: '% IVA' }, { clave: 'iva', titulo: 'IVA (Bs)', num: true }, { clave: 'tasa', titulo: 'Tasa BCV', num: true }, { clave: 'totalUsd', titulo: 'Total USD', num: true },
        ],
        totales: ['total', 'exento', 'base', 'iva', 'totalUsd'],
    },
    compras: {
        titulo: 'Libro de Compras',
        columnas: [
            { clave: 'n', titulo: 'N° op.' }, { clave: 'fecha', titulo: 'Fecha', f: fmtFecha }, { clave: 'tipoDocumento', titulo: 'Tipo doc.' }, { clave: 'numero', titulo: 'N° factura' },
            { clave: 'control', titulo: 'N° control', vacia: true }, { clave: 'rif', titulo: 'RIF proveedor' }, { clave: 'nombre', titulo: 'Razón social' },
            { clave: 'total', titulo: 'Total compras (Bs)', num: true }, { clave: 'exento', titulo: 'Exentas (Bs)', num: true }, { clave: 'base', titulo: 'Base imponible (Bs)', num: true },
            { clave: 'alicuota', titulo: '% IVA' }, { clave: 'iva', titulo: 'IVA (Bs)', num: true }, { clave: 'retenido', titulo: 'IVA retenido (Bs)', num: true }, { clave: 'tasa', titulo: 'Tasa BCV', num: true },
        ],
        totales: ['total', 'exento', 'base', 'iva', 'retenido'],
    },
    movimientos: {
        titulo: 'Libro de Caja (ingresos y gastos)',
        columnas: [
            { clave: 'fecha', titulo: 'Fecha', f: fmtFecha }, { clave: 'tipo', titulo: 'Tipo' }, { clave: 'categoria', titulo: 'Categoría' }, { clave: 'metodo', titulo: 'Método' },
            { clave: 'referencia', titulo: 'Referencia' }, { clave: 'descripcion', titulo: 'Descripción' },
            { clave: 'montoUsd', titulo: 'USD', num: true }, { clave: 'tasa', titulo: 'Tasa BCV', num: true }, { clave: 'montoVes', titulo: 'Bs', num: true },
        ],
        totales: [],
    },
};

const valor = (col, fila) => {
    if (col.vacia) return '';
    const v = fila[col.clave];
    if (v === null || v === undefined) return '';
    if (col.f) return col.f(v);
    if (col.num) return dinero(v);
    if (col.clave === 'alicuota') return v ? `${v}%` : '';
    return String(v);
};

const totalDe = (libro, filas, clave) => filas.reduce((a, f) => a + (Number(f[clave]) || 0), 0);

function descargar(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// CSV listo para Excel en español: separador ";", coma decimal y BOM UTF-8 (para que los acentos se vean bien)
export function descargarCsv(clave, datos) {
    const libro = LIBROS[clave];
    const filas = datos[clave];
    const esc = (t) => `"${String(t ?? '').replace(/"/g, '""')}"`;
    const lineas = [
        [`${MEMBRETE_MEDIQUIR.nombre} - RIF ${MEMBRETE_MEDIQUIR.rif}`], [`${libro.titulo} - ${nombreMes(datos.mes)}`], [datos.aviso], [],
        libro.columnas.map((c) => c.titulo),
        ...filas.map((f) => libro.columnas.map((c) => valor(c, f))),
    ];
    if (libro.totales.length) {
        lineas.push([], libro.columnas.map((c) => (c.clave === 'nombre' ? 'TOTALES' : libro.totales.includes(c.clave) ? dinero(totalDe(libro, filas, c.clave)) : '')));
    }
    const contenido = lineas.map((l) => l.map(esc).join(';')).join('\r\n');
    descargar(new Blob(['﻿' + contenido], { type: 'text/csv;charset=utf-8' }), `${clave}-${datos.mes}.csv`);
}

// PDF imprimible del cierre: portada con resumen de IVA + un libro por sección (apaisado)
export async function descargarPdfCierre(datos) {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape', compress: true });
    const ANCHO = doc.internal.pageSize.getWidth();
    const encabezado = (titulo) => {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(11, 27, 61);
        doc.text(`${MEMBRETE_MEDIQUIR.nombre}  ·  RIF ${MEMBRETE_MEDIQUIR.rif}`, 12, 12);
        doc.setFontSize(11); doc.text(`${titulo} · ${nombreMes(datos.mes)}`, 12, 18);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(150, 60, 0);
        doc.text(doc.splitTextToSize(datos.aviso, ANCHO - 24), 12, 23);
        doc.setTextColor(35, 45, 60);
    };

    // Portada: resumen de IVA
    encabezado('Cierre mensual');
    autoTable(doc, {
        startY: 36, theme: 'grid', styles: { fontSize: 10, cellPadding: 3 }, headStyles: { fillColor: [11, 27, 61] },
        head: [['Concepto', 'Monto (Bs)']],
        body: [
            ['Débito fiscal (IVA de ventas)', dinero(datos.iva.debitoFiscal)], ['Crédito fiscal (IVA de compras)', dinero(datos.iva.creditoFiscal)],
            ['IVA retenido en compras', dinero(datos.iva.ivaRetenido)],
            [datos.iva.resultado >= 0 ? 'IVA a pagar del mes (débito - crédito)' : 'Crédito fiscal a favor (débito - crédito)', dinero(Math.abs(datos.iva.resultado))],
            ['Total de ventas del mes', dinero(datos.totales.ventas.total)], ['Total de compras del mes', dinero(datos.totales.compras.total)],
            ['Documentos anulados (no incluidos)', String(datos.anuladas)],
        ],
        columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } }, tableWidth: 160,
    });

    for (const clave of ['ventas', 'compras', 'movimientos']) {
        const libro = LIBROS[clave]; const filas = datos[clave];
        doc.addPage();
        encabezado(libro.titulo);
        const cuerpo = filas.map((f) => libro.columnas.map((c) => valor(c, f)));
        if (libro.totales.length) cuerpo.push(libro.columnas.map((c) => (c.clave === 'nombre' ? 'TOTALES' : libro.totales.includes(c.clave) ? dinero(totalDe(libro, filas, c.clave)) : '')));
        autoTable(doc, {
            startY: 33, margin: { left: 12, right: 12, bottom: 12 }, theme: 'grid',
            styles: { fontSize: 6.5, cellPadding: 1.4, overflow: 'linebreak' }, headStyles: { fillColor: [11, 27, 61], fontSize: 6.5 },
            head: [libro.columnas.map((c) => c.titulo)], body: cuerpo.length ? cuerpo : [[{ content: 'Sin operaciones en el mes', colSpan: libro.columnas.length, styles: { halign: 'center' } }]],
            columnStyles: Object.fromEntries(libro.columnas.map((c, i) => [i, { halign: c.num ? 'right' : 'left' }])),
            didParseCell: (d) => { if (libro.totales.length && d.row.index === cuerpo.length - 1 && filas.length) d.cell.styles.fontStyle = 'bold'; },
        });
    }

    const paginas = doc.getNumberOfPages();
    for (let i = 1; i <= paginas; i++) {
        doc.setPage(i); doc.setFontSize(7); doc.setTextColor(120);
        doc.text(`Página ${i} de ${paginas}`, ANCHO - 12, doc.internal.pageSize.getHeight() - 6, { align: 'right' });
    }
    descargar(doc.output('blob'), `cierre-${datos.mes}.pdf`);
}
