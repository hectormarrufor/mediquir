import { NextResponse } from 'next/server';
import db from '@/models';
import { requerirNoVendedor } from '../_lib/acceso';
import { armarRecibo, siguienteNumero } from './_lib';

export const dynamic = 'force-dynamic';
const { Recibo } = db;

// Lista de recibos (los más recientes primero) y el número que toca al próximo: ?limite=
export async function GET(request) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    try {
        const limite = Math.min(Number(new URL(request.url).searchParams.get('limite')) || 100, 300);
        const recibos = await Recibo.findAll({ order: [['numero', 'DESC']], limit: limite, raw: true });
        return NextResponse.json({ recibos, siguiente: await siguienteNumero() });
    } catch (error) {
        console.error('Recibos:', error);
        return NextResponse.json({ error: 'No se pudo cargar la lista de recibos' }, { status: 500 });
    }
}

// Crea un recibo. Sin `numero` toma el siguiente del correlativo; con `numero` se usa ese (el talonario puede traer otro número)
export async function POST(request) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    try {
        const { error, datos, numero } = armarRecibo(await request.json());
        if (error) return NextResponse.json({ error }, { status: 400 });
        if (numero !== null && (await Recibo.findOne({ where: { numero }, attributes: ['id'] }))) return NextResponse.json({ error: `El recibo N° ${numero} ya existe` }, { status: 409 });
        const recibo = await Recibo.create({ ...datos, numero: numero ?? (await siguienteNumero()), creadoPorId: Number(acceso.sesion?.id) || null });
        return NextResponse.json(recibo, { status: 201 });
    } catch (error) {
        if (error?.name === 'SequelizeUniqueConstraintError') return NextResponse.json({ error: 'Ese número de recibo ya existe: vuelve a intentar' }, { status: 409 });
        console.error('Recibos (crear):', error);
        return NextResponse.json({ error: 'No se pudo guardar el recibo' }, { status: 500 });
    }
}
