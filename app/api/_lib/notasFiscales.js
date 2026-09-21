// Notas de crédito y de débito (ver models/facturacion/NotaFiscal.js).
// Imports relativos con extensión (sin alias "@/") para poder probarlo con un script de Node.
//
// EFECTO DE CADA NOTA (todo dentro de la transacción del llamador; ninguna mueve dinero real salvo el reintegro):
//  · NC de venta : baja lo que el cliente debe (se registra como un abono "Nota de crédito", igual que la retención). Si la
//                  factura ya estaba pagada, el monto queda como "saldo a favor" del cliente hasta que se le reintegre.
//                  Opcionalmente devuelve la mercancía al inventario.
//  · ND de venta : sube lo que el cliente debe (suma a la cuenta por cobrar de la factura; si la factura era de contado
//                  y ya estaba cobrada, la nota crea su propia cuenta por cobrar).
//  · NC / ND de compra (las emite el proveedor): bajan / suben la cuenta por pagar de la factura de compra.
//  · En los libros y en el IVA: la NC resta, la ND suma. Los montos se guardan en la moneda y con la tasa de la factura afectada.
import db from '../../../models/index.js';
import { calcularFactura, aBolivares, aDolares, REGLAS } from '../../constants/facturacion.js';
import { hoyCaracas, recalcularCobro } from './retencionesVenta.js';
import { fechaCaracas } from '../../constants/hora.js';

const {
    sequelize, NotaFiscal, NotaFiscalDetalle, VentaDetalle, Producto, Abono, CuentaPorCobrar, CuentaPorPagar, Correlativo,
    MovimientoFinanciero, CategoriaFinanciera, Cliente,
} = db;

export class ErrorNota extends Error {
    constructor(mensaje, status = 400, codigo = null) { super(mensaje); this.status = status; this.codigo = codigo; }
}

export const PREFIJO = { CREDITO: 'NC', DEBITO: 'ND' };
export const ETIQUETA = { CREDITO: 'Nota de crédito', DEBITO: 'Nota de débito' };
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const aUsdDoc = (monto, moneda, tasa) => (moneda === 'BS' ? aDolares(Number(monto), Number(tasa) || 1) : r2(monto));
const aBsDoc = (monto, moneda, tasa) => (moneda === 'BS' ? r2(monto) : aBolivares(Number(monto), Number(tasa) || 1));

// ------------------------------------------------------------------ correlativo
// NC-00001 / ND-00001. Nunca por debajo del mayor número ya emitido (aunque falte la fila del correlativo).
export async function siguienteNumeroNota(tipo, transaction) {
    const prefijo = PREFIJO[tipo];
    if (!prefijo) throw new ErrorNota('Tipo de nota no válido');
    const corr = await Correlativo.findOne({ where: { prefijo }, transaction, lock: transaction.LOCK.UPDATE });
    if (!corr || !corr.configurado) {
        throw new ErrorNota(`Antes de emitir la primera ${ETIQUETA[tipo].toLowerCase()} debes indicar con qué número empieza tu numeración`, 409, 'NUMERACION_PENDIENTE');
    }
    const [{ maximo }] = await sequelize.query(
        `SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace("numeroDocumento", '\\D', '', 'g'), '') AS bigint)), 0) AS maximo
         FROM "NotasFiscales" WHERE origen = 'VENTA' AND "numeroDocumento" LIKE :patron`,
        { replacements: { patron: `${prefijo}-%` }, type: sequelize.QueryTypes.SELECT, transaction },
    );
    const numero = Math.max(corr.siguienteNumero, Number(maximo) + 1);
    corr.siguienteNumero = numero + 1;
    await corr.save({ transaction });
    return `${prefijo}-${String(numero).padStart(corr.cerosRelleno || 5, '0')}`;
}

