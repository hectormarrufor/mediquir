// Exportación de los libros de compras y ventas: PDF con el formato "Libro Declarativo" y CSV para Excel en español.

const nf = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const dinero = (v) => (v === null || v === undefined || v === '' ? '' : nf.format(Number(v) || 0));
export const fmtFecha = (v) => (v ? `${String(v).slice(8, 10)}/${String(v).slice(5, 7)}/${String(v).slice(0, 4)}` : '');

export const TIPOS = {
    compras: { titulo: 'Libro de Compras Declarativo', corto: 'Compras', montoTotal: 'Total Compras incluyendo I.V.A.', resumen: 'Resumen de Compras y Egresos', alicuota: 'Compras', descuentos: 'Descuentos en compras', nc: 'N/C' },
    ventas: { titulo: 'Libro de Ventas Declarativo', corto: 'Ventas', montoTotal: 'Total Ventas incluyendo I.V.A.', resumen: 'Resumen de Ventas', alicuota: 'Ventas', descuentos: 'Descuentos en ventas', nc: 'N/C' },
};

const nombreArchivo = (tipo, datos) => `libro-de-${tipo}-${datos.desde}_${datos.hasta}`;

function descargar(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Etiqueta de la columna de base imponible: "al 16,00 %" cuando todo el periodo tiene una sola alícuota
export function etiquetaBase(filas) {
    const alicuotas = [...new Set(filas.filter((f) => f.tipo === 'FAC' && Number(f.base) > 0).map((f) => f.alicuota))];
    return alicuotas.length === 1 ? `Base Imponible al ${nf.format(alicuotas[0])} %` : 'Base Imponible';
}

export const COLUMNAS = (tipo, filas) => [
    { k: 'n', t: 'Oper.\nNro.' }, { k: 'fecha', t: 'Emisión', f: fmtFecha }, { k: 'rif', t: 'R.I.F.' }, { k: 'nombre', t: 'Nombre o Razón Social' }, { k: 'tipo', t: 'Tipo' },
    { k: 'documento', t: 'Número\nDocumento' }, { k: 'facturaAfectada', t: '# Fact.\nAfect.' }, { k: 'control', t: 'Número de\nControl' }, { k: 'tipoTrans', t: 'Tipo\nTrans.' },
    { k: 'total', t: TIPOS[tipo].montoTotal.replace('incluyendo', '\nincluyendo'), num: true }, { k: 'base', t: etiquetaBase(filas).replace(' al ', '\nal '), num: true },
    { k: 'ivaRetenido', t: 'IVA RETENIDO', num: true }, { k: 'exento', t: 'Total\nExento', num: true }, { k: 'iva', t: 'Monto Total\nI.V.A.', num: true },
];

const valor = (c, f) => {
    const v = f[c.k];
    if (v === null || v === undefined) return '';
    if (c.f) return c.f(v);
    return c.num ? dinero(v) : String(v);
};

// ------------------------------------------------------------------ CSV
const esc = (t) => `"${String(t ?? '').replace(/"/g, '""')}"`;
const csv = (lineas) => new Blob(['﻿' + lineas.map((l) => l.map(esc).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });

export function descargarCsvLibro(tipo, datos) {
    const libro = datos[tipo];
    const cols = COLUMNAS(tipo, libro.filas);
    const r = libro.resumen;
    const lineas = [
        [`${datos.empresa.nombre} - RIF ${datos.empresa.rif}`], [`Dirección: ${datos.empresa.direccion || ''}`], [`${TIPOS[tipo].titulo} - desde ${fmtFecha(datos.desde)} hasta ${fmtFecha(datos.hasta)}`], [datos.aviso], [],
        cols.map((c) => c.t.replace('\n', ' ')),
        ...libro.filas.map((f) => cols.map((c) => valor(c, f))),
        [],
        cols.map((c) => (c.k === 'nombre' ? `TOTAL TRANSACCIONES: ${r.totalTransacciones}` : c.k === 'total' ? dinero(r.totalGeneral) : c.k === 'base' ? dinero(r.totalImponible.monto) : c.k === 'ivaRetenido' ? dinero(r.ivaRetenido) : c.k === 'exento' ? dinero(r.exento) : c.k === 'iva' ? dinero(r.totalImpuesto) : '')),
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

// ------------------------------------------------------------------ PDF (formato "Libro Declarativo")
export async function descargarPdfLibro(tipo, datos, usuario = '') {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
    const libro = datos[tipo];
    const info = TIPOS[tipo];
    const r = libro.resumen;
    const cols = COLUMNAS(tipo, libro.filas);
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape', compress: true });
    const ANCHO = doc.internal.pageSize.getWidth();
    const ALTO = doc.internal.pageSize.getHeight();
    const M = 12;
    const ahora = new Date();
    const fechaLarga = ahora.toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Caracas' });
    const hora = ahora.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Caracas' });
    const NEGRO = [20, 20, 20];

    const cabecera = () => {
        doc.setTextColor(...NEGRO);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text(`Empresa: ${datos.empresa.nombre}`, M, 8.5);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
        doc.text(`R.I.F.: ${datos.empresa.rif}     Agencia: ${datos.empresa.agencia}`, M, 12.5);
        doc.setFontSize(7.5);
        doc.text(`Dirección: ${datos.empresa.direccion || ''}`, M, 16.2, { maxWidth: 182 }); // una sola línea: termina antes de la raya del título (x = 195 mm)
        doc.setFontSize(8);
        doc.text(`${fechaLarga.charAt(0).toUpperCase()}${fechaLarga.slice(1)}   Página: ${String(doc.getCurrentPageInfo().pageNumber).padStart(3, '0')}`, M, 20.5);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text(info.titulo, ANCHO - M, 14, { align: 'right' });
        doc.setLineWidth(0.7); doc.line(ANCHO - M - 90, 16, ANCHO - M, 16);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
        const sub = `Desde el ${fmtFecha(datos.desde)} hasta el ${fmtFecha(datos.hasta)} / Factura o gastos / Retenciones / Notas de crédito / Según fecha ${tipo === 'compras' ? 'de recepción' : 'de emisión'} del documento`;
        doc.text(sub, ANCHO - M, 21, { align: 'right' });
        doc.setLineWidth(0.15); doc.line(M, 24, ANCHO - M, 24);
    };
    const pie = () => {
        const y = ALTO - 12;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...NEGRO);
        doc.text(datos.empresa.nombre.toUpperCase(), M, y);
        doc.setFont('helvetica', 'normal');
        doc.text('Expresado en Bolívar', ANCHO - M, y, { align: 'right' });
        doc.text(`Procesado por: ${String(usuario || '').toUpperCase()} desde la estación ${datos.empresa.estacion} a las ${hora}`, ANCHO - M, y + 4, { align: 'right' });
    };

    const anchos = [9, 16, 19, 40, 8, 25, 25, 18, 9, 22, 22, 20, 20, 20];
    autoTable(doc, {
        startY: 27, margin: { top: 27, left: M, right: M, bottom: 16 }, theme: 'plain',
        head: [cols.map((c) => c.t)],
        body: libro.filas.map((f) => cols.map((c) => valor(c, f))),
        foot: [cols.map((c) => (c.k === 'nombre' ? `TOTAL TRANSACCIONES:  ${r.totalTransacciones}` : c.k === 'total' ? dinero(r.totalGeneral) : c.k === 'base' ? dinero(r.totalImponible.monto) : c.k === 'ivaRetenido' ? dinero(r.ivaRetenido) : c.k === 'exento' ? dinero(r.exento) : c.k === 'iva' ? dinero(r.totalImpuesto) : ''))],
        showFoot: 'lastPage',
        styles: { font: 'helvetica', fontSize: 6.3, cellPadding: { top: 0.9, bottom: 0.9, left: 0.8, right: 0.8 }, textColor: NEGRO, overflow: 'ellipsize' },
        headStyles: { fontStyle: 'bold', fontSize: 6.1, halign: 'center', valign: 'middle', lineWidth: { bottom: 0.3, top: 0.3 }, lineColor: NEGRO },
        footStyles: { fontStyle: 'bold', fontSize: 6.6, fillColor: false, textColor: NEGRO, lineWidth: { top: 0.3 }, lineColor: NEGRO },
        columnStyles: Object.fromEntries(cols.map((c, i) => [i, { cellWidth: anchos[i], halign: c.num ? 'right' : (['n', 'tipo', 'tipoTrans'].includes(c.k) ? 'center' : 'left') }])),
        // la fila de totales va alineada a la derecha como las cifras
        didParseCell: (d) => { if (d.section === 'foot' && cols[d.column.index].num) d.cell.styles.halign = 'right'; },
        didDrawPage: cabecera,
    });

    // -------- cuadros de resumen (mismo orden que el libro de ejemplo)
    let y = doc.lastAutoTable.finalY + 5;
    if (y > ALTO - 78) { doc.addPage(); y = 30; }
    const tabla = (x, w, inicioY, { head, body, foot, colStyles = {}, bold = false }) => {
        autoTable(doc, {
            startY: inicioY, margin: { left: x, right: ANCHO - x - w }, tableWidth: w, theme: 'grid',
            head: [head], body, foot: foot ? [foot] : undefined, showFoot: 'lastPage',
            styles: { font: 'helvetica', fontSize: 6.8, cellPadding: 1.1, textColor: NEGRO, lineColor: [60, 60, 60], lineWidth: 0.15 },
            headStyles: { fillColor: [235, 235, 235], textColor: NEGRO, fontStyle: 'bold', halign: 'center' },
            footStyles: { fillColor: [235, 235, 235], textColor: NEGRO, fontStyle: 'bold' },
            bodyStyles: bold ? { fontStyle: 'bold' } : {}, columnStyles: colStyles, didDrawPage: () => {},
            didParseCell: (d) => { if (d.section === 'foot' && colStyles[d.column.index]?.halign) d.cell.styles.halign = colStyles[d.column.index].halign; },
        });
        return doc.lastAutoTable.finalY;
    };
    const der = { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } };
    const cuenta = (n) => ({ 0: {}, 1: { halign: 'right' }, 2: { halign: 'center', cellWidth: 12 } });
    void cuenta;

    const yInicio = y;
    let yIzq = tabla(M, 84, yInicio, { head: [info.resumen, 'Monto', 'Cant.'], body: [
        ['Operac. sin impuesto', dinero(r.sinImpuesto.monto), String(r.sinImpuesto.cant)],
        ['Total Imponible', dinero(r.totalImponible.monto), String(r.totalImponible.cant)],
        ['Total Impuesto', dinero(r.totalImpuesto), ''],
    ], foot: ['TOTAL GENERAL', dinero(r.totalGeneral), ''], colStyles: { 1: { halign: 'right' }, 2: { halign: 'center', cellWidth: 12 } } });
    yIzq = tabla(M, 84, yIzq + 3, { head: ['Retenciones', 'Base Imponible', 'I.V.A. Retenido', 'Cant.'], body: [16, ...Object.keys(r.retenciones).map(Number).filter((a) => a !== 16 && r.retenciones[a]?.cant > 0)].map((a) => [`Retenciones al ${a},00 %`, dinero(r.retenciones[a]?.base || 0), dinero(r.retenciones[a]?.retenido || 0), String(r.retenciones[a]?.cant || 0)]),
        foot: ['Totales:', dinero(r.totalRetenciones.base), dinero(r.totalRetenciones.retenido), String(r.totalRetenciones.cant)], colStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'center', cellWidth: 10 } } });

    const yMed = tabla(M + 90, 62, yInicio, { head: [`Resumen de ${info.nc}`, 'Monto', 'Cant.'], body: [[info.nc + ':', dinero(r.notasCredito.monto), String(r.notasCredito.cant)], [`IVA ${info.nc}:`, dinero(r.notasCredito.iva), '']], colStyles: { 1: { halign: 'right' }, 2: { halign: 'center', cellWidth: 12 } } });
    const yND = tabla(M + 90, 62, yMed + 3, { head: [`Resumen de ${info.nc.replace('C', 'D')}`, 'Monto', 'Cant.'], body: [[info.nc.replace('C', 'D') + ':', dinero(r.notasDebito?.monto || 0), String(r.notasDebito?.cant || 0)], [`IVA ${info.nc.replace('C', 'D')}:`, dinero(r.notasDebito?.iva || 0), '']], colStyles: { 1: { halign: 'right' }, 2: { halign: 'center', cellWidth: 12 } } });
    const yMed2 = tabla(M + 90, 62, yND + 3, { head: ['Resumen de anulaciones', 'Monto', 'Cant.'], body: [['Monto anulado:', dinero(r.anulaciones.monto), String(r.anulaciones.cant)], ['Impuesto anulado:', dinero(r.anulaciones.iva), '']], colStyles: { 1: { halign: 'right' }, 2: { halign: 'center', cellWidth: 12 } } });
    void yMed2;

    // Solo la alícuota general (16 %); cualquier otra aparece únicamente si algún documento tuvo movimiento con ella
    const lista = [16, ...Object.keys(r.porAlicuota).map(Number).filter((a) => a !== 16 && (r.porAlicuota[a]?.base || r.porAlicuota[a]?.iva))];
    const totBase = lista.reduce((a, k) => a + (r.porAlicuota[k]?.base || 0), 0);
    const totIva = lista.reduce((a, k) => a + (r.porAlicuota[k]?.iva || 0), 0);
    const yDer = tabla(M + 158, ANCHO - 2 * M - 158, yInicio, { head: ['', 'Base Imponible', 'Monto por I.V.A.', 'Monto I.V.A.\nNo Causado', 'Monto Neto\nI.V.A.'],
        body: [...lista.map((a) => [`${info.alicuota} al ${a},00 %`, dinero(r.porAlicuota[a]?.base || 0), dinero(r.porAlicuota[a]?.iva || 0), dinero(0), dinero(r.porAlicuota[a]?.iva || 0)]), ['Monto Exento', dinero(r.exento), '', '', '']],
        foot: ['Totales:', dinero(totBase), dinero(totIva), dinero(0), dinero(totIva)], colStyles: der });
    void yDer;

    // Firmas
    const yFirma = Math.max(doc.lastAutoTable.finalY, yIzq) + 20;
    const yF = Math.min(yFirma, ALTO - 24);
    doc.setLineWidth(0.2); doc.setFontSize(7); doc.setFont('helvetica', 'normal');
    doc.line(M + 100, yF, M + 150, yF); doc.text('Firma del contador', M + 125, yF + 3.5, { align: 'center' });
    doc.line(M + 165, yF, M + 215, yF); doc.text('Firma del auditor', M + 190, yF + 3.5, { align: 'center' });

    const paginas = doc.getNumberOfPages();
    for (let i = 1; i <= paginas; i++) { doc.setPage(i); pie(); }
    descargar(doc.output('blob'), `${nombreArchivo(tipo, datos)}.pdf`);
}
