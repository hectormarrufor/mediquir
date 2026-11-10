// Conversión de un recibo de venta (V-) en factura (F-), cuando el cliente la pide después de comprar (p. ej. por WhatsApp).
// Imports relativos con extensión (sin alias "@/") para poder probarlo con un script de Node.
//
//  · La venta toma el siguiente número F- y su fecha de emisión es HOY (`fechaEmision`): la factura entra al libro de ventas y al IVA del
//    periodo en que se emite, no en el de la compra. El V- anterior queda en `numeroDocumentoAnterior`.
//  · El IVA que la tienda había dejado como ingreso pasa a la categoría "IVA Recaudado": queda reservado para pagar al SENIAT.
import db from '../../../models/index.js';
import { calcularFactura, aDolares, aBolivares, REGLAS } from '../../constants/facturacion.js';
import { recalcularCobro } from './retencionesVenta.js';
import { fechaCaracas } from '../../constants/hora.js';

const { sequelize, Correlativo, CategoriaFinanciera, MovimientoFinanciero, VentaDetalle, Producto, CuentaPorCobrar, Venta } = db;
const { Op } = db.Sequelize;

export class ErrorConversion extends Error {
    constructor(mensaje, status = 400) { super(mensaje); this.status = status; }
}

const CAT_IVA = 'IVA Recaudado';

// Siguiente número de factura: nunca por debajo del mayor F- ya emitido.
// `manual`: el número que ya tiene esa factura en el sistema anterior (mientras convivan los dos, la factura se copia con SU número y no con uno nuevo).
// Si ya existe una factura con ese número se rechaza (no se renumera en silencio); el correlativo avanza para que el siguiente sea el que sigue.
async function siguienteNumeroFactura(t, manual = null) {
    let corr = await Correlativo.findOne({ where: { prefijo: 'F' }, transaction: t, lock: t.LOCK.UPDATE });
    if (!corr) corr = await Correlativo.create({ prefijo: 'F', siguienteNumero: 1, cerosRelleno: 5 }, { transaction: t });
    const ceros = corr.cerosRelleno || 5;
    if (manual !== null && manual !== undefined && String(manual).trim() !== '') {
        const n = parseInt(String(manual).replace(/\D/g, ''), 10);
        if (!Number.isInteger(n) || n < 1) throw new ErrorConversion('El número de factura no es válido', 400);
        const numero = `F-${String(n).padStart(ceros, '0')}`;
        if (await Venta.findOne({ where: { numeroDocumento: numero }, attributes: ['id'], transaction: t })) throw new ErrorConversion(`Ya existe la factura ${numero}`, 409);
        corr.siguienteNumero = Math.max(Number(corr.siguienteNumero) || 1, n + 1);
        await corr.save({ transaction: t });
        return numero;
    }
    const [{ maximo }] = await sequelize.query(
        `SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace("numeroDocumento", '[^0-9]', '', 'g'), '') AS bigint)), 0) AS maximo
         FROM "Ventas" WHERE "numeroDocumento" LIKE 'F-%'`,
        { type: sequelize.QueryTypes.SELECT, transaction: t }
    );
    const n = Math.max(corr.siguienteNumero, Number(maximo) + 1);
    corr.siguienteNumero = n + 1;
    await corr.save({ transaction: t });
    return `F-${String(n).padStart(ceros, '0')}`;
}

// Fecha de emisión: hoy, o la que se indique (YYYY-MM-DD, nunca futura) para copiar una factura que el sistema anterior emitió otro día
export function fechaEmisionDe(fecha) {
    if (!fecha) return new Date();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha)) || String(fecha) > fechaCaracas()) throw new ErrorConversion('La fecha de emisión no es válida (no puede ser futura)', 400);
    return new Date(`${fecha}T12:00:00-04:00`);
}
const controlDe = (c) => String(c ?? '').trim().slice(0, 30) || null;

