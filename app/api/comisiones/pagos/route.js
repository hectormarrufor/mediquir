import { NextResponse } from 'next/server';
import sequelize from '@/sequelize';
import db from '@/models';
import { requerirNoVendedor } from '../../_lib/acceso';
import { tasaVigente } from '../../_lib/tasaBcv';
import { fechaCaracas } from '@/app/constants/hora';

export const dynamic = 'force-dynamic';
const { VendedorComision, ComisionVenta, PagoComision, MovimientoPrestamoVendedor } = db;
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

async function saldoPrestamo(vendedorId, transaction) {
    const [fila] = await sequelize.query(
        `SELECT COALESCE(SUM(CASE WHEN tipo = 'PRESTAMO' THEN "montoUsd" ELSE -"montoUsd" END), 0)::float AS saldo FROM "MovimientosPrestamoVendedor" WHERE "vendedorId" = :v`,
        { replacements: { v: vendedorId }, type: sequelize.QueryTypes.SELECT, transaction },
    );
    return r2(fila?.saldo || 0);
}

// Un pago guardado, con el nombre del vendedor, para imprimir su formato de pago: ?id=
export async function GET(request) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    try {
        const id = Number(new URL(request.url).searchParams.get('id'));
        const pago = await PagoComision.findByPk(id, { raw: true });
        if (!pago) return NextResponse.json({ error: 'Ese pago no existe' }, { status: 404 });
        const vendedor = await VendedorComision.findByPk(pago.vendedorId, { attributes: ['nombre'], raw: true });
        return NextResponse.json({ pago: { ...pago, vendedorNombre: vendedor?.nombre || '' } });
    } catch (error) {
        console.error('Leer pago de comisión:', error);
        return NextResponse.json({ error: 'No se pudo cargar el pago' }, { status: 500 });
    }
}

// Paga al vendedor TODO o UNA PARTE de su comisión acumulada y, si hay préstamo, destina parte de ese pago a bajarlo.
// { vendedorId, lineaIds: [..todas las líneas por pagar], montoUsd?: lo que se liquida de la comisión (vacío = todo), abonoPrestamoUsd?, observacion? }
//   · montoUsd = en efectivo (o transferencia) al vendedor + abonoPrestamoUsd (lo que baja de su préstamo)
//   · Lo pagado se aplica a las líneas por pagar de la más vieja a la más nueva: cada línea que queda cubierta entera pasa a pagada;
//     lo que sobra queda como «abonado» del vendedor (VendedoresComision.comisionAbonadaUsd) y se descuenta de lo acumulado.
export async function POST(request) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    try {
        const b = await request.json();
        const ids = [...new Set((Array.isArray(b.lineaIds) ? b.lineaIds : []).map(Number).filter(Number.isInteger))];
        if (!ids.length) return NextResponse.json({ error: 'No hay comisiones por pagar' }, { status: 400 });
        const tasa = await tasaVigente().catch(() => null);
        const hoy = fechaCaracas();
        const resultado = await sequelize.transaction(async (t) => {
            const vendedor = await VendedorComision.findByPk(Number(b.vendedorId), { transaction: t, lock: t.LOCK.UPDATE });
            if (!vendedor) throw Object.assign(new Error('Elige un vendedor'), { estado: 400 });
            const lineas = await ComisionVenta.findAll({ where: { id: ids, vendedorId: vendedor.id }, transaction: t, lock: t.LOCK.UPDATE });
            if (lineas.length !== ids.length || lineas.some((l) => l.estatusComision === 'PAGADA')) throw Object.assign(new Error('Alguna comisión ya se pagó o ya no existe: actualiza la pantalla'), { estado: 409 });
            // de la más vieja a la más nueva
            lineas.sort((x, y) => String(x.fecha || '').localeCompare(String(y.fecha || '')) || x.id - y.id);
            const total = r2(lineas.reduce((a, l) => a + (Number(l.comisionUsd) || 0), 0));
            const abonado = r2(vendedor.comisionAbonadaUsd || 0);
            const acumulado = Math.max(0, r2(total - abonado));
            const monto = b.montoUsd === undefined || b.montoUsd === null || b.montoUsd === '' ? acumulado : r2(b.montoUsd);
            if (!(monto > 0)) throw Object.assign(new Error('No hay nada que pagar'), { estado: 400 });
            if (monto > acumulado + 0.004) throw Object.assign(new Error(`No se puede pagar más de lo acumulado ($${acumulado.toFixed(2)})`), { estado: 400 });
            const antes = await saldoPrestamo(vendedor.id, t);
            const abono = r2(b.abonoPrestamoUsd || 0);
            if (abono < 0) throw Object.assign(new Error('El abono al préstamo no puede ser negativo'), { estado: 400 });
            if (abono > antes + 0.004) throw Object.assign(new Error(`El abono no puede ser mayor que lo que debe de préstamo ($${antes.toFixed(2)})`), { estado: 400 });
            if (abono > monto + 0.004) throw Object.assign(new Error('El abono no puede ser mayor que el pago'), { estado: 400 });

            // Se aplica a las líneas más viejas; las que quedan cubiertas enteras pasan a pagadas
            let resto = r2(abonado + monto);
            const cubiertas = [];
            for (const l of lineas) {
                const c = Number(l.comisionUsd) || 0;
                if (resto + 0.004 >= c) { cubiertas.push(l); resto = r2(resto - c); } else break;
            }
            if (cubiertas.length === lineas.length) resto = 0; // se pagó todo
            const pago = await PagoComision.create({
                vendedorId: vendedor.id, fecha: hoy, totalComisionUsd: monto, abonoPrestamoUsd: abono, pagadoUsd: r2(monto - abono), tasaBcv: tasa,
                lineas: cubiertas.map((l) => ({ id: l.id, documento: l.documentoTexto, cliente: l.clienteTexto, concepto: l.concepto, comisionUsd: Number(l.comisionUsd) || 0 })),
                prestamoAntesUsd: antes, prestamoDespuesUsd: r2(antes - abono), acumuladoAntesUsd: acumulado, acumuladoDespuesUsd: r2(acumulado - monto),
                observacion: String(b.observacion || '').trim().slice(0, 500) || null,
            }, { transaction: t });
            if (abono > 0) await MovimientoPrestamoVendedor.create({ vendedorId: vendedor.id, tipo: 'ABONO', montoUsd: abono, fecha: hoy, nota: `Abono al pagar comisión (pago #${pago.id})`, pagoComisionId: pago.id }, { transaction: t });
            if (cubiertas.length) await ComisionVenta.update({ estatusComision: 'PAGADA', fechaPagoComision: hoy }, { where: { id: cubiertas.map((l) => l.id) }, transaction: t });
            await vendedor.update({ comisionAbonadaUsd: resto }, { transaction: t });
            return pago;
        });
        return NextResponse.json({ ok: true, pagoId: resultado.id }, { status: 201 });
    } catch (error) {
        if (error?.estado) return NextResponse.json({ error: error.message }, { status: error.estado });
        console.error('Pagar comisión:', error);
        return NextResponse.json({ error: 'No se pudo registrar el pago' }, { status: 500 });
    }
}