// ------------------------------------------------------------------ consulta para la pantalla
// Notas de una factura de venta y lo que queda por acreditar de cada renglón
export async function notasDeVenta(venta, transaction) {
    const [notas, detalles] = await Promise.all([
        NotaFiscal.findAll({ where: { ventaId: venta.id }, include: [{ model: NotaFiscalDetalle, as: 'detalles' }], order: [['createdAt', 'DESC']], transaction }),
        VentaDetalle.findAll({ where: { ventaId: venta.id }, include: [{ model: Producto, as: 'producto', attributes: ['nombre', 'codigo', 'porcentajeIva'] }], transaction }),
    ]);
    const emitidas = notas.filter((n) => n.estado === 'EMITIDA');
    const acreditado = new Map();
    for (const n of emitidas.filter((x) => x.tipo === 'CREDITO')) {
        for (const d of n.detalles) if (d.ventaDetalleId) acreditado.set(d.ventaDetalleId, (acreditado.get(d.ventaDetalleId) || 0) + Number(d.cantidad));
    }
    const totalAcreditado = r2(emitidas.filter((n) => n.tipo === 'CREDITO').reduce((a, n) => a + Number(n.totalFinal), 0));
    return {
        notas,
        acreditable: r2(Math.max(0, Number(venta.totalFinal) - totalAcreditado)),
        renglones: detalles.map((d) => ({
            id: d.id, productoId: d.productoId, nombre: d.isFicticio ? d.nombreFicticio : (d.producto?.nombre || 'Producto'), codigo: d.producto?.codigo || null,
            cantidad: Number(d.cantidad), precioUnitario: Number(d.precioUnitario), aplicaIva: Boolean(d.aplicaIva),
            restante: Math.max(0, Number(d.cantidad) - (acreditado.get(d.id) || 0)),
        })),
    };
}

// ------------------------------------------------------------------ emisión (ventas)
/**
 * Emite una nota de crédito o de débito sobre una factura de venta.
 * @param {object} p.venta        Venta (factura) ya cargada; el llamador la bloquea con lock
 * @param {'CREDITO'|'DEBITO'} p.tipo
 * @param {Array}  p.renglones    Crédito: [{ ventaDetalleId, cantidad }] (devolución de un renglón) y/o conceptos libres.
 *                                Concepto libre (crédito o débito): [{ descripcion, precioUnitario, cantidad?, aplicaIva }]
 */
