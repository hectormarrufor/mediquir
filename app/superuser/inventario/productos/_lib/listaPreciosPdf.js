import { montoRenglon, REGLAS } from '@/app/constants/facturacion';
// Lista de precios en PDF.
//
//   construirPdf(...)  -> parte pura: dibuja el documento (se puede probar en Node)
//   descargarListaPrecios(...) -> parte del navegador: baja las imágenes, las reduce y guarda el archivo
//
// Los precios se muestran EXACTOS (de 2 a 3 decimales, sin redondear a centavos).

const AZUL_OSCURO = [11, 27, 61];
const AZUL = [0, 90, 170];
const AZUL_CLARO = [230, 241, 252];
const GRIS = [110, 120, 135];
const GRIS_LINEA = [222, 228, 236];

const PRESENTACION = { unidad: 'Unidad', par: 'Par', paqx2: 'Paquete x2', paqx4: 'Paquete x4' };
const FORMATO = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 });

const NOTA_IVA = `Precios en USD, sin IVA. A los productos gravados se les añade IVA (${REGLAS.alicuotaGeneral}%) al facturar; los marcados (E) son exentos. Monto de cada renglón = precio unitario x cantidad, redondeado a 2 decimales.`;
export const dinero = (v) => `$${FORMATO.format(Number(v) || 0)}`;

const presentacionDe = (f) => PRESENTACION[f.presentacion] || 'Unidad';

const fechaLarga = (iso) => new Date(iso).toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' });

// Ajusta una imagen de w x h px dentro de una caja de `caja` mm, conservando la proporción
function ajustar(w, h, caja) {
    const k = Math.min(caja / w, caja / h);
    return { ancho: w * k, alto: h * k };
}

