// ¿Esta factura (o nota de entrega) de compra ya está registrada? Se compara por proveedor + tipo + número, ignorando mayúsculas, guiones, espacios y ceros a la
// izquierda («F-98765», «f98765» y «F-0098765» son el mismo número); el N° de control del proveedor también cuenta. Un mismo número con otro formato de letras
// («98765» frente a «F-98765») se devuelve como PARECIDA: avisa, pero no bloquea.
// Imports relativos con extensión (sin alias "@/") para poder probarlo con un script de Node.
import db from '../../../models/index.js';

const { FacturaCompra } = db;
const { Op } = db.Sequelize;

// Letras y números sin separadores; los ceros a la izquierda de la parte numérica se quitan
export const normalizarNumero = (t) => String(t ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^([A-Z]*)0+(?=[0-9])/, '$1');
const soloDigitos = (t) => String(t ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');

const resumen = (f) => ({ id: f.id, numeroDocumento: f.numeroDocumento, numeroControl: f.numeroControl, fechaFactura: f.fechaFactura, moneda: f.moneda, total: Number(f.totalFinal) || 0, esGasto: Boolean(f.esGasto) });

/** { exacta, parecidas } — exacta es la compra ya registrada (null si no hay); parecidas, otras con los mismos dígitos pero escritas distinto. */
export async function buscarCompraDuplicada({ proveedorId, tipo = 'FACTURA', numero, control = null, transaction }) {
    const num = normalizarNumero(numero);
    const digitos = soloDigitos(numero);
    const ctl = normalizarNumero(control);
    if (!proveedorId || (!num && !ctl)) return { exacta: null, parecidas: [] };
    const o = [];
    if (digitos) o.push({ numeroDocumento: { [Op.iLike]: `%${digitos}%` } });
    if (ctl) o.push({ numeroControl: { [Op.iLike]: `%${soloDigitos(control) || ctl}%` } });
    if (!o.length && num) o.push({ numeroDocumento: String(numero).trim() });
    const candidatas = await FacturaCompra.findAll({
        where: { proveedorId, tipoDocumento: tipo, [Op.or]: o },
        attributes: ['id', 'numeroDocumento', 'numeroControl', 'fechaFactura', 'moneda', 'totalFinal', 'esGasto'], limit: 200, transaction,
    });
    let exacta = null;
    const parecidas = [];
    for (const f of candidatas) {
        const mismoNumero = num && normalizarNumero(f.numeroDocumento) === num;
        const mismoControl = ctl && f.numeroControl && normalizarNumero(f.numeroControl) === ctl;
        if (mismoNumero || mismoControl) { if (!exacta) exacta = { ...resumen(f), por: mismoNumero ? 'número' : 'control' }; }
        else if (digitos && soloDigitos(f.numeroDocumento) === digitos) parecidas.push(resumen(f));
    }
    return { exacta, parecidas: parecidas.slice(0, 5) };
}
