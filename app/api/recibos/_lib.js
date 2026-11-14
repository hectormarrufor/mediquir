// Recibos: correlativo propio y validación de lo que se escribe en el formulario.
import db from '@/models';

export const RECIBO_INICIO = 1; // el correlativo de recibos arranca en 1; se cambia desde la pantalla «Numeración» (fila REC de correlativos)
export const FORMAS = ['EFECTIVO', 'CHEQUE', 'TRANSFERENCIA', 'OTRO'];
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Primer número de recibo libre desde el que dice la pantalla «Numeración» (o desde 1): si ya existe, se salta al siguiente
export async function primerReciboLibre() {
    const c = await db.Correlativo.findOne({ where: { prefijo: 'REC' }, attributes: ['siguienteNumero'] });
    const desde = Number(c?.siguienteNumero) || RECIBO_INICIO;
    const filas = await db.Recibo.findAll({ where: { numero: { [db.Sequelize.Op.gte]: desde } }, attributes: ['numero'], raw: true });
    const usados = new Set(filas.map((f) => Number(f.numero)));
    let n = desde;
    while (usados.has(n)) n += 1;
    return n;
}
export const siguienteNumero = primerReciboLibre;

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
