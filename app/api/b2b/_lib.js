import { Op } from 'sequelize';
import { Abono, CuentaPorCobrar, Venta, VentaDetalle, Producto, Marca } from '@/models';
import { aDolares } from '@/app/constants/facturacion';

// Crédito del cliente: días aprobados, máximo de pedidos a crédito activos y cuántos le quedan.
// "Activo" = a crédito, no cancelado y todavía con saldo por pagar.
export async function creditoDeCliente(cliente, { transaction } = {}) {
    const activos = await Venta.count({
        where: { clienteId: cliente.id, condicionPago: 'Credito', statusDespacho: { [Op.ne]: 'Cancelado' }, statusPago: { [Op.ne]: 'Pagado' } },
        transaction,
    });
    const maxPedidos = Number(cliente.maxPedidosCredito ?? 5);
    return { diasCredito: Number(cliente.diasCredito ?? 7), maxPedidos, activos, disponibles: Math.max(0, maxPedidos - activos) };
}

// Estados de despacho en los que el pedido sigue "en curso"
export const ESTADOS_ACTIVOS = ['Pendiente', 'Empacado', 'Parcial'];

// Fecha de hoy en Caracas (YYYY-MM-DD) para comparar vencimientos sin depender de la zona del servidor
export const hoyCaracas = () =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

const aFechaISO = (d) => (d ? (typeof d === 'string' ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10)) : null);

const diasEntre = (desde, hasta) => Math.round((new Date(`${hasta}T00:00:00Z`) - new Date(`${desde}T00:00:00Z`)) / 86400000);

// La asociación puede venir como arreglo (hasMany): [] no significa "tiene cuenta"
export const cuentaDe = (venta) => {
    const c = venta.cuentaPorCobrar;
    return Array.isArray(c) ? (c[0] || null) : (c || null);
};

// Lo que el cliente todavía debe de una venta, en USD.
//  · Si tiene cuenta por cobrar, manda su saldo (el personal lo va descontando con cada abono).
//  · Si no (pedido de contado aún sin pagar), es el total menos lo abonado.
export function saldoDeVenta(venta) {
    if (venta.statusDespacho === 'Cancelado' || venta.statusPago === 'Pagado') return 0;
    const cxc = cuentaDe(venta);
    if (cxc) {
        const saldo = Number(cxc.saldoPendiente) || 0;
        return cxc.moneda === 'BS' ? aDolares(saldo, cxc.tasaCambio) : saldo;
    }
    const abonado = (venta.abonos || []).reduce((acc, a) => acc + (Number(a.montoUsd) || 0), 0);
    return Math.max(0, Number((Number(venta.totalFinal) - abonado).toFixed(2)));
}

// Situación de cobro de una venta: al día, por vencer, vencida o pagada
export function estadoCobro(venta, hoy = hoyCaracas()) {
    if (venta.statusDespacho === 'Cancelado') return { clave: 'anulado', etiqueta: 'Anulado', saldo: 0, vence: null, diasParaVencer: null };
    const saldo = saldoDeVenta(venta);
    const vence = aFechaISO(cuentaDe(venta)?.fechaVencimiento || venta.fechaVencimiento);
    if (saldo <= 0) return { clave: 'pagado', etiqueta: 'Pagado', saldo: 0, vence, diasParaVencer: null };
    if (!vence) return { clave: 'pendiente', etiqueta: 'Pendiente de pago', saldo, vence: null, diasParaVencer: null };
    const dias = diasEntre(hoy, vence);
    if (dias < 0) return { clave: 'vencido', etiqueta: `Vencido hace ${-dias} día${-dias === 1 ? '' : 's'}`, saldo, vence, diasParaVencer: dias };
    return { clave: 'pendiente', etiqueta: dias === 0 ? 'Vence hoy' : `Vence en ${dias} día${dias === 1 ? '' : 's'}`, saldo, vence, diasParaVencer: dias };
}

// Línea de tiempo del pedido para mostrarle al cliente
export function lineaDeTiempo(venta) {
    const cancelado = venta.statusDespacho === 'Cancelado';
    const empacado = ['Empacado', 'Parcial', 'Completado'].includes(venta.statusDespacho);
    const completado = venta.statusDespacho === 'Completado';
    const pasos = [
        { clave: 'recibido', titulo: 'Pedido recibido', detalle: 'Recibimos tu pedido y lo estamos revisando.', hecho: true, fecha: venta.createdAt },
        { clave: 'empacado', titulo: 'Preparado', detalle: 'Tu mercancía está armada y lista.', hecho: empacado && !cancelado, fecha: null },
        { clave: 'entregado', titulo: venta.tipoEntrega === 'pickup' ? 'Retirado' : 'Despachado', detalle: venta.quienRetira ? `Retira/recibe: ${venta.quienRetira}` : 'Entregado.', hecho: completado && !cancelado, fecha: completado ? venta.fechaHoraRetiro : null },
    ];
    if (cancelado) pasos.push({ clave: 'cancelado', titulo: 'Pedido cancelado', detalle: '', hecho: true, fecha: venta.updatedAt });
    return pasos;
}

const ETIQUETAS_DESPACHO = { Pendiente: 'Recibido', Empacado: 'Preparado', Parcial: 'Entrega parcial', Completado: 'Entregado', Cancelado: 'Cancelado' };

// Resumen de una venta para listados
export function resumenPedido(venta, hoy) {
    const cobro = estadoCobro(venta, hoy);
    return {
        id: venta.id,
        numero: venta.numeroDocumento,
        fecha: venta.createdAt,
        estado: venta.statusDespacho,
        estadoEtiqueta: ETIQUETAS_DESPACHO[venta.statusDespacho] || venta.statusDespacho,
        tipoEntrega: venta.tipoEntrega,
        condicionPago: venta.condicionPago,
        subtotal: Number(venta.subtotal),
        montoIva: Number(venta.montoIva),
        flete: Number(venta.costoFlete),
        total: Number(venta.totalFinal),
        tasaCambio: Number(venta.tasaCambio),
        cobro,
        articulos: venta.detalles ? venta.detalles.reduce((acc, d) => acc + Number(d.cantidad), 0) : undefined,
    };
}

// Ventas de un cliente con lo necesario para calcular estado y saldo
export const INCLUDES_COBRO = [
    { model: CuentaPorCobrar, as: 'cuentaPorCobrar', attributes: ['id', 'montoTotal', 'saldoPendiente', 'moneda', 'tasaCambio', 'fechaVencimiento', 'estado'] },
    { model: Abono, as: 'abonos', attributes: ['id', 'fechaPago', 'metodoPago', 'referencia', 'montoUsd', 'montoVes', 'tasaBcvAplicada'] },
];

export async function ventasDelCliente(clienteId, { where = {}, extraInclude = [], order = [['createdAt', 'DESC']], limit, offset } = {}) {
    return Venta.findAll({
        where: { clienteId, ...where },
        include: [...INCLUDES_COBRO, ...extraInclude],
        order, limit, offset,
    });
}

export const INCLUDE_DETALLES = {
    model: VentaDetalle,
    as: 'detalles',
    attributes: ['id', 'cantidad', 'precioUnitario', 'subtotal', 'aplicaIva', 'isFicticio', 'nombreFicticio'],
    include: [{
        model: Producto, as: 'producto', attributes: ['id', 'nombre', 'codigo', 'imagen', 'presentacion', 'unidadesPorCaja'],
        include: [{ model: Marca, as: 'marca', attributes: ['nombre', 'imagen'] }],
    }],
};

export { Op };