/** Convierte `venta` (instancia de Venta ya cargada dentro de la transacción `t`). No hace commit. */
export async function convertirAFactura({ venta, transaction: t, numeroManual = null, numeroControl = null, fecha = null }) {
    if (venta.tipoDocumento !== 'VENTA_RAPIDA') throw new ErrorConversion('Solo un recibo de venta (V-) se puede convertir en factura', 409);
    if (venta.statusDespacho === 'Cancelado') throw new ErrorConversion('Este pedido está cancelado', 409);
    if (!venta.clienteId) throw new ErrorConversion('Una factura necesita los datos del cliente (cédula o RIF)', 409);

    const anterior = venta.numeroDocumento;
    const emision = fechaEmisionDe(fecha);
    const numero = await siguienteNumeroFactura(t, numeroManual);
    venta.numeroDocumentoAnterior = anterior;
    venta.numeroDocumento = numero;
    venta.tipoDocumento = 'FACTURA';
    venta.fechaEmision = emision;
    if (controlDe(numeroControl)) venta.numeroControl = controlDe(numeroControl);
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

/**
 * Pasa la nota de entrega `venta` (ya cargada y bloqueada dentro de `transaction`) a una FACTURA NUEVA con la tasa de hoy. No hace commit.
 *  · La nota NO desaparece: conserva su número y queda anulada (histórica). La factura toma el siguiente F- y enlaza a la nota en `numeroDocumentoAnterior`.
 *  · El inventario no se mueve: los productos ya salieron con la nota; las salidas y la evidencia de empaque pasan a la factura.
 *  · Los dólares se mantienen (más el IVA); los bolívares se recalculan con la tasa del día de la factura.
 *  · La cuenta por cobrar, los abonos, los ingresos de caja y las comisiones de vendedores siguen a la factura. La comisión no cambia: se calcula sobre la base sin IVA.
 *  · La retención de IVA NO se crea sola: se declara después, por factura, al registrar un abono.
 */
export async function convertirNotaEntregaAFactura({ venta, tasaHoy, transaction: t, numeroManual = null, numeroControl = null, fecha = null }) {
    if (!(Number(tasaHoy) > 0)) throw new ErrorConversion('No hay una tasa BCV vigente registrada', 409);
    const p = await planConversionNE(venta, t);
    const anterior = venta.numeroDocumento;
    const emision = fechaEmisionDe(fecha);
    const numero = await siguienteNumeroFactura(t, numeroManual);
    const sql = (texto, reemplazos) => sequelize.query(texto, { replacements: reemplazos, transaction: t });

    // 1. La factura nueva: copia de la nota con su número, su fecha, la tasa de hoy y el IVA
    const datos = venta.get({ plain: true });
    for (const k of ['id', 'createdAt', 'updatedAt', 'detalles']) delete datos[k];
    const factura = await Venta.create({
        ...datos, numeroDocumento: numero, numeroDocumentoAnterior: anterior, tipoDocumento: 'FACTURA', fechaEmision: emision,
        numeroControl: controlDe(numeroControl), tasaCambio: tasaHoy, montoIva: p.ivaNuevo, totalFinal: p.totalNuevo,
    }, { transaction: t });

    // 2. Sus renglones (el IVA de cada producto gravado queda marcado); se recuerda cuál es cuál para pasar la evidencia de empaque
    const mapa = new Map();
    for (const l of p.lineas) {
        const copia = l.d.get({ plain: true });
        for (const k of ['id', 'createdAt', 'updatedAt']) delete copia[k];
        const nuevo = await VentaDetalle.create({ ...copia, ventaId: factura.id, aplicaIva: l.aplicaIva }, { transaction: t });
        mapa.set(l.d.id, nuevo.id);
    }
    for (const [viejo, nuevo] of mapa) await sql('UPDATE "VentaEmpaqueItems" SET "ventaId" = :f, "ventaDetalleId" = :nuevo WHERE "ventaDetalleId" = :viejo', { f: factura.id, nuevo, viejo });

    // 3. Todo lo que seguía a la nota sigue a la factura (el inventario no se vuelve a tocar: las salidas ya hechas pasan con ella)
    await sql('UPDATE "CuentasPorCobrar" SET "ventaId" = :f, "tasaCambio" = :tasa, "montoTotal" = "montoTotal" + :delta WHERE "ventaId" = :n', { f: factura.id, n: venta.id, tasa: tasaHoy, delta: p.deltaIva });
    for (const tabla of ['Abonos', 'MovimientosFinancieros', 'NotasFiscales', 'SalidasInventario', 'PagoSms']) {
        await sql(`UPDATE "${tabla}" SET "ventaId" = :f WHERE "ventaId" = :n`, { f: factura.id, n: venta.id });
    }
    // Comisiones: siguen al documento nuevo. La comisión (base sin IVA) no cambia; el monto de la factura sí, y de él depende cómo se prorratean los abonos futuros
    await sql(`UPDATE "ComisionesVenta" SET "ventaId" = :f, "documentoTexto" = :num, "montoUsd" = CASE WHEN concepto = 'FACTURA' THEN :total ELSE "montoUsd" END WHERE "ventaId" = :n`, { f: factura.id, n: venta.id, num: numero, total: p.totalNuevo });

    // 4. La nota queda anulada y sin fotos propias (las usa la factura); conserva su número y sus renglones como historia
    venta.statusDespacho = 'Cancelado';
    venta.fotoCajaAbiertaUrl = null;
    venta.fotoCajaSelladaUrl = null;
    await venta.save({ transaction: t });

    await recalcularCobro(factura, t);
    return { numeroDocumento: numero, numeroAnterior: anterior, tasaHoy: Number(tasaHoy), ivaAgregadoUsd: p.deltaIva, totalUsd: p.totalNuevo, ventaId: factura.id };
}