export async function emitirNotaVenta({ venta, tipo, renglones, motivo, devuelveInventario = false, usuarioId = null, transaction: t }) {
    if (!PREFIJO[tipo]) throw new ErrorNota('Tipo de nota no válido');
    if (venta.tipoDocumento !== 'FACTURA') throw new ErrorNota('Las notas de crédito y de débito solo se emiten sobre facturas', 409);
    if (venta.statusDespacho === 'Cancelado') throw new ErrorNota('La factura está anulada', 409);
    const motivoTxt = String(motivo || '').trim();
    if (motivoTxt.length < 5) throw new ErrorNota('Explica el motivo de la nota (mínimo 5 caracteres)');
    if (!Array.isArray(renglones) || renglones.length === 0) throw new ErrorNota('La nota no tiene renglones');
    if (tipo === 'DEBITO' && !venta.clienteId) throw new ErrorNota('Una nota de débito necesita que la factura tenga cliente', 409);

    const detallesFactura = await VentaDetalle.findAll({
        where: { ventaId: venta.id }, include: [{ model: Producto, as: 'producto', attributes: ['nombre', 'porcentajeIva'] }], transaction: t,
    });
    const { renglones: yaEmitidos, acreditable } = await notasDeVenta(venta, t);
    const restante = new Map(yaEmitidos.map((r) => [r.id, r.restante]));

    // Renglones normalizados para calcular: los de la factura conservan su precio y su IVA; los libres traen los suyos
    const lineas = [];
    const usados = new Set();
    for (const r of renglones) {
        const cantidad = Number(r.cantidad ?? 1);
        if (!Number.isInteger(cantidad) || cantidad < 1) throw new ErrorNota('Las cantidades deben ser números enteros mayores a 0');

        if (r.ventaDetalleId) {
            if (tipo !== 'CREDITO') throw new ErrorNota('La nota de débito se arma con conceptos libres, no con renglones de la factura');
            if (usados.has(r.ventaDetalleId)) throw new ErrorNota('Un renglón de la factura aparece dos veces');
            usados.add(r.ventaDetalleId);
            const d = detallesFactura.find((x) => x.id === r.ventaDetalleId);
            if (!d) throw new ErrorNota('Uno de los renglones no pertenece a esta factura');
            if (cantidad > (restante.get(d.id) ?? 0)) throw new ErrorNota(`De "${d.isFicticio ? d.nombreFicticio : d.producto?.nombre}" solo quedan ${restante.get(d.id) ?? 0} por acreditar`);
            lineas.push({
                ventaDetalleId: d.id, productoId: d.productoId, descripcion: d.isFicticio ? d.nombreFicticio : (d.producto?.nombre || 'Producto'),
                precioUnitario: Number(d.precioUnitario), cantidad, aplicaIva: Boolean(d.aplicaIva),
                porcentajeIva: d.aplicaIva ? Number(d.producto?.porcentajeIva ?? REGLAS.alicuotaGeneral) || REGLAS.alicuotaGeneral : 0,
            });
        } else {
            const descripcion = String(r.descripcion || '').trim().slice(0, 200);
            const precio = Number(r.precioUnitario);
            if (descripcion.length < 3) throw new ErrorNota('Cada concepto necesita una descripción');
            if (!(precio > 0)) throw new ErrorNota(`El concepto "${descripcion}" necesita un monto mayor a 0`);
            const aplicaIva = r.aplicaIva !== false && r.aplicaIva !== 'false';
            lineas.push({ ventaDetalleId: null, productoId: null, descripcion, precioUnitario: precio, cantidad, aplicaIva, porcentajeIva: aplicaIva ? REGLAS.alicuotaGeneral : 0 });
        }
    }

    let factura;
    try {
        factura = calcularFactura({ renglones: lineas.map((l) => ({ precioUnitario: l.precioUnitario, cantidad: l.cantidad, aplicaIva: l.aplicaIva, porcentajeIva: l.porcentajeIva })) });
    } catch (e) {
        throw new ErrorNota(e.message);
    }
    if (tipo === 'CREDITO' && factura.totalFinal > acreditable + 0.005) {
        throw new ErrorNota(`La nota de crédito (${factura.totalFinal.toFixed(2)}) supera lo que queda por acreditar de la factura (${acreditable.toFixed(2)})`, 409);
    }

    const moneda = venta.moneda;
    const tasa = Number(venta.tasaCambio) || 1;
    const numero = await siguienteNumeroNota(tipo, t);
    const nota = await NotaFiscal.create({
        tipo, origen: 'VENTA', numeroDocumento: numero, fecha: hoyCaracas(), ventaId: venta.id, clienteId: venta.clienteId,
        moneda, tasaCambio: tasa, subtotal: factura.subtotal, baseImponible: factura.baseImponible, montoExento: factura.exento,
        montoIva: factura.montoIva, alicuotaIva: REGLAS.alicuotaGeneral, totalFinal: factura.totalFinal, motivo: motivoTxt,
        devuelveInventario: Boolean(devuelveInventario) && tipo === 'CREDITO', registradoPorId: usuarioId,
    }, { transaction: t });
    await NotaFiscalDetalle.bulkCreate(lineas.map((l, i) => ({
        notaId: nota.id, ventaDetalleId: l.ventaDetalleId, productoId: l.productoId, descripcion: l.descripcion, cantidad: l.cantidad,
        precioUnitario: l.precioUnitario, aplicaIva: l.aplicaIva, porcentajeIva: l.porcentajeIva, subtotal: factura.renglones[i].monto,
    })), { transaction: t });

    const totalUsd = aUsdDoc(factura.totalFinal, moneda, tasa);
    const totalBs = aBsDoc(factura.totalFinal, moneda, tasa);

    if (tipo === 'CREDITO') {
        // 1) Inventario: solo si la mercancía ya salió (el mayor descuenta al empacar; el detal y la tienda, al vender)
        if (nota.devuelveInventario) {
            const descontado = venta.tipoVenta !== 'MAYOR' || Boolean(venta.empacadoAt);
            if (!descontado) throw new ErrorNota('Este pedido aún no se ha empacado: no salió mercancía del inventario, no hay nada que reintegrar. Desmarca esa opción.', 409);
            for (const l of lineas.filter((x) => x.productoId)) {
                const producto = await Producto.findByPk(l.productoId, { transaction: t, lock: t.LOCK.UPDATE });
                if (!producto) continue;
                producto.stockAlmacen = Number(producto.stockAlmacen) + l.cantidad;
                producto.nroVentas = Math.max(0, (Number(producto.nroVentas) || 0) - l.cantidad);
                await producto.save({ transaction: t });
            }
        }

        // 2) Deuda del cliente: la nota se aplica como un abono (no es dinero, es un descuento de la deuda)
        const cxc = await CuentaPorCobrar.findOne({ where: { ventaId: venta.id }, transaction: t, lock: t.LOCK.UPDATE });
        if (!cxc && venta.statusPago === 'Pagado') {
            nota.saldoAFavorUsd = totalUsd; // ya se cobró todo: hay dinero que devolverle al cliente
        } else {
            const abono = await Abono.create({
                ventaId: venta.id, fechaPago: nota.fecha, metodoPago: 'Nota de crédito', referencia: numero,
                montoUsd: totalUsd, montoVes: totalBs, montoBs: totalBs, tasaBcvAplicada: tasa, tasaCambio: tasa,
                notas: `Nota de crédito ${numero}: ${motivoTxt}`.slice(0, 250),
            }, { transaction: t });
            nota.abonoId = abono.id;
            await recalcularCobro(venta, t);
            // Si con la nota el cliente quedó pagando de más, ese exceso es saldo a su favor
            const abonos = await Abono.findAll({ where: { ventaId: venta.id }, attributes: ['montoUsd'], transaction: t });
            const abonado = abonos.reduce((a, x) => a + Number(x.montoUsd), 0);
            // Lo que el cliente debía en total (factura + notas de débito, en dólares)
            const debidoUsd = cxc ? (cxc.moneda === 'BS' ? aDolares(Number(cxc.montoTotal), tasa) : Number(cxc.montoTotal)) : aUsdDoc(venta.totalFinal, moneda, tasa);
            nota.saldoAFavorUsd = Math.min(totalUsd, r2(Math.max(0, abonado - debidoUsd)));
        }
        await nota.save({ transaction: t });
    } else {
        // Nota de débito: el cliente debe más
        const cxc = await CuentaPorCobrar.findOne({ where: { ventaId: venta.id }, transaction: t, lock: t.LOCK.UPDATE });
        if (cxc) {
            const enMonedaCuenta = cxc.moneda === 'BS' ? totalBs : totalUsd;
            cxc.montoTotal = r2(Number(cxc.montoTotal) + enMonedaCuenta);
            cxc.saldoPendiente = r2(Number(cxc.saldoPendiente) + enMonedaCuenta);
            cxc.estado = 'Pendiente';
            await cxc.save({ transaction: t });
        } else {
            const cliente = await Cliente.findByPk(venta.clienteId, { attributes: ['diasCredito'], transaction: t });
            await CuentaPorCobrar.create({
                clienteId: venta.clienteId, ventaId: venta.id, notaId: nota.id, montoTotal: factura.totalFinal, saldoPendiente: factura.totalFinal,
                moneda, tasaCambio: tasa, fechaVencimiento: new Date(Date.now() + (Number(cliente?.diasCredito) || 7) * 86400000), estado: 'Pendiente',
            }, { transaction: t });
        }
        if (venta.statusPago === 'Pagado') { venta.statusPago = 'Pendiente'; await venta.save({ transaction: t }); }
    }
    return nota;
}

