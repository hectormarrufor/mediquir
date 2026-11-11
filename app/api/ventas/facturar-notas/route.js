import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import sequelize from '@/sequelize';
import db from '@/models';
import { requerirAdmin } from '@/app/api/_lib/acceso';
import { tasaVigente, tasaDelDia } from '@/app/api/_lib/tasaBcv';
import { ErrorConversion } from '@/app/api/_lib/convertirFactura';
import { planFacturacion, facturarNotas, MAX_RENGLONES } from '@/app/api/_lib/facturarNotas';
import { fechaCaracas } from '@/app/constants/hora';

export const dynamic = 'force-dynamic';
const { Venta, CuentaPorCobrar, VentaDetalle } = db;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Tasa de la factura: la del día de emisión si se copia una factura de otro día; si no, la vigente
async function tasaPara(fecha, transaction) {
    if (fecha && String(fecha) < fechaCaracas()) return tasaDelDia(String(fecha), { transaction });
    return tasaVigente({ transaction });
}

// Notas de entrega del mismo cliente que se pueden facturar junto con `nota` (a crédito, en dólares, sin anular ni facturar)
export async function GET(request) {
    const acceso = await requerirAdmin();
    if (acceso.error) return acceso.error;
    try {
        const id = new URL(request.url).searchParams.get('nota');
        if (!UUID.test(String(id || ''))) return NextResponse.json({ error: 'Nota no encontrada' }, { status: 404 });
        const nota = await Venta.findByPk(id, { attributes: ['id', 'clienteId', 'tipoDocumento'] });
        if (!nota || nota.tipoDocumento !== 'NOTA_ENTREGA') return NextResponse.json({ error: 'Nota no encontrada' }, { status: 404 });
        const candidatas = await Venta.findAll({
            where: {
                clienteId: nota.clienteId, tipoDocumento: 'NOTA_ENTREGA', moneda: 'USD', condicionPago: 'Credito',
                statusDespacho: { [Op.ne]: 'Cancelado' }, [Op.or]: [{ revisionStock: null }, { revisionStock: { [Op.ne]: 'PENDIENTE' } }],
            },
            attributes: ['id', 'numeroDocumento', 'fechaEmision', 'createdAt', 'subtotal', 'totalFinal', 'statusDespacho'],
            include: [
                { model: CuentaPorCobrar, as: 'cuentaPorCobrar', attributes: ['saldoPendiente'], required: true },
                { model: VentaDetalle, as: 'detalles', attributes: ['id'] },
            ],
            order: [['fechaEmision', 'ASC'], ['numeroDocumento', 'ASC']],
        });
        return NextResponse.json({
            maxRenglones: MAX_RENGLONES,
            tasaHoy: await tasaVigente().catch(() => null),
            candidatas: candidatas.map((c) => ({
                id: c.id, numero: c.numeroDocumento, fecha: c.fechaEmision || c.createdAt, subtotal: Number(c.subtotal), totalUsd: Number(c.totalFinal),
                saldoUsd: (c.cuentaPorCobrar || []).reduce((a, x) => a + Number(x.saldoPendiente), 0), renglones: (c.detalles || []).length,
                entregada: c.statusDespacho === 'Completado',
            })),
        });
    } catch (error) {
        console.error('Notas para facturar:', error);
        return NextResponse.json({ error: 'No se pudieron cargar las notas del cliente' }, { status: 500 });
    }
}

// { notaIds, manuales: { [notaId]: [{ productoId, nombre, cantidad, precioUnitario, exento }] }, porFactura, copias: [{ numero, control }], fecha, moverInventario, vistaPrevia }
export async function POST(request) {
    const acceso = await requerirAdmin();
    if (acceso.error) return acceso.error;
    let t = null;
    try {
        const b = await request.json();
        const notaIds = Array.isArray(b.notaIds) ? b.notaIds.filter((x) => UUID.test(String(x))) : [];
        if (!notaIds.length) return NextResponse.json({ error: 'Elige al menos una nota de entrega' }, { status: 400 });
        const fecha = b.fecha ? String(b.fecha) : null;
        if (fecha && (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha > fechaCaracas())) return NextResponse.json({ error: 'La fecha de emisión no es válida (no puede ser futura)' }, { status: 400 });
        const comun = { notaIds, manuales: b.manuales && typeof b.manuales === 'object' ? b.manuales : {}, porFactura: b.porFactura, moverInventario: b.moverInventario !== false };

        if (b.vistaPrevia) {
            const tasa = await tasaPara(fecha);
            return NextResponse.json(await planFacturacion({ ...comun, tasa }));
        }

        t = await sequelize.transaction();
        const tasa = await tasaPara(fecha, t);
        if (!tasa) throw new ErrorConversion(fecha ? `No hay tasa BCV registrada para el ${fecha.split('-').reverse().join('/')}` : 'No hay una tasa BCV vigente registrada', 409);
        const r = await facturarNotas({ ...comun, copias: Array.isArray(b.copias) ? b.copias : [], fecha, tasa, usuarioId: Number(acceso.sesion.id) || null, transaction: t });
        await t.commit();
        return NextResponse.json({ success: true, ...r });
    } catch (error) {
        if (t && !t.finished) await t.rollback();
        if (error instanceof ErrorConversion) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('Facturar notas de entrega:', error);
        return NextResponse.json({ error: 'No se pudieron emitir las facturas' }, { status: 500 });
    }
}
