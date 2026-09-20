// Cobro de las compras de la tienda (landing, clientes SIN usuario). Imports relativos con extensión para poder probarlo con Node.
//
// Reglas de dinero de una compra de la tienda:
//  · El SUBTOTAL y el IVA entran a tesorería como ingreso de la tienda (mientras sea un recibo V-; si luego piden factura el IVA pasa a "IVA Recaudado").
//  · El DELIVERY es dinero de la empresa de transporte: NO genera movimiento (queda en Venta.costoFlete y se compara al despachar).
//  · Las fechas de los movimientos son de Caracas (no del servidor, que está en UTC).
//
// Un pago puede llegar de tres formas: el SMS ya estaba (checkout lo concilia al instante), el SMS llega tarde (el webhook lo empareja con el
// pedido "por verificar"), o administración lo confirma en el banco a mano. Los tres terminan igual: pedido pagado + movimientos.
import db from '../../../models/index.js';
import { aBolivares } from '../../constants/facturacion.js';
import { fechaCaracas } from '../../constants/hora.js';

const { CategoriaFinanciera, MovimientoFinanciero, VentaDetalle, Producto, Venta, PagoSms } = db;
const { Op } = db.Sequelize;

export class ErrorPagoTienda extends Error {
    constructor(mensaje, status = 400) { super(mensaje); this.status = status; }
}

// Diferencia tolerada entre el SMS y lo que debía pagar el cliente (Bs)
export const TOLERANCIA_BS = 0.01;

// Lo que el cliente debía pagar, en bolívares (las ventas de la tienda siempre son en USD con la tasa congelada)
export const totalEnBs = (venta) => (venta.moneda === 'BS'
    ? Math.round(Number(venta.totalFinal) * 100) / 100
    : aBolivares(Number(venta.totalFinal), Number(venta.tasaCambio)));

async function categoriaIngresos(t) {
    let cat = await CategoriaFinanciera.findOne({ where: { nombre: 'Ingresos por Ventas' }, transaction: t });
    if (!cat) cat = await CategoriaFinanciera.create({ nombre: 'Ingresos por Ventas', tipo: 'INGRESO' }, { transaction: t });
    return cat;
}

// Asienta el ingreso de una compra de la tienda ya pagada: subtotal + IVA (sin el delivery)
export async function asentarCobroTienda({ venta, pago = null, referencia, metodoPago = 'Pago Móvil', detalle = '', transaction: t }) {
    if (venta.moneda !== 'USD') throw new ErrorPagoTienda('Las compras de la tienda son en dólares');
    const cat = await categoriaIngresos(t);
    const tasa = Number(venta.tasaCambio);
    const partes = [
        { monto: Number(venta.subtotal), texto: `Venta Online ${venta.numeroDocumento} (subtotal)` },
        { monto: Number(venta.montoIva), texto: `IVA de Venta Online ${venta.numeroDocumento} (recibo sin factura)` },
    ];
    for (const { monto, texto } of partes) {
        if (!(monto > 0)) continue;
        await MovimientoFinanciero.create({
            tipo: 'INGRESO',
            fecha: fechaCaracas(),
            metodoPago,
            referencia: referencia || null,
            montoUsd: monto,
            tasaBcvAplicada: tasa,
            montoVes: aBolivares(monto, tasa),
            descripcion: `${texto} - ${metodoPago}${detalle ? ` (${detalle})` : ''}`,
            categoriaId: cat.id,
            ventaId: venta.id,
            pagoSmsId: pago ? pago.id : null,
        }, { transaction: t });
    }
}

// Un SMS de pago encontrado se une a la compra: el pago queda usado, la compra pagada y el dinero asentado.
//   origen: 'CHECKOUT' (el SMS ya estaba) · 'AUTO' (llegó tarde y se emparejó solo) · 'MANUAL' (administración lo vinculó)
export async function conciliarPagoTienda({ venta, pago, origen = 'CHECKOUT', transaction: t }) {
    pago.procesado = true;
    pago.ventaId = venta.id;
    await pago.save({ transaction: t });

    venta.pagoSmsId = pago.id;
    venta.statusPago = 'Pagado';
    if (venta.verificacionPago === 'POR_VERIFICAR') {
        venta.verificacionPago = origen === 'AUTO' ? 'CONFIRMADO_AUTO' : 'CONFIRMADO';
        venta.verificacionAt = new Date();
    }
    await venta.save({ transaction: t });

    await asentarCobroTienda({
        venta, pago, referencia: pago.referencia,
        detalle: `Banco: ${pago.banco || 'N/A'}, Ref: ${pago.referencia}${origen === 'AUTO' ? ', conciliado solo al llegar el SMS' : ''}`,
        transaction: t,
    });
}

