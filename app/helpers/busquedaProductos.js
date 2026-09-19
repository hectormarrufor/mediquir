// Buscador de productos tolerante, compartido por la landing y los buscadores del sistema.
//
// En vez de exigir que la frase completa aparezca tal cual en el nombre, separa lo que escribe la persona en palabras
// y busca cada una por separado en el nombre, las etiquetas, la marca, el código, el grupo de equivalencia, la categoría
// y la presentación. Ignora tildes, mayúsculas, comillas (1/2" = 1/2), plurales y errores leves de tipeo.
//
// Resultado, del más al menos relevante:
//   1. Productos que coinciden con TODAS las palabras.
//   2. Productos que coinciden solo con algunas (se ofrecen para no dejar al cliente con las manos vacías).

const PESOS = { nombre: 10, codigo: 8, tags: 6, marca: 5, grupo: 4, categoria: 3, presentacion: 3 };
const PALABRAS_VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'para', 'con', 'y', 'en', 'por', 'un', 'una', 'al', 'a']);
const MAX_PARCIALES = 40; // los que solo coinciden en parte se limitan para no inundar la lista

export const normalizar = (s) => String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9/.]+/g, ' ')               // comillas de pulgadas, guiones, símbolos...
    .replace(/(^|\s)\.+|\.+(?=\s|$)/g, ' ')      // puntos sueltos al borde de una palabra
    .replace(/\s+/g, ' ')
    .trim();

// Palabras de la búsqueda: sin palabras vacías, y con el plural recortado ("guantes" -> "guante")
function palabrasDeBusqueda(texto) {
    const todas = normalizar(texto).split(' ').filter(Boolean);
    const utiles = todas.filter((p) => !PALABRAS_VACIAS.has(p));
    return (utiles.length ? utiles : todas).map((p) => ({ p, singular: p.length > 4 && p.endsWith('s') ? p.slice(0, -1) : p }));
}

// Distancia de edición con corte anticipado: solo interesa saber si es <= max
function cercana(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return false;
    let previa = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const actual = [i];
        let minimo = i;
        for (let j = 1; j <= b.length; j++) {
            actual[j] = Math.min(previa[j] + 1, actual[j - 1] + 1, previa[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            minimo = Math.min(minimo, actual[j]);
        }
        if (minimo > max) return false;
        previa = actual;
    }
    return previa[b.length] <= max;
}

// Texto normalizado de cada campo del producto (se calcula una vez por producto, no en cada tecla)
const cache = new WeakMap();
function camposDe(producto) {
    let c = cache.get(producto);
    if (c) return c;
    const campo = (peso, texto) => {
        const t = normalizar(texto);
        return t ? { peso, texto: t, palabras: t.split(' ') } : null;
    };
    c = [
        campo(PESOS.nombre, producto.nombre),
        campo(PESOS.codigo, producto.codigo),
        campo(PESOS.tags, (producto.tags || []).map((t) => t?.nombre).filter(Boolean).join(' ')),
        campo(PESOS.marca, producto.marca?.nombre),
        campo(PESOS.grupo, producto.grupoEquivalencia?.nombre),
        campo(PESOS.categoria, producto.categoria?.nombre),
        campo(PESOS.presentacion, producto.presentacion),
    ].filter(Boolean);
    cache.set(producto, c);
    return c;
}

// Cuánto vale la palabra dentro de este producto (0 = no aparece)
function valorDePalabra({ p, singular }, campos) {
    let mejor = 0;
    for (const { peso, texto, palabras } of campos) {
        let v = 0;
        if (palabras.includes(p) || palabras.includes(singular)) v = peso * 1.5;                       // palabra exacta
        else if (palabras.some((w) => w.startsWith(p) || w.startsWith(singular))) v = peso * 1.2;     // empieza igual (dura -> durapore)
        else if (texto.includes(p) || texto.includes(singular)) v = peso;                             // está dentro (1/2 dentro de 1/2x)
        else if (p.length >= 5) {
            const tolerancia = p.length >= 8 ? 2 : 1;                                                 // error de tipeo (duraphore)
            if (palabras.some((w) => w.length >= 4 && (cercana(p, w, tolerancia) || cercana(singular, w, tolerancia)))) v = peso * 0.6;
        }
        if (v > mejor) mejor = v;
    }
    return mejor;
}

/**
 * @param {Array} productos lista del API (con marca, tags, categoria y grupoEquivalencia)
 * @param {string} texto lo que escribió la persona
 * @param {{ desempate?: (p) => number }} opciones desempate: dentro del mismo nivel de coincidencia va primero el que devuelva más
 *        (p. ej. los disponibles en stock)
 */
export function buscarProductos(productos, texto, { desempate } = {}) {
    const lista = productos || [];
    const palabras = palabrasDeBusqueda(texto);
    if (!palabras.length) return lista;

    const completos = [];
    const parciales = [];
    for (const producto of lista) {
        const campos = camposDe(producto);
        let encontradas = 0;
        let significativas = 0; // palabras de 3+ letras (un "x" o un "1" solos no bastan para ofrecer un producto)
        let puntos = 0;
        for (const palabra of palabras) {
            const v = valorDePalabra(palabra, campos);
            if (v > 0) { encontradas++; puntos += v; if (palabra.p.length >= 3) significativas++; }
        }
        if (encontradas === palabras.length) completos.push({ producto, encontradas, puntos });
        else if (significativas > 0) parciales.push({ producto, encontradas, puntos });
    }

    const orden = (a, b) =>
        (b.encontradas - a.encontradas)
        || (desempate ? (Number(desempate(b.producto)) || 0) - (Number(desempate(a.producto)) || 0) : 0)
        || (b.puntos - a.puntos);

    return [
        ...completos.sort(orden),
        ...parciales.sort(orden).slice(0, MAX_PARCIALES),
    ].map((r) => r.producto);
}
