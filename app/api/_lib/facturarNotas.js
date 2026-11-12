// Facturar notas de entrega: VARIAS notas -> UNA factura, UNA nota con muchos renglones -> VARIAS facturas (la forma libre solo admite
// CONFIG_FISCAL.maxRenglonesFactura renglones), o las dos cosas a la vez. Lo usa «Pasar a factura» de una nota de entrega.
// Imports relativos con extensión (sin alias "@/") para poder probarlo con un script de Node.
//
//  · Los renglones salen de las notas. Una nota migrada que solo tiene el total (sin renglones) necesita que se escriban, y deben sumar
//    exactamente lo que dice la nota (base sin IVA + exento).
//  · Se reparten en orden en facturas de hasta `porFactura` renglones. Cada factura toma el siguiente F- (o el número que ya tiene en el
//    sistema anterior), su número de control, la fecha de emisión y la tasa de ese día; en dólares, con el IVA de cada producto.
//  · Las notas quedan anuladas (conservan su número y sus renglones como historia) y cada factura enlaza las notas de las que salió en
//    `numeroDocumentoAnterior` ("NE-06610, NE-06614").
//  · Deuda: cada factura lleva su cuenta por cobrar en dólares (lo de la nota más el IVA) y vence a los días de crédito del cliente; las
//    cuentas de las notas desaparecen. Con abonos ya registrados solo se emite UNA factura (los abonos pasan a ella): repartirlos entre
//    varias no tiene una sola respuesta correcta.
//  · Inventario: lo que ya salió con la nota no se vuelve a descontar (sus salidas pasan a la factura). Lo que nunca salió (notas migradas
//    sin renglones o con renglones que no movieron inventario) sale con la factura; como la mercancía ya se entregó, si el sistema no tiene
//    suficiente se descuenta lo que hay (el stock nunca queda negativo, igual que al empacar lo conseguido afuera) y se avisa el faltante.
//  · Comisiones: si las notas eran de un vendedor a comisión, su línea pasa a una por factura (base sin IVA × su %).
//  · Una sola nota que cabe en una factura y no tiene inventario pendiente sigue el camino de siempre (convertirNotaEntregaAFactura),
//    que además acompaña un pedido que todavía no se ha despachado.
import db from '../../../models/index.js';
import { calcularFactura, REGLAS } from '../../constants/facturacion.js';
import { CONFIG_FISCAL } from '../../constants/empresa.js';
import { unirAnteriores } from '../../constants/documentosAnteriores.js';
import { recalcularCobro } from './retencionesVenta.js';
import { asegurarComisionFactura } from './comisionesPago.js';
import { controlAlNacer } from './numeracion.js';
import { ErrorConversion, fechaEmisionDe, siguienteNumeroFactura, convertirNotaEntregaAFactura } from './convertirFactura.js';

const { sequelize, Venta, VentaDetalle, Producto, CuentaPorCobrar, Abono, ComisionVenta, SalidaInventario, NotaFiscal, Cliente } = db;

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const MAX_RENGLONES = CONFIG_FISCAL.maxRenglonesFactura;
const fechaDe = (v) => new Date(v.fechaEmision || v.createdAt).getTime();
const diaCaracas = (fecha) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(fecha);

// Ya salió del inventario con la nota: el detal y la tienda descuentan al vender; el mayor, al empacar
const yaSalio = (nota, d) => !d.isFicticio && Boolean(d.productoId) && d.afectaInventario !== false
    && (['DETAL', 'ONLINE'].includes(nota.tipoVenta) || ['Empacado', 'Completado'].includes(nota.statusDespacho) || Boolean(nota.empacadoAt));

