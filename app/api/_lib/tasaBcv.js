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
