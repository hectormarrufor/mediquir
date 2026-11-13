import { NextResponse } from 'next/server';
import sequelize from '@/sequelize';
import db from '@/models';
import { requerirStaff } from '../../../inventario/_lib';
import { puedeCorregirFacturas, bloqueoCorreccion, modificarFactura, eliminarFacturaSinImprimir, ErrorCorreccion } from '../../../_lib/corregirFactura';
import { borrarArchivosDeVenta } from '../../_eliminar';
import { numerosAnteriores } from '@/app/constants/documentosAnteriores';

const { Venta, Cliente } = db;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Solo el usuario 1 y «jolexi» corrigen o eliminan facturas, y solo mientras no se hayan impreso en la forma libre
async function acceso() {
    const a = await requerirStaff();
    if (a.error) return a;
    if (!(await puedeCorregirFacturas(a.sesion))) return { error: NextResponse.json({ error: 'No tienes permiso para corregir facturas' }, { status: 403 }) };
    return a;
}

const responder = (e, etiqueta) => {
    if (e instanceof ErrorCorreccion) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(etiqueta, e);
    return NextResponse.json({ error: 'Error interno al corregir la factura', detalle: e.message }, { status: 500 });
};

// ¿Se puede corregir? (y los días de crédito del cliente, para sugerirlos)
export async function GET(request, { params }) {
    const a = await acceso();
    if (a.error) return a.error;
    try {
        const { id } = await params;
        if (!UUID.test(id)) return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
        const venta = await Venta.findByPk(id);
        if (!venta) return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
        const bloqueo = await bloqueoCorreccion(venta);
        const cliente = venta.clienteId ? await Cliente.findByPk(venta.clienteId, { attributes: ['diasCredito'] }) : null;
        return NextResponse.json({ bloqueo, diasCreditoCliente: Number(cliente?.diasCredito) || 0 });
    } catch (e) { return responder(e, 'Error consultando corrección de factura:'); }
}

export async function POST(request, { params }) {
    const a = await acceso();
    if (a.error) return a.error;
    const t = await sequelize.transaction();
    try {
        const { id } = await params;
        if (!UUID.test(id)) throw new ErrorCorreccion('Factura no encontrada', 404);
        const body = await request.json();
        const venta = await Venta.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!venta) throw new ErrorCorreccion('Factura no encontrada', 404);
        const r = await modificarFactura({ venta, condicionPago: body.condicionPago, diasCredito: body.diasCredito, metodoPago: body.metodoPago, referencia: body.referencia, detalles: body.detalles, transaction: t });
        await t.commit();
        return NextResponse.json({ success: true, ...r });
    } catch (e) {
        if (!t.finished) await t.rollback();
        return responder(e, 'Error modificando factura:');
    }
}

export async function DELETE(request, { params }) {
    const a = await acceso();
    if (a.error) return a.error;
    const t = await sequelize.transaction();
    try {
        const { id } = await params;
        if (!UUID.test(id)) throw new ErrorCorreccion('Factura no encontrada', 404);
        const venta = await Venta.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!venta) throw new ErrorCorreccion('Factura no encontrada', 404);
        const r = await eliminarFacturaSinImprimir({ venta, transaction: t });
        await t.commit();
        try {
            const conFotos = Boolean(venta.fotoCajaAbiertaUrl || venta.fotoCajaSelladaUrl);
            await borrarArchivosDeVenta([venta.numeroDocumento, ...(conFotos ? numerosAnteriores(venta.numeroDocumentoAnterior) : [])], r.archivos);
        } catch (e) { console.error('No se pudieron borrar los archivos del Blob de la factura eliminada:', e.message); }
        return NextResponse.json({
            success: true,
            message: `La factura ${venta.numeroDocumento} fue eliminada con todo su rastro.${r.control ? (r.controlLiberado ? ` El control ${r.control} quedó libre para la próxima factura.` : ` El control ${r.control} no era el último: ajústalo en Numeración fiscal si esa forma no se va a usar.`) : ''}`,
        });
    } catch (e) {
        if (!t.finished) await t.rollback();
        return responder(e, 'Error eliminando factura:');
    }
}
