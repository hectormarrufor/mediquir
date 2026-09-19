// Horario de despacho (hora de Caracas). Módulo puro: lo usa la tienda para avisar cuándo saldrá la mercancía.
//   · Lunes a viernes se despacha hasta las 4:30 p. m.; sábado hasta las 12:30 p. m.; domingo no.
//   · Fuera de ese horario el despacho es al día siguiente hábil: después de las 4:30 p. m. entre semana, "mañana"
//     (el viernes, mañana sábado); el sábado después de las 12:30 p. m. y el domingo, "el lunes".
const CIERRE_SEMANA = 16 * 60 + 30; // 4:30 p. m.
const CIERRE_SABADO = 12 * 60 + 30; // 12:30 p. m.
const DIAS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// { dia: 0-6 (domingo = 0), minutos: minutos desde las 0:00 } en hora de Caracas
export function ahoraCaracas(fecha = new Date()) {
    const partes = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Caracas', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(fecha);
    const de = (tipo) => partes.find((p) => p.type === tipo)?.value;
    return { dia: DIAS[de('weekday')], minutos: Number(de('hour')) * 60 + Number(de('minute')) };
}

/**
 * Devuelve null si la mercancía se puede despachar hoy, o { cuando: 'mañana' | 'el lunes', texto } si ya pasó el horario.
 * `texto` es el aviso completo para el cliente.
 */
export function avisoDespacho(fecha = new Date()) {
    const { dia, minutos } = ahoraCaracas(fecha);
    let cuando = null;
    if (dia === 0) cuando = 'el lunes';
    else if (dia === 6) cuando = minutos >= CIERRE_SABADO ? 'el lunes' : null;
    else cuando = minutos >= CIERRE_SEMANA ? 'mañana' : null;
    if (!cuando) return null;
    return {
        cuando,
        texto: `Por motivo de horario laboral no podremos despachar tu mercancía hasta ${cuando}. Si no hay problema con eso, puedes continuar con el pago: tu pedido se entregará o despachará ${cuando}.`,
    };
}
