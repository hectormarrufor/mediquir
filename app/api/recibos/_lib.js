// Recibos: correlativo propio y validación de lo que se escribe en el formulario.
import db from '@/models';

export const RECIBO_INICIO = 12501; // el primer número del talonario actual (el 12501 de la foto); si cambia, se escribe a mano en el primer recibo
export const FORMAS = ['EFECTIVO', 'CHEQUE', 'TRANSFERENCIA', 'OTRO'];
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// El siguiente número libre: el mayor que existe + 1 (o el inicio del talonario si no hay ninguno)
export async function siguienteNumero() {
    const max = await db.Recibo.max('numero');
    return max ? Number(max) + 1 : RECIBO_INICIO;
}

// Del cuerpo de la petición, solo lo permitido y validado. Devuelve { datos } o { error }.
export function armarRecibo(b) {
    const personaNombre = String(b?.personaNombre || '').trim().slice(0, 200);
    if (personaNombre.length < 2) return { error: 'Escribe el nombre de la persona' };
    const monto = r2(b?.monto);
    if (!(monto > 0)) return { error: 'Escribe el monto del recibo' };
    if (!FECHA.test(String(b?.fecha || ''))) return { error: 'La fecha no es válida' };
    const formaPago = FORMAS.includes(b?.formaPago) ? b.formaPago : 'EFECTIVO';
    const texto = (v, max) => String(v ?? '').trim().slice(0, max) || null;
    const datos = {
        tipo: b?.tipo === 'RECIBIDO_DE' ? 'RECIBIDO_DE' : 'PAGADO_A',
        fecha: b.fecha, lugar: texto(b?.lugar, 80), personaNombre, personaIdentificacion: texto(b?.personaIdentificacion, 40),
        moneda: b?.moneda === 'USD' ? 'USD' : 'BS', monto, montoLetras: texto(b?.montoLetras, 600), concepto: texto(b?.concepto, 1500),
        formaPago, referencia: texto(b?.referencia, 100), banco: texto(b?.banco, 120),
    };
    const numero = b?.numero === '' || b?.numero === null || b?.numero === undefined ? null : Number(b.numero);
    if (numero !== null && (!Number.isInteger(numero) || numero < 1)) return { error: 'El número del recibo no es válido' };
    return { datos, numero };
}
