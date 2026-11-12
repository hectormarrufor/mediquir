import { MEMBRETE_MEDIQUIR } from '@/app/constants/empresa';
import { numeroALetras } from '@/app/utils/numeroALetras';
import { TIPOS_PAGO, FORMAS_PAGO, fechaCorta, textoPeriodo } from '@/app/constants/pagosEmpleados';
// Recibo de pago a empleado en PDF (carta vertical) con el membrete de Mediquir: beneficio de alimentación, de transporte y quincena.
//   construirPdf(...)  -> parte pura: dibuja el documento
//   abrirReciboPdf(...) -> parte del navegador: baja el logo y la firma, arma el PDF y lo abre en una pestaña (descargar o imprimir)

const AZUL_OSCURO = [11, 27, 61];
const AZUL = [0, 90, 170];
const AZUL_CLARO = [230, 241, 252];
const GRIS = [110, 120, 135];
const GRIS_LINEA = [200, 208, 220];

const nf = (v) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);
const fechaHora = (iso) => (iso ? new Date(iso).toLocaleString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'short', timeStyle: 'short' }) : '');
const sinCon = (t) => t.replace(/CON \d\d\/100$/, '').trim();

// «TRECE MIL TRESCIENTOS TREINTA Y OCHO BOLIVARES CON SETENTA Y CINCO CENTAVOS»
export function montoEnLetras(monto) {
    const entero = Math.floor(Number(monto) + 1e-9);
    const centavos = Math.round((Number(monto) - entero) * 100);
    const letras = `${sinCon(numeroALetras(entero))} ${entero === 1 ? 'BOLIVAR' : 'BOLIVARES'}`;
    return centavos > 0 ? `${letras} CON ${sinCon(numeroALetras(centavos))} ${centavos === 1 ? 'CENTAVO' : 'CENTAVOS'}` : letras;
}

