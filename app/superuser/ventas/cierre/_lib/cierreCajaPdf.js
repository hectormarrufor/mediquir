import { MEMBRETE_MEDIQUIR } from '@/app/constants/empresa';
// Cierre de caja en PDF (A4 vertical) con el membrete de Mediquir.
//   construirPdf(...)   -> parte pura: dibuja el documento
//   abrirCierrePdf(...) -> parte del navegador: baja el logo, arma el PDF y lo abre en una pestaña (visor con descargar e imprimir)

const AZUL_OSCURO = [11, 27, 61];
const AZUL = [0, 90, 170];
const AZUL_CLARO = [230, 241, 252];
const GRIS = [110, 120, 135];
const GRIS_LINEA = [222, 228, 236];
const ROJO = [185, 28, 28];

const nf = (v) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);
const fechaLarga = (f) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`;
const esDolares = (metodo) => /\(\$\)|zelle/i.test(metodo);
const DOC = { FACTURA: 'Factura', NOTA_DEBITO: 'N. débito' };

export function construirPdf({ jsPDF, autoTable, data, logo, generado }) {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const ANCHO = doc.internal.pageSize.getWidth();
    const ALTO = doc.internal.pageSize.getHeight();
    const M = 10;
    const CAB = 28;
    const t = data.totales;

    // ---- Cifras principales
    let y = CAB + 9;
    doc.setTextColor(...AZUL_OSCURO); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
    doc.text(`Cierre de caja · ${fechaLarga(data.fecha)}`, M, y);
    y += 4;
    const cifras = [
        ['Vendido (Bs)', nf(t.facturas), AZUL_OSCURO],
        ['A crédito (Bs)', nf(t.credito), AZUL_OSCURO],
        ['Devoluciones (Bs)', nf(t.devoluciones), ROJO],
        ['Cobrado (Bs)', nf(data.totalCobradoBs), [13, 120, 100]],
    ];
    const gap = 3;
    const w = (ANCHO - 2 * M - gap * 3) / 4;
    cifras.forEach(([titulo, valor, color], i) => {
        const x = M + i * (w + gap);
        doc.setDrawColor(...GRIS_LINEA); doc.setFillColor(248, 250, 253); doc.setLineWidth(0.2);
        doc.roundedRect(x, y, w, 15, 1.5, 1.5, 'FD');
        doc.setTextColor(...GRIS); doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5);
        doc.text(titulo.toUpperCase(), x + 3, y + 5);
        doc.setTextColor(...color); doc.setFontSize(12);
        doc.text(valor, x + 3, y + 11.5);
    });
    y += 22;

    const estiloTabla = {
        theme: 'plain',
        styles: { font: 'helvetica', fontSize: 8, cellPadding: { top: 1.6, bottom: 1.6, left: 2, right: 2 }, textColor: [35, 45, 60], valign: 'middle', lineColor: GRIS_LINEA, lineWidth: { bottom: 0.15 }, overflow: 'linebreak' },
        headStyles: { fillColor: AZUL_OSCURO, textColor: 255, fontStyle: 'bold', fontSize: 7.5, lineWidth: 0 },
        margin: { top: CAB + 6, right: M, bottom: 16, left: M },
    };
    const subtitulo = (texto, nota) => {
        doc.setTextColor(...AZUL_OSCURO); doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5);
        doc.text(texto, M, y);
        if (nota) { doc.setTextColor(...GRIS); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.text(nota, M, y + 4); }
        y += nota ? 7 : 3;
    };

    // ---- Recibo de caja
    subtitulo('Recibo de caja', 'Lo cobrado ese día por cada método de pago (ventas de contado y abonos de cobranza).');
    if (!data.cobros.length) {
        doc.setTextColor(...GRIS); doc.setFont('helvetica', 'italic'); doc.setFontSize(9);
        doc.text('No hubo cobros este día.', M, y + 3);
        y += 10;
    } else {
        autoTable(doc, {
            ...estiloTabla, startY: y,
            head: [['Método de pago', 'Cobros', 'Monto']],
            body: [
                ...data.cobros.map((c) => [c.metodo, String(c.cobros), esDolares(c.metodo) ? `$ ${nf(c.montoUsd)}` : `Bs ${nf(c.montoBs)}`]),
                [
                    { content: 'Total (equivalente en Bs)', colSpan: 2, styles: { fontStyle: 'bold', fillColor: AZUL_CLARO } },
                    { content: `Bs ${nf(data.totalCobradoBs)}`, styles: { fontStyle: 'bold', fillColor: AZUL_CLARO, halign: 'right' } },
                ],
            ],
            columnStyles: { 1: { halign: 'right', cellWidth: 20 }, 2: { halign: 'right', cellWidth: 45 } },
            didParseCell: (d) => { if (d.section === 'head' && d.column.index > 0) d.cell.styles.halign = 'right'; },
        });
        y = doc.lastAutoTable.finalY + 9;
    }

    // ---- Relación de documentos
    if (y > ALTO - 60) { doc.addPage(); y = CAB + 10; }
    subtitulo('Relación de facturas y devoluciones (Bs)');
    const cuerpo = [
        ...data.facturas.map((f) => [
            `${f.numero}\n${DOC[f.tipoDocumento] || ''}`, f.estado || '', f.rif || '', f.cliente || '—',
            f.condicion === 'Credito' ? 'CRÉDITO' : 'CONTADO',
            f.condicion === 'Credito' ? nf(f.totalBs) : '', f.condicion !== 'Credito' ? nf(f.totalBs) : '', '',
        ]),
        ...data.devoluciones.map((d) => [
            `${d.numero}\nN. crédito`, '', d.rif || '', d.cliente || '—', '', '', '',
            { content: nf(d.totalBs), styles: { textColor: ROJO } },
        ]),
    ];
    if (!cuerpo.length) cuerpo.push([{ content: 'No hay documentos este día.', colSpan: 8, styles: { halign: 'center', textColor: GRIS } }]);
    cuerpo.push([
        { content: 'TOTALES', colSpan: 5, styles: { fontStyle: 'bold', fillColor: AZUL_CLARO } },
        ...[t.credito, t.contado, t.devoluciones].map((v) => ({ content: nf(v), styles: { fontStyle: 'bold', fillColor: AZUL_CLARO, halign: 'right' } })),
    ]);
    autoTable(doc, {
        ...estiloTabla, startY: y, styles: { ...estiloTabla.styles, fontSize: 7.5 },
        head: [['Documento', 'Est.', 'RIF', 'Cliente', 'Condición', 'Total crédito', 'Total contado', 'Devolución']],
        body: cuerpo,
        columnStyles: { 0: { cellWidth: 25 }, 1: { cellWidth: 9 }, 2: { cellWidth: 23 }, 4: { cellWidth: 17 }, 5: { cellWidth: 22, halign: 'right' }, 6: { cellWidth: 22, halign: 'right' }, 7: { cellWidth: 22, halign: 'right' } },
        didParseCell: (d) => { if (d.section === 'head' && d.column.index >= 5) d.cell.styles.halign = 'right'; },
    });
    y = doc.lastAutoTable.finalY + 7;

    if (y > ALTO - 55) { doc.addPage(); y = CAB + 10; }
    doc.setTextColor(...AZUL_OSCURO); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text(`Total devoluciones: Bs ${nf(t.devoluciones)}`, ANCHO - M, y, { align: 'right' });
    doc.text(`Total facturas: Bs ${nf(t.facturas)}`, ANCHO - M, y + 5, { align: 'right' });

    // ---- Firmas
    y += 28;
    if (y > ALTO - 25) { doc.addPage(); y = CAB + 30; }
    doc.setDrawColor(...GRIS); doc.setLineWidth(0.3);
    [['Elaborado por', M + 8], ['Revisado por', ANCHO / 2 + 8]].forEach(([texto, x]) => {
        doc.line(x, y, x + 70, y);
        doc.setTextColor(...GRIS); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
        doc.text(texto, x + 35, y + 4.5, { align: 'center' });
    });

    // ---- Membrete y pie en todas las páginas
    const paginas = doc.getNumberOfPages();
    for (let i = 1; i <= paginas; i += 1) {
        doc.setPage(i);
        doc.setFillColor(...AZUL_OSCURO); doc.rect(0, 0, ANCHO, CAB, 'F');
        doc.setFillColor(...AZUL); doc.rect(0, CAB, ANCHO, 0.9, 'F');
        if (logo) {
            const alto = 15;
            doc.addImage(logo.data, 'PNG', M, (CAB - alto) / 2, alto * (logo.w / logo.h), alto, undefined, 'FAST');
        } else {
            doc.setTextColor(255); doc.setFont('helvetica', 'bolditalic'); doc.setFontSize(18); doc.text('MEDIQUIR', M, 16);
        }
        doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
        doc.text(MEMBRETE_MEDIQUIR.nombre, ANCHO - M, 8.5, { align: 'right' });
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(170, 205, 240);
        doc.text(`RIF: ${MEMBRETE_MEDIQUIR.rif}`, ANCHO - M, 13.5, { align: 'right' });
        doc.text(doc.splitTextToSize(MEMBRETE_MEDIQUIR.direccion, 105), ANCHO - M, 17.5, { align: 'right' });
        doc.text(`${MEMBRETE_MEDIQUIR.telefonos} · ${MEMBRETE_MEDIQUIR.email}`, ANCHO - M, 25.5, { align: 'right' });

        doc.setDrawColor(...GRIS_LINEA); doc.setLineWidth(0.2); doc.line(M, ALTO - 10, ANCHO - M, ALTO - 10);
        doc.setTextColor(...GRIS); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
        doc.text(`Cierre de caja del ${fechaLarga(data.fecha)} · generado ${generado}`, M, ALTO - 5.8);
        doc.text(`Página ${i} de ${paginas}`, ANCHO - M, ALTO - 5.8, { align: 'right' });
    }
    return doc;
}

async function logoPng() {
    try {
        const res = await fetch('/tenants/mediquir/logo-header@2x.png');
        const bmp = await createImageBitmap(await res.blob());
        const canvas = document.createElement('canvas');
        canvas.width = bmp.width; canvas.height = bmp.height;
        canvas.getContext('2d').drawImage(bmp, 0, 0);
        return { data: canvas.toDataURL('image/png'), w: bmp.width, h: bmp.height };
    } catch {
        return null;
    }
}

// Abre el PDF en una pestaña nueva (visor del navegador: descargar o imprimir). Si el navegador bloquea la pestaña, lo descarga.
export async function abrirCierrePdf(data) {
    const pestana = window.open('', '_blank'); // se abre ya, con el toque del usuario, para que no la bloqueen
    try {
        const [{ jsPDF }, { default: autoTable }, logo] = await Promise.all([import('jspdf'), import('jspdf-autotable'), logoPng()]);
        const generado = new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'short', timeStyle: 'short' });
        const doc = construirPdf({ jsPDF, autoTable, data, logo, generado });
        doc.setProperties({ title: `Cierre de caja ${data.fecha}` });
        if (pestana) pestana.location.href = String(doc.output('bloburl'));
        else doc.save(`cierre-de-caja-${data.fecha}.pdf`);
    } catch (e) {
        pestana?.close();
        throw e;
    }
}
