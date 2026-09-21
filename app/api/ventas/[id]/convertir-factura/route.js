import { NextResponse } from 'next/server';
import { Venta } from '@/models';
import { requerirAdmin } from '@/app/api/_lib/acceso';
import { ErrorConversion, vistaPreviaConversion } from '@/app/api/_lib/convertirFactura';
import { tasaVigente } from '@/app/api/_lib/tasaBcv';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Vista previa de convertir una nota de entrega a crédito en factura hoy (IVA que se suma, tasa de hoy y bolívares nuevos). No guarda nada.
export async function GET(request, { params }) {
    const acceso = await requerirAdmin();
    if (acceso.error) return acceso.error;
    try {
        const { id } = await params;
        if (!UUID.test(id)) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
        const venta = await Venta.findByPk(id);
        if (!venta) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
        return NextResponse.json(await vistaPreviaConversion({ venta, tasaHoy: await tasaVigente() }));
    } catch (error) {
        if (error instanceof ErrorConversion) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('Vista previa de conversión:', error);
        return NextResponse.json({ error: 'No se pudo calcular la conversión' }, { status: 500 });
    }
}