/** Carga y valida las notas (bloqueadas dentro de la transacción) con todo lo que cuelga de ellas. Ordenadas por fecha. */
export async function cargarNotas(ids, transaction) {
    const unicos = [...new Set((ids || []).map(String).filter(Boolean))];
    if (!unicos.length) throw new ErrorConversion('Elige al menos una nota de entrega');
    const notas = await Venta.findAll({ where: { id: unicos }, transaction, lock: transaction?.LOCK.UPDATE });
    if (notas.length !== unicos.length) throw new ErrorConversion('Alguna de las notas no existe', 404);
    const [detalles, cuentas, abonos, comisiones, fiscales] = await Promise.all([
        VentaDetalle.findAll({ where: { ventaId: unicos }, include: [{ model: Producto, as: 'producto', attributes: ['id', 'codigo', 'nombre', 'porcentajeIva', 'stockAlmacen'] }], transaction }),
        CuentaPorCobrar.findAll({ where: { ventaId: unicos }, transaction, lock: transaction?.LOCK.UPDATE }),
        Abono.findAll({ where: { ventaId: unicos }, attributes: ['id', 'ventaId'], transaction }),
        ComisionVenta.findAll({ where: { ventaId: unicos }, transaction }),
        NotaFiscal.findAll({ where: { ventaId: unicos }, attributes: ['id', 'ventaId'], transaction }),
    ]);
    const por = (lista) => { const m = new Map(); for (const x of lista) (m.get(x.ventaId) || m.set(x.ventaId, []).get(x.ventaId)).push(x); return m; };
    const [dP, cP, aP, kP, fP] = [por(detalles), por(cuentas), por(abonos), por(comisiones), por(fiscales)];

    const clienteId = notas[0].clienteId;
    for (const n of notas) {
        const num = n.numeroDocumento;
        if (n.tipoDocumento !== 'NOTA_ENTREGA') throw new ErrorConversion(`${num} no es una nota de entrega`, 409);
        if (n.statusDespacho === 'Cancelado') throw new ErrorConversion(`${num} está anulada o ya pasó a factura`, 409);
        if (n.revisionStock === 'PENDIENTE') throw new ErrorConversion(`${num} está en revisión de existencias: confírmala antes de facturar`, 409);
        if (n.moneda !== 'USD') throw new ErrorConversion(`${num} está en bolívares: no tiene diferencial que actualizar`, 409);
        if (!n.clienteId) throw new ErrorConversion(`${num} no tiene cliente: una factura necesita su cédula o RIF`, 409);
        if (n.clienteId !== clienteId) throw new ErrorConversion('Todas las notas deben ser del mismo cliente', 409);
        if (!cP.get(n.id)?.length) throw new ErrorConversion(`${num} no tiene cuenta por cobrar: así solo se facturan las notas a crédito`, 409);
    }
    notas.sort((a, b) => fechaDe(a) - fechaDe(b) || String(a.numeroDocumento).localeCompare(String(b.numeroDocumento)));
    return notas.map((venta) => ({
        venta, detalles: dP.get(venta.id) || [], cuentas: cP.get(venta.id) || [], abonos: aP.get(venta.id) || [],
        comisiones: kP.get(venta.id) || [], fiscales: fP.get(venta.id) || [],
    }));
}

/**
 * Renglones de todas las notas, en orden. Los de una nota sin renglones salen de `manuales[notaId]`:
 * [{ productoId | null, nombre, cantidad, precioUnitario (USD), exento }], y deben sumar lo que dice la nota.
 */
