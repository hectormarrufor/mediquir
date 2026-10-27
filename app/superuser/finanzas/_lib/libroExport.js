// Libros de compras y ventas con el formato que lleva el contador (libro de compras y libro de ventas de la quincena del 01 al 15/04/2026
// que mandó Hector): PDF, CSV para Excel y la vista en pantalla usan las MISMAS columnas, y al final el «Resumen del periodo imposición».

const nf = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const dinero = (v) => (v === null || v === undefined || v === '' ? '' : nf.format(Number(v) || 0));
export const fmtFecha = (v) => (v ? `${String(v).slice(8, 10)}/${String(v).slice(5, 7)}/${String(v).slice(0, 4)}` : '');
const r2 = (v) => Math.round(((Number(v) || 0) + Number.EPSILON) * 100) / 100;

export const TIPOS = {
    compras: { titulo: 'Libro de Compras', mayus: 'LIBRO DE COMPRAS', totales: 'TOTALES' },
    ventas: { titulo: 'Libro de Ventas', mayus: 'LIBRO DE VENTAS', totales: 'TOTAL' },
};

const nombreArchivo = (tipo, datos) => `libro-de-${tipo}-${datos.desde}_${datos.hasta}`;

function descargar(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Tipo de documento como lo escribe el contador
const TIPO_DOC = { FAC: 'FACTURA', NC: 'N/CREDITO', ND: 'N/DEBITO', RET: 'COM.RET' };
// El comprobante de retención (AAAAMM + 8 dígitos) se escribe 2026-04-00006613
const documento = (f) => {
    const d = String(f.documento || '');
    return f.tipo === 'RET' && /^\d{14}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : d;
};
const esDoc = (f) => f.tipo !== 'RET';
const monto = (v) => (Number(v) ? dinero(v) : '');

// Columnas de cada libro. `v` da el valor de la celda; `sum` es lo que se suma en la fila de totales.
const COLS = {
    compras: [
        { k: 'fecha', t: 'Fecha', v: (f) => fmtFecha(f.fecha), w: 15 },
        { k: 'tipoDoc', t: 'Tipo Doc.', v: (f) => TIPO_DOC[f.tipo] || f.tipo, w: 16 },
        { k: 'documento', t: 'No. Documento', v: documento, w: 25 },
        { k: 'control', t: 'No Control', v: (f) => f.control || '', w: 20 },
        { k: 'facturaAfectada', t: 'No. Factura Afectada', v: (f) => f.facturaAfectada || '', w: 16 },
        { k: 'nombre', t: 'Nombre y Apellido / Razón Social', v: (f) => f.nombre || '', w: 49 },
        { k: 'rif', t: 'No. Rif', v: (f) => f.rif || '', w: 20 },
        { k: 'exento', t: 'Compras Sin Derecho a Crédito Fiscal', num: true, v: (f) => (esDoc(f) ? monto(f.exento) : ''), sum: (f) => (esDoc(f) ? f.exento : 0), w: 22 },
        { k: 'base', t: 'Compras Internas Gravadas', num: true, v: (f) => (esDoc(f) ? monto(f.base) : ''), sum: (f) => (esDoc(f) ? f.base : 0), w: 22 },
        { k: 'iva', t: 'Impuesto IVA 16%', num: true, v: (f) => (esDoc(f) ? (Number(f.iva) ? dinero(f.iva) : '-') : ''), sum: (f) => (esDoc(f) ? f.iva : 0), w: 19 },
        { k: 'total', t: 'Total Compras Incluye Iva', num: true, v: (f) => (esDoc(f) ? dinero(f.total) : ''), sum: (f) => (esDoc(f) ? f.total : 0), w: 22 },
        { k: 'ivaRetenido', t: 'RETENCIÓN IVA', num: true, v: (f) => (f.tipo === 'RET' ? dinero(f.ivaRetenido) : ''), sum: (f) => (f.tipo === 'RET' ? f.ivaRetenido : 0), w: 18 },
    ],
    ventas: [
        { k: 'fecha', t: 'Fecha', v: (f) => fmtFecha(f.fecha), w: 14 },
        { k: 'corteZ', t: 'No. Corte Z', v: () => '', w: 11 },
        { k: 'documento', t: 'No. Documento', v: documento, w: 21 },
        { k: 'control', t: 'No Control', v: (f) => f.control || '', w: 18 },
        { k: 'tipoDoc', t: 'Tipo de Documento', v: (f) => TIPO_DOC[f.tipo] || f.tipo, w: 15 },
        { k: 'facturaAfectada', t: 'Factura Afectada', v: (f) => f.facturaAfectada || '', w: 14 },
        { k: 'nombre', t: 'Nombre y Apellido / Razón Social', v: (f) => f.nombre || '', w: 35 },
        { k: 'rif', t: 'No. Rif - C.I', v: (f) => f.rif || '', w: 19 },
        { k: 'exento', t: 'Ventas Internas No Gravadas Base Imponible', num: true, v: (f) => (esDoc(f) ? monto(f.exento) : ''), sum: (f) => (esDoc(f) ? f.exento : 0), w: 19 },
        { k: 'base', t: 'Ventas Internas Gravadas Base Imponible', num: true, v: (f) => (esDoc(f) ? monto(f.base) : ''), sum: (f) => (esDoc(f) ? f.base : 0), w: 19 },
        { k: 'iva', t: 'Impuesto Iva 16%', num: true, v: (f) => (esDoc(f) ? (Number(f.iva) ? dinero(f.iva) : '-') : ''), sum: (f) => (esDoc(f) ? f.iva : 0), w: 16 },
        { k: 'baseIgtf', t: 'BASE IGTF', num: true, v: (f) => (esDoc(f) ? (Number(f.baseIgtf) ? dinero(f.baseIgtf) : '-') : ''), sum: (f) => (esDoc(f) ? f.baseIgtf || 0 : 0), w: 12 },
        { k: 'igtf', t: 'IGTF\nPERCIBIDO\n3%', num: true, v: (f) => (esDoc(f) ? (Number(f.igtf) ? dinero(f.igtf) : '-') : ''), sum: (f) => (esDoc(f) ? f.igtf || 0 : 0), w: 14 },
        { k: 'total', t: 'Total Ventas Incluye Iva', num: true, v: (f) => (esDoc(f) ? dinero(f.total) : ''), sum: (f) => (esDoc(f) ? f.total : 0), w: 19 },
        { k: 'ivaRetenido', t: 'IVA Retenido (por el Comprador)', num: true, v: (f) => (f.tipo === 'RET' ? dinero(f.ivaRetenido) : ''), sum: (f) => (f.tipo === 'RET' ? f.ivaRetenido : 0), w: 17 },
    ],
};

export const COLUMNAS = (tipo) => COLS[tipo];
export const celda = (c, f) => c.v(f);
// Celda de la fila de totales (el IGTF en cero va con guion, como en el libro del contador)
export const celdaTotal = (c, tot) => (!c.sum ? '' : ['baseIgtf', 'igtf'].includes(c.k) && !tot[c.k] ? '-' : dinero(tot[c.k]));

/** Filas en el orden del libro: por fecha (las retenciones y notas entre las facturas de su día) */
export const filasLibro = (libro) => [...libro.filas].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || a.n - b.n);

