// HORA DE VENEZUELA (America/Caracas, UTC-4 fijo: el país no usa horario de verano).
// Todo el sistema debe usar estas funciones para "hoy", "ayer", el inicio de un día, las fechas de los movimientos y lo que se lee de un SMS.
// El servidor (Vercel) corre en UTC: usar `new Date().toISOString().slice(0, 10)`, `setHours(0, 0, 0, 0)` o `new Date(año, mes, día, hora)`
// da el día equivocado a partir de las 8:00 p. m. de Caracas y corre 4 horas cualquier hora escrita "en local".
// Módulo puro (sin imports) para poder usarlo en el servidor, en el navegador y en scripts de Node.
export const ZONA_CARACAS = 'America/Caracas';
const OFFSET = '-04:00';

const dos = (n) => String(n).padStart(2, '0');

const FORMATO_PARTES = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_CARACAS, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

// { ano, mes, dia, hora, min } de un instante, vistos en Caracas
export function partesCaracas(fecha = new Date()) {
    const p = Object.fromEntries(FORMATO_PARTES.formatToParts(new Date(fecha)).map((x) => [x.type, x.value]));
    return { ano: Number(p.year), mes: Number(p.month), dia: Number(p.day), hora: Number(p.hour), min: Number(p.minute) };
}

// 'AAAA-MM-DD' de hoy (o de la fecha dada) en Caracas: sirve para columnas DATEONLY y para comparar días
export function fechaCaracas(fecha = new Date()) {
    const { ano, mes, dia } = partesCaracas(fecha);
    return `${ano}-${dos(mes)}-${dos(dia)}`;
}

// 'HH:mm' en Caracas
export function horaCaracas(fecha = new Date()) {
    const { hora, min } = partesCaracas(fecha);
    return `${dos(hora)}:${dos(min)}`;
}

// Instante exacto en que empieza un día de Caracas (00:00 -04:00). desplazamientoDias: 0 = hoy, -1 = ayer, 1 = mañana
export function inicioDiaCaracas(desplazamientoDias = 0, fecha = new Date()) {
    const { ano, mes, dia } = partesCaracas(fecha);
    const dia0 = new Date(Date.UTC(ano, mes - 1, dia + desplazamientoDias)).toISOString().slice(0, 10);
    return new Date(`${dia0}T00:00:00${OFFSET}`);
}

// Fecha y hora escritas en hora de Caracas (como las trae un SMS del banco) -> instante correcto, sin importar la zona del servidor
export function fechaHoraCaracas({ ano, mes, dia, hora = 0, min = 0 }) {
    return new Date(`${ano}-${dos(mes)}-${dos(dia)}T${dos(hora)}:${dos(min)}:00${OFFSET}`);
}

// Para <input type="datetime-local">: valor inicial en hora de Caracas ('AAAA-MM-DDTHH:mm') y lectura de lo que el usuario escribió
export const aInputFechaHora = (fecha = new Date()) => `${fechaCaracas(fecha)}T${horaCaracas(fecha)}`;
export function desdeInputFechaHora(texto) {
    if (!texto) return null;
    const limpio = String(texto).trim();
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(limpio)) return new Date(limpio); // ya trae zona (ISO completo)
    return new Date(`${limpio}:00${OFFSET}`);
}

// Texto para mostrar, siempre en hora de Caracas (el navegador de quien mira puede estar en otra zona)
export function formatearFechaHora(fecha, opciones = {}) {
    if (!fecha) return '';
    return new Date(fecha).toLocaleString('es-VE', { timeZone: ZONA_CARACAS, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, ...opciones });
}
export function formatearFecha(fecha, opciones = {}) {
    if (!fecha) return '';
    // Las columnas de solo fecha ('2026-09-20') no llevan hora: convertirlas como instante las corre un día hacia atrás en Caracas
    const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fecha));
    if (soloFecha) return `${soloFecha[3]}/${soloFecha[2]}/${soloFecha[1]}`;
    return new Date(fecha).toLocaleDateString('es-VE', { timeZone: ZONA_CARACAS, day: '2-digit', month: '2-digit', year: 'numeric', ...opciones });
}