export async function renglonesDeNotas(cargadas, manuales = {}, transaction) {
    const lineas = [];
    for (const c of cargadas) {
        const n = c.venta;
        if (c.detalles.length) {
            for (const d of c.detalles) {
                const pct = d.isFicticio || !d.producto ? (d.aplicaIva ? REGLAS.alicuotaGeneral : 0) : (Number(d.producto.porcentajeIva) || 0);
                lineas.push({
                    notaId: n.id, nota: n.numeroDocumento, detalleId: d.id, productoId: d.productoId || null, codigo: d.producto?.codigo || null,
                    nombre: d.isFicticio ? d.nombreFicticio : d.producto?.nombre, cantidad: Number(d.cantidad), precioUnitario: Number(d.precioUnitario),
                    porcentajeIva: pct, yaSalio: yaSalio(n, d), stock: d.producto ? Number(d.producto.stockAlmacen) || 0 : null,
                    presentacionPedida: d.presentacionPedida, cantidadPresentacion: d.cantidadPresentacion, unidadesPorPresentacion: d.unidadesPorPresentacion,
                });
            }
            continue;
        }
        const propios = manuales?.[n.id];
        if (!Array.isArray(propios) || !propios.length) throw new ErrorConversion(`${n.numeroDocumento} no tiene renglones en el sistema (solo su total): escríbelos para poder facturarla`, 409);
        let suma = 0;
        for (const m of propios) {
            const cantidad = Number(m.cantidad);
            const precio = Number(m.precioUnitario);
            if (!Number.isInteger(cantidad) || cantidad < 1) throw new ErrorConversion(`${n.numeroDocumento}: la cantidad debe ser un número entero mayor a 0`);
            if (!(precio > 0)) throw new ErrorConversion(`${n.numeroDocumento}: todos los renglones deben tener precio`);
            const producto = m.productoId ? await Producto.findByPk(Number(m.productoId), { attributes: ['id', 'codigo', 'nombre', 'porcentajeIva', 'stockAlmacen'], transaction }) : null;
            if (m.productoId && !producto) throw new ErrorConversion(`${n.numeroDocumento}: un producto ya no existe`, 404);
            const nombre = producto ? producto.nombre : String(m.nombre || '').trim().slice(0, 250);
            if (!nombre) throw new ErrorConversion(`${n.numeroDocumento}: escribe el nombre del renglón que no está en el inventario`);
            suma += r2(cantidad * precio);
            lineas.push({
                notaId: n.id, nota: n.numeroDocumento, detalleId: null, productoId: producto?.id || null, codigo: producto?.codigo || null, nombre,
                cantidad, precioUnitario: precio, porcentajeIva: m.exento ? 0 : (producto ? Number(producto.porcentajeIva) || 0 : REGLAS.alicuotaGeneral),
                yaSalio: false, stock: producto ? Number(producto.stockAlmacen) || 0 : null,
            });
        }
        // La nota sin renglones guarda su base sin IVA (+ exento) en el subtotal: lo escrito tiene que dar exactamente eso
        const diferencia = r2(suma - Number(n.subtotal));
        if (Math.abs(diferencia) > 0.01) {
            throw new ErrorConversion(`Los renglones de ${n.numeroDocumento} suman $${r2(suma).toFixed(2)} y la nota es de $${Number(n.subtotal).toFixed(2)} (${diferencia > 0 ? 'sobran' : 'faltan'} $${Math.abs(diferencia).toFixed(2)})`, 409);
        }
    }
    return lineas;
}

/** Reparte los renglones en orden en facturas de hasta `porFactura` renglones (lo que cabe en la forma libre). */
export function repartir(lineas, porFactura = MAX_RENGLONES) {
    const n = Math.min(MAX_RENGLONES, Math.max(1, Math.floor(Number(porFactura) || MAX_RENGLONES)));
    const grupos = [];
    for (let i = 0; i < lineas.length; i += n) grupos.push(lineas.slice(i, i + n));
    return grupos;
}

const calcular = (lineas) => calcularFactura({ renglones: lineas.map((l) => ({ precioUnitario: l.precioUnitario, cantidad: l.cantidad, aplicaIva: l.porcentajeIva > 0, porcentajeIva: l.porcentajeIva })) });

/** Una sola nota que cabe en una factura y no tiene inventario por sacar: sigue la conversión de siempre. */
function esConversionSimple(cargadas, lineas, grupos, moverInventario) {
    return cargadas.length === 1 && cargadas[0].detalles.length > 0 && grupos.length === 1
        && !(moverInventario && lineas.some((l) => l.productoId && !l.yaSalio));
}

