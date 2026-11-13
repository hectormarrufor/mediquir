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

const FORMAS_NUMERO = (n) => String(n || '').replace(/^F-/i, '');
const diaLargo = (f) => {
    if (!f) return '';
    const t = new Date(`${String(f).slice(0, 10)}T12:00:00-04:00`).toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Caracas' });
    return t.replace(',', '').charAt(0).toUpperCase() + t.replace(',', '').slice(1);
};
const horaCorta = (iso) => (iso ? new Date(iso).toLocaleTimeString('es-VE', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Caracas' }).replace(/\s*([ap])\.?\s*m\.?/i, ' $1m') : '');

/**
 * Texto que va ARRIBA de la tabla de renglones en la nota impresa (como en la forma del sistema anterior). Devuelve párrafos; la hoja los parte en líneas.
 * `facturas`: [{ numeroDocumento, fecha }] · `creadaEn`: ISO opcional (para la hora) · `estacion`: opcional
 */
export function textoSuperiorNota({ tipo, cliente, fecha, creadaEn, facturas, motivo, estacion }) {
    const nombre = String(cliente || '').trim().toUpperCase() || '________________';
    const lista = (facturas || []).filter((f) => f?.numeroDocumento);
    const una = lista.length === 1;
    if (tipo === 'CREDITO') {
        const num = lista.length ? lista.map((f) => `00-${FORMAS_NUMERO(f.numeroDocumento)}`).join(', ') : '________';
        const hora = horaCorta(creadaEn);
        return [
            `Hemos emitido el presente documento a nombre de ${nombre} bajo el concepto de:`,
            `NOTA DE CRÉDITO generada por devolución el día ${diaLargo(fecha)}${hora ? ` a las ${hora}` : ''}${estacion ? ` por la estación # ${estacion}` : ''} originada por ${una ? 'la Factura' : 'las Facturas'} # ${num}`,
        ];
    }
    const num = lista.length ? lista.map((f) => FORMAS_NUMERO(f.numeroDocumento)).join('-') : '________';
    const por = String(motivo || '').trim();
    return [
        `Hemos emitido la presente NOTA DE DÉBITO a nombre de ${nombre} por concepto de:`,
        `nota de débito${por ? ` por ${por.charAt(0).toLowerCase()}${por.slice(1)}` : ''} sobre ${una ? 'la factura' : 'facturas'} ${num}`,
    ];
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
