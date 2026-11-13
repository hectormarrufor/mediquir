// Cuántas líneas ocupa cada renglón en la forma libre (factura y notas): entre la cabecera y los totales caben CONFIG_FISCAL.maxRenglonesFactura líneas.
// Una descripción que no cabe en el ancho de su columna se parte en 2 líneas (máximo; lo que pase se corta). Se mide con el tipo de letra real
// (Arial 7,6 px) en un lienzo del navegador; en el servidor no hay lienzo y se estima por caracteres.
import { CONFIG_FISCAL } from './empresa';

// Ancho útil de la columna de descripción en px: hoja 7,34 in menos las columnas fijas (código, precio, cantidad y total) menos el relleno
export const ANCHO_DESC_PX = (7.34 - (0.62 + 1.05 + 0.9 + 1.3)) * 96 - 6;
let lienzo = null;
const medir = (t) => {
    if (typeof document === 'undefined') return t.length * 7.6 * 0.6;
    lienzo = lienzo || document.createElement('canvas').getContext('2d');
    lienzo.font = 'normal 7.6px Arial, Helvetica, sans-serif';
    return lienzo.measureText(t).width;
};

/** Líneas que necesita una descripción en su columna (sin tope). */
export function lineasDeDescripcion(texto) {
    let lineas = 1, actual = '';
    for (const palabra of String(texto || '').split(/\s+/).filter(Boolean)) {
        const prueba = actual ? `${actual} ${palabra}` : palabra;
        if (!actual || medir(prueba) <= ANCHO_DESC_PX) actual = prueba;
        else { lineas++; actual = palabra; }
    }
    return lineas;
}

/** Líneas que ocupa un renglón en la hoja: 1 o 2 (una descripción más larga se corta en la segunda). */
export const lineasDeRenglon = (texto) => Math.min(2, lineasDeDescripcion(texto));

/**
 * Reparte renglones (en orden) en facturas de a lo sumo `maximo` líneas cada una.
 * `textos`: la descripción de cada renglón tal como sale impresa. Devuelve listas de índices: [[0,1,2],[3,4]...].
 */
export function repartirEnFacturas(textos, maximo = CONFIG_FISCAL.maxRenglonesFactura) {
    const grupos = [[]];
    let usadas = 0;
    textos.forEach((t, i) => {
        const l = lineasDeRenglon(t);
        if (usadas + l > maximo && grupos[grupos.length - 1].length) { grupos.push([]); usadas = 0; }
        grupos[grupos.length - 1].push(i);
        usadas += l;
    });
    return grupos;
}
