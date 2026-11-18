// Efectos de una factura de vendedor que se aplican AL APROBARLA (no al crearla).
// Una factura hecha por un vendedor nace como documento "por aprobar": no mueve inventario, no crea cuenta por cobrar, no registra ingresos en caja
// ni genera comisión. Lo que hace falta para aplicarlos después queda en Ventas.efectosPendientes (ver aprobacion.js) y esta función lo ejecuta
// dentro de la misma transacción de la aprobación: si algo falla (p. ej. inventario insuficiente), la factura sigue por aprobar.
// Mismo resultado que el POST de ventas cuando el documento lo hace administración.
import db from '@/models';
import { aBolivares, aDolares } from '@/app/constants/facturacion';
import { fechaCaracas } from '@/app/constants/hora';
import { notificarTodos } from '@/app/handlers/notificar';
import { leerEfectosPendientes, limpiarEfectosPendientes } from './aprobacion';
import { asegurarComisionFactura } from './comisionesPago';

const { Venta, VentaDetalle, Producto, SalidaInventario, MovimientoFinanciero, CategoriaFinanciera, CuentaPorCobrar } = db;

export class ErrorEfectos extends Error {
    constructor(mensaje, status = 409) { super(mensaje); this.status = status; }
}

/**
 * Aplica los efectos pendientes de una factura (id de la venta). No hace nada si ya se aplicaron o no eran diferidos.
 * Devuelve { aplicado, venta } para que el llamador pueda avisar (pedido al mayor).
 */
export async function aplicarEfectosVenta({ ventaId, transaction: t }) {
    const efectos = await leerEfectosPendientes('VENTA', ventaId, t);
    if (!efectos) return { aplicado: false, venta: null };
    const venta = await Venta.findByPk(ventaId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!venta) throw new ErrorEfectos('La factura no existe', 404);
    if (venta.statusDespacho === 'Cancelado') throw new ErrorEfectos('La factura está anulada: no se puede aprobar');

    const moneda = venta.moneda;
    const tasa = Number(venta.tasaCambio) || 1;
    const numero = venta.numeroDocumento;

    // ---- Cuenta por cobrar (crédito)
    if (venta.condicionPago === 'Credito') {
        await CuentaPorCobrar.create({
            clienteId: venta.clienteId, ventaId: venta.id, montoTotal: venta.totalFinal, saldoPendiente: venta.totalFinal, moneda, tasaCambio: tasa,
            fechaVencimiento: fechaCaracas(venta.fechaVencimiento), estado: 'Pendiente',
        }, { transaction: t });
    }

    // ---- Inventario: el detal descuenta de inmediato (solo productos auditados); el mayor deja la salida pendiente y descuenta al empacar
    const detalles = await VentaDetalle.findAll({ where: { ventaId: venta.id }, transaction: t });
    const detal = venta.tipoVenta === 'DETAL';
    for (const d of detalles) {
        if (d.isFicticio || d.afectaInventario === false || !d.productoId) continue;
        const producto = await Producto.findByPk(d.productoId, { transaction: t, lock: t.LOCK.UPDATE });
        if (!producto) continue;
        const cantidad = Number(d.cantidad);
        if (detal) {
            const stock = Number(producto.stockAlmacen) || 0;
            if (producto.inventarioAuditado) {
                if (stock < cantidad) throw new ErrorEfectos(`Inventario insuficiente para aprobar: ${producto.nombre} (disponible ${stock}, la factura pide ${cantidad})`);
                producto.stockAlmacen = stock - cantidad;
            }
            producto.nroVentas = (Number(producto.nroVentas) || 0) + cantidad;
        }
        await producto.save({ transaction: t });
        await SalidaInventario.create({
            ventaId: venta.id, productoId: producto.id, cantidad, costoAlMomento: Number(producto.costoUsd) || 0, justificacion: `Venta ${numero}`,
            estado: detal ? 'Entregada' : 'Pendiente', solicitadoPorId: efectos.solicitadoPorId || venta.vendedorId || null,
        }, { transaction: t });
    }

    // ---- Caja (contado): ingreso propio e IVA que se le debe al SENIAT
    if (venta.condicionPago === 'Contado') {
        const aUsd = (v) => (moneda === 'USD' ? v : aDolares(v, tasa));
        const aBs = (v) => (moneda === 'BS' ? v : aBolivares(v, tasa));
        const flete = Number(venta.costoFlete) || 0;
        const ingreso = Number((Number(venta.subtotal) + flete).toFixed(2));
        const metodoPago = efectos.metodoPago || 'No especificado';
        const referencia = efectos.referencia || null;
        let catVentas = await CategoriaFinanciera.findOne({ where: { nombre: 'Ingresos por Ventas' }, transaction: t });
        if (!catVentas) catVentas = await CategoriaFinanciera.create({ nombre: 'Ingresos por Ventas', tipo: 'INGRESO' }, { transaction: t });
        await MovimientoFinanciero.create({
            tipo: 'INGRESO', fecha: fechaCaracas(), metodoPago, referencia, montoUsd: aUsd(ingreso), tasaBcvAplicada: tasa, montoVes: aBs(ingreso),
            descripcion: `Venta ${numero} (Subtotal${flete > 0 ? ' + flete' : ''})`, categoriaId: catVentas.id, ventaId: venta.id,
        }, { transaction: t });
        if (Number(venta.montoIva) > 0) {
            let catIva = await CategoriaFinanciera.findOne({ where: { nombre: 'IVA Recaudado' }, transaction: t });
            if (!catIva) catIva = await CategoriaFinanciera.create({ nombre: 'IVA Recaudado', tipo: 'INGRESO' }, { transaction: t });
            await MovimientoFinanciero.create({
                tipo: 'INGRESO', fecha: fechaCaracas(), metodoPago, referencia, montoUsd: aUsd(Number(venta.montoIva)), tasaBcvAplicada: tasa, montoVes: aBs(Number(venta.montoIva)),
                descripcion: `IVA de Venta ${numero} (Impuesto SENIAT)`, categoriaId: catIva.id, ventaId: venta.id,
            }, { transaction: t });
        }
    }

    // ---- Comisión del vendedor externo dueño del cliente
    await asegurarComisionFactura({ venta, transaction: t });

    await limpiarEfectosPendientes('VENTA', venta.id, t);
    return { aplicado: true, venta };
}

/** Aviso al almacén de un pedido al mayor (se manda al aprobar la factura del vendedor, no al crearla). Nunca falla. */
export async function avisarPedidoMayor(venta) {
    try {
        if (venta?.tipoVenta !== 'MAYOR') return;
        const { Cliente, User, Empleado } = db;
        const cliente = venta.clienteId ? await Cliente.findByPk(venta.clienteId) : null;
        const nombreCliente = cliente ? (cliente.nombre || cliente.identificacion) : 'Cliente Desconocido';
        let nombreVendedor = 'Administración';
        if (venta.vendedorId) {
            const u = await User.findByPk(venta.vendedorId, { include: [{ model: Empleado, as: 'empleado' }] });
            nombreVendedor = u?.empleado ? `${u.empleado.nombre} ${u.empleado.apellido}` : (u?.user || nombreVendedor);
        }
        await notificarTodos({ title: 'Nuevo Pedido Mayorista 📦', body: `Se ha creado un nuevo pedido de ${nombreCliente} por ${nombreVendedor}.`, url: '/superuser/ventas', tipo: 'Info' });
    } catch (e) { console.error('Error enviando notificación Push:', e); }
}
