// Comisión de vendedores a medida que el cliente paga. Cada pago EN DINERO registrado en una factura que tiene línea de vendedor a comisión
// genera su línea ABONO, PENDIENTE de pagarle al vendedor: sobre la parte SIN IVA de lo pagado y con el % de la factura.
// La retención de IVA es IVA: no genera comisión. El dinero que paga el cliente es el total menos lo retenido, y la base sin IVA se reparte sobre eso;
// así, cuando la factura se paga completa, la suma de sus abonos es justo la comisión de la factura (base sin IVA × %).
// Imports relativos con extensión (sin alias "@/") para poder probarlo con un script de Node.
import db from '../../../models/index.js';

const { ComisionVenta, Cliente, Venta, Abono, CuentaPorCobrar, sequelize } = db;
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const diaCaracas = (f) => (f ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date(f)) : null);

/**
 * La factura (o nota de entrega) no tiene línea de vendedor a comisión pero su cliente ES de un vendedor externo (ficha del cliente,
 * «Vendedor externo»): se le crea, con el % que ese vendedor tiene con ese cliente (el de su última línea; si no, el del vendedor).
 * Así una venta nunca se queda sin comisión porque no estaba en la hoja del vendedor (pasó con la F-146834 de Farmavit18, de Edgar Jiménez).
 * Si el cliente no tiene vendedor externo, no hace nada. Devuelve la línea creada.
 */
export async function asegurarComisionFactura({ venta, transaction: t }) {
    if (!venta?.id || !venta.clienteId || !['FACTURA', 'NOTA_ENTREGA'].includes(venta.tipoDocumento) || venta.statusDespacho === 'Cancelado') return null;
    if (await ComisionVenta.count({ where: { ventaId: venta.id, concepto: 'FACTURA' }, transaction: t })) return null;
    const [dueno] = await sequelize.query(
        `SELECT vc.id AS "vendedorId", vc.porcentaje::float AS defecto, c.nombre AS cliente,
                (SELECT cv.porcentaje::float FROM "ComisionesVenta" cv JOIN "Ventas" v ON v.id = cv."ventaId"
                  WHERE cv."vendedorId" = vc.id AND v."clienteId" = c.id AND cv.concepto = 'FACTURA' ORDER BY cv.id DESC LIMIT 1) AS porcentaje,
                (SELECT cv."clienteTexto" FROM "ComisionesVenta" cv JOIN "Ventas" v ON v.id = cv."ventaId"
                  WHERE cv."vendedorId" = vc.id AND v."clienteId" = c.id AND cv."clienteTexto" IS NOT NULL ORDER BY cv.id DESC LIMIT 1) AS "clienteTexto"
           FROM "Clientes" c JOIN "VendedoresComision" vc ON vc.id = c."vendedorComisionId"
          WHERE c.id = :cliente AND vc.activo = true`,
        { replacements: { cliente: venta.clienteId }, type: sequelize.QueryTypes.SELECT, transaction: t },
    );
    if (!dueno) return null;
    dueno.porcentaje = dueno.porcentaje || dueno.defecto;
    dueno.clienteTexto = dueno.clienteTexto || dueno.cliente;
    if (!(dueno.porcentaje > 0)) return null;
    // En dólares, como la hoja del vendedor: el monto es lo que debe el cliente (su cuenta por cobrar en dólares) y la base, lo vendido sin IVA
    const tasa = Number(venta.tasaCambio) || 1;
    const enUsd = (monto) => (venta.moneda === 'BS' ? r2(Number(monto) / tasa) : r2(monto));
    const cxc = await CuentaPorCobrar.findOne({ where: { ventaId: venta.id }, attributes: ['montoTotal', 'moneda'], transaction: t });
    const montoUsd = cxc && cxc.moneda === 'USD' ? r2(cxc.montoTotal) : enUsd(venta.totalFinal);
    const baseUsd = enUsd(venta.subtotal);
    const digitos = String(venta.numeroDocumento || '').replace(/\D/g, '');
    return ComisionVenta.create({
        vendedorId: dueno.vendedorId, ventaId: venta.id, concepto: 'FACTURA', fecha: diaCaracas(venta.fechaEmision || venta.createdAt || new Date()), vencimiento: diaCaracas(venta.fechaVencimiento),
        documentoTexto: venta.tipoDocumento === 'NOTA_ENTREGA' ? digitos.replace(/^0+/, '') : digitos, clienteTexto: dueno.clienteTexto,
        montoUsd, baseUsd, porcentaje: dueno.porcentaje, comisionUsd: r2((baseUsd * dueno.porcentaje) / 100), estatusComision: 'PENDIENTE',
        observacion: 'Agregada sola: el cliente es de este vendedor',
    }, { transaction: t });
}

/**
 * @param {object} p.abono  Abono recién creado (necesita id, ventaId, montoUsd, fechaPago, metodoPago)
 * Devuelve las líneas creadas (una por vendedor de la factura). No duplica: la línea lleva el id del abono en su observación.
 */
export async function generarComisionPorPago({ abono, transaction: t }) {
    const monto = Number(abono.montoUsd);
    if (!(monto > 0) || !abono.ventaId) return [];
    if (/nota de cr|retenci/i.test(abono.metodoPago || '')) return []; // ni una nota de crédito ni la retención de IVA son dinero que comisiona
    let padres = await ComisionVenta.findAll({ where: { ventaId: abono.ventaId, concepto: 'FACTURA' }, transaction: t });
    if (!padres.length) {
        // La factura no estaba en la hoja del vendedor, pero el cliente es suyo: se le crea la línea antes de comisionar el pago
        const venta = await Venta.findByPk(abono.ventaId, { transaction: t });
        if (await asegurarComisionFactura({ venta, transaction: t })) padres = await ComisionVenta.findAll({ where: { ventaId: abono.ventaId, concepto: 'FACTURA' }, transaction: t });
    }
    if (!padres.length) return [];
    // Un solo pago que salda la factura completa (con la retención ya descontada) NO es un abono: la comisión es la de la propia línea de la factura
    const cxc = await CuentaPorCobrar.findOne({ where: { ventaId: abono.ventaId }, transaction: t });
    if (cxc && cxc.moneda === 'USD' && Number(cxc.saldoPendiente) - monto <= 0.01) {
        const previos = await Abono.count({ where: { ventaId: abono.ventaId, id: { [db.Sequelize.Op.ne]: abono.id }, metodoPago: { [db.Sequelize.Op.notRegexp]: 'etenci|ota de cr' } }, transaction: t });
        if (!previos) return [];
    }
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