// Administración confirmó en el banco que el dinero llegó, aunque el SMS nunca apareció
export async function confirmarPagoManual({ venta, referencia, transaction: t }) {
    if (venta.verificacionPago !== 'POR_VERIFICAR') throw new ErrorPagoTienda('Este pedido no está pendiente de verificación de pago', 409);
    venta.statusPago = 'Pagado';
    venta.verificacionPago = 'CONFIRMADO';
    venta.verificacionAt = new Date();
    await venta.save({ transaction: t });
    const ref = String(referencia || venta.referenciaDeclarada || '').trim() || null;
    await asentarCobroTienda({ venta, referencia: ref, detalle: 'confirmado por administración en el banco, sin SMS', transaction: t });
}

// El pago nunca existió (o venció el plazo): el pedido se cancela y el stock vuelve al inventario. No deja movimientos porque nunca hubo cobro.
//   estado: 'RECHAZADO' (administración) | 'VENCIDO' (nadie lo resolvió a tiempo)
export async function cancelarPedidoTienda({ venta, estado = 'RECHAZADO', nota = '', transaction: t }) { // estado null: cancelación sin verificación de pago (retiro sin pagar)
    if (venta.statusDespacho === 'Cancelado') throw new ErrorPagoTienda('El pedido ya está cancelado', 409);
    if (venta.statusPago === 'Pagado') throw new ErrorPagoTienda('El pedido ya está pagado', 409);

    const detalles = await VentaDetalle.findAll({ where: { ventaId: venta.id }, transaction: t });
    for (const d of detalles) {
        if (d.isFicticio || !d.productoId || d.afectaInventario === false) continue;
        const producto = await Producto.findByPk(d.productoId, { transaction: t, lock: t.LOCK.UPDATE });
        if (!producto) continue;
        // stockAlmacen es DECIMAL: llega como texto, hay que convertirlo (sumar texto + número concatenaría)
        producto.stockAlmacen = Number(producto.stockAlmacen) + Number(d.cantidad);
        await producto.save({ transaction: t });
    }
    venta.statusDespacho = 'Cancelado';
    venta.statusPago = 'Vencido';
    if (estado) {
        venta.verificacionPago = estado;
        venta.verificacionAt = new Date();
    }
    if (nota) venta.verificacionNota = [venta.verificacionNota, nota].filter(Boolean).join(' | ');
    await venta.save({ transaction: t });
}

// Llegó un SMS nuevo: ¿hay una compra "por verificar" que lo estaba esperando? Se empareja por los últimos 4 dígitos de la referencia
// Y por el monto exacto. Si la referencia coincide pero el monto no, no se toca el pedido: queda una nota para administración.
// Devuelve [{ venta, resultado: 'CONCILIADO' | 'MONTO_DISTINTO' }] para que quien llama avise al personal.
export async function conciliarPendientesConPago(pago) {
    const t = await db.sequelize.transaction();
    try {
        const resultados = [];
        const pendientes = await Venta.findAll({
            where: {
                tipoVenta: 'ONLINE', verificacionPago: 'POR_VERIFICAR', statusDespacho: { [Op.ne]: 'Cancelado' },
                referenciaDeclarada: { [Op.endsWith]: String(pago.referencia) },
            },
            transaction: t, lock: t.LOCK.UPDATE,
        });
        const pagoActual = await PagoSms.findByPk(pago.id, { transaction: t, lock: t.LOCK.UPDATE });
        for (const venta of pendientes) {
            if (!pagoActual || pagoActual.procesado) break;
            const esperado = totalEnBs(venta);
            if (Math.abs(esperado - Number(pagoActual.monto)) <= TOLERANCIA_BS) {
                await conciliarPagoTienda({ venta, pago: pagoActual, origen: 'AUTO', transaction: t });
                resultados.push({ venta, resultado: 'CONCILIADO' });
            } else {
                venta.verificacionNota = [venta.verificacionNota, `Llegó un SMS con esa referencia pero por Bs ${Number(pagoActual.monto).toFixed(2)} (se esperaba Bs ${esperado.toFixed(2)}). Revisa el banco.`].filter(Boolean).join(' | ');
                await venta.save({ transaction: t });
                resultados.push({ venta, resultado: 'MONTO_DISTINTO' });
            }
        }
        await t.commit();
        return resultados;
    } catch (e) {
        await t.rollback().catch(() => {});
        throw e;
    }
}
