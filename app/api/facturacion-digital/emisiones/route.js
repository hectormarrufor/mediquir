import { NextResponse } from 'next/server';
import db from '@/models';
import { requerirAdmin } from '@/app/api/_lib/acceso';

export const dynamic = 'force-dynamic';
const { EmisionDigital } = db;

export async function GET(request) {
    const acceso = await requerirAdmin();
    if (acceso.error) return acceso.error;

    try {
        const p = new URL(request.url).searchParams;
        const where = {};
        if (p.get('ambiente')) where.ambiente = p.get('ambiente');
        if (p.get('tipoDocumento')) where.tipoDocumento = p.get('tipoDocumento');
        if (p.get('estado')) where.estado = p.get('estado');

        const emisiones = await EmisionDigital.findAll({
            where,
            order: [['createdAt', 'DESC']],
            limit: 50,
        });
        return NextResponse.json(emisiones);
    } catch (error) {
        console.error('Error listando emisiones digitales:', error);
        return NextResponse.json({ error: 'No se pudo cargar el historial de emisiones digitales' }, { status: 500 });
    }
}
