import { NextResponse } from 'next/server';
import { requerirNoVendedor } from '@/app/api/_lib/acceso';
import { buscarCompraDuplicada } from '@/app/api/_lib/compraDuplicada';

export const dynamic = 'force-dynamic';

// Primer paso al ingresar una compra: con solo el proveedor y el número (y, si se tiene, el control) dice si esa factura ya está registrada.
export async function GET(request) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    try {
        const p = new URL(request.url).searchParams;
        const proveedorId = Number(p.get('proveedorId'));
        const tipo = p.get('tipo') === 'NOTA_ENTREGA' ? 'NOTA_ENTREGA' : 'FACTURA';
        const numero = String(p.get('numero') || '').trim().slice(0, 50);
        const control = String(p.get('control') || '').trim().slice(0, 30);
        if (!Number.isInteger(proveedorId) || proveedorId < 1 || (!numero && !control)) return NextResponse.json({ exacta: null, parecidas: [] });
        return NextResponse.json(await buscarCompraDuplicada({ proveedorId, tipo, numero, control }));
    } catch (error) {
        console.error('Verificar compra repetida:', error);
        return NextResponse.json({ error: 'No se pudo verificar la factura' }, { status: 500 });
    }
}
