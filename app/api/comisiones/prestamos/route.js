import { NextResponse } from 'next/server';
import db from '@/models';
import { requerirNoVendedor } from '../../_lib/acceso';
import { fechaCaracas } from '@/app/constants/hora';

export const dynamic = 'force-dynamic';
const { VendedorComision, MovimientoPrestamoVendedor } = db;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Borra un préstamo registrado por error: ?id=  (solo un PRESTAMO, y solo si lo que debe el vendedor no queda en negativo por los abonos ya hechos)
export async function DELETE(request) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    try {
        const mov = await MovimientoPrestamoVendedor.findByPk(Number(new URL(request.url).searchParams.get('id')));
        if (!mov) return NextResponse.json({ error: 'Ese préstamo ya no existe' }, { status: 404 });
        if (mov.tipo !== 'PRESTAMO') return NextResponse.json({ error: 'Un abono que viene de un pago de comisión no se borra aquí' }, { status: 400 });
        const movs = await MovimientoPrestamoVendedor.findAll({ where: { vendedorId: mov.vendedorId }, raw: true });
        const saldo = movs.reduce((a, m) => a + (m.tipo === 'PRESTAMO' ? 1 : -1) * Number(m.montoUsd), 0) - Number(mov.montoUsd);
        if (saldo < -0.004) return NextResponse.json({ error: 'No se puede borrar: el vendedor ya abonó más de lo que quedaría prestado' }, { status: 409 });
        await mov.destroy();
        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('Borrar préstamo:', error);
        return NextResponse.json({ error: 'No se pudo borrar el préstamo' }, { status: 500 });
    }
}

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
