// Formato de montos y fechas del portal B2B. Los precios unitarios se muestran exactos (hasta 3 decimales);
// los montos de renglón, subtotales y totales, con 2.

const usd = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const precio = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const bs = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtUsd = (v) => `$${usd.format(Number(v) || 0)}`;
export const fmtPrecio = (v) => `$${precio.format(Number(v) || 0)}`;
export const fmtBs = (v) => `Bs ${bs.format(Number(v) || 0)}`;

// "2026-09-19" o ISO -> "19/09/2026" (sin desfase por zona horaria para fechas sin hora)
export function fmtFecha(valor) {
    if (!valor) return '—';
    const s = String(valor);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const [a, m, d] = s.split('-'); return `${d}/${m}/${a}`; }
    return new Date(valor).toLocaleDateString('es-VE', { timeZone: 'America/Caracas' });
}

export const fmtFechaHora = (valor) => (valor
    ? new Date(valor).toLocaleString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'short', timeStyle: 'short' })
    : '—');

// Lectura de la API con manejo uniforme de errores
export async function pedirJson(url, opciones) {
    const res = await fetch(url, opciones);
    let cuerpo = null;
    try { cuerpo = await res.json(); } catch { /* sin cuerpo */ }
    if (!res.ok) throw new Error(cuerpo?.error || cuerpo?.message || 'No se pudo completar la solicitud');
    return cuerpo;
}

export const COLOR_DESPACHO = { Pendiente: 'blue', Empacado: 'violet', Parcial: 'orange', Completado: 'teal', Cancelado: 'gray' };
export const COLOR_COBRO = { pagado: 'teal', pendiente: 'orange', vencido: 'red', anulado: 'gray' };
