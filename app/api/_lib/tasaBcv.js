import { Op } from 'sequelize';
import { BcvPrecioHistorico } from '@/models';

// Tasa BCV vigente según la base de datos (el registro más reciente). Es la ÚNICA tasa que el servidor
// acepta al cobrar: el navegador nunca decide a cuánto se convierte el dólar.
export async function tasaVigente({ transaction } = {}) {
    const fila = await BcvPrecioHistorico.findOne({
        order: [['fecha', 'DESC'], ['id', 'DESC']],
        attributes: ['monto', 'fecha'],
        transaction,
    });
    const tasa = Number(fila?.monto);
    if (!(tasa > 0)) throw new Error('No hay una tasa BCV vigente registrada');
    return tasa;
}

// Tasa BCV de un día pasado (la última publicada hasta ese día): para asentar en caja un pago que se hizo días antes
// de registrarlo. null si no hay ninguna hasta esa fecha.
export async function tasaDelDia(fecha, { transaction } = {}) {
    const fila = await BcvPrecioHistorico.findOne({
        where: { fecha: { [Op.lte]: fecha } },
        order: [['fecha', 'DESC'], ['id', 'DESC']],
        attributes: ['monto'],
        transaction,
    });
    const tasa = Number(fila?.monto);
    return tasa > 0 ? tasa : null;
}
