import { NextResponse } from 'next/server';
import { Abono, Cliente, RetencionIva, Venta, VentaDetalle, sequelize } from '@/models';
import { requerirAdmin, requerirNoVendedor } from '../../../_lib/acceso';
import { calcularRetencion, hoyCaracas, recalcularCobro } from '../../../_lib/retencionesVenta';
import { avisarCliente } from '../../../_lib/avisosCliente';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

class ErrorRetencion extends Error {
    constructor(mensaje, status = 400) { super(mensaje); this.status = status; }
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
// Si la factura ya tiene la retención calculada al facturarla (PENDIENTE de comprobante) o con el comprobante que subió el cliente
// (POR_REVISAR), la completa / confirma: pasa a REGISTRADA y entra al libro de ventas.
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

        const venta = await Venta.findByPk(id, {
            include: [{ model: Cliente, as: 'cliente', attributes: ['identificacion', 'nombre'] }, { model: VentaDetalle, as: 'detalles', attributes: ['subtotal', 'aplicaIva'] }],
            transaction: t, lock: { level: t.LOCK.UPDATE, of: Venta },
        });
        if (!venta) throw new ErrorRetencion('Venta no encontrada', 404);
        if (venta.tipoDocumento !== 'FACTURA') throw new ErrorRetencion('Solo las facturas admiten retención de IVA');
        if (venta.statusDespacho === 'Cancelado') throw new ErrorRetencion('La factura está anulada', 409);
        if (!(Number(venta.montoIva) > 0)) throw new ErrorRetencion('Esta factura no tiene IVA que retener');

        const existente = await RetencionIva.findOne({ where: { ventaId: venta.id }, transaction: t });
        if (existente && existente.estado === 'REGISTRADA') {
            throw new ErrorRetencion('Esta factura ya tiene una retención registrada; elimínala primero si hay que corregirla', 409);
        }

        const c = calcularRetencion(venta, venta.detalles, porcentaje, ivaRetenidoBs);
        if (c.retenidoBs > c.ivaBs + 0.005) throw new ErrorRetencion('La retención no puede ser mayor que el IVA de la factura');

        // La retención cuenta como un abono: el cliente le paga ese IVA al SENIAT y no a la empresa
        const datosAbono = {
            fechaPago: fechaRet, metodoPago: 'Retención IVA', referencia: numeroComprobante,
            montoUsd: c.retenidoUsd, montoVes: c.retenidoBs, montoBs: c.retenidoBs, tasaBcvAplicada: c.tasa, tasaCambio: c.tasa,
            notas: `Retención de IVA ${c.pct}% - comprobante ${numeroComprobante}`,
        };
        const datosRetencion = {
            fecha: fechaRet, periodo: fechaRet.slice(0, 7), comprobante: numeroComprobante, estado: 'REGISTRADA',
            numeroControlFactura: venta.numeroControl, baseImponible: c.baseBs, montoIva: c.ivaBs,
            porcentajeRetencion: c.pct, ivaRetenido: c.retenidoBs, registradoPorId: Number(acceso.sesion.id) || null,
        };

        let retencion;
        if (existente) {
            // Completa la retención calculada al facturar: actualiza ella y su abono
            const abono = existente.abonoId ? await Abono.findByPk(existente.abonoId, { transaction: t }) : null;
            if (abono) await abono.update(datosAbono, { transaction: t });
            else datosRetencion.abonoId = (await Abono.create({ ventaId: venta.id, ...datosAbono }, { transaction: t })).id;
            retencion = await existente.update(datosRetencion, { transaction: t });
        } else {
            const abono = await Abono.create({ ventaId: venta.id, ...datosAbono }, { transaction: t });
            retencion = await RetencionIva.create({
                tipo: 'VENTA', facturaAfectada: venta.numeroDocumento,
                contraparteRif: venta.cliente?.identificacion || null, contraparteNombre: venta.cliente?.nombre || null,
                alicuota: 16, tasaCambio: c.tasa, ventaId: venta.id, abonoId: abono.id, ...datosRetencion,
            }, { transaction: t });
        }

        await recalcularCobro(venta, t);
        await t.commit();
        if (venta.tipoVenta === 'MAYOR') await avisarCliente(venta, 'RETENCION_CONFIRMADA', { comprobante: numeroComprobante });
        return NextResponse.json({ success: true, retencion }, { status: 201 });
    } catch (error) {
        if (!t.finished) await t.rollback();
        if (error instanceof ErrorRetencion) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('Retención de venta:', error);
        return NextResponse.json({ error: 'No se pudo registrar la retención' }, { status: 500 });
    }
}

// Corrige un error: elimina la retención (registrada o pendiente) y su abono, y el saldo vuelve a como estaba
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
