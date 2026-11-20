// Recibo del pago de comisión a un vendedor en PDF, para COMPARTIRLO por WhatsApp en el momento de entregárselo.
//   · En el teléfono (y en navegadores que lo permiten) abre la hoja de compartir con el PDF adjunto: se elige WhatsApp y el chat del vendedor.
//   · En la computadora no se puede adjuntar un archivo desde un enlace: se descarga el PDF y se abre WhatsApp con el resumen escrito, para adjuntarlo.
import { MEMBRETE_MEDIQUIR } from '@/app/constants/empresa';

const AZUL_OSCURO = [11, 27, 61];
const AZUL = [0, 90, 170];
const FONDO_MEMBRETE = [236, 244, 252];
const TEXTO_MEMBRETE = [40, 55, 80];
const GRIS = [110, 120, 135];
const LINEA = [200, 208, 220];
const fmtCorrelativo = (id) => `00-${String(id ?? '').replace(/\D/g, '').padStart(5, '0')}`;

const nf = (v) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);
const usd = (v) => `$ ${nf(v)}`;
const fechaLinda = (f) => String(f || '').slice(0, 10).split('-').reverse().join('/');

async function imagen(url) {
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const bmp = await createImageBitmap(await res.blob());
        const canvas = document.createElement('canvas');
        canvas.width = bmp.width; canvas.height = bmp.height;
        canvas.getContext('2d').drawImage(bmp, 0, 0);
        return { data: canvas.toDataURL('image/png'), w: bmp.width, h: bmp.height };
    } catch { return null; }
}

async function cargarPago(pagoId) {
    const res = await fetch(`/api/comisiones/pagos?id=${pagoId}`);
    const cuerpo = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(cuerpo.error || 'No se pudo cargar el pago');
    return cuerpo.pago;
}

// 0424-6371531 / +58 424-6371531 -> 584246371531 (para wa.me)
export const aWhatsApp = (tel) => {
    const d = String(tel || '').replace(/\D/g, '');
    if (!d) return null;
    if (d.startsWith('58')) return d;
    return d.startsWith('0') ? `58${d.slice(1)}` : d;
};

// Texto corto del pago, para el mensaje de WhatsApp
export function resumenPago(pago) {
    const tasa = Number(pago.tasaBcv) > 0 ? Number(pago.tasaBcv) : null;
    const lineas = [
        `*Recibo de pago de comisión N° ${pago.id}*`,
        `Fecha: ${fechaLinda(pago.fecha)}`,
        `Vendedor: ${pago.vendedorNombre}`,
        `Comisión liquidada: ${usd(pago.totalComisionUsd)}`,
    ];
    if (Number(pago.abonoPrestamoUsd) > 0) lineas.push(`Abonado a tu préstamo: ${usd(pago.abonoPrestamoUsd)}`);
    if (Number(pago.pagadoUsd) > 0) lineas.push(`*Pagado: ${usd(pago.pagadoUsd)}*${tasa ? ` (Bs ${nf(Number(pago.pagadoUsd) * tasa)})` : ''}`);
    if (pago.acumuladoDespuesUsd !== null && pago.acumuladoDespuesUsd !== undefined && Number(pago.acumuladoDespuesUsd) > 0.004) lineas.push(`Te quedan por cobrar: ${usd(pago.acumuladoDespuesUsd)}`);
    if (Number(pago.prestamoDespuesUsd) > 0.004) lineas.push(`Préstamo pendiente: ${usd(pago.prestamoDespuesUsd)}`);
    lineas.push('', MEMBRETE_MEDIQUIR.nombre);
    return lineas.join('\n');
}

