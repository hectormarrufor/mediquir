// Corregir o eliminar una factura de venta que TODAVÍA NO se imprimió en la forma libre (Ventas.impresaAt vacío).
// Solo el usuario 1 y «jolexi». Una vez impresa, la factura solo se corrige con notas de crédito o débito.
// Imports relativos con extensión (sin alias "@/") para poder probarlo con un script de Node.
//
//  · MODIFICAR: renglones (agregar, quitar, cantidades, precios), condición de pago (contado <-> crédito) y días de crédito. Se rehacen los
//    efectos: totales, inventario, ingresos de caja (contado) o cuenta por cobrar (crédito) y la línea de comisión del vendedor externo.
//  · ELIMINAR: borra la factura con todo su rastro (como la eliminación de la última venta) y devuelve su número y su control si eran los últimos.
// No se corrige una factura con abonos, retenciones, notas de crédito/débito, pago móvil enlazado ni comisión ya pagada, ni una que salió de otro
// documento (nota de entrega o recibo): para esas está la anulación con nota de crédito.
import db from '../../../models/index.js';
import { calcularFactura, aBolivares, aDolares, REGLAS } from '../../constants/facturacion.js';
import { CONFIG_FISCAL } from '../../constants/empresa.js';
import { fechaCaracas } from '../../constants/hora.js';
import { asegurarComisionFactura } from './comisionesPago.js';
import { eliminarVenta } from '../ventas/_eliminar.js';

const {
    sequelize, User, Venta, VentaDetalle, Producto, SalidaInventario, MovimientoFinanciero, CategoriaFinanciera, CuentaPorCobrar, Abono, RetencionIva,
    NotaFiscal, PagoSms, ComisionVenta, Cliente, Correlativo,
} = db;
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export class ErrorCorreccion extends Error {
    constructor(mensaje, status = 400) { super(mensaje); this.status = status; }
}

/** Usuario 1 o «jolexi». */
export async function puedeCorregirFacturas(sesion) {
    if (!sesion || sesion.clienteId) return false;
    if (Number(sesion.id) === 1) return true;
    const u = await User.findByPk(Number(sesion.id), { attributes: ['id', 'user'] });
    return String(u?.user || '').trim().toLowerCase() === 'jolexi';
}

/** ¿Ya se imprimió en la forma libre? Falla con un mensaje claro si la columna aún no existe (migración sin correr). */
export async function estaImpresa(ventaId, transaction) {
    try {
        const [f] = await sequelize.query('SELECT "impresaAt" FROM "Ventas" WHERE id = :id', { replacements: { id: ventaId }, type: sequelize.QueryTypes.SELECT, transaction });
        return Boolean(f?.impresaAt);
    } catch (e) {
        if (e?.original?.code === '42703' || /impresaAt/.test(e?.message || '')) throw new ErrorCorreccion('Falta correr la migración factura-impresa (columna impresaAt)', 409);
        throw e;
    }
}

/** Marca la factura como impresa (la primera vez). No falla si la migración no se ha corrido. */
export async function marcarImpresa(ventaId) {
    try {
        await sequelize.query('UPDATE "Ventas" SET "impresaAt" = now() WHERE id = :id AND "impresaAt" IS NULL AND "tipoDocumento" = \'FACTURA\'', { replacements: { id: ventaId } });
    } catch (e) { console.error('No se pudo marcar la factura como impresa:', e.message); }
}

/** Mensaje de por qué la factura no se puede corregir (null si se puede). Bloquea las filas con FOR UPDATE si hay transacción. */
export async function bloqueoCorreccion(venta, transaction) {
    if (venta.tipoDocumento !== 'FACTURA') return 'Solo se corrigen facturas';
    if (venta.statusDespacho === 'Cancelado') return 'La factura está anulada';
    if (await estaImpresa(venta.id, transaction)) return 'Esta factura ya se imprimió en la forma libre: para corregirla usa una nota de crédito o débito';
    if (venta.numeroDocumentoAnterior) return `Esta factura salió de otro documento (${venta.numeroDocumentoAnterior}): para corregirla usa la anulación con nota de crédito`;
    const where = { ventaId: venta.id };
    const [abonos, retenciones, notas, pagos, pagadas] = await Promise.all([
        Abono.count({ where, transaction }), RetencionIva.count({ where, transaction }), NotaFiscal.count({ where, transaction }),
        PagoSms.count({ where, transaction }), ComisionVenta.count({ where: { ventaId: venta.id, [db.Sequelize.Op.or]: [{ estatusComision: 'PAGADA' }, { concepto: { [db.Sequelize.Op.ne]: 'FACTURA' } }] }, transaction }),
    ]);
    if (abonos) return 'La factura ya tiene abonos registrados';
    if (retenciones) return 'La factura ya tiene una retención de IVA registrada';
    if (notas) return 'La factura ya tiene notas de crédito o débito';
    if (pagos) return 'La factura tiene un pago móvil enlazado';
    if (pagadas) return 'Al vendedor ya se le generó o pagó comisión de esta factura';
    return null;
}

