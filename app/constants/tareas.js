// Módulo de tareas: constantes, fechas y el "añadir rápido" (escribes una frase y el sistema detecta prioridad, fecha y responsable).
// Módulo puro (solo importa hora.js) para usarlo en pantalla, en el servidor y en pruebas de Node.
import { fechaCaracas } from './hora.js';

export const ESTADOS = ['Pendiente', 'En Progreso', 'Completada', 'Cancelada'];
export const PRIORIDADES = ['Baja', 'Media', 'Alta', 'Urgente'];
export const COLOR_PRIORIDAD = { Urgente: 'red', Alta: 'orange', Media: 'blue', Baja: 'gray' };
export const COLOR_ESTADO = { Pendiente: 'gray', 'En Progreso': 'blue', Completada: 'teal', Cancelada: 'red' };
export const ABIERTA = (estado) => estado !== 'Completada' && estado !== 'Cancelada';

const sinAcentos = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const NOMBRE_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// ---- Fechas ('AAAA-MM-DD', siempre en calendario de Caracas) ----
const aUtc = (iso) => new Date(`${iso}T00:00:00Z`);
export const sumarDias = (iso, n) => new Date(aUtc(iso).getTime() + n * 86400000).toISOString().slice(0, 10);
export const diaSemana = (iso) => aUtc(iso).getUTCDay(); // 0 = domingo
export const diasHasta = (iso, hoy = fechaCaracas()) => Math.round((aUtc(iso) - aUtc(hoy)) / 86400000);
export const corto = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

// Cómo se muestra el vencimiento: texto, color y si hay que resaltarlo
export function etiquetaVencimiento(iso, estado, hoy = fechaCaracas()) {
    if (!iso) return { texto: 'Sin fecha', color: 'gray', alerta: false };
    const fecha = String(iso).slice(0, 10);
    if (!ABIERTA(estado)) return { texto: corto(fecha), color: 'gray', alerta: false };
    const d = diasHasta(fecha, hoy);
    if (d < 0) return { texto: `Venció hace ${-d} día${d === -1 ? '' : 's'}`, color: 'red', alerta: true };
    if (d === 0) return { texto: 'Vence hoy', color: 'orange', alerta: true };
    if (d === 1) return { texto: 'Mañana', color: 'yellow', alerta: false };
    if (d <= 6) return { texto: NOMBRE_DIA[diaSemana(fecha)], color: 'blue', alerta: false };
    return { texto: corto(fecha), color: 'gray', alerta: false };
}

// Próxima vez que cae un día de la semana (0 = domingo): siempre en el futuro, nunca hoy
const proximoDia = (dow, hoy) => { for (let i = 1; i <= 7; i++) { const f = sumarDias(hoy, i); if (diaSemana(f) === dow) return f; } return hoy; };

// ---- Añadir rápido ----
// "Llamar al proveedor mañana !alta @luis"  ->  { titulo: 'Llamar al proveedor', fecha: <mañana>, prioridad: 'Alta', asignadoAId: <luis> }
// personas: [{ id, nombre }] a quienes se puede asignar (vacío si no puede asignar: entonces la tarea es para quien la escribe)
export function interpretarRapida(texto, { hoy = fechaCaracas(), personas = [] } = {}) {
    let resto = ` ${String(texto || '').trim()} `;
    const detectado = { prioridad: null, fecha: null, asignado: null };

    // !urgente !alta !media !baja (y "!!" = urgente)
    resto = resto.replace(/\s!(urgente|alta|media|baja|!)(?=\s)/gi, (_, p) => {
        const k = sinAcentos(p);
        detectado.prioridad = k === '!' || k === 'urgente' ? 'Urgente' : k === 'alta' ? 'Alta' : k === 'media' ? 'Media' : 'Baja';
        return ' ';
    });

    // @nombre: el primer nombre de la persona (sin acentos) empieza con lo escrito
    resto = resto.replace(/\s@([^\s]+)(?=\s)/g, (todo, nombre) => {
        const buscado = sinAcentos(nombre);
        const coincide = personas.filter((p) => sinAcentos(p.nombre).split(/\s+/).some((parte) => parte.startsWith(buscado)));
        if (coincide.length >= 1 && buscado.length >= 2) { detectado.asignado = coincide[0]; return ' '; }
        return todo;
    });

    // Fecha: hoy, mañana, pasado mañana, en N días, día de la semana, dd/mm[/aaaa]
    const usarFecha = (f) => { if (!detectado.fecha) detectado.fecha = f; return ' '; };
    resto = resto.replace(/\s(pasado\s+ma[nñ]ana)(?=\s)/gi, () => usarFecha(sumarDias(hoy, 2)));
    resto = resto.replace(/\s(ma[nñ]ana)(?=\s)/gi, () => usarFecha(sumarDias(hoy, 1)));
    resto = resto.replace(/\s(hoy)(?=\s)/gi, () => usarFecha(hoy));
    resto = resto.replace(/\sen\s+(\d{1,3})\s+d[ií]as?(?=\s)/gi, (_, n) => usarFecha(sumarDias(hoy, Number(n))));
    resto = resto.replace(/\s(?:el\s+)?(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)(?=\s)/gi, (_, dia) => usarFecha(proximoDia(DIAS_SEMANA.indexOf(sinAcentos(dia)), hoy)));
    resto = resto.replace(/\s(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?=\s)/g, (todo, d, m, a) => {
        const dia = Number(d), mes = Number(m);
        if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return todo;
        let ano = a ? Number(a) : Number(hoy.slice(0, 4));
        if (ano < 100) ano += 2000;
        let f = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
        if (!a && f < hoy) f = `${ano + 1}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`; // "15/03" ya pasó este año: el próximo
        return usarFecha(f);
    });

    const titulo = resto.replace(/\s+/g, ' ').trim();
    return {
        titulo,
        prioridad: detectado.prioridad,
        fecha: detectado.fecha,
        asignadoAId: detectado.asignado ? detectado.asignado.id : null,
        asignadoNombre: detectado.asignado ? detectado.asignado.nombre : null,
    };
}

// Progreso de la lista de pasos: { hechas, total, pct }
export function progresoSubtareas(subtareas) {
    const lista = Array.isArray(subtareas) ? subtareas : [];
    const hechas = lista.filter((s) => s.hecha).length;
    return { hechas, total: lista.length, pct: lista.length ? Math.round((hechas / lista.length) * 100) : 0 };
}

// Orden de "lo que hay que hacer primero": vencidas, hoy, urgentes, luego por fecha; sin fecha al final
const PESO_PRIORIDAD = { Urgente: 0, Alta: 1, Media: 2, Baja: 3 };
export function compararUrgencia(a, b, hoy = fechaCaracas()) {
    const da = a.fechaVencimiento ? diasHasta(String(a.fechaVencimiento).slice(0, 10), hoy) : 9999;
    const db = b.fechaVencimiento ? diasHasta(String(b.fechaVencimiento).slice(0, 10), hoy) : 9999;
    if (da !== db) return da - db;
    return (PESO_PRIORIDAD[a.prioridad] ?? 2) - (PESO_PRIORIDAD[b.prioridad] ?? 2);
}
