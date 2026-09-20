// Conversión de un recibo de venta (V-) en factura (F-), cuando el cliente la pide después de comprar (p. ej. por WhatsApp).
// Imports relativos con extensión (sin alias "@/") para poder probarlo con un script de Node.
//
//  · La venta toma el siguiente número F- y su fecha de emisión es HOY (`fechaEmision`): la factura entra al libro de ventas y al IVA del
//    periodo en que se emite, no en el de la compra. El V- anterior queda en `numeroDocumentoAnterior`.
//  · El IVA que la tienda había dejado como ingreso pasa a la categoría "IVA Recaudado": queda reservado para pagar al SENIAT.
import db from '../../../models/index.js';

const { sequelize, Correlativo, CategoriaFinanciera, MovimientoFinanciero } = db;
const { Op } = db.Sequelize;

export class ErrorConversion extends Error {
    constructor(mensaje, status = 400) { super(mensaje); this.status = status; }
}

const CAT_IVA = 'IVA Recaudado';

// Siguiente número de factura: nunca por debajo del mayor F- ya emitido
async function siguienteNumeroFactura(t) {
    let corr = await Correlativo.findOne({ where: { prefijo: 'F' }, transaction: t, lock: t.LOCK.UPDATE });
    if (!corr) corr = await Correlativo.create({ prefijo: 'F', siguienteNumero: 1, cerosRelleno: 5 }, { transaction: t });
    const [{ maximo }] = await sequelize.query(
        `SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace("numeroDocumento", '\\D', '', 'g'), '') AS bigint)), 0) AS maximo
         FROM "Ventas" WHERE "numeroDocumento" LIKE 'F-%'`,
        { type: sequelize.QueryTypes.SELECT, transaction: t }
    );
    const n = Math.max(corr.siguienteNumero, Number(maximo) + 1);
    corr.siguienteNumero = n + 1;
    await corr.save({ transaction: t });
    return `F-${String(n).padStart(corr.cerosRelleno || 5, '0')}`;
}

/** Convierte `venta` (instancia de Venta ya cargada dentro de la transacción `t`). No hace commit. */
export async function convertirAFactura({ venta, transaction: t }) {
    if (venta.tipoDocumento !== 'VENTA_RAPIDA') throw new ErrorConversion('Solo un recibo de venta (V-) se puede convertir en factura', 409);
    if (venta.statusDespacho === 'Cancelado') throw new ErrorConversion('Este pedido está cancelado', 409);
    if (!venta.clienteId) throw new ErrorConversion('Una factura necesita los datos del cliente (cédula o RIF)', 409);

    const anterior = venta.numeroDocumento;
    const numero = await siguienteNumeroFactura(t);
    venta.numeroDocumentoAnterior = anterior;
    venta.numeroDocumento = numero;
    venta.tipoDocumento = 'FACTURA';
    venta.fechaEmision = new Date();
    await venta.save({ transaction: t });

    // El IVA cobrado deja de ser ingreso de la tienda y pasa a estar reservado para el SENIAT
    let catIva = await CategoriaFinanciera.findOne({ where: { nombre: CAT_IVA }, transaction: t });
    if (!catIva) catIva = await CategoriaFinanciera.create({ nombre: CAT_IVA, tipo: 'INGRESO' }, { transaction: t });
    const [reclasificados] = await MovimientoFinanciero.update(
        { categoriaId: catIva.id, descripcion: `IVA de Venta ${numero} (Impuesto SENIAT, antes ${anterior})` },
        {
            where: {
                ventaId: venta.id, tipo: 'INGRESO', descripcion: { [Op.like]: 'IVA de Venta%' },
                [Op.or]: [{ categoriaId: null }, { categoriaId: { [Op.ne]: catIva.id } }],
            },
            transaction: t,
        }
    );
    return { numeroDocumento: numero, numeroAnterior: anterior, ivaReservado: reclasificados > 0 };
}