/** Plan para la pantalla: renglones, facturas con sus totales en dólares y bolívares y avisos. No guarda nada. */
export async function planFacturacion({ notaIds, manuales, porFactura, tasa, moverInventario = true, transaction }) {
    const cargadas = await cargarNotas(notaIds, transaction);
    const lineas = await renglonesDeNotas(cargadas, manuales, transaction);
    const grupos = repartir(lineas, porFactura);
    const simple = esConversionSimple(cargadas, lineas, grupos, moverInventario);
    const avisos = [];
    const abonos = cargadas.reduce((a, c) => a + c.abonos.length, 0);
    if (grupos.length > 1 && abonos) avisos.push({ bloquea: true, texto: 'Las notas tienen abonos registrados: así solo se pueden pasar a UNA factura. Junta menos renglones o factura las notas por separado.' });
    if (!simple && cargadas.some((c) => c.venta.statusDespacho !== 'Completado')) avisos.push({ bloquea: true, texto: 'Para juntar o dividir notas en facturas, todas deben estar entregadas (despachadas).' });
    const vendedores = new Set(cargadas.flatMap((c) => c.comisiones.filter((k) => k.concepto === 'FACTURA').map((k) => k.vendedorId)));
    if (vendedores.size > 1) avisos.push({ bloquea: true, texto: 'Las notas son de vendedores distintos: factúralas por separado para no mezclar sus comisiones.' });
    const faltantes = moverInventario ? lineas.filter((l) => l.productoId && !l.yaSalio && l.stock !== null && l.stock < l.cantidad).map((l) => ({ nombre: l.nombre, codigo: l.codigo, hay: l.stock, salen: l.cantidad })) : [];
    return {
        simple, maxRenglones: MAX_RENGLONES, tasa: Number(tasa) || null,
        notas: cargadas.map((c) => ({ id: c.venta.id, numero: c.venta.numeroDocumento, fecha: c.venta.fechaEmision || c.venta.createdAt, subtotal: Number(c.venta.subtotal), totalUsd: Number(c.venta.totalFinal), saldoUsd: c.cuentas.reduce((a, x) => a + Number(x.saldoPendiente), 0), renglones: c.detalles.length, abonos: c.abonos.length })),
        renglones: lineas.map(({ notaId, detalleId, ...l }) => l),
        facturas: grupos.map((g) => {
            const calc = calcular(g);
            return { renglones: g.length, notas: unirAnteriores(g.map((l) => l.nota)), subtotal: calc.subtotal, exento: calc.exento, base: calc.baseImponible, iva: calc.montoIva, totalUsd: calc.totalFinal, totalBs: tasa ? r2(calc.totalFinal * Number(tasa)) : null };
        }),
        porSacar: moverInventario ? lineas.filter((l) => l.productoId && !l.yaSalio).length : 0,
        faltantes, avisos,
    };
}

/**
 * Emite las facturas de unas notas YA cargadas (`cargarNotas`) con los renglones ya repartidos. No hace commit.
 *   grupos: [{ renglones: [línea de renglonesDeNotas o escrita igual, con precioUnitario en `moneda`], numero?, control?, totalUsd? }]
 *   moneda 'USD' (lo normal) o 'BS' (copia exacta de una factura del sistema anterior impresa en bolívares, con sus precios en bolívares).
 *   totalUsd: el total en dólares impreso en la copia (si no, el total entre la tasa).
 */
