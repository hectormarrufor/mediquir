import { NextResponse } from 'next/server';
import sequelize from '@/sequelize';
import { Venta } from '@/models';
import { requerirAdmin } from '@/app/api/_lib/acceso';
import { planAnulacion, anularFactura, ErrorAnulacion } from '@/app/api/_lib/anularFactura';
import { ErrorNota } from '@/app/api/_lib/notasFiscales';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const respuestaError = (error, contexto) => {
    if (error instanceof ErrorAnulacion || error instanceof ErrorNota) return NextResponse.json({ error: error.message, ...(error.codigo ? { codigo: error.codigo } : {}) }, { status: error.status || 400 });
    console.error(contexto, error);
    return NextResponse.json({ error: 'No se pudo completar la anulación' }, { status: 500 });
};

// Lo que el formulario de anulación necesita (renglones por acreditar, notas de entrega de origen, controles sugeridos)
export async function GET(_request, { params }) {
    const acceso = await requerirAdmin();
    if (acceso.error) return acceso.error;
    try {
        const { id } = await params;
        if (!UUID.test(id)) return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
        const venta = await Venta.findByPk(id);
        if (!venta) return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
        return NextResponse.json(await planAnulacion({ venta }));
    } catch (error) {
        return respuestaError(error, 'Plan de anulación:');
    }
}

// { tipo: 'TOTAL'|'PARCIAL', notas (varias NC: [{ renglones, numero, control }]), renglones, afectaCxc, motivo, documentos: { [ventaId]: { numero, control } }, fecha }
export async function POST(request, { params }) {
    const acceso = await requerirAdmin();
    if (acceso.error) return acceso.error;
    const t = await sequelize.transaction();
    try {
        const { id } = await params;
        if (!UUID.test(id)) throw new ErrorAnulacion('Factura no encontrada', 404);
        const venta = await Venta.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!venta) throw new ErrorAnulacion('Factura no encontrada', 404);
        const b = await request.json();
        const r = await anularFactura({
            venta, tipo: b.tipo, renglones: b.renglones, afectaCxc: typeof b.afectaCxc === 'boolean' ? b.afectaCxc : null, motivo: b.motivo,
            documentos: b.documentos && typeof b.documentos === 'object' ? b.documentos : {}, notas: Array.isArray(b.notas) ? b.notas : null, fecha: b.fecha || null, confirmarPagada: b.confirmarPagada === true, usuarioId: Number(acceso.sesion.id) || null, transaction: t,
        });
        await t.commit();
        return NextResponse.json({ success: true, ...r });
    } catch (error) {
        if (!t.finished) await t.rollback();
        return respuestaError(error, 'Anular factura:');
    }
}