export function construirPdf({ jsPDF, autoTable, pago, logo, generado }) {
    const cfg = TIPOS_PAGO[pago.tipo];
    const doc = new jsPDF({ unit: 'mm', format: 'letter', compress: true });
    const ANCHO = doc.internal.pageSize.getWidth();
    const ALTO = doc.internal.pageSize.getHeight();
    const M = 14;
    const CAB = 30;
    const confirmado = pago.estado === 'CONFIRMADO';
    const anulado = pago.estado === 'ANULADO';
    const codigo = String(pago.id).slice(0, 8).toUpperCase();

    // ---- Membrete
    doc.setFillColor(...AZUL_OSCURO); doc.rect(0, 0, ANCHO, CAB, 'F');
    doc.setFillColor(...AZUL); doc.rect(0, CAB, ANCHO, 0.9, 'F');
    if (logo) {
        const alto = 16;
        doc.addImage(logo.data, 'PNG', M, (CAB - alto) / 2, alto * (logo.w / logo.h), alto, undefined, 'FAST');
    } else {
        doc.setTextColor(255); doc.setFont('helvetica', 'bolditalic'); doc.setFontSize(20); doc.text('MEDIQUIR', M, 17);
    }
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.text(MEMBRETE_MEDIQUIR.nombre, ANCHO - M, 9.5, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(170, 205, 240);
    doc.text(`RIF: ${MEMBRETE_MEDIQUIR.rif}`, ANCHO - M, 14.5, { align: 'right' });
    doc.text(doc.splitTextToSize(MEMBRETE_MEDIQUIR.direccion, 105), ANCHO - M, 18.5, { align: 'right' });
    doc.text(`${MEMBRETE_MEDIQUIR.telefonos} · ${MEMBRETE_MEDIQUIR.email}`, ANCHO - M, 27, { align: 'right' });

    let y = CAB + 13;
    const tabla = { theme: 'grid', margin: { left: M, right: M }, styles: { font: 'helvetica', fontSize: 9, cellPadding: 2, textColor: [25, 35, 55], lineColor: GRIS_LINEA, lineWidth: 0.25, valign: 'middle' } };

    // ---- Firma a mano, cédula y huella (el recibo se imprime, se firma y se archiva) + una línea de constancia
    const bloqueFirma = (yTop) => {
        const mitad = (ANCHO - 2 * M) / 2 - 3;
        doc.setDrawColor(...GRIS); doc.setLineWidth(0.3);
        doc.line(M + 4, yTop + 24, M + mitad - 4, yTop + 24);
        doc.setTextColor(25, 35, 55); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
        doc.text(pago.tipo === 'QUINCENA' ? 'RECIBE CONFORME' : 'FIRMA Y CEDULA', M + mitad / 2, yTop + 29, { align: 'center' });
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
        doc.text(`${pago.empleadoNombre} · C.I. ${pago.cedula}`, M + mitad / 2, yTop + 33.5, { align: 'center' });
        if (pago.tipo !== 'QUINCENA') {
            const x2 = M + mitad + 6;
            doc.rect(x2 + mitad - 48, yTop, 48, 28, 'S');
            doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
            doc.text('HUELLA', x2 + mitad - 24, yTop + 33, { align: 'center' });
        }
        // Constancia: quién lo registró y si ya se firmó y archivó
        const estado = anulado ? `ANULADO el ${fechaHora(pago.anuladoAt)}${pago.anuladoMotivo ? ` · ${pago.anuladoMotivo}` : ''}`
            : confirmado ? `Firmado y archivado (marcado el ${fechaHora(pago.confirmadoAt)})`
                : 'Pendiente de firma';
        doc.setTextColor(...GRIS); doc.setFont('helvetica', 'italic'); doc.setFontSize(7.5);
        doc.text(doc.splitTextToSize(`Recibo N° ${codigo} · registrado por ${pago.creadoPorNombre || 'Administración'} · ${estado}`, ANCHO - 2 * M), M, yTop + 40);
    };

    if (pago.tipo === 'QUINCENA') {
        // ---- Formato de quincena
        doc.setTextColor(...AZUL_OSCURO); doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
        doc.text('RECIBO DE PAGO · QUINCENA', ANCHO / 2, y, { align: 'center' });
        y += 12;
        const fila = (etiqueta, valor, alto = 8) => {
            doc.setTextColor(25, 35, 55); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
            doc.text(etiqueta, M, y);
            const ancho = doc.getTextWidth(`${etiqueta} `);
            doc.setFont('helvetica', 'normal');
            const partes = doc.splitTextToSize(valor, ANCHO - 2 * M - ancho);
            doc.text(partes, M + ancho, y);
            y += alto + (partes.length - 1) * 5;
        };
        doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
        doc.text('FECHA:', M, y); doc.setFont('helvetica', 'normal'); doc.text(fechaCorta(pago.fecha), M + 18, y);
        doc.setFont('helvetica', 'bold'); doc.text(`BSS. ${nf(pago.totalCobrar)}`, ANCHO - M, y, { align: 'right' });
        y += 10;
        fila('HEMOS PAGADO A:', pago.empleadoNombre.toUpperCase());
        fila('LA CANTIDAD DE:', montoEnLetras(pago.totalCobrar), 9);
        fila('POR CONCEPTO DE:', pago.conceptoTexto || pago.conceptos?.[0]?.concepto || '');
        y += 4;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(25, 35, 55);
        [['EFECTIVO', 'EFECTIVO'], ['CHEQUE', 'CHEQUE'], ['TRANSF', 'TRANSFERENCIA']].forEach(([txt, clave], i) => {
            const x = M + i * 48;
            doc.text(`${txt}:`, x, y);
            doc.setDrawColor(...GRIS); doc.setLineWidth(0.3); doc.rect(x + doc.getTextWidth(`${txt}: `) + 1, y - 4, 5, 5, 'S');
            if (pago.formaPago === clave) { doc.setFont('helvetica', 'bold'); doc.text('X', x + doc.getTextWidth(`${txt}: `) + 2.2, y - 0.2); doc.setFont('helvetica', 'normal'); }
        });
        if (pago.referencia) { doc.setFontSize(9); doc.setTextColor(...GRIS); doc.text(`Referencia: ${pago.referencia}${pago.formaPago ? ` (${FORMAS_PAGO[pago.formaPago]})` : ''}`, M, y + 7); }
        y += 18;
        bloqueFirma(y);
    } else {
        // ---- Formato de beneficio (alimentación / transporte)
        doc.setTextColor(...AZUL_OSCURO); doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
        doc.text(cfg.titulo, ANCHO / 2, y, { align: 'center' });
        doc.setFontSize(10.5);
        doc.text(textoPeriodo(pago.periodoDesde, pago.periodoHasta), ANCHO / 2, y + 6.5, { align: 'center' });
        y += 12;

        autoTable(doc, {
            ...tabla, startY: y,
            head: [['CEDULA', 'NOMBRE Y APELLIDO', 'FECHA DE INGRESO', 'CARGO']],
            body: [[pago.cedula, pago.empleadoNombre.toUpperCase(), fechaCorta(pago.fechaIngreso), (pago.cargo || '').toUpperCase()]],
            headStyles: { fillColor: AZUL_CLARO, textColor: AZUL_OSCURO, fontStyle: 'bold', halign: 'center', fontSize: 8.5 },
            bodyStyles: { halign: 'center' },
        });
        y = doc.lastAutoTable.finalY;

        const filas = (pago.conceptos || []).map((c) => [String(pago.dias ?? ''), c.concepto, Number(c.asignacion) > 0 ? nf(c.asignacion) : '', Number(c.deduccion) > 0 ? nf(c.deduccion) : '']);
        autoTable(doc, {
            ...tabla, startY: y,
            head: [['DIAS', 'CONCEPTO', 'ASIGNACIONES', 'DEDUCCIONES']],
            body: [
                ...filas,
                [{ content: 'TOTAL ASIGNACIONES Y DEDUCCIONES', colSpan: 2, styles: { fontStyle: 'bold' } }, { content: nf(pago.totalAsignaciones), styles: { halign: 'right', fontStyle: 'bold' } }, { content: Number(pago.totalDeducciones) > 0 ? nf(pago.totalDeducciones) : '', styles: { halign: 'right', fontStyle: 'bold' } }],
                [{ content: 'TOTAL A COBRAR', colSpan: 3, styles: { fontStyle: 'bold', halign: 'center', fontSize: 11, fillColor: AZUL_CLARO } }, { content: nf(pago.totalCobrar), styles: { halign: 'right', fontStyle: 'bold', fontSize: 12, fillColor: AZUL_CLARO } }],
            ],
            headStyles: { fillColor: AZUL_CLARO, textColor: AZUL_OSCURO, fontStyle: 'bold', halign: 'center', fontSize: 8.5 },
            columnStyles: { 0: { cellWidth: 18, halign: 'center' }, 2: { cellWidth: 38, halign: 'right' }, 3: { cellWidth: 38, halign: 'right' } },
            bodyStyles: { minCellHeight: 9 },
        });
        y = doc.lastAutoTable.finalY + 14;
        bloqueFirma(y);
        y += 48;
        // Nota legal, tal cual
        doc.setDrawColor(...GRIS); doc.setLineWidth(0.4);
        const texto = doc.splitTextToSize(cfg.nota, ANCHO - 2 * M - 8);
        const alto = texto.length * 3.9 + 6;
        doc.rect(M, y, ANCHO - 2 * M, alto, 'S');
        doc.setTextColor(25, 35, 55); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.8);
        doc.text(texto, ANCHO / 2, y + 5, { align: 'center', lineHeightFactor: 1.3 });
    }

    // ---- Pie
    doc.setDrawColor(...GRIS_LINEA); doc.setLineWidth(0.2); doc.line(M, ALTO - 12, ANCHO - M, ALTO - 12);
    doc.setTextColor(...GRIS); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
    doc.text(`${cfg.etiqueta} · ${pago.empleadoNombre} · recibo ${codigo} · generado ${generado}`, M, ALTO - 7);
    doc.text('Queda guardado en el histórico de pagos a empleados', ANCHO - M, ALTO - 7, { align: 'right' });
    if (anulado) {
        doc.setTextColor(200, 40, 40); doc.setFont('helvetica', 'bold'); doc.setFontSize(60);
        doc.text('ANULADO', ANCHO / 2, ALTO / 2, { align: 'center', angle: 30 });
    }
    return doc;
}

