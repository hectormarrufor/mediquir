'use client';

// Utilidades compartidas por todo el apartado de cuentas por cobrar (libro, vendedores y resumen):
// formato de montos y fechas, llamadas a la API, almacenamiento local seguro y cómo saber si se ve en tarjetas (teléfono).
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMediaQuery } from '@mantine/hooks';
import { fechaCaracas } from '@/app/constants/hora';

const nf = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// 1,234.56 (vacío si no hay valor): así lo lleva la administradora en el Excel
export const usd = (v) => (v === null || v === undefined || v === '' ? '' : nf.format(Number(v) || 0));
export const dolares = (v) => `$${usd(v ?? 0)}`;
export const bolivares = (v) => `Bs ${usd(v ?? 0)}`;
export const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const fmtFecha = (v) => (v ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(2, 4)}` : '');
export const fmtFechaLarga = (v) => (v ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : '');
export const hoy = () => fechaCaracas();
export const diasEntre = (desde, hasta) => Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86400000);
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// El vencimiento de un documento dicho en palabras (con el día de hoy de Caracas, no el del servidor)
export function vencimientoEnPalabras(vence, saldo, dias = vence ? diasEntre(hoy(), vence) : null) {
    if (!(Number(saldo) > 0.005)) return { texto: 'Cobrada', corto: 'Cobrada', tono: 'pagada' };
    if (dias === null) return { texto: 'Sin fecha de vencimiento', corto: 'Sin fecha', tono: 'neutro' };
    if (dias < 0) return { texto: `Vencida hace ${plural(-dias, 'día', 'días')}`, corto: `+${-dias} d`, tono: 'vencida' };
    if (dias === 0) return { texto: 'Vence hoy', corto: 'hoy', tono: 'pronto' };
    if (dias <= 7) return { texto: `Vence en ${plural(dias, 'día', 'días')}`, corto: `${dias} d`, tono: 'pronto' };
    return { texto: `Vence en ${dias} días`, corto: `${dias} d`, tono: 'aldia' };
}

// Para buscar sin importar mayúsculas ni acentos
export const sinAcentos = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export async function pedir(url, opciones) {
    const res = await fetch(url, opciones);
    const cuerpo = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(cuerpo.error || 'No se pudo completar');
    return cuerpo;
}
export const enviar = (url, metodo, body) => pedir(url, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });

// Corre `fn` sobre muchos elementos sin mandar todas las peticiones de golpe (marcar 80 comisiones no debe saturar el servidor)
export async function enLotes(elementos, fn, simultaneos = 4) {
    const resultados = new Array(elementos.length);
    let i = 0;
    const trabajador = async () => {
        while (i < elementos.length) {
            const k = i++;
            try { resultados[k] = { ok: true, valor: await fn(elementos[k]) }; } catch (error) { resultados[k] = { ok: false, error }; }
        }
    };
    await Promise.all(Array.from({ length: Math.min(simultaneos, elementos.length) }, trabajador));
    return resultados;
}

// localStorage puede fallar (navegación privada, sitio bloqueado): la página debe funcionar igual, solo sin recordar
export function leerLocal(clave) {
    try { return window.localStorage.getItem(clave); } catch { return null; }
}
export function guardarLocal(clave, valor) {
    try {
        if (valor === null || valor === undefined) window.localStorage.removeItem(clave);
        else window.localStorage.setItem(clave, String(valor));
    } catch { /* sin almacenamiento: no se recuerda, nada más */ }
}

// Tarjetas en vez de tabla: teléfonos y tabletas en vertical (una tabla ancha con desplazamiento lateral no se lee ahí).
// Devuelve undefined hasta montar (así no se pinta la tabla en el teléfono para luego cambiarla).
export const useVistaTarjetas = () => useMediaQuery('(max-width: 61.99em)');
export const useEsTelefono = () => useMediaQuery('(max-width: 48em)');
export const useAnchoGrande = () => useMediaQuery('(min-width: 75em)'); // cabe la hoja completa sin desplazarse de lado
export const useAnchoMuyGrande = () => useMediaQuery('(min-width: 88em)');

// Alto real (con borde) de un elemento: la barra pegajosa lo usa para que el encabezado de la tabla se pegue justo debajo
export function useAltoElemento() {
    const [alto, setAlto] = useState(0);
    const observador = useRef(null);
    const ref = useCallback((nodo) => {
        observador.current?.disconnect();
        observador.current = null;
        if (!nodo) return;
        const medir = () => setAlto(Math.round(nodo.getBoundingClientRect().height));
        medir();
        if (typeof ResizeObserver === 'undefined') return;
        observador.current = new ResizeObserver(medir);
        observador.current.observe(nodo);
    }, []);
    useEffect(() => () => observador.current?.disconnect(), []);
    return [ref, alto];
}

// El encabezado de las tablas se pega debajo del encabezado de la app y de la barra de filtros
export const DESPLAZAMIENTO_CABECERA = 'calc(var(--app-shell-header-offset, 0px) + var(--cxc-barra, 0px))';