// ---------------------------------------------------------------------------------------------
// Parte pura
// ---------------------------------------------------------------------------------------------
export function construirPdf({ jsPDF, autoTable, datos, imagenes, logo, incluirPrecioCaja }) {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const ANCHO = doc.internal.pageSize.getWidth();
    const ALTO = doc.internal.pageSize.getHeight();
    const MARGEN = 10;
    const ALTO_CABECERA = 20;
    const CAJA_FOTO = 11;

    const mostrarCaja = Boolean(incluirPrecioCaja);
    const columnas = [
        { header: '', dataKey: 'foto' },
        { header: 'Código', dataKey: 'codigo' },
        { header: 'Producto', dataKey: 'nombre' },
        { header: 'Marca', dataKey: 'marca' },
        { header: 'Presentación', dataKey: 'presentacion' },
        { header: `${datos.etiqueta}`, dataKey: 'precio' },
        ...(mostrarCaja ? [{ header: 'Precio por caja', dataKey: 'precioCaja' }] : []),
    ];

    // Cuerpo: una fila de encabezado por categoría y luego sus productos
    const cuerpo = [];
    let categoriaActual = null;
    datos.filas.forEach((f) => {
        if (f.categoria !== categoriaActual) {
            categoriaActual = f.categoria;
            cuerpo.push([{ content: f.categoria.toUpperCase(), colSpan: columnas.length, styles: { fillColor: AZUL_CLARO, textColor: AZUL_OSCURO, fontStyle: 'bold', fontSize: 9, minCellHeight: 7, cellPadding: { top: 1.6, bottom: 1.6, left: 3, right: 2 } }, _categoria: true }]);
        }
        const foto = f.imagen ? imagenes.get(f.imagen) : null;
        const fila = [
            { content: '', _foto: foto, _inicial: (f.nombre || '?').charAt(0).toUpperCase() },
            f.codigo || '',
            f.porcentajeIva > 0 ? f.nombre : `${f.nombre} (E)`,
            f.marca,
            presentacionDe(f),
            { content: dinero(f.precio), styles: { halign: 'right', fontStyle: 'bold', textColor: AZUL_OSCURO, fontSize: 9.5 } },
        ];
        if (mostrarCaja) {
            fila.push(f.unidadesPorCaja > 0 && f.precio > 0
                ? { content: dinero(montoRenglon(f.precio, f.unidadesPorCaja)), styles: { halign: 'right', textColor: GRIS } }
                : { content: '', styles: { halign: 'right' } });
        }
        cuerpo.push(fila);
    });

    const anchos = mostrarCaja
        ? { foto: 15, codigo: 18, marca: 24, presentacion: 25, precio: 25, precioCaja: 25 }
        : { foto: 15, codigo: 20, marca: 30, presentacion: 27, precio: 30 };

    autoTable(doc, {
        head: [columnas.map((c) => c.header)],
        body: cuerpo,
        startY: ALTO_CABECERA + 12,
        margin: { top: ALTO_CABECERA + 6, right: MARGEN, bottom: 22, left: MARGEN },
        theme: 'plain',
        styles: { font: 'helvetica', fontSize: 8.5, cellPadding: { top: 1.6, bottom: 1.6, left: 2, right: 2 }, textColor: [35, 45, 60], valign: 'middle', lineColor: GRIS_LINEA, lineWidth: { bottom: 0.15 }, overflow: 'linebreak' },
        headStyles: { fillColor: AZUL_OSCURO, textColor: 255, fontStyle: 'bold', fontSize: 7.5, halign: 'left', lineWidth: 0, cellPadding: { top: 2.2, bottom: 2.2, left: 2, right: 2 } },
        columnStyles: {
            0: { cellWidth: anchos.foto, minCellHeight: 13 },
            1: { cellWidth: anchos.codigo, textColor: GRIS },
            3: { cellWidth: anchos.marca, textColor: GRIS, fontSize: 7.5 },
            4: { cellWidth: anchos.presentacion, fontSize: 8, overflow: 'ellipsize' },
            5: { cellWidth: anchos.precio, halign: 'right' },
            ...(mostrarCaja ? { 6: { cellWidth: anchos.precioCaja, halign: 'right' } } : {}),
        },
        didParseCell: (d) => {
            if (d.section === 'head' && (d.column.index === 5 || d.column.index === 6)) d.cell.styles.halign = 'right';
        },
        // Foto: miniatura (o una inicial gris si el producto no tiene ninguna imagen)
        didDrawCell: (d) => {
            if (d.section !== 'body' || d.column.index !== 0 || d.cell.raw?._categoria || !d.cell.raw) return;
            const x = d.cell.x + (d.cell.width - CAJA_FOTO) / 2;
            const y = d.cell.y + (d.cell.height - CAJA_FOTO) / 2;
            const foto = d.cell.raw._foto;
            if (foto) {
                const { ancho, alto } = ajustar(foto.w, foto.h, CAJA_FOTO);
                doc.addImage(foto.data, 'JPEG', x + (CAJA_FOTO - ancho) / 2, y + (CAJA_FOTO - alto) / 2, ancho, alto, undefined, 'FAST');
            } else {
                doc.setFillColor(240, 243, 247);
                doc.roundedRect(x, y, CAJA_FOTO, CAJA_FOTO, 1.5, 1.5, 'F');
                doc.setTextColor(...GRIS); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
                doc.text(d.cell.raw._inicial || '?', x + CAJA_FOTO / 2, y + CAJA_FOTO / 2 + 1.3, { align: 'center' });
            }
        },
    });

    // Cabecera y pie de TODAS las páginas (se dibujan al final para conocer el total de páginas)
    const paginas = doc.getNumberOfPages();
    for (let i = 1; i <= paginas; i += 1) {
        doc.setPage(i);
        doc.setFillColor(...AZUL_OSCURO);
        doc.rect(0, 0, ANCHO, ALTO_CABECERA, 'F');
        doc.setFillColor(...AZUL);
        doc.rect(0, ALTO_CABECERA, ANCHO, 0.9, 'F');

        if (logo) {
            const alto = 13;
            doc.addImage(logo.data, 'PNG', MARGEN, (ALTO_CABECERA - alto) / 2, alto * (logo.w / logo.h), alto, undefined, 'FAST');
        } else {
            doc.setTextColor(255); doc.setFont('helvetica', 'bolditalic'); doc.setFontSize(16);
            doc.text('MEDIQUIR', MARGEN, 12.5);
        }
        doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
        doc.text('Lista de precios', ANCHO - MARGEN, 9.5, { align: 'right' });
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(170, 205, 240);
        doc.text(`${datos.etiqueta} · USD`, ANCHO - MARGEN, 15, { align: 'right' });

        if (i === 1) {
            doc.setTextColor(...GRIS); doc.setFontSize(8.5); doc.setFont('helvetica', 'normal');
            doc.text(`${fechaLarga(datos.fecha)}  ·  ${datos.total.toLocaleString('es-VE')} productos  ·  Precios en dólares (USD)`, MARGEN, ALTO_CABECERA + 6.5);
        }

        doc.setDrawColor(...GRIS_LINEA); doc.setLineWidth(0.2);
        doc.line(MARGEN, ALTO - 10, ANCHO - MARGEN, ALTO - 10);
        doc.setTextColor(...GRIS); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
        doc.setFontSize(6.8); doc.text(doc.splitTextToSize(NOTA_IVA, ANCHO - 2 * MARGEN), MARGEN, ALTO - 15.6); doc.setFontSize(7.5);
        doc.text('Mediquir C.A. · Materiales y equipos quirúrgicos · mediquirca@gmail.com · @mediquirca', MARGEN, ALTO - 5.8);
        doc.text(`Página ${i} de ${paginas}`, ANCHO - MARGEN, ALTO - 5.8, { align: 'right' });
    }
    return doc;
}