const mismaLista = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export async function modificarFactura({ venta, condicionPago, diasCredito, metodoPago, referencia, detalles, transaction: t }) {
    const bloqueo = await bloqueoCorreccion(venta, t);
    if (bloqueo) throw new ErrorCorreccion(bloqueo, 409);

    const actuales = await VentaDetalle.findAll({ where: { ventaId: venta.id }, order: [['createdAt', 'ASC'], ['id', 'ASC']], transaction: t });
    const condAntes = venta.condicionPago;
    const condNueva = condicionPago || condAntes;
    if (!['Contado', 'Credito'].includes(condNueva)) throw new ErrorCorreccion('Condición de pago inválida');
    if (condNueva === 'Credito' && !venta.clienteId) throw new ErrorCorreccion('Una factura a crédito requiere un cliente');

    // ---- 1. Renglones
    let cambiaronRenglones = false;
    let factura = null;
    let nuevos = null;
    if (Array.isArray(detalles)) {
        if (!detalles.length) throw new ErrorCorreccion('La factura necesita al menos un renglón');
        if (detalles.length > CONFIG_FISCAL.maxRenglonesFactura) throw new ErrorCorreccion(`Una factura admite hasta ${CONFIG_FISCAL.maxRenglonesFactura} renglones (la forma libre no da para más)`);
        const productos = new Map();
        for (const d of detalles) {
            if (d.isFicticio) { if (!String(d.nombreFicticio || '').trim()) throw new ErrorCorreccion('Un renglón escrito a mano necesita su descripción'); continue; }
            if (!productos.has(Number(d.productoId))) {
                const p = await Producto.findByPk(Number(d.productoId), { transaction: t, lock: t.LOCK.UPDATE });
                if (!p) throw new ErrorCorreccion(`Producto no encontrado (id ${d.productoId})`);
                productos.set(Number(d.productoId), p);
            }
        }
        const entrada = detalles.map((d) => {
            if (!(Number(d.precioUnitario) > 0)) throw new ErrorCorreccion('Todos los renglones deben tener un precio mayor a 0');
            const p = d.isFicticio ? null : productos.get(Number(d.productoId));
            const alicuota = p ? Number(p.porcentajeIva) || 0 : REGLAS.alicuotaGeneral;
            return { precioUnitario: d.precioUnitario, cantidad: d.cantidad, aplicaIva: Boolean(d.aplicaIva) && alicuota > 0, porcentajeIva: alicuota };
        });
        try { factura = calcularFactura({ renglones: entrada, costoFlete: Number(venta.costoFlete) || 0 }); } catch (e) { throw new ErrorCorreccion(e.message); }
        const firma = (l) => l.map((x) => [x.isFicticio ? `F:${x.nombreFicticio}` : Number(x.productoId), Number(x.cantidad), Number(Number(x.precioUnitario).toFixed(4)), Boolean(x.aplicaIva)]);
        const nuevasFirma = detalles.map((d, i) => ({ ...d, precioUnitario: factura.renglones[i].precioUnitario, cantidad: factura.renglones[i].cantidad, aplicaIva: factura.renglones[i].aplicaIva }));
        cambiaronRenglones = !mismaLista(firma(actuales.map((a) => a.toJSON())), firma(nuevasFirma));
        nuevos = { detalles, productos, factura };
    }

    if (cambiaronRenglones) {
        const { productos } = nuevos;
        const detal = venta.tipoVenta !== 'MAYOR';
        const salidas = await SalidaInventario.findAll({ where: { ventaId: venta.id }, transaction: t });
        if (!detal && (venta.empacadoAt || venta.statusDespacho !== 'Pendiente' || salidas.some((s) => s.estado !== 'Pendiente'))) {
            throw new ErrorCorreccion('El pedido ya se empacó o despachó: los renglones ya no se pueden cambiar (usa una nota de crédito o débito)', 409);
        }
        // Lo que el detal ya descontó se devuelve y se vuelve a descontar con los renglones nuevos
        if (detal) {
            for (const a of actuales) {
                if (a.isFicticio || a.afectaInventario === false || !a.productoId) continue;
                const p = await Producto.findByPk(a.productoId, { transaction: t, lock: t.LOCK.UPDATE });
                if (!p) continue;
                if (p.inventarioAuditado) p.stockAlmacen = Number(p.stockAlmacen) + Number(a.cantidad);
                p.nroVentas = Math.max(0, (Number(p.nroVentas) || 0) - Number(a.cantidad));
                await p.save({ transaction: t });
            }
        }
        const presentaciones = new Map(actuales.filter((a) => a.presentacionPedida).map((a) => [`${a.productoId}:${Number(a.cantidad)}`, a]));
        const solicitadoPorId = salidas[0]?.solicitadoPorId || null;
        await SalidaInventario.destroy({ where: { ventaId: venta.id }, transaction: t });
        await VentaDetalle.destroy({ where: { ventaId: venta.id }, transaction: t });
        for (let i = 0; i < nuevos.detalles.length; i++) {
            const item = nuevos.detalles[i];
            const r = nuevos.factura.renglones[i];
            const pres = item.isFicticio ? null : presentaciones.get(`${item.productoId}:${r.cantidad}`);
            await VentaDetalle.create({
                ventaId: venta.id, productoId: item.isFicticio ? null : Number(item.productoId), isFicticio: Boolean(item.isFicticio),
                nombreFicticio: item.isFicticio ? String(item.nombreFicticio).trim() : null, aplicaIva: r.aplicaIva,
                afectaInventario: item.isFicticio ? false : item.afectaInventario !== false, cantidad: r.cantidad,
                presentacionPedida: pres?.presentacionPedida || null, cantidadPresentacion: pres?.cantidadPresentacion || null, unidadesPorPresentacion: pres?.unidadesPorPresentacion || null,
                precioUnitario: r.precioUnitario, subtotal: r.monto,
            }, { transaction: t });
            if (item.isFicticio || item.afectaInventario === false) continue;
            const p = productos.get(Number(item.productoId));
            if (detal) {
                const stock = Number(p.stockAlmacen) || 0;
                if (p.inventarioAuditado) {
                    if (stock < r.cantidad) throw new ErrorCorreccion(`Inventario insuficiente: ${p.nombre} (disponible ${stock})`);
                    p.stockAlmacen = stock - r.cantidad;
                }
                p.nroVentas = (Number(p.nroVentas) || 0) + r.cantidad;
                await p.save({ transaction: t });
            }
            await SalidaInventario.create({
                ventaId: venta.id, productoId: p.id, cantidad: r.cantidad, costoAlMomento: Number(p.costoUsd) || 0,
                justificacion: `Venta ${venta.numeroDocumento}`, estado: detal ? 'Entregada' : 'Pendiente', solicitadoPorId,
            }, { transaction: t });
        }
        venta.subtotal = factura.subtotal; venta.montoIva = factura.montoIva; venta.totalFinal = factura.totalFinal;
    }

    // ---- 2. Pago: contado (ingresos en caja) o crédito (cuenta por cobrar con su vencimiento)
    const base = venta.fechaEmision || venta.createdAt;
    const cxcAntes = await CuentaPorCobrar.findOne({ where: { ventaId: venta.id }, transaction: t });
    let dias = null;
    if (condNueva === 'Credito') {
        const pedidos = Number(diasCredito);
        if (diasCredito !== undefined && diasCredito !== null && diasCredito !== '') {
            if (!Number.isInteger(pedidos) || pedidos < 0 || pedidos > 365) throw new ErrorCorreccion('Los días de crédito deben ser un entero entre 0 y 365');
            dias = pedidos;
        } else if (condAntes === 'Credito' && venta.fechaVencimiento) {
            dias = Math.round((new Date(venta.fechaVencimiento).getTime() - new Date(base).getTime()) / 86400000);
        } else {
            const c = await Cliente.findByPk(venta.clienteId, { attributes: ['diasCredito'], transaction: t });
            dias = Number(c?.diasCredito) > 0 ? Number(c.diasCredito) : 15;
        }
    }
    const venceAntes = venta.fechaVencimiento ? fechaCaracas(venta.fechaVencimiento) : null;
    const venceNuevo = condNueva === 'Credito' ? fechaCaracas(new Date(new Date(base).getTime() + dias * 86400000)) : null;
    const cambiaPago = condNueva !== condAntes || cambiaronRenglones || venceNuevo !== venceAntes || (condNueva === 'Contado' && (metodoPago || referencia));
    if (cambiaPago) {
        const previos = await MovimientoFinanciero.findAll({ where: { ventaId: venta.id, tipo: 'INGRESO' }, transaction: t });
        const metodo = metodoPago || previos[0]?.metodoPago || 'No especificado';
        const ref = referencia ?? previos[0]?.referencia ?? null;
        await MovimientoFinanciero.destroy({ where: { ventaId: venta.id }, transaction: t });
        await CuentaPorCobrar.destroy({ where: { ventaId: venta.id }, transaction: t });
        const moneda = venta.moneda;
        const tasa = Number(venta.tasaCambio) || 1;
        if (condNueva === 'Contado') {
            const aUsd = (v) => (moneda === 'USD' ? v : aDolares(v, tasa));
            const aBs = (v) => (moneda === 'BS' ? v : aBolivares(v, tasa));
            const fecha = fechaCaracas(base);
            let catVentas = await CategoriaFinanciera.findOne({ where: { nombre: 'Ingresos por Ventas' }, transaction: t });
            if (!catVentas) catVentas = await CategoriaFinanciera.create({ nombre: 'Ingresos por Ventas', tipo: 'INGRESO' }, { transaction: t });
            const flete = Number(venta.costoFlete) || 0;
            const ingreso = Number((Number(venta.subtotal) + flete).toFixed(2));
            await MovimientoFinanciero.create({
                tipo: 'INGRESO', fecha, metodoPago: metodo, referencia: ref, montoUsd: aUsd(ingreso), tasaBcvAplicada: tasa, montoVes: aBs(ingreso),
                descripcion: `Venta ${venta.numeroDocumento} (Subtotal${flete > 0 ? ' + flete' : ''})`, categoriaId: catVentas.id, ventaId: venta.id,
            }, { transaction: t });
            if (Number(venta.montoIva) > 0) {
                let catIva = await CategoriaFinanciera.findOne({ where: { nombre: 'IVA Recaudado' }, transaction: t });
                if (!catIva) catIva = await CategoriaFinanciera.create({ nombre: 'IVA Recaudado', tipo: 'INGRESO' }, { transaction: t });
                await MovimientoFinanciero.create({
                    tipo: 'INGRESO', fecha, metodoPago: metodo, referencia: ref, montoUsd: aUsd(Number(venta.montoIva)), tasaBcvAplicada: tasa, montoVes: aBs(Number(venta.montoIva)),
                    descripcion: `IVA de Venta ${venta.numeroDocumento} (Impuesto SENIAT)`, categoriaId: catIva.id, ventaId: venta.id,
                }, { transaction: t });
            }
            venta.condicionPago = 'Contado'; venta.statusPago = 'Pagado'; venta.fechaVencimiento = null;
        } else {
            await CuentaPorCobrar.create({
                clienteId: venta.clienteId, ventaId: venta.id, montoTotal: venta.totalFinal, saldoPendiente: venta.totalFinal, moneda, tasaCambio: tasa,
                fechaVencimiento: venceNuevo, estado: 'Pendiente',
            }, { transaction: t });
            venta.condicionPago = 'Credito'; venta.statusPago = 'Pendiente'; venta.fechaVencimiento = new Date(new Date(base).getTime() + dias * 86400000);
        }
    }
    await venta.save({ transaction: t });

    // ---- 3. Comisión del vendedor externo: la línea de la factura sigue sus totales y su vencimiento (o nace si el cliente es de un vendedor)
    const lineas = await ComisionVenta.findAll({ where: { ventaId: venta.id, concepto: 'FACTURA' }, transaction: t });
    if (!lineas.length) {
        await asegurarComisionFactura({ venta, transaction: t });
    } else if (cambiaPago) {
        const tasa = Number(venta.tasaCambio) || 1;
        const enUsd = (m) => (venta.moneda === 'BS' ? r2(Number(m) / tasa) : r2(m));
        for (const l of lineas) {
            const baseUsd = enUsd(venta.subtotal);
            await l.update({ montoUsd: enUsd(venta.totalFinal), baseUsd, comisionUsd: r2((baseUsd * Number(l.porcentaje || 0)) / 100), vencimiento: venta.fechaVencimiento ? fechaCaracas(venta.fechaVencimiento) : null }, { transaction: t });
        }
    }
    return { numeroDocumento: venta.numeroDocumento, condicionPago: venta.condicionPago, totalFinal: Number(venta.totalFinal), fechaVencimiento: venta.fechaVencimiento ? fechaCaracas(venta.fechaVencimiento) : null, renglonesCambiados: cambiaronRenglones };
}

/** Elimina la factura sin imprimir con todo su rastro. Devuelve lo que `eliminarVenta` y los archivos del Blob por borrar. */
export async function eliminarFacturaSinImprimir({ venta, transaction: t }) {
    const bloqueo = await bloqueoCorreccion(venta, t);
    if (bloqueo) throw new ErrorCorreccion(bloqueo, 409);
    const control = /^00-(\d+)$/.exec(String(venta.numeroControl || ''));
    const resultado = await eliminarVenta({ venta, transaction: t });
    // La forma libre no se gastó: si su control era el último tomado, el correlativo retrocede para reutilizarlo
    let controlLiberado = false;
    if (control) {
        const n = Number(control[1]);
        const c = await Correlativo.findOne({ where: { prefijo: 'CONTROL' }, transaction: t, lock: t.LOCK.UPDATE });
        if (c && Number(c.siguienteNumero) === n + 1) { c.siguienteNumero = n; await c.save({ transaction: t }); controlLiberado = true; }
    }
    return { ...resultado, controlLiberado, control: venta.numeroControl };
}
