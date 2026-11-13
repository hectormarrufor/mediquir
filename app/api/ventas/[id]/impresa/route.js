import { NextResponse } from 'next/server';
import { requerirStaff } from '../../../inventario/_lib';
import { marcarImpresa } from '../../../_lib/corregirFactura';

// La factura se mandó a imprimir en la forma libre: desde aquí ya no se corrige ni se elimina (solo con notas de crédito o débito)
export async function POST(request, { params }) {
    const a = await requerirStaff();
    if (a.error) return a.error;
    const { id } = await params;
    await marcarImpresa(id);
    return NextResponse.json({ success: true });
}