// ---------------------------------------------------------------------------------------------
// Parte del navegador
// ---------------------------------------------------------------------------------------------
const BLOB = process.env.NEXT_PUBLIC_BLOB_BASE_URL;

// Descarga una imagen, la reduce (el PDF no necesita más de ~150 px) y la devuelve como JPEG en base64
async function miniatura(url, lado = 150) {
    try {
        const res = await fetch(url, { mode: 'cors' });
        if (!res.ok) return null;
        const bmp = await createImageBitmap(await res.blob());
        const k = Math.min(1, lado / Math.max(bmp.width, bmp.height));
        const w = Math.max(1, Math.round(bmp.width * k));
        const h = Math.max(1, Math.round(bmp.height * k));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const g = canvas.getContext('2d');
        g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); // fondo blanco: los PNG transparentes no salen negros
        g.drawImage(bmp, 0, 0, w, h);
        return { data: canvas.toDataURL('image/jpeg', 0.82), w, h };
    } catch {
        return null;
    }
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

// Descarga las imágenes únicas de a 8 en paralelo (las de marca y grupo se repiten en muchos productos)
async function prepararImagenes(rutas, onProgreso) {
    const mapa = new Map();
    let hechas = 0;
    let siguiente = 0;
    const trabajador = async () => {
        while (siguiente < rutas.length) {
            const ruta = rutas[siguiente++];
            mapa.set(ruta, await miniatura(`${BLOB}/${ruta}`));
            hechas += 1;
            onProgreso?.({ fase: 'imagenes', hecho: hechas, total: rutas.length });
        }
    };
    await Promise.all(Array.from({ length: Math.min(8, rutas.length) }, trabajador));
    return mapa;
}

// opciones: { precio: 6|7, incluirPrecioCaja, soloConStock, incluirSinPrecio, filtros: 'q=..&categoriaId=..' | null }
export async function descargarListaPrecios(opciones, onProgreso) {
    onProgreso?.({ fase: 'datos' });
    const qs = new URLSearchParams({ precio: String(opciones.precio) });
    if (opciones.soloConStock) qs.set('conStock', '1');
    if (opciones.incluirSinPrecio) qs.set('sinPrecio', '1');
    if (opciones.filtros) { qs.set('filtros', '1'); new URLSearchParams(opciones.filtros).forEach((v, k) => qs.set(k, v)); }

    const res = await fetch(`/api/inventario/lista-precios?${qs}`);
    const datos = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(datos.error || 'No se pudo preparar la lista');
    if (!datos.filas.length) throw new Error('No hay productos con precio para esta lista');

    const rutas = [...new Set(datos.filas.map((f) => f.imagen).filter(Boolean))];
    const [imagenes, logo] = await Promise.all([prepararImagenes(rutas, onProgreso), logoPng()]);

    onProgreso?.({ fase: 'pdf' });
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
    const doc = construirPdf({ jsPDF, autoTable, datos, imagenes, logo, incluirPrecioCaja: opciones.incluirPrecioCaja });

    const nombre = `lista-de-precios-precio${opciones.precio}-${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(nombre);

    const porOrigen = { producto: 0, grupo: 0, marca: 0, sin: 0 };
    datos.filas.forEach((f) => { porOrigen[f.origen || 'sin'] += 1; });
    return { nombre, total: datos.total, omitidosSinPrecio: datos.omitidosSinPrecio, omitidosSinStock: datos.omitidosSinStock, imagenes: porOrigen, paginas: doc.getNumberOfPages(), fallidas: rutas.filter((r) => !imagenes.get(r)).length };
}
