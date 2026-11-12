// Recibos de pago a empleados: beneficio de alimentación, beneficio de transporte y quincena.
// Los usan el formulario, el PDF y el servidor, para que todos hablen de lo mismo.
export const TIPOS_PAGO = {
    ALIMENTACION: {
        etiqueta: 'Beneficio de alimentación', titulo: 'BENEFICIO DE ALIMENTACION', color: 'orange', porDias: true,
        conceptos: ['BENEFICIO DE ALIMENTACION CESTA TICKET SOCIALISTA', 'COMPLEMENTO DEL BENEFICIO DE ALIMENTACION'],
        nota: 'NOTA: DANDO ESTRICTO CUMPLIMIENTO A LO ESTABLECIDO EN LA LEY ORGANICA DE ALIMENTACION EN CONCORDANCIA CON LOS DECRETOS DICTADOS POR EL EJECUTIVO NACIONAL, SE HACE DE CONOCIMIENTO QUE DICHAS CANTIDADES DE DINERO CORRESPONDEN AL BENEFICIO DE ALIMENTACION (CESTA TICKET) MAS UN COMPLEMENTO A DICHO BENEFICIO EN VIRTUD DE LA SITUACION ECONOMICA DEL PAIS. QUEDANDO AQUI ESTABLECIDO QUE DICHO COMPLEMENTO SERA PAGADO UNICA Y EXCLUSIVAMENTE POR DIAS TRABAJADOS.',
    },
    TRANSPORTE: {
        etiqueta: 'Beneficio de transporte', titulo: 'BENEFICIO DE TRANSPORTE', color: 'blue', porDias: true,
        conceptos: ['BENEFICIO DE TRANSPORTE'],
        // Texto propuesto por analogía con el de alimentación: confirmar la redacción con el contador o el abogado laboral
        nota: 'NOTA: SE HACE DE CONOCIMIENTO QUE DICHA CANTIDAD DE DINERO CORRESPONDE AL BENEFICIO DE TRANSPORTE, QUEDANDO AQUI ESTABLECIDO QUE DICHO BENEFICIO SERA PAGADO UNICA Y EXCLUSIVAMENTE POR DIAS TRABAJADOS.',
    },
    QUINCENA: { etiqueta: 'Quincena', titulo: 'QUINCENA', color: 'teal', porDias: false, conceptos: [], nota: '' },
};

export const FORMAS_PAGO = { EFECTIVO: 'Efectivo', CHEQUE: 'Cheque', TRANSFERENCIA: 'Transferencia' };
export const ESTADOS_PAGO = {
    PENDIENTE: { etiqueta: 'Por firmar', color: 'yellow' },
    CONFIRMADO: { etiqueta: 'Firmado', color: 'teal' },
    ANULADO: { etiqueta: 'Anulado', color: 'gray' },
};

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Totales de un recibo a partir de sus renglones [{ concepto, asignacion, deduccion }]
export function totalesPago(conceptos) {
    const filas = Array.isArray(conceptos) ? conceptos : [];
    const totalAsignaciones = r2(filas.reduce((a, c) => a + (Number(c.asignacion) || 0), 0));
    const totalDeducciones = r2(filas.reduce((a, c) => a + (Number(c.deduccion) || 0), 0));
    return { totalAsignaciones, totalDeducciones, totalCobrar: r2(totalAsignaciones - totalDeducciones) };
}

export const fechaCorta = (f) => (f ? `${String(f).slice(8, 10)}/${String(f).slice(5, 7)}/${String(f).slice(0, 4)}` : '');
const fechaDiaMes = (f) => (f ? `${String(f).slice(8, 10)}/${String(f).slice(5, 7)}` : '');
// «DESDE EL 26/10 AL 01/11/2026»
export const textoPeriodo = (desde, hasta) => (desde && hasta
    ? `DESDE EL ${fechaDiaMes(desde)}${String(desde).slice(0, 4) !== String(hasta).slice(0, 4) ? `/${String(desde).slice(0, 4)}` : ''} AL ${fechaCorta(hasta)}`
    : '');