export async function emitirFacturasDeNotas({ cargadas, grupos, moneda = 'USD', tasa, fecha = null, vence = null, moverInventario = true, usuarioId = null, transaction: t }) {
    if (!(Number(tasa) > 0)) throw new ErrorConversion('No hay una tasa BCV registrada para la fecha de la factura', 409);
    if (!grupos.length || grupos.some((g) => !g.renglones.length)) throw new ErrorConversion('Cada factura necesita al menos un renglón');
    if (grupos.some((g) => g.renglones.length > MAX_RENGLONES)) throw new ErrorConversion(`Una factura admite hasta ${MAX_RENGLONES} renglones (lo que cabe en la forma libre)`);
    const abonos = cargadas.reduce((a, c) => a + c.abonos.length, 0);
    if (grupos.length > 1 && abonos) throw new ErrorConversion('Las notas tienen abonos registrados: así solo se pueden pasar a UNA factura', 409);
    if (cargadas.some((c) => c.venta.statusDespacho !== 'Completado')) throw new ErrorConversion('Para juntar o dividir notas en facturas, todas deben estar entregadas (despachadas)', 409);
    const comisionesFactura = cargadas.flatMap((c) => c.comisiones.filter((k) => k.concepto === 'FACTURA'));
    if (new Set(comisionesFactura.map((k) => k.vendedorId)).size > 1) throw new ErrorConversion('Las notas son de vendedores distintos: factúralas por separado', 409);
    if (comisionesFactura.some((k) => k.estatusComision === 'PAGADA')) throw new ErrorConversion('Al vendedor ya se le pagó la comisión de alguna de estas notas: pásalas a factura una por una', 409);

    const primera = cargadas[0].venta;
    const notaPorId = new Map(cargadas.map((c) => [c.venta.id, c.venta]));
    const tasaNum = Number(tasa);
    const emision = fechaEmisionDe(fecha);
    const cliente = await Cliente.findByPk(primera.clienteId, { attributes: ['id', 'diasCredito'], transaction: t });
    const venceEl = vence ? new Date(`${vence}T12:00:00-04:00`) : new Date(emision.getTime() + (Number(cliente?.diasCredito) > 0 ? Number(cliente.diasCredito) : 7) * 86400000);
    const observaciones = unirAnteriores(cargadas.flatMap((c) => c.cuentas.map((x) => x.observacion)));
    const enUsd = (bs) => (moneda === 'BS' ? r2(bs / tasaNum) : r2(bs));
    const sql = (texto, reemplazos) => sequelize.query(texto, { replacements: reemplazos, transaction: t });

    const emitidas = [];
    const faltantes = [];
    for (const g of grupos) {
        const calc = calcular(g.renglones);
        const numero = await siguienteNumeroFactura(t, g.numero ?? null);
        const anteriores = unirAnteriores(g.renglones.map((l) => notaPorId.get(l.notaId)?.numeroDocumento).sort());
        if (anteriores.length > 255) throw new ErrorConversion('Son demasiadas notas para una sola factura');
        const factura = await Venta.create({
            clienteId: primera.clienteId, vendedorId: primera.vendedorId, tipoVenta: primera.tipoVenta, tipoEntrega: primera.tipoEntrega,
            quienRetira: primera.quienRetira, direccionEntrega: primera.direccionEntrega,
            tipoDocumento: 'FACTURA', numeroDocumento: numero, numeroDocumentoAnterior: anteriores, numeroControl: await controlAlNacer(g.control, t),
            statusDespacho: 'Completado', condicionPago: 'Credito', statusPago: 'Pendiente', fechaVencimiento: venceEl,
            moneda, tasaCambio: tasaNum, subtotal: calc.subtotal, montoIva: calc.montoIva, totalFinal: calc.totalFinal, costoFlete: 0,
            fechaEmision: emision, createdAt: emision,
        }, { transaction: t });

        // Renglones e inventario
        for (let i = 0; i < g.renglones.length; i++) {
            const l = g.renglones[i];
            const r = calc.renglones[i];
            const sale = Boolean(l.productoId) && !l.yaSalio && moverInventario;
            const det = await VentaDetalle.create({
                ventaId: factura.id, productoId: l.productoId || null, isFicticio: !l.productoId, nombreFicticio: l.productoId ? null : l.nombre,
                aplicaIva: r.aplicaIva, afectaInventario: Boolean(l.productoId) && (l.yaSalio || sale),
                cantidad: r.cantidad, precioUnitario: r.precioUnitario, subtotal: r.monto,
                presentacionPedida: l.presentacionPedida || null, cantidadPresentacion: l.cantidadPresentacion || null, unidadesPorPresentacion: l.unidadesPorPresentacion || null,
            }, { transaction: t });
            if (l.detalleId) {
                await sql('UPDATE "VentaEmpaqueItems" SET "ventaId" = :f, "ventaDetalleId" = :nuevo WHERE "ventaDetalleId" = :viejo', { f: factura.id, nuevo: det.id, viejo: l.detalleId });
                await sql('UPDATE "EmpaqueErrores" SET "ventaId" = :f, "ventaDetalleId" = :nuevo WHERE "ventaDetalleId" = :viejo', { f: factura.id, nuevo: det.id, viejo: l.detalleId });
            }
            if (l.yaSalio) {
                // Ya salió con la nota: sus salidas pasan a la factura (no se descuenta otra vez)
                await sql('UPDATE "SalidasInventario" SET venta_id = :f WHERE venta_id = :n AND producto_id = :p', { f: factura.id, n: l.notaId, p: l.productoId });
            } else if (sale) {
                const producto = await Producto.findByPk(l.productoId, { transaction: t, lock: t.LOCK.UPDATE });
                if (!producto) continue;
                const stock = Number(producto.stockAlmacen) || 0;
                // Producto sin auditar: su stock no es confiable, no se exige ni se descuenta (solo se suma lo vendido)
                if (producto.inventarioAuditado) {
                    if (stock < r.cantidad) faltantes.push({ factura: numero, nombre: producto.nombre, codigo: producto.codigo, hay: stock, salen: r.cantidad });
                    producto.stockAlmacen = stock - Math.min(stock, r.cantidad);
                }
                producto.nroVentas = (Number(producto.nroVentas) || 0) + r.cantidad;
                await producto.save({ transaction: t });
                await SalidaInventario.create({
                    ventaId: factura.id, productoId: producto.id, cantidad: r.cantidad, costoAlMomento: Number(producto.costoUsd) || 0, fecha: emision,
                    justificacion: `Factura ${numero} (de la ${notaPorId.get(l.notaId)?.numeroDocumento || 'nota de entrega'})`, estado: 'Entregada',
                    solicitadoPorId: usuarioId || null, despachadoPorId: usuarioId || null,
                }, { transaction: t });
            }
        }

        const totalUsd = g.totalUsd !== undefined && g.totalUsd !== null ? r2(g.totalUsd) : enUsd(calc.totalFinal);
        await CuentaPorCobrar.create({
            clienteId: primera.clienteId, ventaId: factura.id, montoTotal: totalUsd, saldoPendiente: totalUsd, moneda: 'USD', tasaCambio: tasaNum,
            fechaVencimiento: diaCaracas(venceEl), estado: 'Pendiente', observacion: observaciones || null,
        }, { transaction: t });
        emitidas.push({ factura, numero, calc, totalUsd, baseUsd: g.baseUsd !== undefined && g.baseUsd !== null ? r2(g.baseUsd) : enUsd(calc.subtotal), anteriores });
    }

    // Lo que seguía a las notas: abonos, ingresos, pagos móviles y notas fiscales (solo se llega aquí con abonos si es UNA factura)
    const idsNotas = cargadas.map((c) => c.venta.id);
    const destino = emitidas[0].factura.id;
    for (const tabla of ['Abonos', 'MovimientosFinancieros', 'NotasFiscales', 'PagoSms']) {
        await sql(`UPDATE "${tabla}" SET "ventaId" = :f WHERE "ventaId" IN (:notas)`, { f: destino, notas: idsNotas });
    }
    // Salidas que no correspondían a ningún renglón facturado (p. ej. un producto repetido): quedan con la primera factura
    await sql('UPDATE "SalidasInventario" SET venta_id = :f WHERE venta_id IN (:notas)', { f: destino, notas: idsNotas });

    // Comisiones: una línea por factura con su base sin IVA; los abonos ya comisionados siguen a la factura
    if (comisionesFactura.length) {
        const k = comisionesFactura[0];
        const pct = Number(k.porcentaje) || 0;
        for (const e of emitidas) {
            await ComisionVenta.create({
                vendedorId: k.vendedorId, ventaId: e.factura.id, concepto: 'FACTURA', fecha: diaCaracas(emision), vencimiento: diaCaracas(venceEl),
                documentoTexto: e.numero.replace(/\D/g, ''), clienteTexto: k.clienteTexto, montoUsd: e.totalUsd, baseUsd: e.baseUsd, porcentaje: pct,
                comisionUsd: r2((e.baseUsd * pct) / 100), estatusCliente: k.estatusCliente, estatusComision: 'PENDIENTE',
                observacion: `Factura de ${e.anteriores}`,
            }, { transaction: t });
        }
        await ComisionVenta.destroy({ where: { ventaId: idsNotas, concepto: 'FACTURA' }, transaction: t });
    }
    await sql(`UPDATE "ComisionesVenta" SET "ventaId" = :f, "documentoTexto" = :num WHERE "ventaId" IN (:notas)`, { f: destino, num: emitidas[0].numero.replace(/\D/g, ''), notas: idsNotas });
    // Notas sin comisión de un cliente que sí es de un vendedor externo: cada factura toma su línea
    if (!comisionesFactura.length) for (const e of emitidas) await asegurarComisionFactura({ venta: e.factura, transaction: t });

    // La deuda de las notas ya está en las facturas; las notas quedan anuladas y conservan su número y sus renglones como historia
    await CuentaPorCobrar.destroy({ where: { ventaId: idsNotas }, transaction: t });
    for (const c of cargadas) {
        c.venta.statusDespacho = 'Cancelado';
        await c.venta.save({ transaction: t });
    }
    for (const e of emitidas) await recalcularCobro(e.factura, t);

    return {
        facturas: emitidas.map((e) => ({ ventaId: e.factura.id, numeroDocumento: e.numero, notas: e.anteriores, totalUsd: e.totalUsd, total: e.calc.totalFinal, moneda })),
        notas: cargadas.map((c) => c.venta.numeroDocumento), faltantes,
    };
}

