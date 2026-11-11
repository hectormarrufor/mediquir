import { NextResponse } from 'next/server';
import { requerirAdmin } from '@/app/api/_lib/acceso';
import { ventasPorProducto } from '@/app/api/inventario/_ventasProducto';
import { fechaCaracas } from '@/app/constants/hora';

export const dynamic = 'force-dynamic';
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Total vendido de cada producto en un periodo: ?desde=2026-01-01&hasta=2026-11-10&marcas=juntas
// Son montos de venta: solo administración
export async function GET(request) {
    const acceso = await requerirAdmin();
    if (acceso.error) return acceso.error;
    try {
        const p = new URL(request.url).searchParams;
        const hoy = fechaCaracas();
        const desde = FECHA.test(p.get('desde') || '') ? p.get('desde') : `${hoy.slice(0, 4)}-01-01`;
        const hasta = FECHA.test(p.get('hasta') || '') ? p.get('hasta') : hoy;
        if (desde > hasta) return NextResponse.json({ error: 'La fecha inicial es posterior a la final' }, { status: 400 });
        return NextResponse.json({ desde, hasta, ...(await ventasPorProducto({ desde, hasta, agruparMarcas: p.get('marcas') === 'juntas' })) });
    } catch (error) {
        console.error('Ventas por producto:', error);
        return NextResponse.json({ error: 'No se pudo calcular lo vendido por producto' }, { status: 500 });
    }
}