async function imagen(url, formato = 'png') {
    try {
        const res = await fetch(url, { mode: 'cors' });
        if (!res.ok) return null;
        const bmp = await createImageBitmap(await res.blob());
        const canvas = document.createElement('canvas');
        canvas.width = bmp.width; canvas.height = bmp.height;
        const g = canvas.getContext('2d');
        if (formato === 'jpeg') { g.fillStyle = '#fff'; g.fillRect(0, 0, bmp.width, bmp.height); }
        g.drawImage(bmp, 0, 0);
        return { data: canvas.toDataURL(`image/${formato}`), w: bmp.width, h: bmp.height };
    } catch {
        return null;
    }
}

// Abre el PDF en una pestaña nueva (visor del navegador: descargar o imprimir). Si la bloquean, lo descarga.
export async function abrirReciboPdf(pago) {
    const pestana = window.open('', '_blank'); // se abre ya, con el toque del usuario, para que no la bloqueen
    try {
        const [{ jsPDF }, { default: autoTable }, logo] = await Promise.all([import('jspdf'), import('jspdf-autotable'), imagen('/tenants/mediquir/logo-header@2x.png')]);
        const generado = new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'short', timeStyle: 'short' });
        const doc = construirPdf({ jsPDF, autoTable, pago, logo, generado });
        doc.setProperties({ title: `${TIPOS_PAGO[pago.tipo].etiqueta} · ${pago.empleadoNombre} · ${pago.fecha}` });
        if (pestana) pestana.location.href = String(doc.output('bloburl'));
        else doc.save(`recibo-${pago.tipo.toLowerCase()}-${pago.cedula}-${pago.fecha}.pdf`);
    } catch (e) {
        pestana?.close();
        throw e;
    }
}