// ------------------------------------------------------------------ registro de notas recibidas del proveedor (compras)
/**
 * Registra una nota de crédito o de débito que EMITIÓ un proveedor sobre una factura de compra.
 * Montos en la moneda de la factura: baseImponible + montoExento + IVA (si no se da, se calcula con la alícuota de la factura).
 */
export async function registrarNotaCompra({ factura, tipo, numeroDocumento, numeroControl, fecha, baseImponible, montoExento, montoIva, motivo, usuarioId = null, transaction: t }) {
    if (!PREFIJO[tipo]) throw new ErrorNota('Tipo de nota no válido');
    const numero = String(numeroDocumento || '').trim().slice(0, 50);
    if (!numero) throw new ErrorNota('Escribe el número de la nota que emitió el proveedor');
    const motivoTxt = String(motivo || '').trim();
    if (motivoTxt.length < 5) throw new ErrorNota('Explica el motivo de la nota (mínimo 5 caracteres)');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '') || fecha > hoyCaracas()) throw new ErrorNota('La fecha de la nota no es válida');

    const base = r2(Math.max(0, Number(baseImponible) || 0));
    const exento = r2(Math.max(0, Number(montoExento) || 0));
    const alicuota = Number(factura.alicuotaIva) || REGLAS.alicuotaGeneral;
    const iva = montoIva === undefined || montoIva === null || montoIva === '' ? r2(base * alicuota / 100) : r2(Math.max(0, Number(montoIva) || 0));
    const total = r2(base + exento + iva);
    if (!(total > 0)) throw new ErrorNota('La nota necesita un monto mayor a 0');

    if (await NotaFiscal.findOne({ where: { origen: 'COMPRA', proveedorId: factura.proveedorId, numeroDocumento: numero, tipo }, attributes: ['id'], transaction: t })) {
        throw new ErrorNota('Ya registraste esa nota de este proveedor', 409);
    }

    const moneda = factura.moneda;
    const tasa = Number(factura.tasaCambio) || 1;
    const nota = await NotaFiscal.create({
        tipo, origen: 'COMPRA', numeroDocumento: numero, numeroControl: String(numeroControl || '').trim().slice(0, 30) || null, fecha,
        facturaCompraId: factura.id, proveedorId: factura.proveedorId, moneda, tasaCambio: tasa, subtotal: r2(base + exento),
        baseImponible: base, montoExento: exento, montoIva: iva, alicuotaIva: alicuota, totalFinal: total, motivo: motivoTxt, registradoPorId: usuarioId,
    }, { transaction: t });

    const cxp = await CuentaPorPagar.findOne({ where: { facturaCompraId: factura.id }, transaction: t, lock: t.LOCK.UPDATE });
    if (tipo === 'CREDITO') {
        if (cxp) {
            const saldo = Number(cxp.saldoPendiente);
            cxp.saldoPendiente = r2(Math.max(0, saldo - total));
            if (cxp.saldoPendiente <= 0.005) cxp.estado = 'Pagado';
            await cxp.save({ transaction: t });
            // Si ya se había pagado de más, el proveedor nos debe esa diferencia
            nota.saldoAFavorUsd = aUsdDoc(Math.max(0, total - saldo), moneda, tasa);
        } else {
            nota.saldoAFavorUsd = aUsdDoc(total, moneda, tasa); // factura pagada de contado: el proveedor nos debe el monto
        }
        await nota.save({ transaction: t });
    } else if (cxp) {
        cxp.montoTotal = r2(Number(cxp.montoTotal) + total);
        cxp.saldoPendiente = r2(Number(cxp.saldoPendiente) + total);
        cxp.estado = 'Pendiente';
        await cxp.save({ transaction: t });
    } else {
        await CuentaPorPagar.create({
            proveedorId: factura.proveedorId, facturaCompraId: factura.id, montoTotal: total, saldoPendiente: total, moneda, tasaCambio: tasa,
            fechaVencimiento: fechaCaracas(new Date(Date.now() + 7 * 86400000)), estado: 'Pendiente',
        }, { transaction: t });
    }
    return nota;
}

