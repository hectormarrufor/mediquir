import { NextResponse } from 'next/server';
import db from '@/models';
import { requerirNoVendedor } from '../../_lib/acceso';
import { armarRecibo } from '../_lib';

export const dynamic = 'force-dynamic';
const { Recibo } = db;

const buscar = async (params) => {
    const n = Number((await params).id);
    return Number.isInteger(n) && n >= 1 ? Recibo.findByPk(n) : null;
};

export async function GET(request, { params }) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    try {
        const recibo = await buscar(params);
        return recibo ? NextResponse.json(recibo) : NextResponse.json({ error: 'No encontrado' }, { status: 404 });
    } catch (error) {
        console.error('Recibo (ver):', error);
        return NextResponse.json({ error: 'No se pudo cargar el recibo' }, { status: 500 });
    }
}

// Modifica todo el recibo (incluido su número) o lo anula / reactiva: { anulado: true }
export async function PUT(request, { params }) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    try {
        const recibo = await buscar(params);
        if (!recibo) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
        const b = await request.json();
        if (Object.keys(b).length === 1 && typeof b.anulado === 'boolean') {
            await recibo.update({ anulado: b.anulado });
            return NextResponse.json(recibo);
        }
        const { error, datos, numero } = armarRecibo(b);
        if (error) return NextResponse.json({ error }, { status: 400 });
        if (numero !== null && numero !== recibo.numero && (await Recibo.findOne({ where: { numero }, attributes: ['id'] }))) return NextResponse.json({ error: `El recibo N° ${numero} ya existe` }, { status: 409 });
        await recibo.update({ ...datos, ...(numero !== null ? { numero } : {}) });
        return NextResponse.json(recibo);
    } catch (error) {
        console.error('Recibo (modificar):', error);
        return NextResponse.json({ error: 'No se pudo modificar el recibo' }, { status: 500 });
    }
}
