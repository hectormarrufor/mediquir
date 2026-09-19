import { NextResponse } from 'next/server';
import { Cliente, NotaFiscal, NotaFiscalDetalle, Proveedor, Venta, FacturaCompra, sequelize } from '@/models';
import { requerirAdmin, requerirNoVendedor } from '@/app/api/_lib/acceso';
import { tasaVigente } from '@/app/api/_lib/tasaBcv';
import { ErrorNota, anularNota, registrarReintegro } from '@/app/api/_lib/notasFiscales';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Una nota con todo lo que hace falta para verla o imprimirla
export async function GET(request, { params }) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    try {
        const { id } = await params;
        if (!UUID.test(id)) return NextResponse.json({ error: 'Nota no encontrada' }, { status: 404 });
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
        return NextResponse.json(nota);
    } catch (error) {
        console.error('Detalle de nota:', error);
        return NextResponse.json({ error: 'No se pudo cargar la nota' }, { status: 500 });
    }
}

// Acciones sobre una nota: NUMERO_CONTROL (dato fiscal) · REINTEGRO (devolver dinero al cliente) · ANULAR (solo administrador)
export async function PUT(request, { params }) {
    const t = await sequelize.transaction();
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
            nota.numeroControl = String(body.numeroControl || '').trim().slice(0, 30) || null;
            await nota.save({ transaction: t });
        } else if (accion === 'REINTEGRO') {
            const tasa = await tasaVigente({ transaction: t });
            await registrarReintegro({ nota, montoUsd: body.montoUsd, tasa, metodoPago: body.metodoPago, referencia: body.referencia, transaction: t });
        } else if (accion === 'ANULAR') {
            await anularNota({ nota, transaction: t });
        } else {
            throw new ErrorNota('Acción no válida');
        }
        await t.commit();
        return NextResponse.json({ success: true, nota });
    } catch (error) {
        if (!t.finished) await t.rollback();
        if (error instanceof ErrorNota) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('Acción sobre nota:', error);
        return NextResponse.json({ error: 'No se pudo completar la acción' }, { status: 500 });
    }
}
