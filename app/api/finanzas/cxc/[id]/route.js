import { NextResponse } from 'next/server';
import db from '@/models';
import { requerirNoVendedor } from '../../../_lib/acceso';
import { recalcularCobro } from '../../../_lib/retencionesVenta';
import { ErrorCxc, FECHA } from '../../../_lib/cxc';

export const dynamic = 'force-dynamic';
const { CuentaPorCobrar, Venta, sequelize } = db;

// Edita una cuenta por cobrar: vencimiento, observación y, con su motivo, el monto del documento.
// La DEUDA no se escribe directamente: para bajarla o subirla se registra un abono o un ajuste (ver /abonos).
export async function PATCH(request, { params }) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    const t = await sequelize.transaction();
    try {
        const { id } = await params;
        const body = await request.json();
        const cuenta = await CuentaPorCobrar.findByPk(Number(id), { transaction: t, lock: t.LOCK.UPDATE });
        if (!cuenta) throw new ErrorCxc('Esa cuenta por cobrar ya no existe', 404);
        const cambios = {};
        if (Object.prototype.hasOwnProperty.call(body, 'fechaVencimiento')) {
            if (!FECHA.test(String(body.fechaVencimiento || ''))) throw new ErrorCxc('La fecha de vencimiento no es válida');
            cambios.fechaVencimiento = body.fechaVencimiento;
        }
        if (Object.prototype.hasOwnProperty.call(body, 'observacion')) cambios.observacion = String(body.observacion || '').trim().slice(0, 500) || null;
        if (Object.prototype.hasOwnProperty.call(body, 'montoTotal')) {
            const nuevo = Math.round(Number(body.montoTotal) * 100) / 100;
            if (!(nuevo > 0)) throw new ErrorCxc('El monto del documento debe ser mayor a 0');
            const motivo = String(body.motivo || '').trim();
            if (motivo.length < 5) throw new ErrorCxc('Explica por qué cambia el monto del documento (mínimo 5 caracteres)');
            const antes = Number(cuenta.montoTotal);
            if (Math.abs(nuevo - antes) > 0.004) {
                cambios.montoTotal = nuevo;
                const linea = `[Monto corregido de ${antes.toFixed(2)} a ${nuevo.toFixed(2)}: ${motivo}]`;
                cambios.observacion = [cambios.observacion ?? cuenta.observacion, linea].filter(Boolean).join(' ').slice(0, 500);
            }
        }
        await cuenta.update(cambios, { transaction: t });
        if (cambios.montoTotal !== undefined) {
            const venta = await Venta.findByPk(cuenta.ventaId, { transaction: t, lock: t.LOCK.UPDATE });
            await recalcularCobro(venta, t);
            await cuenta.reload({ transaction: t });
        }
        await t.commit();
        return NextResponse.json({ ok: true, cuenta });
    } catch (error) {
        if (!t.finished) await t.rollback();
        if (error instanceof ErrorCxc) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('Editar cuenta por cobrar:', error);
        return NextResponse.json({ error: 'No se pudo guardar el cambio' }, { status: 500 });
    }
}
