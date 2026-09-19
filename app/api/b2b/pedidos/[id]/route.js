import { NextResponse } from 'next/server';
import { NotaFiscal, RetencionIva, Venta } from '@/models';
import { requerirCliente } from '../../../_lib/acceso';
import { INCLUDES_COBRO, cuentaDe, INCLUDE_DETALLES, hoyCaracas, lineaDeTiempo, resumenPedido } from '../../_lib';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Detalle de UN pedido del cliente. Se filtra por clienteId del token: pedir el id de otro cliente da 404.
export async function GET(request, { params }) {
    const acceso = await requerirCliente();
    if (acceso.error) return acceso.error;

    try {
        const { id } = await params;
        if (!UUID.test(id)) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });

        const venta = await Venta.findOne({
            where: { id, clienteId: acceso.clienteId },
            include: [...INCLUDES_COBRO, INCLUDE_DETALLES],
        });
        if (!venta) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });

        const retencion = await RetencionIva.findOne({ where: { ventaId: venta.id, tipo: 'VENTA' } });
        const notas = await NotaFiscal.findAll({ where: { ventaId: venta.id, origen: 'VENTA', estado: 'EMITIDA' }, order: [['createdAt', 'ASC']] });
        const resumen = resumenPedido(venta, hoyCaracas());
        const cancelable = venta.statusDespacho === 'Pendiente' && !cuentaDe(venta) && (venta.abonos || []).length === 0;

        return NextResponse.json({
            ...resumen,
            quienRetira: venta.quienRetira,
            fechaRetiro: venta.fechaHoraRetiro,
            cancelable,
            // Notas de crédito (bajan lo que debe) y de débito (lo suben) emitidas sobre esta factura
            notas: notas.map((n) => ({ id: n.id, numero: n.numeroDocumento, tipo: n.tipo, fecha: n.fecha, motivo: n.motivo, total: Number(n.totalFinal), moneda: n.moneda })),
            // Retención de IVA que el cliente (contribuyente especial) le hace a la empresa: montos en Bs (dato fiscal)
            retencion: retencion ? {
                estado: retencion.estado, porcentaje: Number(retencion.porcentajeRetencion), ivaBs: Number(retencion.montoIva),
                retenidoBs: Number(retencion.ivaRetenido), comprobante: retencion.comprobante, fecha: retencion.fecha,
                montoDeclarado: retencion.montoDeclarado === null ? null : Number(retencion.montoDeclarado), comprobanteUrl: retencion.comprobanteUrl,
            } : null,
            lineaDeTiempo: lineaDeTiempo(venta),
            detalles: venta.detalles.map((d) => ({
                id: d.id,
                nombre: d.isFicticio ? d.nombreFicticio : d.producto?.nombre,
                codigo: d.producto?.codigo || null,
                imagen: d.producto?.imagen || null,
                marca: d.producto?.marca || null,
                cantidad: Number(d.cantidad),
                // Lo que pidió: p. ej. 2 cajas de 100 (cantidad ya viene en unidades). Nulo en pedidos anteriores.
                presentacion: d.presentacionPedida || null,
                cantidadPresentacion: d.cantidadPresentacion === null ? null : Number(d.cantidadPresentacion),
                unidadesPorPresentacion: d.unidadesPorPresentacion === null ? null : Number(d.unidadesPorPresentacion),
                precioUnitario: Number(d.precioUnitario),
                subtotal: Number(d.subtotal),
                aplicaIva: d.aplicaIva,
            })),
            abonos: (venta.abonos || []).map((a) => ({
                id: a.id, fecha: a.fechaPago, metodo: a.metodoPago, referencia: a.referencia,
                montoUsd: Number(a.montoUsd), montoVes: Number(a.montoVes), tasa: Number(a.tasaBcvAplicada),
            })),
        });
    } catch (error) {
        console.error('B2B pedido detalle:', error);
        return NextResponse.json({ error: 'No se pudo cargar el pedido' }, { status: 500 });
    }
}
