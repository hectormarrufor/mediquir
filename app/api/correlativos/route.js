import { NextResponse } from 'next/server';
import Correlativo from '@/models/Correlativo';

export async function GET() {
    try {
        const correlativos = await Correlativo.findAll();
        return NextResponse.json(correlativos);
    } catch (error) {
        console.error('Error obteniendo correlativos:', error);
        return NextResponse.json({ error: 'Error al obtener correlativos' }, { status: 500 });
    }
}