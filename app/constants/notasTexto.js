// Textos que van en las filas de descripción de la nota impresa en la forma libre (módulo puro: servidor y navegador).
const fmtFecha = (v) => (v ? `${String(v).slice(8, 10)}/${String(v).slice(5, 7)}/${String(v).slice(0, 4)}` : '');
const nf = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ANCHO_LINEA = 105; // caracteres que caben en una fila de la forma libre

// Parte un texto en líneas sin cortar palabras
export function partirTexto(texto, ancho = ANCHO_LINEA) {
    const lineas = [];
    let actual = '';
    for (const palabra of String(texto).split(/ +/).filter(Boolean)) {
        if (actual && `${actual} ${palabra}`.length > ancho) { lineas.push(actual); actual = palabra; } else actual = actual ? `${actual} ${palabra}` : palabra;
    }
    if (actual) lineas.push(actual);
    return lineas;
}

/** Facturas que afecta la nota → líneas de texto. `facturas`: [{ numeroDocumento, fecha }] */
export function lineasFacturasAfectadas(facturas) {
    const lista = (facturas || []).filter((f) => f?.numeroDocumento);
    if (!lista.length) return [];
    // Espacios duros dentro de cada factura para que "F-00013 del 04/09/2026" no se parta entre dos filas
    const items = lista.map((f) => `${f.numeroDocumento}${f.fecha ? ` del ${fmtFecha(f.fecha)}` : ''}`);
    const encabezado = lista.length === 1 ? 'AFECTA LA FACTURA' : 'AFECTA LAS FACTURAS';
    return partirTexto(`${encabezado} ${items.join(', ')}`);
}

/** Párrafo de la tasa cuando la nota está en dólares (referencia BCV): cuánto es en bolívares y a qué tasa */
export function lineasTasaBcv({ moneda, tasaCambio, totalFinal }) {
    const tasa = Number(tasaCambio) || 0;
    if (moneda !== 'USD' || !(tasa > 0)) return [];
    const total = Number(totalFinal) || 0;
    return partirTexto(`Montos expresados en dólares (USD) con referencia a la tasa de cambio BCV de Bs. ${nf.format(tasa)} por dólar; el total de USD ${nf.format(total)} equivale a Bs. ${nf.format(Math.round((total * tasa + Number.EPSILON) * 100) / 100)}.`);
}
