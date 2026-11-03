// Números de las compras TAL CUAL se escriben: no se redondean a céntimos ni se recortan a N decimales.
// Lo único que se quita es el ruido de la coma flotante (2,555 × 3 da 7,665000000000001 en JavaScript y debe ser 7,665),
// que aparece a partir de la cifra 16; con 15 cifras significativas cabe cualquier precio o total real.
export const exacto = (n) => {
    const v = Number(n);
    return Number.isFinite(v) ? Number(v.toPrecision(15)) : 0;
};

// Para mostrar: todos los decimales que tenga el número (al menos 2), con separador de miles
export const formatoExacto = (n, locale = 'en-US') => exacto(n).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 10 });
