// Comisión de vendedores a medida que el cliente paga. Cada pago registrado en una factura (dinero o retención de IVA) que tiene línea de
// vendedor a comisión genera su línea ABONO, PENDIENTE de pagarle al vendedor: sobre la parte SIN IVA de lo pagado y con el % de la factura.
// Así, cuando la factura se paga completa, la suma de sus abonos es justo la comisión de la factura.
// Imports relativos con extensión (sin alias "@/") para poder probarlo con un script de Node.
import db from '../../../models/index.js';

const { ComisionVenta, Cliente, Venta } = db;
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * @param {object} p.abono  Abono recién creado (necesita id, ventaId, montoUsd, fechaPago, metodoPago)
 * Devuelve las líneas creadas (una por vendedor de la factura). No duplica: la línea lleva el id del abono en su observación.
 */
export async function generarComisionPorPago({ abono, transaction: t }) {
    const monto = Number(abono.montoUsd);
    if (!(monto > 0) || !abono.ventaId) return [];
    if (/nota de cr/i.test(abono.metodoPago || '')) return []; // una nota de crédito no es un pago del cliente
    const padres = await ComisionVenta.findAll({ where: { ventaId: abono.ventaId, concepto: 'FACTURA' }, transaction: t });
    if (!padres.length) return [];
    const marca = `Pago #${abono.id}`;
    const venta = await Venta.findByPk(abono.ventaId, { attributes: ['numeroDocumento', 'clienteId'], transaction: t });
    const cliente = venta?.clienteId ? await Cliente.findByPk(venta.clienteId, { attributes: ['nombre'], transaction: t }) : null;
    const creadas = [];
    for (const p of padres) {
        if (await ComisionVenta.count({ where: { vendedorId: p.vendedorId, ventaId: abono.ventaId, concepto: 'ABONO', observacion: { [db.Sequelize.Op.like]: `${marca}%` } }, transaction: t })) continue;
        const razon = Number(p.montoUsd) > 0 && p.baseUsd !== null ? Math.min(1, Number(p.baseUsd) / Number(p.montoUsd)) : 1;
        const base = r2(monto * razon);
        const pct = Number(p.porcentaje) || 0;
        // Tope: entre todos sus pagos, el vendedor nunca cobra más que la comisión de la factura (base sin IVA × %); el redondeo no la excede
        const previas = await ComisionVenta.sum('comisionUsd', { where: { vendedorId: p.vendedorId, ventaId: abono.ventaId, concepto: 'ABONO' }, transaction: t });
        const disponible = Math.max(0, r2(Number(p.comisionUsd) - Number(previas || 0)));
        creadas.push(await ComisionVenta.create({
            vendedorId: p.vendedorId, ventaId: abono.ventaId, concepto: 'ABONO', fecha: abono.fechaPago, documentoTexto: p.documentoTexto || venta?.numeroDocumento || null,
            clienteTexto: p.clienteTexto || cliente?.nombre || null, montoUsd: -r2(monto), baseUsd: base, porcentaje: pct, comisionUsd: Math.min(r2(base * pct / 100), disponible),
            estatusComision: 'PENDIENTE', observacion: `${marca} (${abono.metodoPago || 'pago'})`,
        }, { transaction: t }));
    }
    return creadas;
}
