import { NextResponse } from 'next/server';
import { Presupuesto, Cliente } from '@/models';
import { requerirStaff } from '../../inventario/_lib';
import { numeroDe } from '../_lib';

export async function GET(request, { params }) {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;
    try {
        const { id } = await params;
        // Un enlace mal copiado ("P-000012" o texto) daba error 500: el id es un número
        const n = Number(String(id).replace(/^P-/i, ''));
        if (!Number.isInteger(n) || n < 1) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
        const presupuesto = await Presupuesto.findByPk(n, {
            include: [{ model: Cliente, as: 'cliente', attributes: ['id', 'nombre', 'identificacion', 'direccion'] }],
        });
        if (!presupuesto) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
        return NextResponse.json({ ...presupuesto.toJSON(), numero: numeroDe(presupuesto.id) });
    } catch (error) {
        console.error('Presupuesto (ver):', error);
        return NextResponse.json({ error: 'No se pudo cargar el presupuesto' }, { status: 500 });
    }
}
