// PDF del presupuesto a partir de lo que se ve en pantalla: cada hoja (.pp-hoja) se copia fuera de pantalla a tamaño real (sin el zoom del teléfono),
// se fotografía con html2canvas y se arma un PDF carta con una imagen por hoja. Así el PDF es idéntico a la hoja impresa.
// Solo corre en el navegador (se importan html2canvas y jspdf al usarlo para no cargarlos con la página).

const ANCHO_PX = 816; // 8.5 in a 96 dpi
const PT_ANCHO = 612; // carta en puntos
const PT_ALTO = 792;

const esperarImagenes = (raiz) => Promise.all([...raiz.querySelectorAll('img')].map((img) => (img.complete && img.naturalWidth ? null : new Promise((ok) => { img.onload = ok; img.onerror = ok; }))));

/**
 * @param {HTMLElement} origen  contenedor con las hojas (#pp-print-section)
 * @param {string} claseFuente  clase del tipo de letra de la hoja (la de la tienda)
 * @returns {Promise<Blob>} el PDF
 */
export async function generarPdfDeHojas(origen, claseFuente) {
    const hojas = [...origen.querySelectorAll('.pp-hoja')];
    if (!hojas.length) throw new Error('No hay hojas para el PDF');
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);

    const contenedor = document.createElement('div');
    contenedor.className = `${claseFuente || ''} pp-envoltura`;
    Object.assign(contenedor.style, { position: 'fixed', left: '-10000px', top: '0', width: `${ANCHO_PX}px`, background: '#fff', padding: '0', minHeight: '0', overflow: 'visible', zIndex: '-1' });
    for (const hoja of hojas) {
        const copia = hoja.cloneNode(true);
        copia.style.setProperty('--pp-zoom', '1');
        Object.assign(copia.style, { zoom: '1', margin: '0 0 0 0', boxShadow: 'none', width: `${ANCHO_PX}px` });
        contenedor.appendChild(copia);
    }
    document.body.appendChild(contenedor);
    try {
        if (document.fonts?.ready) await document.fonts.ready;
        await esperarImagenes(contenedor);
        const pdf = new jsPDF({ unit: 'pt', format: 'letter', compress: true });
        const copias = [...contenedor.querySelectorAll('.pp-hoja')];
        for (let i = 0; i < copias.length; i++) {
            const lienzo = await html2canvas(copias[i], { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false, windowWidth: ANCHO_PX });
            let ancho = PT_ANCHO;
            let alto = (PT_ANCHO * lienzo.height) / lienzo.width;
            if (alto > PT_ALTO) { ancho = (PT_ANCHO * PT_ALTO) / alto; alto = PT_ALTO; } // una hoja más alta que la carta se ajusta, no se corta
            if (i > 0) pdf.addPage('letter', 'portrait');
            pdf.addImage(lienzo.toDataURL('image/jpeg', 0.92), 'JPEG', (PT_ANCHO - ancho) / 2, 0, ancho, alto, undefined, 'FAST');
        }
        return pdf.output('blob');
    } finally {
        contenedor.remove();
    }
}

/**
 * Genera un PDF media carta horizontal (8 x 5.5 in) a partir de #print-section de FacturaFormaLibre.
 * Incluye el fondo de la forma preimpresa para que el PDF compartido por WhatsApp muestre membrete y casillas.
 */
export async function generarPdfDeFormaLibre(hoja) {
    if (!hoja) throw new Error('No hay documento para generar el PDF');
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);

    const anchoPx = 768; // 8 in a 96 dpi
    const altoPx = 528;  // 5.5 in a 96 dpi
    const contenedor = document.createElement('div');
    contenedor.className = 'fl-envoltura';
    Object.assign(contenedor.style, {
        position: 'fixed', left: '-10000px', top: '0', width: `${anchoPx}px`, height: `${altoPx}px`,
        background: '#fff', padding: '0', minHeight: '0', overflow: 'hidden', zIndex: '-1',
    });

    const copia = hoja.cloneNode(true);
    Object.assign(copia.style, { zoom: '1', margin: '0', boxShadow: 'none', width: `${anchoPx}px`, height: `${altoPx}px` });
    let guiaImg = copia.querySelector('.fl-guia');
    if (!guiaImg) {
        guiaImg = document.createElement('img');
        guiaImg.className = 'fl-guia fl-guia-imprime';
        guiaImg.src = '/tenants/mediquir/forma-libre.png';
        guiaImg.alt = '';
        copia.prepend(guiaImg);
    }
    guiaImg.style.opacity = '0.85';
    contenedor.appendChild(copia);
    document.body.appendChild(contenedor);

    try {
        if (document.fonts?.ready) await document.fonts.ready;
        await esperarImagenes(contenedor);
        const lienzo = await html2canvas(copia, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false, windowWidth: anchoPx });
        const pdf = new jsPDF({ unit: 'in', format: [8, 5.5], orientation: 'landscape', compress: true });
        pdf.addImage(lienzo.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 8, 5.5, undefined, 'FAST');
        return pdf.output('blob');
    } finally {
        contenedor.remove();
    }
}
