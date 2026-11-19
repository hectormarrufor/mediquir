import { MEMBRETE_MEDIQUIR } from '@/app/constants/empresa';
import { formatearFecha } from '@/app/constants/hora';
// Estado de cuenta de un cliente en PDF (A4 vertical) con el membrete de Mediquir.
//   construirPdf(...)        -> parte pura: dibuja el documento
//   abrirEstadoCuentaPdf(...) -> parte del navegador: baja el logo, arma el PDF y lo abre en una pestaña (visor con descargar e imprimir)

const AZUL_OSCURO = [11, 27, 61];
const AZUL = [0, 90, 170];
const AZUL_CLARO = [230, 241, 252];
const GRIS = [110, 120, 135];
const GRIS_LINEA = [222, 228, 236];
const ROJO = [185, 28, 28];
const VERDE = [13, 120, 100];

const usd = (v) => `$ ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0)}`;
const bs = (v) => `Bs ${new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0)}`;
const DOC = { FACTURA: 'Factura', NOTA_ENTREGA: 'N. entrega', VENTA_RAPIDA: 'V. rápida' };

export function construirPdf({ jsPDF, autoTable, cliente, logo, generado }) {
    const ec = cliente.estadoCuenta || { pendientes: [], pagos: [], total: 0 };
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const ANCHO = doc.internal.pageSize.getWidth();
    const ALTO = doc.internal.pageSize.getHeight();
    const M = 10;
    const CAB = 28;
    const vencido = ec.pendientes.filter((p) => p.estado === 'vencido').reduce((a, p) => a + p.saldo, 0);
    const porVencer = Math.max(ec.total - vencido, 0);

    // ---- Datos del cliente
    let y = CAB + 9;
    doc.setTextColor(...AZUL_OSCURO); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
    doc.text('Estado de cuenta', M, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRIS);
    doc.text(`Al ${generado.fecha}`, ANCHO - M, y, { align: 'right' });
    y += 6;
    doc.setTextColor(...AZUL_OSCURO); doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5);
    doc.text(doc.splitTextToSize(cliente.nombre || 'Sin razón social', ANCHO - 2 * M), M, y);
    y += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...GRIS);
    const contacto = [cliente.identificacion && `RIF/C.I.: ${cliente.identificacion}`, cliente.telefono && `Tel.: ${cliente.telefono}`].filter(Boolean).join('   ·   ');
    if (contacto) { doc.text(contacto, M, y); y += 4.2; }
    if (cliente.direccion) { const l = doc.splitTextToSize(cliente.direccion, ANCHO - 2 * M); doc.text(l, M, y); y += 4.2 * l.length; }
    y += 3;

    // ---- Cifras
    const cifras = [
        ['Total adeudado', usd(ec.total), AZUL_OSCURO],
        ['Vencido', usd(vencido), vencido > 0 ? ROJO : AZUL_OSCURO],
        ['Por vencer', usd(porVencer), AZUL_OSCURO],
        ['Documentos con saldo', String(ec.pendientes.length), AZUL_OSCURO],
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

    // ---- Documentos con saldo
    subtitulo('Documentos con saldo', 'Montos en dólares. El saldo ya descuenta abonos, retenciones y notas.');
    if (!ec.pendientes.length) {
        doc.setTextColor(...VERDE); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        doc.text('Este cliente no tiene saldo pendiente.', M, y + 3);
        y += 10;
    } else {
        autoTable(doc, {
            ...estiloTabla, startY: y,
            head: [['Documento', 'Emisión', 'Vence', 'Estado', 'Total', 'Saldo']],
            body: [
                ...ec.pendientes.map((p) => [
                    `${p.numero}${DOC[p.tipoDocumento] ? `\n${DOC[p.tipoDocumento]}` : ''}`, formatearFecha(p.fecha) || '', formatearFecha(p.vence) || '—', p.etiqueta || '',
                    usd(p.total), { content: usd(p.saldo), styles: { fontStyle: 'bold', textColor: p.estado === 'vencido' ? ROJO : [35, 45, 60] } },
                ]),
                [
                    { content: 'TOTAL ADEUDADO', colSpan: 5, styles: { fontStyle: 'bold', fillColor: AZUL_CLARO } },
                    { content: usd(ec.total), styles: { fontStyle: 'bold', fillColor: AZUL_CLARO, halign: 'right' } },
                ],
            ],
            columnStyles: { 1: { cellWidth: 24 }, 2: { cellWidth: 24 }, 3: { cellWidth: 30 }, 4: { halign: 'right', cellWidth: 28 }, 5: { halign: 'right', cellWidth: 28 } },
            didParseCell: (d) => { if (d.section === 'head' && d.column.index >= 4) d.cell.styles.halign = 'right'; },
        });
        y = doc.lastAutoTable.finalY + 9;
    }

    // ---- Últimos pagos
    if (ec.pagos.length) {
        if (y > ALTO - 50) { doc.addPage(); y = CAB + 10; }
        subtitulo('Últimos pagos recibidos');
        autoTable(doc, {
            ...estiloTabla, startY: y,
            head: [['Fecha', 'Método', 'Documento', 'Referencia', 'Monto ($)', 'Monto (Bs)']],
            body: ec.pagos.map((p) => [formatearFecha(p.fecha) || '', p.metodo || '', p.documento || '', p.referencia || '', usd(p.montoUsd), bs(p.montoVes)]),
            columnStyles: { 0: { cellWidth: 24 }, 4: { halign: 'right', cellWidth: 26 }, 5: { halign: 'right', cellWidth: 32 } },
            didParseCell: (d) => { if (d.section === 'head' && d.column.index >= 4) d.cell.styles.halign = 'right'; },
        });
        y = doc.lastAutoTable.finalY + 6;
    }

    if (y > ALTO - 30) { doc.addPage(); y = CAB + 10; }
    doc.setTextColor(...GRIS); doc.setFont('helvetica', 'italic'); doc.setFontSize(7.5);
    doc.text('Cualquier diferencia con este estado de cuenta, comuníquese con nosotros.', M, y);

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
        doc.text(`Estado de cuenta de ${cliente.nombre || cliente.identificacion} · generado ${generado.completo}`, M, ALTO - 5.8);
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
export async function abrirEstadoCuentaPdf(cliente) {
    const pestana = window.open('', '_blank'); // se abre ya, con el toque del usuario, para que no la bloqueen
    try {
        const [{ jsPDF }, { default: autoTable }, logo] = await Promise.all([import('jspdf'), import('jspdf-autotable'), logoPng()]);
        const ahora = new Date();
        const generado = {
            fecha: ahora.toLocaleDateString('es-VE', { timeZone: 'America/Caracas' }),
            completo: ahora.toLocaleString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'short', timeStyle: 'short' }),
        };
        const doc = construirPdf({ jsPDF, autoTable, cliente, logo, generado });
        const nombre = `estado-de-cuenta-${(cliente.identificacion || cliente.id || 'cliente').toString().replace(/[^\w-]+/g, '')}`;
        doc.setProperties({ title: `Estado de cuenta ${cliente.nombre || cliente.identificacion || ''}` });
        if (pestana) pestana.location.href = String(doc.output('bloburl'));
        else doc.save(`${nombre}.pdf`);
    } catch (e) {
        pestana?.close();
        throw e;
    }
}
