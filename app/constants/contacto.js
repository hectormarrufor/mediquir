// Número de WhatsApp en formato internacional sin "+" (Venezuela = 58): 0414-1234567 -> 584141234567. Null si no parece un número válido.
export function normalizarWhatsApp(telefono) {
    const digitos = String(telefono || '').replace(/\D/g, '');
    let n = digitos;
    if (n.startsWith('58') && n.length >= 12) n = digitos;
    else if (n.startsWith('0')) n = `58${n.slice(1)}`;
    else if (n.length === 10) n = `58${n}`;
    return n.length >= 11 && n.length <= 15 ? n : null;
}