async function armarPdf(pago) {
    const [{ jsPDF }, { default: autoTable }, logo] = await Promise.all([import('jspdf'), import('jspdf-autotable'), imagen('/tenants/mediquir/logo-header@2x.png')]);
    const doc = new jsPDF({ unit: 'mm', format: 'a5' }); // media carta: se lee bien en la pantalla del teléfono
    const ANCHO = doc.internal.pageSize.getWidth();
    const M = 10;
    const tasa = Number(pago.tasaBcv) > 0 ? Number(pago.tasaBcv) : null;

    // Membrete claro para que contraste con el logo azul de Mediquir
    doc.setFillColor(...FONDO_MEMBRETE); doc.rect(0, 0, ANCHO, 24, 'F');
    doc.setFillColor(...AZUL); doc.rect(0, 24, ANCHO, 0.8, 'F');
    if (logo) { const alto = 12; const ancho = Math.min(40, (logo.w / logo.h) * alto); doc.addImage(logo.data, 'PNG', M, 6, ancho, alto); }
    doc.setTextColor(...AZUL_OSCURO); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
    doc.text(MEMBRETE_MEDIQUIR.nombre, ANCHO - M, 10, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...TEXTO_MEMBRETE);
    doc.text(`RIF ${MEMBRETE_MEDIQUIR.rif}`, ANCHO - M, 14.5, { align: 'right' });

    // Título
    doc.setTextColor(...AZUL_OSCURO); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
    doc.text('Recibo de pago de comisión', M, 35);
    doc.setFontSize(10); doc.setTextColor(...GRIS);
    doc.text(`N° ${fmtCorrelativo(pago.id)} · ${fechaLinda(pago.fecha)}`, ANCHO - M, 35, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30); doc.setFontSize(10);
    doc.text(`Vendedor: ${pago.vendedorNombre}`, M, 42);
    if (tasa) doc.text(`Tasa BCV: ${nf(tasa)} Bs/$`, ANCHO - M, 42, { align: 'right' });

    const estilo = { styles: { fontSize: 9, cellPadding: 1.8, lineColor: LINEA, lineWidth: 0.2 }, headStyles: { fillColor: AZUL_OSCURO, textColor: 255 }, margin: { left: M, right: M } };

    // Comisión
    const comision = [];
    if (pago.acumuladoAntesUsd !== null && pago.acumuladoAntesUsd !== undefined) comision.push(['Comisión por pagar antes de este pago', usd(pago.acumuladoAntesUsd)]);
    comision.push([{ content: 'Comisión que se liquida en este pago', styles: { fontStyle: 'bold' } }, { content: usd(pago.totalComisionUsd), styles: { fontStyle: 'bold' } }]);
    if (pago.acumuladoDespuesUsd !== null && pago.acumuladoDespuesUsd !== undefined) comision.push(['Queda por pagar', usd(pago.acumuladoDespuesUsd)]);
    autoTable(doc, { ...estilo, startY: 47, body: comision, columnStyles: { 1: { halign: 'right', cellWidth: 38 } } });

    // Comisiones que quedaron pagadas completas
    const lineas = (pago.lineas || []).map((l) => [l.documento || '', l.cliente || '', l.concepto === 'ABONO' ? 'Abono' : l.concepto === 'NOTA' ? 'Nota' : 'Factura', usd(l.comisionUsd)]);
    if (lineas.length) {
        autoTable(doc, { ...estilo, startY: doc.lastAutoTable.finalY + 5, head: [['Documento', 'Cliente', 'Tipo', 'Comisión']], body: lineas, columnStyles: { 3: { halign: 'right' } } });
    }

    // Destino del pago
    const destino = [];
    if (Number(pago.abonoPrestamoUsd) > 0) destino.push(['Abono al préstamo del vendedor', usd(pago.abonoPrestamoUsd), tasa ? `Bs ${nf(Number(pago.abonoPrestamoUsd) * tasa)}` : '']);
    destino.push([{ content: 'Pagado al vendedor', styles: { fontStyle: 'bold' } }, { content: usd(pago.pagadoUsd), styles: { fontStyle: 'bold' } }, { content: tasa ? `Bs ${nf(Number(pago.pagadoUsd) * tasa)}` : '', styles: { fontStyle: 'bold' } }]);
    autoTable(doc, { ...estilo, startY: doc.lastAutoTable.finalY + 5, head: [['Destino del pago', 'USD', 'Bolívares']], body: destino, columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } } });

    let y = doc.lastAutoTable.finalY + 6;
    doc.setFontSize(9); doc.setTextColor(30, 30, 30);
    if (Number(pago.abonoPrestamoUsd) > 0 || Number(pago.prestamoAntesUsd) > 0) {
        doc.text(`Préstamo: debía ${usd(pago.prestamoAntesUsd)} · abonó ${usd(pago.abonoPrestamoUsd)} · queda debiendo ${usd(pago.prestamoDespuesUsd)}`, M, y, { maxWidth: ANCHO - 2 * M });
        y += 7;
    }
    if (pago.observacion) { doc.text(`Observación: ${pago.observacion}`, M, y, { maxWidth: ANCHO - 2 * M }); y += 7; }

    // Firmas
    if (Number(pago.pagadoUsd) > 0) {
        const alto = doc.internal.pageSize.getHeight();
        const yFirma = Math.max(y + 18, alto - 22);
        doc.setDrawColor(40, 40, 40); doc.setLineWidth(0.3);
        doc.line(M, yFirma, ANCHO / 2 - 4, yFirma); doc.line(ANCHO / 2 + 4, yFirma, ANCHO - M, yFirma);
        doc.setFontSize(8); doc.setTextColor(...GRIS);
        doc.text('Entregado por', M, yFirma + 4);
        doc.text(`Recibí conforme: ${pago.vendedorNombre}`, ANCHO / 2 + 4, yFirma + 4);
    }
    return doc;
}

/** Arma el archivo PDF del recibo (se puede preparar de antemano para que compartir sea instantáneo). */
export async function prepararReciboComision(pagoId) {
    const pago = await cargarPago(pagoId);
    const doc = await armarPdf(pago);
    const nombre = `Recibo-comision-${pago.id}-${String(pago.vendedorNombre || '').replace(/[^A-Za-z0-9]+/g, '-').slice(0, 30)}.pdf`;
    const file = new File([doc.output('blob')], nombre, { type: 'application/pdf' });
    return { pago, file, texto: resumenPago(pago) };
}

/** Abre directamente el chat del vendedor (si tiene teléfono guardado) con el resumen escrito del pago. */
export function abrirChatVendedor(preparado) {
    const numero = aWhatsApp(preparado.pago.vendedorTelefono);
    if (!numero) return false;
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(preparado.texto)}`, '_blank');
    return true;
}

/** Comparte el recibo ya preparado. Devuelve 'compartido' | 'descargado' | 'cancelado'. */
export async function compartirReciboComision(preparado) {
    const { file, texto, pago } = preparado;
    if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({ files: [file], title: `Recibo de pago de comisión N° ${pago.id}`, text: texto });
            return 'compartido';
        } catch (e) {
            if (e?.name === 'AbortError') return 'cancelado'; // cerró la hoja de compartir
            // cualquier otro fallo: se cae al plan B
        }
    }
    // Plan B (computadora): se descarga el PDF y se abre WhatsApp con el resumen; el archivo se adjunta desde el clip
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    // Con el teléfono del vendedor guardado, WhatsApp abre directo su chat
    const numero = aWhatsApp(pago.vendedorTelefono);
    window.open(`https://wa.me/${numero || ''}?text=${encodeURIComponent(texto)}`, '_blank');
    return 'descargado';
}
