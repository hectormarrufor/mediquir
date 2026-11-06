import { NextResponse } from 'next/server';
import db from '@/models';
import { requerirNoVendedor } from '../../../../_lib/acceso';
import { recalcularCobro } from '../../../../_lib/retencionesVenta';
import { ErrorCxc, FECHA } from '../../../../_lib/cxc';
import { tasaDelDia } from '../../../../_lib/tasaBcv';
import { fechaCaracas } from '@/app/constants/hora';

export const dynamic = 'force-dynamic';
const { Abono, Venta, MovimientoFinanciero, RetencionIva, sequelize } = db;
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

async function cargar(id, t) {
    const abono = await Abono.findByPk(Number(id), { transaction: t, lock: t.LOCK.UPDATE });
    if (!abono) throw new ErrorCxc('Ese abono ya no existe', 404);
    const venta = await Venta.findByPk(abono.ventaId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!venta) throw new ErrorCxc('La venta de ese abono ya no existe', 404);
    return { abono, venta };
}

// Corrige un abono ya registrado (fecha, monto, método, referencia, notas): la cuenta se recalcula sola
export async function PUT(request, { params }) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    const t = await sequelize.transaction();
    try {
        const { abonoId } = await params;
        const b = await request.json();
        const { abono, venta } = await cargar(abonoId, t);
        const cambios = {};
        if (b.fecha !== undefined) {
            if (!FECHA.test(String(b.fecha)) || b.fecha > fechaCaracas()) throw new ErrorCxc('La fecha del abono no es válida (no puede ser futura)');
            cambios.fechaPago = b.fecha;
        }
        if (b.monto !== undefined) {
            const m = r2(b.monto);
            if (!Number.isFinite(m) || m === 0) throw new ErrorCxc('El monto debe ser distinto de cero');
            cambios.montoUsd = m;
        }
        if (b.metodo !== undefined) cambios.metodoPago = String(b.metodo || '').trim().slice(0, 60) || abono.metodoPago;
        if (b.referencia !== undefined) cambios.referencia = String(b.referencia || '').trim().slice(0, 100) || null;
        if (b.notas !== undefined) cambios.notas = String(b.notas || '').trim().slice(0, 250) || null;
        if (cambios.fechaPago || cambios.montoUsd !== undefined) {
            const tasa = (await tasaDelDia(cambios.fechaPago || abono.fechaPago, { transaction: t })) || Number(abono.tasaBcvAplicada) || 1;
            const monto = cambios.montoUsd ?? Number(abono.montoUsd);
            Object.assign(cambios, { tasaBcvAplicada: tasa, tasaCambio: tasa, montoVes: r2(monto * tasa), montoBs: r2(monto * tasa) });
        }
        await abono.update(cambios, { transaction: t });
        // Si el abono tenía su ingreso de caja, ese movimiento sigue al abono
        const mov = await MovimientoFinanciero.findOne({ where: { abonoId: abono.id }, transaction: t });
        if (mov && (cambios.fechaPago || cambios.montoUsd !== undefined)) {
            await mov.update({ fecha: abono.fechaPago, montoUsd: abono.montoUsd, montoVes: abono.montoVes, tasaBcvAplicada: abono.tasaBcvAplicada }, { transaction: t });
        }
        await recalcularCobro(venta, t);
        await t.commit();
        return NextResponse.json({ ok: true });
    } catch (error) {
        if (!t.finished) await t.rollback();
        if (error instanceof ErrorCxc) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('Corregir abono:', error);
        return NextResponse.json({ error: 'No se pudo corregir el abono' }, { status: 500 });
    }
}

// Borra un abono registrado por error: la deuda vuelve a subir y su ingreso de caja (si lo tenía) se quita
export async function DELETE(request, { params }) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    const t = await sequelize.transaction();
    try {
        const { abonoId } = await params;
        const { abono, venta } = await cargar(abonoId, t);
        await MovimientoFinanciero.destroy({ where: { abonoId: abono.id }, transaction: t });
        await RetencionIva.update({ abonoId: null }, { where: { abonoId: abono.id }, transaction: t });
        await abono.destroy({ transaction: t });
        await recalcularCobro(venta, t);
        await t.commit();
        return NextResponse.json({ ok: true });
    } catch (error) {
        if (!t.finished) await t.rollback();
        if (error instanceof ErrorCxc) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('Borrar abono:', error);
        return NextResponse.json({ error: 'No se pudo borrar el abono' }, { status: 500 });
    }
}
