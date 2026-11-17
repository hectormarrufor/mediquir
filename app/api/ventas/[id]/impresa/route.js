import { NextResponse } from 'next/server';
import { requerirStaff } from '../../../inventario/_lib';
import { marcarImpresa } from '../../../_lib/corregirFactura';
import { estaPorAprobar, esFacturaAprobadaDe } from '../../../_lib/aprobacion';
import { rolDe } from '@/app/constants/roles';

// La factura se mandó a imprimir en la forma libre: desde aquí ya no se corrige ni se elimina (solo con notas de crédito o débito)
export async function POST(request, { params }) {
    const a = await requerirStaff();
    if (a.error) return a.error;
    const { id } = await params;
    if (await estaPorAprobar('VENTA', id)) return NextResponse.json({ error: 'La factura está por aprobar: no se puede imprimir todavía' }, { status: 409 });
    if (rolDe(a.sesion) === 'vendedor' && !(await esFacturaAprobadaDe(id, a.sesion.id))) return NextResponse.json({ error: 'Solo puedes imprimir tus facturas ya aprobadas' }, { status: 403 });
    await marcarImpresa(id);
    return NextResponse.json({ success: true });
}
