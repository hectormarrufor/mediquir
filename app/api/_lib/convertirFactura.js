// Conversión de un recibo de venta (V-) en factura (F-), cuando el cliente la pide después de comprar (p. ej. por WhatsApp).
// Imports relativos con extensión (sin alias "@/") para poder probarlo con un script de Node.
//
//  · La venta toma el siguiente número F- y su fecha de emisión es HOY (`fechaEmision`): la factura entra al libro de ventas y al IVA del
//    periodo en que se emite, no en el de la compra. El V- anterior queda en `numeroDocumentoAnterior`.
//  · El IVA que la tienda había dejado como ingreso pasa a la categoría "IVA Recaudado": queda reservado para pagar al SENIAT.
import db from '../../../models/index.js';
import { calcularFactura, aDolares, aBolivares, REGLAS } from '../../constants/facturacion.js';
import { recalcularCobro, crearRetencionPendiente } from './retencionesVenta.js';

const { sequelize, Correlativo, CategoriaFinanciera, MovimientoFinanciero, VentaDetalle, Producto, CuentaPorCobrar } = db;
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

// ------------------------------------------------------------------ nota de entrega (a crédito) -> factura el día del pago
// La nota de entrega no lleva IVA y quedó con la tasa del día del pedido. Al pedir el cliente la factura (normalmente al pagar):
//  · el IVA de cada producto gravado se suma (los dólares del pedido suben por ese IVA; la cuenta por cobrar sube igual),
//  · la tasa pasa a ser la de HOY (los bolívares del documento se actualizan a esa fecha),
//  · toma el siguiente número F- y su fecha de emisión es hoy: entra al libro de ventas de este periodo.
async function planConversionNE(venta, transaction) {
    if (venta.tipoDocumento !== 'NOTA_ENTREGA') throw new ErrorConversion('Solo una nota de entrega se convierte en factura de esta forma', 409);
    if (venta.statusDespacho === 'Cancelado') throw new ErrorConversion('Este pedido está cancelado', 409);
    if (venta.revisionStock === 'PENDIENTE') throw new ErrorConversion('El pedido está en revisión de existencias: confírmalo antes de facturar', 409);
    if (venta.moneda !== 'USD') throw new ErrorConversion('Esta nota de entrega está en bolívares: no tiene diferencial que actualizar', 409);
    if (!venta.clienteId) throw new ErrorConversion('Una factura necesita los datos del cliente (cédula o RIF)', 409);
    const cxc = await CuentaPorCobrar.findOne({ where: { ventaId: venta.id }, transaction, lock: transaction?.LOCK.UPDATE });
    if (!cxc) throw new ErrorConversion('Solo las notas de entrega a crédito con cuenta por cobrar se convierten así', 409);

    const detalles = await VentaDetalle.findAll({ where: { ventaId: venta.id }, include: [{ model: Producto, as: 'producto', attributes: ['porcentajeIva'] }], transaction });
    const lineas = detalles.map((d) => {
        const pct = d.isFicticio ? (d.aplicaIva ? REGLAS.alicuotaGeneral : 0) : (Number(d.producto?.porcentajeIva) || 0);
        return { d, aplicaIva: pct > 0, porcentajeIva: pct };
    });
    const calc = calcularFactura({ renglones: lineas.map((l) => ({ precioUnitario: Number(l.d.precioUnitario), cantidad: Number(l.d.cantidad), aplicaIva: l.aplicaIva, porcentajeIva: l.porcentajeIva })) });
    const ivaNuevo = calc.montoIva;
    const ivaViejo = Number(venta.montoIva) || 0;
    const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
    return { cxc, lineas, ivaNuevo, ivaViejo, deltaIva: r2(ivaNuevo - ivaViejo), totalNuevo: r2(Number(venta.totalFinal) + ivaNuevo - ivaViejo) };
}

/** Vista previa para la pantalla: qué cambia si se convierte hoy (no guarda nada). */
export async function vistaPreviaConversion({ venta, tasaHoy, transaction }) {
    const p = await planConversionNE(venta, transaction);
    const tasaAntes = Number(venta.tasaCambio) || 1;
    const totalAntes = Number(venta.totalFinal);
    return {
        numeroActual: venta.numeroDocumento, tasaAntes, tasaHoy,
        ivaUsd: p.ivaNuevo, deltaIvaUsd: p.deltaIva, totalAntesUsd: totalAntes, totalNuevoUsd: p.totalNuevo, saldoNuevoUsd: Number((Number(p.cxc.saldoPendiente) + p.deltaIva).toFixed(2)),
        totalAntesBs: aBolivares(totalAntes, tasaAntes), totalNuevoBs: aBolivares(p.totalNuevo, tasaHoy),
    };
}

/** Convierte la nota de entrega `venta` (ya cargada y bloqueada dentro de `transaction`) en factura con la tasa de hoy. No hace commit. */
export async function convertirNotaEntregaAFactura({ venta, tasaHoy, transaction: t }) {
    if (!(Number(tasaHoy) > 0)) throw new ErrorConversion('No hay una tasa BCV vigente registrada', 409);
    const p = await planConversionNE(venta, t);
    const anterior = venta.numeroDocumento;
    const numero = await siguienteNumeroFactura(t);

    for (const l of p.lineas) { l.d.aplicaIva = l.aplicaIva; await l.d.save({ transaction: t }); }
    venta.numeroDocumentoAnterior = anterior;
    venta.numeroDocumento = numero;
    venta.tipoDocumento = 'FACTURA';
    venta.fechaEmision = new Date();
    venta.tasaCambio = tasaHoy;
    venta.montoIva = p.ivaNuevo;
    venta.totalFinal = p.totalNuevo;
    await venta.save({ transaction: t });

    p.cxc.tasaCambio = tasaHoy;
    p.cxc.montoTotal = Number((Number(p.cxc.montoTotal) + p.deltaIva).toFixed(2));
    await p.cxc.save({ transaction: t });
    await recalcularCobro(venta, t);
    // Si el cliente es contribuyente especial, la retención de IVA queda calculada desde ya (falta su comprobante)
    await crearRetencionPendiente({ venta, transaction: t });
    return { numeroDocumento: numero, numeroAnterior: anterior, tasaHoy: Number(tasaHoy), ivaAgregadoUsd: p.deltaIva, totalUsd: p.totalNuevo };
}
