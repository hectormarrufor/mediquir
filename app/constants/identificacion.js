// Formato único de identificación (cédula / RIF) y de teléfono. Sirve igual en el navegador, en el servidor y en las migraciones.
//   Cédula:           V-12345678  /  E-12345678          (sin ceros a la izquierda, sin puntos)
//   RIF jurídico:     J-12345678-9 / G-20003652-4 / C-… / P-…   (cuerpo de 8 dígitos + dígito verificador)
//   RIF persona natural: V-12345678-9 (cédula + dígito verificador)
// Es el mismo formato que arma el checkout de la tienda.

const LETRAS = 'VEJGCP';
const PESOS = [4, 3, 2, 7, 6, 5, 4, 3, 2];
const VALOR_LETRA = { V: 1, E: 2, J: 3, P: 4, G: 5, C: 3 };

// Dígito verificador de un RIF (módulo 11 del SENIAT). Devuelve true si cuadra.
export function rifTieneDigitoValido(letra, cuerpo8, verificador) {
    const v = VALOR_LETRA[letra];
    if (!v || !/^\d{8}$/.test(cuerpo8)) return false;
    const suma = v * PESOS[0] + [...cuerpo8].reduce((a, d, i) => a + Number(d) * PESOS[i + 1], 0);
    const resto = suma % 11;
    const dv = 11 - resto >= 10 ? 0 : 11 - resto;
    return dv === Number(verificador);
}

/**
 * Lleva lo que escribió la persona al formato único.
 * @returns {{ valor: string|null, tipo: 'cedula'|'rif'|null, motivo?: string }}
 */
export function formatearIdentificacion(entrada) {
    const crudo = String(entrada ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!crudo || /^0+$/.test(crudo)) return { valor: null, tipo: null, motivo: 'vacía' };
    const m = crudo.match(/^([A-Z]?)(\d+)$/);
    if (!m || (m[1] && !LETRAS.includes(m[1]))) return { valor: null, tipo: null, motivo: 'caracteres no válidos' };
    let [, letra, digitos] = m;

    // Sin letra: una cédula venezolana
    if (!letra) {
        const ced = digitos.replace(/^0+/, '');
        if (ced.length < 5 || ced.length > 8) return { valor: null, tipo: null, motivo: 'sin letra y no parece una cédula' };
        return { valor: `V-${ced}`, tipo: 'cedula' };
    }

    if (letra === 'V' || letra === 'E') {
        const sinCeros = digitos.replace(/^0+/, '');
        if (digitos.length <= 8) { // cédula (a veces rellena con ceros: V05805488)
            if (sinCeros.length < 4) return { valor: null, tipo: null, motivo: 'cédula demasiado corta' };
            return { valor: `${letra}-${sinCeros}`, tipo: 'cedula' };
        }
        if (digitos.length === 9) return { valor: `${letra}-${digitos.slice(0, 8)}-${digitos.slice(8)}`, tipo: 'rif' }; // RIF de persona natural
        return { valor: null, tipo: null, motivo: 'demasiados dígitos' };
    }

    if (letra === 'P') return digitos.length >= 5 && digitos.length <= 12
        ? { valor: `P-${digitos}`, tipo: 'cedula' }
        : { valor: null, tipo: null, motivo: 'pasaporte con largo raro' };

    // J, G, C: RIF de 9 dígitos
    if (digitos.length === 8) digitos = '0' + digitos; // RIF antiguo al que le falta el cero inicial
    else if (digitos.length === 10 && digitos.startsWith('0')) digitos = digitos.slice(1);
    if (digitos.length === 9) return { valor: `${letra}-${digitos.slice(0, 8)}-${digitos.slice(8)}`, tipo: 'rif' };
    return { valor: null, tipo: null, motivo: `RIF con ${digitos.length} dígitos (deben ser 9)` };
}

/**
 * Teléfono normalizado: nacional con 0 adelante y solo dígitos (04141234567); internacional con "+" y código de país (+573001234567).
 * @returns {{ valor: string|null, motivo?: string }}
 */
export function formatearTelefono(entrada) {
    let t = String(entrada ?? '').trim();
    if (!t) return { valor: null, motivo: 'vacío' };
    if (/^\d+\.0$/.test(t)) t = t.slice(0, -2); // número que Excel guardó como decimal
    const internacional = /^\s*(\+|00)/.test(t);
    let d = t.replace(/\D/g, '');
    if (!d) return { valor: null, motivo: 'sin dígitos' };
    if (internacional) {
        d = d.replace(/^00/, '');
        if (d.startsWith('58')) d = '0' + d.slice(2); // +58 es Venezuela: se deja en formato nacional
        else return d.length >= 8 && d.length <= 15 ? { valor: `+${d}` } : { valor: null, motivo: 'internacional con largo raro' };
    }
    if (d.length === 10 && !d.startsWith('0')) d = '0' + d; // 4141234567 -> 04141234567
    if (d.length === 11 && d.startsWith('0')) return { valor: d };
    return { valor: null, motivo: `${d.length} dígitos` };
}

// Proveedor cargado desde el libro de compras sin RIF legible: se guarda con un RIF provisional y la pantalla de proveedores avisa que hay que conseguirlo
export const PREFIJO_SIN_RIF = 'SIN-RIF-';
export const esSinRif = (identificacion) => String(identificacion ?? '').toUpperCase().startsWith(PREFIJO_SIN_RIF);

// Para comparar: sin signos, mayúsculas
export const claveIdentificacion = (v) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// Dirección legible: espacios limpios, sin mayúsculas gritadas, abreviaturas comunes del sistema viejo con su forma normal
const SIGLAS = new Set(['CC', 'C.C', 'CA', 'C.A', 'C.A.', 'SA', 'S.A', 'S.A.', 'ZP', 'CP', 'PB', 'GPS', 'II', 'III', 'IV', 'VI', 'VII', 'VIII', 'IX']);
const ABREVIATURAS = { URB: 'Urb.', NRO: 'Nro.', EDO: 'Edo.', EDF: 'Edif.', AV: 'Av.' };
export function formatearDireccion(entrada) {
    const s = String(entrada ?? '').replace(/\s+/g, ' ').replace(/\s*([,;])\s*/g, '$1 ').replace(/[,;.\s]+$/, '').trim();
    if (!s) return null;
    return s.split(' ').map((p) => {
        const base = p.replace(/[.,;]+$/, '').toUpperCase();
        if (SIGLAS.has(base)) return p.toUpperCase();
        if (ABREVIATURAS[base]) return ABREVIATURAS[base] + (/[,;]$/.test(p) ? p.slice(-1) : '');
        return p.toLowerCase().replace(/(^|[(\-/])([a-záéíóúñ])/g, (_, a, b) => a + b.toUpperCase());
    }).join(' ').slice(0, 500);
}

// Razón social / nombre: espacios limpios (las razones sociales se dejan en mayúsculas, como en el RIF)
export const formatearNombre = (n) => String(n ?? '').replace(/\s+/g, ' ').replace(/"+/g, '').trim() || null;
