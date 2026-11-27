import { NextResponse } from 'next/server';
import sequelize from '@/sequelize';
import { Venta } from '@/models';
import { rolDe } from '@/app/api/_lib/acceso';
import { requerirStaff } from '@/app/api/inventario/_lib';
import { aprobacionDisponible, marcarPorAprobar, avisarPorAprobar, nombreDeUsuario, efectosDiferidosDisponible, leerEfectosPendientes } from '@/app/api/_lib/aprobacion';
import { planAnulacion, anularFactura, anularFacturaDirecta, ErrorAnulacion } from '@/app/api/_lib/anularFactura';
import { ErrorNota } from '@/app/api/_lib/notasFiscales';
import { asegurarColumnasEmpaqueNotas, notificarCajaRetenidaPorNc } from '@/app/api/_lib/empaqueNotas';

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
        if (rolDe(acceso.sesion) === 'vendedor' && ![venta.vendedorId, venta.empacadorId, venta.etiquetadorId].map(Number).includes(Number(acceso.sesion.id))) {
            return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
        }
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
    await asegurarColumnasEmpaqueNotas();
    const t = await sequelize.transaction();
    try {
        const { id } = await params;
        if (!UUID.test(id)) throw new ErrorAnulacion('Factura no encontrada', 404);
        const venta = await Venta.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!venta) throw new ErrorAnulacion('Factura no encontrada', 404);
        if (esVend) {
            if (![venta.vendedorId, venta.empacadorId, venta.etiquetadorId].map(Number).includes(Number(acceso.sesion.id))) {
                throw new ErrorAnulacion('Factura no encontrada', 404);
            }
            if (!(await aprobacionDisponible())) throw new ErrorAnulacion('Todavía no está activada la aprobación de documentos: pídele a administración que emita la nota', 409);
        }
        // Una factura por aprobar todavía no movió nada: se corrige o se elimina, no se anula con una nota
        if (await leerEfectosPendientes('VENTA', venta.id, t)) throw new ErrorAnulacion('Esta factura todavía está por aprobar: pide que se corrija o se elimine en lugar de anularla con una nota de crédito', 409);
        // La nota de un vendedor no mueve inventario ni cuentas por cobrar hasta que jolexi la aprueba
        const diferir = esVend && (await efectosDiferidosDisponible());
        const b = await request.json();
        if (b.tipo === 'DIRECTA') {
            if (!acceso.sesion.isAdmin) {
                throw new ErrorAnulacion('Solo un administrador puede anular una factura sin Nota de Crédito', 403);
            }
            const r = await anularFacturaDirecta({
                venta,
                motivo: b.motivo,
                tieneOriginalYCopias: b.tieneOriginalYCopias === true,
                usuarioId: Number(acceso.sesion.id) || null,
                transaction: t,
            });
            await t.commit();
            return NextResponse.json({ success: true, ...r });
        }

        const r = await anularFactura({
            venta, tipo: b.tipo, renglones: b.renglones, afectaCxc: typeof b.afectaCxc === 'boolean' ? b.afectaCxc : null, motivo: b.motivo,
            documentos: b.documentos && typeof b.documentos === 'object' ? b.documentos : {}, notas: Array.isArray(b.notas) ? b.notas : null, fecha: b.fecha || null, confirmarPagada: b.confirmarPagada === true, modificarPago: b.modificarPago === true,usuarioId: Number(acceso.sesion.id) || null, diferir, permitirControl: !esVend && b.huecoControl === true, transaction: t,
        });
        if (diferir) for (const n of r.notas || []) if (n.id) await marcarPorAprobar('NOTA', n.id, t); // por aprobar en la misma transacción: nunca queda una nota con efectos pendientes sin aprobación
        await t.commit();
        for (const aviso of r.avisosPostEmpaque || []) await notificarCajaRetenidaPorNc(aviso);
        // Lo que emite un vendedor queda por aprobar (jolexi lo revisa y lo imprime)
        let porAprobar = false;
        if (esVend) {
            const vendedor = await nombreDeUsuario(acceso.sesion.id).catch(() => null);
            for (const n of r.notas || []) {
                if (n.id && (diferir || await marcarPorAprobar('NOTA', n.id))) { porAprobar = true; await avisarPorAprobar({ tipoDoc: 'la nota de crédito', numero: n.numero, vendedor }); }
            }
        }
        return NextResponse.json({ success: true, ...r, porAprobar });
    } catch (error) {
        if (!t.finished) await t.rollback();
        return respuestaError(error, 'Anular factura:');
    }
}
