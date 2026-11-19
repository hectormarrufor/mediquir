// La ficha de la tienda se edita como texto sencillo (una cosa por línea) y se guarda como listas.
//   puntos:     una viñeta por línea                       <-> ["viñeta", …]
//   ficha:      «Etiqueta: valor» por línea                <-> [{ etiqueta, valor }, …]
//   adicional:  «Título: texto» por línea                  <-> [{ titulo, texto }, …]
const lineas = (t) => String(t || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const partir = (l) => { const i = l.indexOf(':'); return i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : null; };

export const puntosATexto = (v) => (Array.isArray(v) ? v.join('\n') : '');
export const textoAPuntos = (t) => { const r = lineas(t); return r.length ? r : null; };

export const fichaATexto = (v) => (Array.isArray(v) ? v.map((f) => `${f.etiqueta}: ${f.valor}`).join('\n') : '');
export const textoAFicha = (t) => { const r = lineas(t).map(partir).filter((p) => p && p[1]).map(([etiqueta, valor]) => ({ etiqueta, valor })); return r.length ? r : null; };

export const adicionalATexto = (v) => (Array.isArray(v) ? v.map((s) => `${s.titulo}: ${s.texto}`).join('\n') : '');
export const textoAAdicional = (t) => { const r = lineas(t).map(partir).filter((p) => p && p[1]).map(([titulo, texto]) => ({ titulo, texto })); return r.length ? r : null; };
