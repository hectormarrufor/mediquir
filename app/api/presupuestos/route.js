import { NextResponse } from 'next/server';
import { Presupuesto, Cliente } from '@/models';
import { requerirStaff } from '../inventario/_lib';
import { numeroDe } from './_lib';
import { armarPresupuesto } from './_armar';

const plano = (p) => ({ ...p.toJSON(), numero: numeroDe(p.id) });

export async function GET(request) {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;
    try {
        const { searchParams } = new URL(request.url);
        const limite = Math.min(Number(searchParams.get('limite')) || 50, 200);
        const presupuestos = await Presupuesto.findAll({
            include: [{ model: Cliente, as: 'cliente', attributes: ['id', 'nombre', 'identificacion'] }],
            order: [['createdAt', 'DESC']],
            limit: limite,
        });
        return NextResponse.json(presupuestos.map(plano));
    } catch (error) {
        console.error('Presupuestos:', error);
        return NextResponse.json({ error: 'No se pudo cargar la lista de presupuestos' }, { status: 500 });
    }
}

export async function POST(request) {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;
    try {
        const { error, datos } = await armarPresupuesto(await request.json());
        if (error) return NextResponse.json({ error }, { status: 400 });
        const presupuesto = await Presupuesto.create({ ...datos, creadoPorId: Number(acceso.sesion.id) || null });

        return NextResponse.json(plano(presupuesto), { status: 201 });
    } catch (error) {
        console.error('Presupuestos (crear):', error);
        return NextResponse.json({ error: 'No se pudo guardar el presupuesto' }, { status: 500 });
    }
}