// ------------------------------------------------------------------ anulación
// Revierte los efectos de la nota (la numeración queda usada: el hueco es normal en una nota anulada)
export async function anularNota({ nota, transaction: t }) {
    if (nota.estado !== 'EMITIDA') throw new ErrorNota('Esta nota ya está anulada', 409);
    if (Number(nota.reintegradoUsd) > 0) throw new ErrorNota('Ya se le reintegró dinero al cliente por esta nota: no se puede anular', 409);
    const detalles = await NotaFiscalDetalle.findAll({ where: { notaId: nota.id }, transaction: t });

    if (nota.origen === 'VENTA') {
        const venta = await nota.getVenta({ transaction: t, lock: t.LOCK.UPDATE });
        const tasa = Number(nota.tasaCambio) || 1;
        const cxc = await CuentaPorCobrar.findOne({ where: { ventaId: nota.ventaId }, transaction: t, lock: t.LOCK.UPDATE });

        if (nota.tipo === 'CREDITO') {
            if (nota.devuelveInventario) {
                for (const d of detalles.filter((x) => x.productoId)) {
                    const producto = await Producto.findByPk(d.productoId, { transaction: t, lock: t.LOCK.UPDATE });
                    if (!producto) continue;
                    if (Number(producto.stockAlmacen) < d.cantidad) throw new ErrorNota(`No se puede anular: "${d.descripcion}" ya salió del inventario que esta nota había reintegrado`, 409);
                    producto.stockAlmacen = Number(producto.stockAlmacen) - d.cantidad;
                    producto.nroVentas = (Number(producto.nroVentas) || 0) + d.cantidad;
                    await producto.save({ transaction: t });
                }
            }
            if (nota.abonoId) {
                await Abono.destroy({ where: { id: nota.abonoId }, transaction: t });
                await recalcularCobro(venta, t);
            }
        } else if (cxc?.notaId === nota.id) {
            // La cuenta por cobrar era solo de esta nota: no puede tener pagos
            const abonado = Number(cxc.montoTotal) - Number(cxc.saldoPendiente);
            if (abonado > 0.005) throw new ErrorNota('El cliente ya pagó parte de esta nota de débito: no se puede anular', 409);
            await cxc.destroy({ transaction: t });
            venta.statusPago = 'Pagado';
            await venta.save({ transaction: t });
        } else if (cxc) {
            const enMonedaCuenta = cxc.moneda === 'BS' ? aBsDoc(nota.totalFinal, nota.moneda, tasa) : aUsdDoc(nota.totalFinal, nota.moneda, tasa);
            if (Number(cxc.saldoPendiente) < enMonedaCuenta - 0.005) throw new ErrorNota('El cliente ya pagó parte de esta nota de débito: no se puede anular', 409);
            cxc.montoTotal = r2(Number(cxc.montoTotal) - enMonedaCuenta);
            cxc.saldoPendiente = r2(Number(cxc.saldoPendiente) - enMonedaCuenta);
            if (cxc.saldoPendiente <= 0.005) cxc.estado = 'Pagado';
            await cxc.save({ transaction: t });
            if (cxc.estado === 'Pagado') { venta.statusPago = 'Pagado'; await venta.save({ transaction: t }); }
        }
    } else {
        const cxp = await CuentaPorPagar.findOne({ where: { facturaCompraId: nota.facturaCompraId }, transaction: t, lock: t.LOCK.UPDATE });
        if (cxp) {
            const monto = Number(nota.totalFinal);
            if (nota.tipo === 'CREDITO') {
                cxp.saldoPendiente = r2(Number(cxp.saldoPendiente) + monto);
                cxp.estado = 'Pendiente';
            } else {
                if (Number(cxp.saldoPendiente) < monto - 0.005) throw new ErrorNota('Ya se pagó parte de esta nota de débito: no se puede anular', 409);
                cxp.montoTotal = r2(Number(cxp.montoTotal) - monto);
                cxp.saldoPendiente = r2(Number(cxp.saldoPendiente) - monto);
                if (cxp.saldoPendiente <= 0.005) cxp.estado = 'Pagado';
            }
            await cxp.save({ transaction: t });
        }
    }

    nota.estado = 'ANULADA';
    nota.anuladaAt = new Date();
    nota.saldoAFavorUsd = 0;
    await nota.save({ transaction: t });
    return nota;
}

