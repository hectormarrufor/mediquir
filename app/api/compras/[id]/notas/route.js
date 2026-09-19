import { NextResponse } from 'next/server';
import { FacturaCompra, NotaFiscal, sequelize } from '@/models';
import { requerirNoVendedor } from '@/app/api/_lib/acceso';
import { ErrorNota, registrarNotaCompra } from '@/app/api/_lib/notasFiscales';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Notas de crédito y de débito que un proveedor emitió sobre una factura de compra
export async function GET(request, { params }) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    try {
        const { id } = await params;
        if (!UUID.test(id)) return NextResponse.json({ error: 'Factura de compra no encontrada' }, { status: 404 });
        const notas = await NotaFiscal.findAll({ where: { facturaCompraId: id }, order: [['fecha', 'DESC']] });
        return NextResponse.json({ notas });
    } catch (error) {
        console.error('Notas de una compra:', error);
        return NextResponse.json({ error: 'No se pudieron cargar las notas' }, { status: 500 });
    }
}

// Registra una nota que emitió el proveedor: { tipo, numeroDocumento, numeroControl, fecha, baseImponible, montoExento, montoIva?, motivo }
export async function POST(request, { params }) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;

    const t = await sequelize.transaction();
    try {
        const { id } = await params;
        if (!UUID.test(id)) throw new ErrorNota('Factura de compra no encontrada', 404);
        const cuerpo = await request.json();
        const factura = await FacturaCompra.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!factura) throw new ErrorNota('Factura de compra no encontrada', 404);
        if (factura.tipoDocumento !== 'FACTURA') throw new ErrorNota('Solo las facturas admiten notas de crédito o de débito', 409);

        const nota = await registrarNotaCompra({ factura, ...cuerpo, usuarioId: Number(acceso.sesion.id) || null, transaction: t });
        await t.commit();
        return NextResponse.json({ success: true, nota }, { status: 201 });
    } catch (error) {
        if (!t.finished) await t.rollback();
        if (error instanceof ErrorNota) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('Registrar nota de compra:', error);
        return NextResponse.json({ error: 'No se pudo registrar la nota' }, { status: 500 });
    }
}
