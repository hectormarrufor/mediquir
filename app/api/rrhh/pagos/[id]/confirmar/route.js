import { NextResponse } from 'next/server';
import db from '@/models';
import { notificarCabezas } from '@/app/handlers/notificar';
import { TIPOS_PAGO } from '@/app/constants/pagosEmpleados';
import { requerirPersonal, UUID } from '../../_lib';

export const dynamic = 'force-dynamic';

const { PagoEmpleado, sequelize } = db;

// El empleado confirma que recibió el pago desde su usuario: { acepto: true }. Queda la fecha y hora, su usuario y la IP (sin firma dibujada).
// Solo puede confirmar el empleado dueño del recibo (por el enlace usuario -> empleado de su sesión).
export async function POST(request, { params }) {
    const acceso = await requerirPersonal();
    if (acceso.error) return acceso.error;
    try {
        const { id } = await params;
        if (!UUID.test(id)) return NextResponse.json({ error: 'Recibo no encontrado' }, { status: 404 });
        const body = await request.json();
        if (body.acepto !== true) return NextResponse.json({ error: 'Marca la casilla de conformidad para confirmar' }, { status: 400 });

        const t = await sequelize.transaction();
        try {
            const pago = await PagoEmpleado.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
            if (!pago || !acceso.empleadoId || pago.empleadoId !== acceso.empleadoId) { await t.rollback(); return NextResponse.json({ error: 'Recibo no encontrado' }, { status: 404 }); }
            if (pago.estado === 'CONFIRMADO') { await t.rollback(); return NextResponse.json({ error: 'Este recibo ya está confirmado' }, { status: 409 }); }
            if (pago.estado === 'ANULADO') { await t.rollback(); return NextResponse.json({ error: 'Este recibo fue anulado' }, { status: 409 }); }

            pago.estado = 'CONFIRMADO';
            pago.confirmadoAt = new Date();
            pago.confirmadoPorId = acceso.usuarioId;
            pago.confirmadoIp = String(request.headers.get('x-forwarded-for') || '').split(',')[0].trim().slice(0, 60) || null;
            await pago.save({ transaction: t });
            await t.commit();

            try {
                await notificarCabezas({
                    title: '✅ Recibo confirmado',
                    body: `${pago.empleadoNombre} confirmó su recibo de ${TIPOS_PAGO[pago.tipo]?.etiqueta?.toLowerCase() || 'pago'}.`,
                    url: '/superuser/rrhh/pagos',
                    tag: `pago-confirmado-${pago.id}`,
                });
            } catch (e) { console.error('Aviso de recibo confirmado:', e.message); }
            return NextResponse.json({ pago });
        } catch (e) {
            if (!t.finished) await t.rollback();
            throw e;
        }
    } catch (error) {
        console.error('Confirmar recibo de pago:', error);
        return NextResponse.json({ error: 'No se pudo confirmar el recibo' }, { status: 500 });
    }
}