// ------------------------------------------------------------------ reintegro al cliente
// Devuelve dinero al cliente por una nota de crédito que superó lo que debía: es un GASTO real (sale dinero)
export async function registrarReintegro({ nota, montoUsd, tasa, metodoPago, referencia, transaction: t }) {
    if (nota.estado !== 'EMITIDA' || nota.tipo !== 'CREDITO' || nota.origen !== 'VENTA') throw new ErrorNota('Solo las notas de crédito de venta vigentes admiten reintegro', 409);
    const pendiente = r2(Number(nota.saldoAFavorUsd) - Number(nota.reintegradoUsd));
    const monto = r2(montoUsd);
    if (!(monto > 0)) throw new ErrorNota('Indica el monto a reintegrar');
    if (monto > pendiente + 0.005) throw new ErrorNota(`Solo hay ${pendiente.toFixed(2)} USD por reintegrar en esta nota`, 409);
    if (!(Number(tasa) > 0)) throw new ErrorNota('Tasa de cambio inválida');

    let cat = await CategoriaFinanciera.findOne({ where: { nombre: 'Devoluciones a clientes' }, transaction: t });
    if (!cat) cat = await CategoriaFinanciera.create({ nombre: 'Devoluciones a clientes', tipo: 'GASTO' }, { transaction: t });
    await MovimientoFinanciero.create({
        tipo: 'GASTO', fecha: hoyCaracas(), metodoPago: metodoPago || 'Transferencia', referencia: referencia || `Reintegro ${nota.numeroDocumento}`,
        montoUsd: monto, tasaBcvAplicada: tasa, montoVes: aBolivares(monto, Number(tasa)),
        descripcion: `Reintegro al cliente por la ${ETIQUETA[nota.tipo].toLowerCase()} ${nota.numeroDocumento}`, categoriaId: cat.id, ventaId: nota.ventaId,
    }, { transaction: t });
    nota.reintegradoUsd = r2(Number(nota.reintegradoUsd) + monto);
    await nota.save({ transaction: t });
    return nota;
}

