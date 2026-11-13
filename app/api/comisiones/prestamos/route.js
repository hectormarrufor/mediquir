import { NextResponse } from 'next/server';
import db from '@/models';
import { requerirNoVendedor } from '../../_lib/acceso';
import { fechaCaracas } from '@/app/constants/hora';

export const dynamic = 'force-dynamic';
const { VendedorComision, MovimientoPrestamoVendedor } = db;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Presta dinero a un vendedor a comisión (el primero o uno más): se suma a lo que debe. { vendedorId, montoUsd, fecha?, nota? }
export async function POST(request) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    try {
        const b = await request.json();
        const vendedor = await VendedorComision.findByPk(Number(b.vendedorId));
        if (!vendedor) return NextResponse.json({ error: 'Elige un vendedor' }, { status: 400 });
        const monto = r2(b.montoUsd);
        if (!(monto > 0)) return NextResponse.json({ error: 'Escribe el monto del préstamo' }, { status: 400 });
        const mov = await MovimientoPrestamoVendedor.create({
            vendedorId: vendedor.id, tipo: 'PRESTAMO', montoUsd: monto, fecha: FECHA.test(String(b.fecha || '')) ? b.fecha : fechaCaracas(),
            nota: String(b.nota || '').trim().slice(0, 500) || null,
        });
        return NextResponse.json({ ok: true, movimiento: mov }, { status: 201 });
    } catch (error) {
        console.error('Préstamo a vendedor:', error);
        return NextResponse.json({ error: 'No se pudo registrar el préstamo' }, { status: 500 });
    }
}
