// Comisión de vendedores a medida que el cliente paga. Cada pago EN DINERO registrado en una factura que tiene línea de vendedor a comisión
// genera su línea ABONO, PENDIENTE de pagarle al vendedor: sobre la parte SIN IVA de lo pagado y con el % de la factura.
// La retención de IVA es IVA: no genera comisión. El dinero que paga el cliente es el total menos lo retenido, y la base sin IVA se reparte sobre eso;
// así, cuando la factura se paga completa, la suma de sus abonos es justo la comisión de la factura (base sin IVA × %).
// Imports relativos con extensión (sin alias "@/") para poder probarlo con un script de Node.
import db from '../../../models/index.js';

const { ComisionVenta, Cliente, Venta, Abono, CuentaPorCobrar } = db;
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * @param {object} p.abono  Abono recién creado (necesita id, ventaId, montoUsd, fechaPago, metodoPago)
 * Devuelve las líneas creadas (una por vendedor de la factura). No duplica: la línea lleva el id del abono en su observación.
 */
export async function generarComisionPorPago({ abono, transaction: t }) {
    const monto = Number(abono.montoUsd);
    if (!(monto > 0) || !abono.ventaId) return [];
    if (/nota de cr|retenci/i.test(abono.metodoPago || '')) return []; // ni una nota de crédito ni la retención de IVA son dinero que comisiona
    const padres = await ComisionVenta.findAll({ where: { ventaId: abono.ventaId, concepto: 'FACTURA' }, transaction: t });
    if (!padres.length) return [];
    const marca = `Pago #${abono.id}`;
    const venta = await Venta.findByPk(abono.ventaId, { attributes: ['numeroDocumento', 'clienteId'], transaction: t });
    const cliente = venta?.clienteId ? await Cliente.findByPk(venta.clienteId, { attributes: ['nombre'], transaction: t }) : null;
    const retenido = Number((await Abono.sum('montoUsd', { where: { ventaId: abono.ventaId, metodoPago: 'Retención IVA' }, transaction: t })) || 0);
    const creadas = [];
    for (const p of padres) {
        if (await ComisionVenta.count({ where: { vendedorId: p.vendedorId, ventaId: abono.ventaId, concepto: 'ABONO', observacion: { [db.Sequelize.Op.like]: `${marca}%` } }, transaction: t })) continue;
        const aCobrar = Number(p.montoUsd) - retenido; // lo que el cliente paga en dinero
        const razon = aCobrar > 0.01 && p.baseUsd !== null ? Math.min(1, Number(p.baseUsd) / aCobrar) : 1;
        const base = r2(monto * razon);
        const pct = Number(p.porcentaje) || 0;
        // Tope: entre todos sus pagos, el vendedor nunca cobra más que la comisión de la factura (base sin IVA × %)
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

/**
 * Cuando la factura queda saldada (el cliente ya pagó todo, retención incluida), la comisión del vendedor debe ser exactamente la de la factura:
 * si por redondeo o por haber declarado la retención después faltó algo, se completa en su último pago por pagar. Llamar DESPUÉS de dejar el saldo al día.
 */
export async function completarComisionAlSaldar({ ventaId, transaction: t }) {
    const cxc = await CuentaPorCobrar.findOne({ where: { ventaId }, transaction: t });
    if (!cxc || Number(cxc.saldoPendiente) > 0.005) return;
    const padres = await ComisionVenta.findAll({ where: { ventaId, concepto: 'FACTURA' }, transaction: t });
    for (const p of padres) {
        const abonos = await ComisionVenta.findAll({ where: { vendedorId: p.vendedorId, ventaId, concepto: 'ABONO' }, order: [['id', 'DESC']], transaction: t });
        if (!abonos.length) continue; // sin pagos generados, la factura cobrada sin abonos ya cuenta entera
        const falta = r2(Number(p.comisionUsd) - abonos.reduce((a, x) => a + Number(x.comisionUsd || 0), 0));
        const ultima = abonos.find((x) => x.estatusComision === 'PENDIENTE');
        if (falta > 0.004 && ultima) await ultima.update({ comisionUsd: r2(Number(ultima.comisionUsd) + falta) }, { transaction: t });
    }
}