// ------------------------------------------------------------------ diferencial cambiario (factura emitida a crédito, pagada a otra tasa)
// La factura se emitió en Bs con la tasa de ese día; cuando el cliente paga, el dólar vale más. El monto en dólares no cambia (no toca la
// cuenta por cobrar): la nota de débito solo documenta ante el SENIAT la diferencia en bolívares (tasa del pago − tasa de la factura), repartida
// entre base, exento e IVA en la misma proporción de la factura. Va en bolívares y con la tasa de hoy.
export const textoDiferencial = (numeroFactura) => `Nota de débito correspondiente a diferencial cambiario que afecta a la factura número ${numeroFactura}`;

/** Cuánto se puede cobrar de diferencial hoy y cómo se reparte. `usdSolicitado` (opcional): tramo de la factura, en dólares, que se está pagando. */
export async function calcularDiferencial({ venta, tasaHoy, usdSolicitado, transaction }) {
    const tasaFactura = Number(venta.tasaCambio) || 1;
    const base = { tasaFactura, tasaHoy: Number(tasaHoy) || 0, puede: false, motivoNo: null };
    if (venta.tipoDocumento !== 'FACTURA') return { ...base, motivoNo: 'El diferencial cambiario se emite sobre una factura' };
    if (venta.statusDespacho === 'Cancelado') return { ...base, motivoNo: 'La factura está anulada' };
    if (venta.moneda !== 'USD') return { ...base, motivoNo: 'La factura está en bolívares: no hay diferencial que cobrar' };

    const previas = await NotaFiscal.findAll({ where: { ventaId: venta.id, esDiferencial: true, estado: 'EMITIDA' }, attributes: ['diferencialUsd'], transaction });
    const totalUsd = r2(venta.totalFinal);
    const cubiertoUsd = r2(previas.reduce((a, n) => a + Number(n.diferencialUsd), 0));
    const disponibleUsd = r2(Math.max(0, totalUsd - cubiertoUsd));
    const cxc = await CuentaPorCobrar.findOne({ where: { ventaId: venta.id }, attributes: ['saldoPendiente', 'moneda', 'notaId'], transaction });
    const saldoUsd = cxc && !cxc.notaId ? (cxc.moneda === 'BS' ? aDolares(Number(cxc.saldoPendiente), tasaFactura) : r2(cxc.saldoPendiente)) : 0;
    const datos = { ...base, totalUsd, cubiertoUsd, disponibleUsd, saldoUsd };

    const difTasa = r2(datos.tasaHoy - tasaFactura);
    if (!(datos.tasaHoy > 0)) return { ...datos, motivoNo: 'No hay una tasa BCV vigente registrada' };
    if (!(difTasa > 0)) return { ...datos, motivoNo: `La tasa de hoy (${datos.tasaHoy.toFixed(2)}) no es mayor que la de la factura (${tasaFactura.toFixed(2)}): no hay diferencial a favor` };
    if (!(disponibleUsd > 0.005)) return { ...datos, motivoNo: 'Ya se emitió el diferencial de toda la factura' };

    const usd = usdSolicitado === undefined || usdSolicitado === null || usdSolicitado === '' ? (saldoUsd > 0.005 ? Math.min(saldoUsd, disponibleUsd) : disponibleUsd) : r2(usdSolicitado);
    if (!(usd > 0)) return { ...datos, usd, motivoNo: 'Indica cuántos dólares de la factura se están pagando' };
    if (usd > disponibleUsd + 0.005) return { ...datos, usd, motivoNo: `Solo quedan ${disponibleUsd.toFixed(2)} USD de la factura sin diferencial` };

    const detalles = await VentaDetalle.findAll({ where: { ventaId: venta.id }, attributes: ['subtotal', 'aplicaIva'], transaction });
    const gravadaUsd = detalles.filter((d) => d.aplicaIva).reduce((a, d) => a + Number(d.subtotal), 0);
    const f = usd / totalUsd;
    const total = r2(usd * difTasa);
    const iva = Math.min(total, r2(Number(venta.montoIva) * f * difTasa));
    const baseImponible = iva > 0 ? Math.min(r2(total - iva), r2(gravadaUsd * f * difTasa)) : 0;
    const exento = r2(total - baseImponible - iva);
    if (!(total > 0)) return { ...datos, usd, motivoNo: 'La diferencia es menor a un céntimo' };
    return { ...datos, usd, difTasa, total, baseImponible, exento, iva, puede: true };
}

