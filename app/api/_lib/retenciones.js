import { Correlativo } from '@/models';

const PREFIJO_COMPRAS = 'RET-COMPRA';

// Número de comprobante de retención que EMITE la empresa (retenciones de compras): año (4) + mes (2) + correlativo de 8 dígitos,
// como en el libro de compras de ejemplo (20260900000734). El correlativo continúa de un mes a otro; su valor inicial se ajusta
// en la tabla `correlativos` (prefijo RET-COMPRA) para empatar con el último comprobante que ya emitiste.
// OJO: el formato se copió de tu libro de ejemplo; confírmalo con tu contador.
export async function siguienteComprobante(fecha, transaction) {
    let corr = await Correlativo.findOne({ where: { prefijo: PREFIJO_COMPRAS }, transaction, lock: transaction.LOCK.UPDATE });
    if (!corr) corr = await Correlativo.create({ prefijo: PREFIJO_COMPRAS, siguienteNumero: 1, cerosRelleno: 8 }, { transaction });
    const numero = corr.siguienteNumero;
    corr.siguienteNumero = numero + 1;
    await corr.save({ transaction });
    const [anio, mes] = String(fecha).slice(0, 7).split('-');
    return `${anio}${mes}${String(numero).padStart(8, '0')}`;
}

export const periodoDe = (fecha) => String(fecha).slice(0, 7);
