// Ruta: app/api/clientes/buscar/route.js

import { Cliente } from '@/models';
import { NextResponse } from 'next/server';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const identificacion = searchParams.get('id');

    if (!identificacion) {
        return NextResponse.json({ message: 'Identificación requerida' }, { status: 400 });
    }

    try {
        const cliente = await Cliente.findOne({
            where: { identificacion: identificacion }
        });

        if (cliente) {
            return NextResponse.json({ success: true, cliente }, { status: 200 });
        } else {
            return NextResponse.json({ success: false, message: 'Cliente no encontrado' }, { status: 404 });
        }
    } catch (error) {
        console.error("Error buscando cliente:", error);
        return NextResponse.json({ message: 'Error interno del servidor' }, { status: 500 });
    }
}