/**
 * Pasa una o varias notas a factura(s) con la tasa del día de emisión. No hace commit.
 *   copias: [{ numero, control }] por factura (opcionales: los datos que ya tiene en el sistema anterior).
 */
export async function facturarNotas({ notaIds, manuales = {}, porFactura = MAX_RENGLONES, copias = [], fecha = null, tasa, moverInventario = true, usuarioId = null, transaction: t }) {
    const cargadas = await cargarNotas(notaIds, t);
    const lineas = await renglonesDeNotas(cargadas, manuales, t);
    const grupos = repartir(lineas, porFactura);
    if (esConversionSimple(cargadas, lineas, grupos, moverInventario)) {
        const r = await convertirNotaEntregaAFactura({ venta: cargadas[0].venta, tasaHoy: tasa, transaction: t, numeroManual: copias[0]?.numero || null, numeroControl: copias[0]?.control || null, fecha });
        return { facturas: [{ ventaId: r.ventaId, numeroDocumento: r.numeroDocumento, notas: r.numeroAnterior, totalUsd: r.totalUsd, moneda: 'USD' }], notas: [r.numeroAnterior], faltantes: [] };
    }
    return emitirFacturasDeNotas({
        cargadas, grupos: grupos.map((g, i) => ({ renglones: g, numero: copias[i]?.numero || null, control: copias[i]?.control || null })),
        moneda: 'USD', tasa, fecha, moverInventario, usuarioId, transaction: t,
    });
}
