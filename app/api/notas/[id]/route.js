import { NextResponse } from 'next/server';
import { Marca, Producto, Cliente, NotaFiscal, NotaFiscalDetalle, Proveedor, Venta, FacturaCompra, sequelize } from '@/models';
import { requerirAdmin, requerirNoVendedor } from '@/app/api/_lib/acceso';
import { tasaVigente } from '@/app/api/_lib/tasaBcv';
import { estaPorAprobar, esNotaAprobadaDe } from '@/app/api/_lib/aprobacion';
import { getSesion } from '@/app/api/notificaciones/_lib';
import { rolDe } from '@/app/constants/roles';
import { ErrorNota, anularNota, registrarReintegro, compensarSaldoAFavor } from '@/app/api/_lib/notasFiscales';
import { puedeCorregirFacturas } from '@/app/api/_lib/corregirFactura';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Una nota con todo lo que hace falta para verla o imprimirla
export async function GET(request, { params }) {
    // Un vendedor solo ve (para imprimirla) una nota SUYA ya aprobada
    const sesionActual = await getSesion();
    const esVend = Boolean(sesionActual) && !sesionActual.clienteId && rolDe(sesionActual) === 'vendedor';
    const acceso = esVend ? { sesion: sesionActual } : await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    try {
        const { id } = await params;
        if (!UUID.test(id)) return NextResponse.json({ error: 'Nota no encontrada' }, { status: 404 });
        if (esVend && !(await esNotaAprobadaDe(id, sesionActual.id))) return NextResponse.json({ error: 'Solo puedes ver tus notas ya aprobadas' }, { status: 403 });
        const nota = await NotaFiscal.findByPk(id, {
            include: [
                { model: NotaFiscalDetalle, as: 'detalles' },
                { model: Cliente, as: 'cliente', attributes: ['id', 'nombre', 'identificacion', 'direccion'] },
                { model: Proveedor, as: 'proveedor', attributes: ['id', 'nombre', 'identificacion'] },
                { model: Venta, as: 'venta', attributes: ['id', 'numeroDocumento', 'numeroControl', 'createdAt', 'condicionPago'] },
                { model: FacturaCompra, as: 'facturaCompra', attributes: ['id', 'numeroDocumento', 'numeroControl', 'fechaFactura'] },
            ],
        });
        if (!nota) return NextResponse.json({ error: 'Nota no encontrada' }, { status: 404 });
        // La marca del producto sale impresa junto al artículo
        const json = nota.toJSON();
        const ids = [...new Set((json.detalles || []).map((d) => d.productoId).filter(Boolean))];
        if (ids.length) {
            const productos = await Producto.findAll({ where: { id: ids }, attributes: ['id'], include: [{ model: Marca, as: 'marca', attributes: ['nombre'] }] });
            const marcas = Object.fromEntries(productos.map((p) => [p.id, p.marca?.nombre]));
            json.detalles = json.detalles.map((d) => ({ ...d, marcaNombre: marcas[d.productoId] || null }));
        }
        json.aprobacionPendiente = await estaPorAprobar('NOTA', nota.id);
        return NextResponse.json(json);
    } catch (error) {
        console.error('Detalle de nota:', error);
        return NextResponse.json({ error: 'No se pudo cargar la nota' }, { status: 500 });
    }
}

// Acciones sobre una nota: NUMERO_CONTROL (dato fiscal) · REINTEGRO (devolver dinero al cliente) · ANULAR (solo administrador)
export async function PUT(request, { params }) {
    const t = await sequelize.transaction();
    let compensacion = null;
    let eliminada = false;
    try {
        const { id } = await params;
        const body = await request.json();
        const { accion } = body;

        const acceso = accion === 'ANULAR' ? await requerirAdmin() : await requerirNoVendedor();
        if (acceso.error) { await t.rollback(); return acceso.error; }
        if (!UUID.test(id)) throw new ErrorNota('Nota no encontrada', 404);

        const nota = await NotaFiscal.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!nota) throw new ErrorNota('Nota no encontrada', 404);

        if (accion === 'NUMERO_CONTROL') {
            if (nota.estado !== 'EMITIDA') throw new ErrorNota('La nota está anulada', 409);
            // El control de una nota de la empresa lo asigna el sistema al imprimirla por primera vez: escribirlo a mano ya causó un control mal tecleado
            if (nota.origen === 'VENTA') throw new ErrorNota('El número de control de una nota de crédito o débito se asigna solo, al imprimirla por primera vez', 409);
            nota.numeroControl = String(body.numeroControl || '').trim().slice(0, 30) || null;
            await nota.save({ transaction: t });
        } else if (accion === 'REINTEGRO') {
            const tasa = await tasaVigente({ transaction: t });
            await registrarReintegro({ nota, montoUsd: body.montoUsd, tasa, metodoPago: body.metodoPago, referencia: body.referencia, transaction: t });
        } else if (accion === 'COMPENSAR') {
            // Usa el saldo a favor de la nota para pagar otras facturas pendientes del cliente (las más antiguas primero, o las de `ventaIds`)
            const tasa = await tasaVigente({ transaction: t });
            compensacion = await compensarSaldoAFavor({ nota, ventaIds: Array.isArray(body.ventaIds) ? body.ventaIds.filter((x) => UUID.test(String(x))) : null, tasa, transaction: t });
        } else if (accion === 'ANULAR') {
            await anularNota({ nota, transaction: t });
        } else if (accion === 'ELIMINAR') {
            // Una nota sin número de control (aún no se imprimió) se puede eliminar: se revierten sus efectos y desaparece; su número queda libre si era el último
            if (!(await puedeCorregirFacturas(acceso.sesion))) throw new ErrorNota('Solo Jolexi o el usuario 1 pueden eliminar notas', 403);
            if (nota.origen !== 'VENTA') throw new ErrorNota('Solo se eliminan las notas que emitió la empresa', 409);
            if (nota.numeroControl) throw new ErrorNota(`Esta nota ya tiene número de control (${nota.numeroControl}): se asignó al imprimirla y ya no se puede eliminar`, 409);
            if (nota.estado === 'EMITIDA') await anularNota({ nota, transaction: t }); // revierte inventario, abono y saldo a favor
            await NotaFiscal.destroy({ where: { id: nota.id }, transaction: t }); // sus renglones se borran en cascada
            eliminada = true;
        } else {
            throw new ErrorNota('Acción no válida');
        }
        await t.commit();
        return NextResponse.json({ success: true, nota, compensacion, eliminada });
    } catch (error) {
        if (!t.finished) await t.rollback();
        if (error instanceof ErrorNota) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('Acción sobre nota:', error);
        return NextResponse.json({ error: 'No se pudo completar la acción' }, { status: 500 });
    }
}
