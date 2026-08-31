import { NextResponse } from 'next/server';
import db from '@/models/index';

export async function GET() {
    try {
        const pagos = await db.PagoSms.findAll({
            order: [['fechaHora', 'DESC']],
            // limit: 100 // Opcional: limitar a los últimos 100 para que cargue ultra rápido
        });

        return NextResponse.json(pagos);
    } catch (error) {
        console.error('Error obtenendo pagos recibidos:', error);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}