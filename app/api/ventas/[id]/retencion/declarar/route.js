import { NextResponse } from 'next/server';
import { Venta, sequelize } from '@/models';
import { requerirNoVendedor } from '../../../../_lib/acceso';
import { declararRetencion } from '../../../../_lib/retencionesVenta';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Declara que el cliente retuvo el 75 % del IVA de esta factura, sin datos de comprobante: baja la deuda desde ya y queda pendiente
// de comprobante (aparece en la lista de seguimiento). Los datos del comprobante se cargan después.
export async function POST(request, { params }) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    const t = await sequelize.transaction();
    try {
        const { id } = await params;
        if (!UUID.test(id)) { await t.rollback(); return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 }); }
        const venta = await Venta.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!venta) { await t.rollback(); return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 }); }
        const retencion = await declararRetencion({ venta, porcentaje: 75, transaction: t });
        await t.commit();
        return NextResponse.json({ success: true, retencion }, { status: 201 });
    } catch (error) {
        if (!t.finished) await t.rollback();
        return NextResponse.json({ error: error.message || 'No se pudo declarar la retención' }, { status: 400 });
    }
}
