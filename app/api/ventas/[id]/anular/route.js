import { NextResponse } from 'next/server';
import sequelize from '@/sequelize';
import { Venta } from '@/models';
import { rolDe } from '@/app/api/_lib/acceso';
import { requerirStaff } from '@/app/api/inventario/_lib';
import { aprobacionDisponible, marcarPorAprobar, avisarPorAprobar, nombreDeUsuario } from '@/app/api/_lib/aprobacion';
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
    const acceso = await requerirStaff(); // un vendedor la usa sobre SUS facturas (lo que emite queda por aprobar)
    if (acceso.error) return acceso.error;
    try {
        const { id } = await params;
        if (!UUID.test(id)) return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
        const venta = await Venta.findByPk(id);
        if (!venta) return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
        if (rolDe(acceso.sesion) === 'vendedor' && Number(venta.vendedorId) !== Number(acceso.sesion.id)) return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
        return NextResponse.json(await planAnulacion({ venta }));
    } catch (error) {
        return respuestaError(error, 'Plan de anulación:');
    }
}

// confirmarPagada / modificarPago: nota parcial sobre factura pagada (modificarPago rebaja además el pago ya registrado)
// { tipo: 'TOTAL'|'PARCIAL', notas (varias NC: [{ renglones, numero, control }]), renglones, afectaCxc, motivo, documentos: { [ventaId]: { numero, control } }, fecha }
export async function POST(request, { params }) {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;
    const esVend = rolDe(acceso.sesion) === 'vendedor';
    const t = await sequelize.transaction();
    try {
        const { id } = await params;
        if (!UUID.test(id)) throw new ErrorAnulacion('Factura no encontrada', 404);
        const venta = await Venta.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!venta) throw new ErrorAnulacion('Factura no encontrada', 404);
        if (esVend) {
            if (Number(venta.vendedorId) !== Number(acceso.sesion.id)) throw new ErrorAnulacion('Factura no encontrada', 404);
            if (!(await aprobacionDisponible())) throw new ErrorAnulacion('Todavía no está activada la aprobación de documentos: pídele a administración que emita la nota', 409);
        }
        const b = await request.json();
        const r = await anularFactura({
            venta, tipo: b.tipo, renglones: b.renglones, afectaCxc: typeof b.afectaCxc === 'boolean' ? b.afectaCxc : null, motivo: b.motivo,
            documentos: b.documentos && typeof b.documentos === 'object' ? b.documentos : {}, notas: Array.isArray(b.notas) ? b.notas : null, fecha: b.fecha || null, confirmarPagada: b.confirmarPagada === true, modificarPago: b.modificarPago === true,usuarioId: Number(acceso.sesion.id) || null, transaction: t,
        });
        await t.commit();
        // Lo que emite un vendedor queda por aprobar (jolexi lo revisa y lo imprime)
        let porAprobar = false;
        if (esVend) {
            const vendedor = await nombreDeUsuario(acceso.sesion.id).catch(() => null);
            for (const n of r.notas || []) {
                if (n.id && await marcarPorAprobar('NOTA', n.id)) { porAprobar = true; await avisarPorAprobar({ tipoDoc: 'la nota de crédito', numero: n.numero, vendedor }); }
            }
        }
        return NextResponse.json({ success: true, ...r, porAprobar });
    } catch (error) {
        if (!t.finished) await t.rollback();
        return respuestaError(error, 'Anular factura:');
    }
}