/** Fila de totales: suma de cada columna numérica (las notas de crédito ya vienen en negativo) */
export function totalesLibro(tipo, filas) {
    return Object.fromEntries(COLS[tipo].filter((c) => c.sum).map((c) => [c.k, r2(filas.reduce((a, f) => a + (Number(c.sum(f)) || 0), 0))]));
}

/**
 * «Resumen del periodo imposición» (va al pie de los dos libros, igual que en el del contador).
 * Lo de este periodo sale de los libros; lo que viene de declaraciones anteriores lo escribe el contador (`ajustes`):
 *   excedenteAnterior (crédito fiscal del mes anterior), deducibles (créditos fiscales totalmente deducibles; vacío = el crédito del
 *   periodo) y retencionesAcumuladas (retenciones por descontar de periodos anteriores).
 */
export function resumenPeriodo(datos, ajustes = {}) {
    const v = datos.ventas.resumen;
    const c = datos.compras.resumen;
    const debito = r2(v.totalImpuesto);
    const credito = r2(c.totalImpuesto);
    const general = c.porAlicuota?.[16] || { base: 0, iva: 0 };
    const reducida = c.porAlicuota?.[8] || { base: 0, iva: 0 };
    const excedenteAnterior = r2(ajustes.excedenteAnterior);
    const deducibles = ajustes.deducibles === '' || ajustes.deducibles === null || ajustes.deducibles === undefined ? credito : r2(ajustes.deducibles);
    const retAcumuladas = r2(ajustes.retencionesAcumuladas);
    const retPeriodo = r2(v.ivaRetenido);
    const totalRet = r2(retAcumuladas + retPeriodo);
    const cuota = r2(debito - deducibles - excedenteAnterior);
    const descontadas = cuota > 0 ? Math.min(totalRet, cuota) : 0;
    return [
        ['Ventas No Gravadas', r2(v.exento), null, null],
        ['Ventas Gravadas', r2(v.totalImponible.monto), debito, null],
        ['Total Ventas', r2(v.exento + v.totalImponible.monto), debito, null],
        ['Compras No Gravadas', r2(c.exento), null, null],
        ['Compras Internas Gravadas con Alícuota General', r2(general.base), null, r2(general.iva)],
        ['Compras Internas Gravadas con Alícuota Reducida', reducida.base ? r2(reducida.base) : null, null, reducida.iva ? r2(reducida.iva) : null],
        ['Total Compras', r2(c.exento + c.totalImponible.monto), null, credito],
        ['Excedente de crédito fiscal del mes anterior', null, null, excedenteAnterior || null],
        ['Créditos Fiscales Totalmente Deducibles', null, null, deducibles],
        ['Retenciones acumuladas por descontar', null, null, retAcumuladas || null],
        ['Retenciones del periodo', null, null, retPeriodo],
        ['Total Retenciones', null, null, totalRet],
        ['Retenciones soportadas y descontadas en esta declaración', null, null, descontadas || null],
        ['Saldo de retenciones de iva no aplicado', null, null, r2(totalRet - descontadas)],
        ['Impuesto a Pagar', null, null, cuota > 0 ? r2(cuota - descontadas) : null],
        ['Excedente de crédito fiscal para el mes siguiente', null, null, cuota < 0 ? r2(-cuota) : null],
    ];
}

