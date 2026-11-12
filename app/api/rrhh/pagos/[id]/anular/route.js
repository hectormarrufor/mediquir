import { NextResponse } from 'next/server';
import db from '@/models';
import { requerirAdministracion, UUID } from '../../_lib';

export const dynamic = 'force-dynamic';

// Anula un recibo (solo administración). No se borra: queda en el histórico como anulado, con el motivo.
export async function POST(request, { params }) {
    const acceso = await requerirAdministracion();
    if (acceso.error) return acceso.error;
    try {
        const { id } = await params;
        if (!UUID.test(id)) return NextResponse.json({ error: 'Recibo no encontrado' }, { status: 404 });
        const { motivo } = await request.json();
        const texto = String(motivo || '').trim().slice(0, 250);
        if (texto.length < 5) return NextResponse.json({ error: 'Explica el motivo de la anulación (mínimo 5 caracteres)' }, { status: 400 });
        const pago = await db.PagoEmpleado.findByPk(id);
        if (!pago) return NextResponse.json({ error: 'Recibo no encontrado' }, { status: 404 });
        if (pago.estado === 'ANULADO') return NextResponse.json({ error: 'Este recibo ya está anulado' }, { status: 409 });
        pago.estado = 'ANULADO';
        pago.anuladoAt = new Date();
        pago.anuladoMotivo = texto;
        await pago.save();
        return NextResponse.json({ pago });
    } catch (error) {
        console.error('Anular recibo de pago:', error);
        return NextResponse.json({ error: 'No se pudo anular el recibo' }, { status: 500 });
    }
}
