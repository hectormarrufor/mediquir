import { NextResponse } from 'next/server';
import db from '@/models';
import { requerirAdministracion, UUID } from '../../_lib';

export const dynamic = 'force-dynamic';

// Administración marca el recibo como FIRMADO cuando el empleado ya lo firmó en papel y quedó archivado.
export async function POST(request, { params }) {
    const acceso = await requerirAdministracion();
    if (acceso.error) return acceso.error;
    try {
        const { id } = await params;
        if (!UUID.test(id)) return NextResponse.json({ error: 'Recibo no encontrado' }, { status: 404 });
        const pago = await db.PagoEmpleado.findByPk(id);
        if (!pago) return NextResponse.json({ error: 'Recibo no encontrado' }, { status: 404 });
        if (pago.estado === 'CONFIRMADO') return NextResponse.json({ error: 'Este recibo ya está marcado como firmado' }, { status: 409 });
        if (pago.estado === 'ANULADO') return NextResponse.json({ error: 'Este recibo fue anulado' }, { status: 409 });
        pago.estado = 'CONFIRMADO';
        pago.confirmadoAt = new Date();
        pago.confirmadoPorId = acceso.usuarioId;
        await pago.save();
        return NextResponse.json({ pago });
    } catch (error) {
        console.error('Marcar recibo firmado:', error);
        return NextResponse.json({ error: 'No se pudo marcar el recibo' }, { status: 500 });
    }
}
