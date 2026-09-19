import { NextResponse } from 'next/server';
import { Venta } from '@/models';
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

        const resumen = resumenPedido(venta, hoyCaracas());
        const cancelable = venta.statusDespacho === 'Pendiente' && !cuentaDe(venta) && (venta.abonos || []).length === 0;

        return NextResponse.json({
            ...resumen,
            quienRetira: venta.quienRetira,
            fechaRetiro: venta.fechaHoraRetiro,
            cancelable,
            lineaDeTiempo: lineaDeTiempo(venta),
            detalles: venta.detalles.map((d) => ({
                id: d.id,
                nombre: d.isFicticio ? d.nombreFicticio : d.producto?.nombre,
                codigo: d.producto?.codigo || null,
                imagen: d.producto?.imagen || null,
                marca: d.producto?.marca || null,
                cantidad: Number(d.cantidad),
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