// ------------------------------------------------------------------ CSV
const esc = (t) => `"${String(t ?? '').replace(/"/g, '""')}"`;
const csv = (lineas) => new Blob(['﻿' + lineas.map((l) => l.map(esc).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
const periodoTexto = (datos) => `PERIODO ${fmtFecha(datos.desde)} - ${fmtFecha(datos.hasta)}`;

export function descargarCsvLibro(tipo, datos, ajustes) {
    const cols = COLS[tipo];
    const filas = filasLibro(datos[tipo]);
    const tot = totalesLibro(tipo, filas);
    const lineas = [
        [TIPOS[tipo].mayus], [`RIF ${datos.empresa.rif}`], [periodoTexto(datos)], [],
        cols.map((c) => c.t),
        ...filas.map((f) => cols.map((c) => c.v(f))),
        cols.map((c, i) => (i === 0 ? TIPOS[tipo].totales : celdaTotal(c, tot))),
        [], ['Resumen del periodo imposición'], ['Concepto', 'Base Imponible', 'Debito fiscal', 'Credito Fiscal'],
        ...resumenPeriodo(datos, ajustes).map(([concepto, ...m]) => [concepto, ...m.map((x) => (x === null ? '' : dinero(x)))]),
    ];
    descargar(csv(lineas), `${nombreArchivo(tipo, datos)}.csv`);
}

export function descargarCsvRetenciones(tipo, datos) {
    const filas = datos[tipo].retencionesDetalle;
    const lineas = [
        [`${datos.empresa.nombre} - RIF ${datos.empresa.rif}`], [`Dirección: ${datos.empresa.direccion || ''}`], [`Relación de IVA retenido (${tipo === 'ventas' ? 'retenciones que te hicieron tus clientes' : 'retenciones que practicaste a tus proveedores'}) - desde ${fmtFecha(datos.desde)} hasta ${fmtFecha(datos.hasta)}`], [],
        ['Nº', 'FECHA', 'RIF', 'NOMBRE O RAZÓN SOCIAL', 'TIPO DOC', 'DOCUMENTO (COMPROBANTE)', 'Nº CONTROL', 'TOTAL', 'BASE IMPONIBLE', 'TOTAL EXENTO', 'TOTAL IVA', 'DOCUMENTO AFECTADO', 'IVA RETENIDO'],
        ...filas.map((f) => [f.n, fmtFecha(f.fecha), f.rif, f.nombre, f.tipoDoc, f.comprobante, f.control, dinero(f.totalVentas), dinero(f.base), dinero(f.exento), dinero(f.iva), f.facturaAfectada, dinero(f.ivaRetenido)]),
        [], ['', '', '', 'TOTAL', '', '', '', '', '', '', '', '', dinero(filas.reduce((a, f) => a + f.ivaRetenido, 0))],
    ];
    descargar(csv(lineas), `iva-retenido-${tipo}-${datos.desde}_${datos.hasta}.csv`);
}

// ------------------------------------------------------------------ PDF (formato del contador)
export async function descargarPdfLibro(tipo, datos, ajustes) {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
    const cols = COLS[tipo];
    const filas = filasLibro(datos[tipo]);
    const tot = totalesLibro(tipo, filas);
    const doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'landscape', compress: true });
    const ANCHO = doc.internal.pageSize.getWidth();
    const ALTO = doc.internal.pageSize.getHeight();
    const M = 8;
    const NEGRO = [0, 0, 0];

    // Encabezado de cada página: el nombre del libro, el RIF y el periodo, como en el del contador
    const cabecera = () => {
        doc.setTextColor(...NEGRO);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
        doc.text(TIPOS[tipo].mayus, M, 9);
        doc.text(`RIF ${datos.empresa.rif}`, M, 13.5);
        doc.text(periodoTexto(datos), M, 18);
    };

    // El ancho de las columnas se escala para llenar la hoja
    const anchoTotal = cols.reduce((a, c) => a + c.w, 0);
    const escala = (ANCHO - 2 * M) / anchoTotal;
    const lineas = { lineWidth: 0.15, lineColor: NEGRO };
    autoTable(doc, {
        startY: 21, margin: { top: 21, left: M, right: M, bottom: 10 }, theme: 'grid',
        head: [cols.map((c) => c.t)],
        body: filas.map((f) => cols.map((c) => c.v(f))),
        foot: [cols.map((c, i) => (i === 0 ? TIPOS[tipo].totales : celdaTotal(c, tot)))],
        showFoot: 'lastPage',
        styles: { font: 'helvetica', fontSize: 6.2, cellPadding: 0.7, textColor: NEGRO, overflow: 'linebreak', valign: 'middle', ...lineas },
        headStyles: { fontStyle: 'bold', fontSize: 6, halign: 'center', fillColor: false, ...lineas },
        footStyles: { fontStyle: 'bold', fontSize: 6.6, fillColor: false, textColor: NEGRO, ...lineas },
        columnStyles: Object.fromEntries(cols.map((c, i) => [i, { cellWidth: c.w * escala, halign: c.num ? 'right' : 'left' }])),
        didParseCell: (d) => { if (d.section === 'foot' && cols[d.column.index].num) d.cell.styles.halign = 'right'; },
        didDrawPage: cabecera,
    });

    // Resumen del periodo imposición, debajo de los totales
    const filasResumen = resumenPeriodo(datos, ajustes);
    let y = doc.lastAutoTable.finalY + 6;
    if (y > ALTO - 92) { doc.addPage(); cabecera(); y = 24; }
    const x = M + (ANCHO - 2 * M) * 0.36;
    const w = 150;
    autoTable(doc, {
        startY: y, margin: { left: x, right: ANCHO - x - w, top: 21, bottom: 10 }, tableWidth: w, theme: 'grid',
        head: [[{ content: 'Resumen del periodo imposición', colSpan: 4, styles: { halign: 'left' } }], ['Concepto', 'Base Imponible', 'Debito fiscal', 'Credito Fiscal']],
        body: filasResumen.map(([concepto, ...m]) => [concepto, ...m.map((v) => (v === null ? '' : dinero(v)))]),
        styles: { font: 'helvetica', fontSize: 6.6, cellPadding: 0.8, textColor: NEGRO, ...lineas },
        headStyles: { fontStyle: 'normal', fillColor: false, textColor: NEGRO, ...lineas },
        columnStyles: { 0: { cellWidth: 66 }, 1: { cellWidth: 28, halign: 'right', fontStyle: 'bold' }, 2: { cellWidth: 28, halign: 'right', fontStyle: 'bold' }, 3: { cellWidth: 28, halign: 'right', fontStyle: 'bold' } },
        didDrawPage: () => {},
    });

    descargar(doc.output('blob'), `${nombreArchivo(tipo, datos)}.pdf`);
}
