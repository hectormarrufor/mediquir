import { NextResponse } from 'next/server';
import { Venta, sequelize } from '@/models';
import { requerirNoVendedor } from '@/app/api/_lib/acceso';
import { ErrorNota, emitirNotaVenta, notasDeVenta } from '@/app/api/_lib/notasFiscales';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Notas de crédito y de débito de una factura y lo que queda por acreditar de cada renglón
export async function GET(request, { params }) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    try {
        const { id } = await params;
        if (!UUID.test(id)) return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
        const venta = await Venta.findByPk(id);
        if (!venta) return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
        return NextResponse.json(await notasDeVenta(venta));
    } catch (error) {
        console.error('Notas de una factura:', error);
        return NextResponse.json({ error: 'No se pudieron cargar las notas' }, { status: 500 });
    }
}

// Emite una nota de crédito o de débito sobre la factura: { tipo, motivo, renglones, devuelveInventario }
export async function POST(request, { params }) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;

    const t = await sequelize.transaction();
    try {
        const { id } = await params;
        if (!UUID.test(id)) throw new ErrorNota('Factura no encontrada', 404);
        const { tipo, motivo, renglones, devuelveInventario } = await request.json();

        const venta = await Venta.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!venta) throw new ErrorNota('Factura no encontrada', 404);

        const nota = await emitirNotaVenta({ venta, tipo, renglones, motivo, devuelveInventario: Boolean(devuelveInventario), usuarioId: Number(acceso.sesion.id) || null, transaction: t });
        await t.commit();
        return NextResponse.json({ success: true, nota }, { status: 201 });
    } catch (error) {
        if (!t.finished) await t.rollback();
        if (error instanceof ErrorNota) return NextResponse.json({ error: error.message, codigo: error.codigo }, { status: error.status });
        console.error('Emitir nota:', error);
        return NextResponse.json({ error: 'No se pudo emitir la nota' }, { status: 500 });
    }
}