/** Emite la nota de débito de diferencial cambiario (fiscal: entra al libro de ventas). No mueve la cuenta por cobrar. */
export async function emitirNotaDiferencial({ venta, tasaHoy, usdSolicitado, usuarioId = null, transaction: t }) {
    const c = await calcularDiferencial({ venta, tasaHoy, usdSolicitado, transaction: t });
    if (!c.puede) throw new ErrorNota(c.motivoNo || 'No se puede emitir el diferencial', 409);
    if (!venta.clienteId) throw new ErrorNota('Una nota de débito necesita que la factura tenga cliente', 409);

    const texto = textoDiferencial(venta.numeroDocumento);
    const numero = await siguienteNumeroNota('DEBITO', t);
    const nota = await NotaFiscal.create({
        tipo: 'DEBITO', origen: 'VENTA', numeroDocumento: numero, fecha: hoyCaracas(), ventaId: venta.id, clienteId: venta.clienteId,
        moneda: 'BS', tasaCambio: c.tasaHoy, subtotal: r2(c.baseImponible + c.exento), baseImponible: c.baseImponible, montoExento: c.exento,
        montoIva: c.iva, alicuotaIva: REGLAS.alicuotaGeneral, totalFinal: c.total, motivo: texto, esDiferencial: true, diferencialUsd: c.usd, registradoPorId: usuarioId,
    }, { transaction: t });
    const renglones = [];
    if (c.baseImponible > 0) renglones.push({ monto: c.baseImponible, aplicaIva: true });
    if (c.exento > 0) renglones.push({ monto: c.exento, aplicaIva: false });
    await NotaFiscalDetalle.bulkCreate(renglones.map((r) => ({
        notaId: nota.id, descripcion: texto, cantidad: 1, precioUnitario: r.monto, aplicaIva: r.aplicaIva,
        porcentajeIva: r.aplicaIva ? REGLAS.alicuotaGeneral : 0, subtotal: r.monto,
    })), { transaction: t });
    return nota;
}
