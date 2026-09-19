import { NextResponse } from 'next/server';
import { Abono, Cliente, CuentaPorCobrar, RetencionIva, Venta, VentaDetalle, sequelize } from '@/models';
import { aBolivares, aDolares } from '@/app/constants/facturacion';
import { requerirAdmin, requerirNoVendedor } from '../../../_lib/acceso';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const hoyCaracas = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

class ErrorRetencion extends Error {
    constructor(mensaje, status = 400) { super(mensaje); this.status = status; }
}

// Deja el cobro de la venta coherente con sus abonos (incluida la retención): saldo de la cuenta por cobrar y estado de pago
async function recalcularCobro(venta, t) {
    const abonos = await Abono.findAll({ where: { ventaId: venta.id }, attributes: ['montoUsd', 'montoVes'], transaction: t });
    const totalUsd = venta.moneda === 'BS' ? aDolares(Number(venta.totalFinal), Number(venta.tasaCambio)) : Number(venta.totalFinal);
    const abonadoUsd = abonos.reduce((a, x) => a + Number(x.montoUsd), 0);
    const pagada = abonadoUsd >= totalUsd - 0.005;

    const cxc = await CuentaPorCobrar.findOne({ where: { ventaId: venta.id }, transaction: t });
    if (cxc) {
        const abonado = cxc.moneda === 'USD' ? abonadoUsd : abonos.reduce((a, x) => a + Number(x.montoVes), 0);
        cxc.saldoPendiente = Math.max(0, Number((Number(cxc.montoTotal) - abonado).toFixed(2)));
        cxc.estado = cxc.saldoPendiente <= 0.005 ? 'Pagado' : 'Pendiente';
        await cxc.save({ transaction: t });
    }
    venta.statusPago = pagada ? 'Pagado' : 'Pendiente';
    await venta.save({ transaction: t });
}

export async function GET(request, { params }) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    const { id } = await params;
    if (!UUID.test(id)) return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 });
    const retenciones = await RetencionIva.findAll({ where: { ventaId: id }, order: [['fecha', 'DESC']] });
    return NextResponse.json(retenciones);
}

// Registra el comprobante de retención de IVA que el CLIENTE (contribuyente especial) le hace a la empresa sobre una factura de venta.
export async function POST(request, { params }) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;

    const t = await sequelize.transaction();
    try {
        const { id } = await params;
        if (!UUID.test(id)) throw new ErrorRetencion('Venta no encontrada', 404);
        const { comprobante, fecha, porcentaje, ivaRetenidoBs } = await request.json();

        const numeroComprobante = String(comprobante || '').trim().slice(0, 30);
        if (!numeroComprobante) throw new ErrorRetencion('Indica el número del comprobante de retención');
        const fechaRet = FECHA.test(fecha || '') ? fecha : hoyCaracas();
        const pct = Number(porcentaje) === 100 ? 100 : 75;

        const venta = await Venta.findByPk(id, {
            include: [{ model: Cliente, as: 'cliente', attributes: ['identificacion', 'nombre'] }, { model: VentaDetalle, as: 'detalles', attributes: ['subtotal', 'aplicaIva'] }],
            transaction: t, lock: { level: t.LOCK.UPDATE, of: Venta },
        });
        if (!venta) throw new ErrorRetencion('Venta no encontrada', 404);
        if (venta.tipoDocumento !== 'FACTURA') throw new ErrorRetencion('Solo las facturas admiten retención de IVA');
        if (venta.statusDespacho === 'Cancelado') throw new ErrorRetencion('La factura está anulada', 409);
        if (!(Number(venta.montoIva) > 0)) throw new ErrorRetencion('Esta factura no tiene IVA que retener');
        if (await RetencionIva.findOne({ where: { ventaId: venta.id }, attributes: ['id'], transaction: t })) {
            throw new ErrorRetencion('Esta factura ya tiene una retención registrada; elimínala primero si hay que corregirla', 409);
        }

        // Los libros se llevan en bolívares: se convierte con la tasa que tenía la factura
        const tasa = Number(venta.tasaCambio) || 1;
        const aBs = (v) => (venta.moneda === 'BS' ? Number(Number(v).toFixed(2)) : aBolivares(Number(v), tasa));
        const ivaBs = aBs(venta.montoIva);
        const baseBs = aBs(venta.detalles.filter((d) => d.aplicaIva).reduce((a, d) => a + Number(d.subtotal), 0));
        const retenidoBs = Number(ivaRetenidoBs) > 0 ? Number(Number(ivaRetenidoBs).toFixed(2)) : Math.round(ivaBs * pct) / 100;
        if (retenidoBs > ivaBs + 0.005) throw new ErrorRetencion('La retención no puede ser mayor que el IVA de la factura');

        // La retención cuenta como un abono: el cliente le paga ese IVA al SENIAT y no a la empresa
        const retenidoUsd = aDolares(retenidoBs, tasa);
        const abono = await Abono.create({
            ventaId: venta.id, fechaPago: fechaRet, metodoPago: 'Retención IVA', referencia: numeroComprobante,
            montoUsd: retenidoUsd, montoVes: retenidoBs, montoBs: retenidoBs, tasaBcvAplicada: tasa, tasaCambio: tasa,
            notas: `Retención de IVA ${pct}% - comprobante ${numeroComprobante}`,
        }, { transaction: t });

        const retencion = await RetencionIva.create({
            tipo: 'VENTA', fecha: fechaRet, periodo: fechaRet.slice(0, 7), comprobante: numeroComprobante,
            facturaAfectada: venta.numeroDocumento, numeroControlFactura: venta.numeroControl,
            contraparteRif: venta.cliente?.identificacion || null, contraparteNombre: venta.cliente?.nombre || null,
            baseImponible: baseBs, alicuota: 16, montoIva: ivaBs, porcentajeRetencion: pct, ivaRetenido: retenidoBs,
            tasaCambio: tasa, ventaId: venta.id, abonoId: abono.id, registradoPorId: Number(acceso.sesion.id) || null,
        }, { transaction: t });

        await recalcularCobro(venta, t);
        await t.commit();
        return NextResponse.json({ success: true, retencion }, { status: 201 });
    } catch (error) {
        if (!t.finished) await t.rollback();
        if (error instanceof ErrorRetencion) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('Retención de venta:', error);
        return NextResponse.json({ error: 'No se pudo registrar la retención' }, { status: 500 });
    }
}

// Corrige un error: elimina la retención y su abono, y el saldo vuelve a como estaba
export async function DELETE(request, { params }) {
    const acceso = await requerirAdmin();
    if (acceso.error) return acceso.error;

    const t = await sequelize.transaction();
    try {
        const { id } = await params;
        if (!UUID.test(id)) throw new ErrorRetencion('Venta no encontrada', 404);
        const venta = await Venta.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
        const retencion = venta && await RetencionIva.findOne({ where: { ventaId: venta.id }, transaction: t });
        if (!retencion) throw new ErrorRetencion('Esta factura no tiene retención registrada', 404);

        await Abono.destroy({ where: { id: retencion.abonoId }, transaction: t });
        await retencion.destroy({ transaction: t });
        await recalcularCobro(venta, t);
        await t.commit();
        return NextResponse.json({ success: true });
    } catch (error) {
        if (!t.finished) await t.rollback();
        if (error instanceof ErrorRetencion) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('Eliminar retención:', error);
        return NextResponse.json({ error: 'No se pudo eliminar la retención' }, { status: 500 });
    }
}
