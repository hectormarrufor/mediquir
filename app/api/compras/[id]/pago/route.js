import { NextResponse } from 'next/server';
import db from '@/models';
import { requerirNoVendedor } from '../../../_lib/acceso';
import { tasaVigente } from '../../../_lib/tasaBcv';
import { aBolivares, aDolares } from '@/app/constants/facturacion';
import { fechaCaracas } from '@/app/constants/hora';

const { sequelize, FacturaCompra, CuentaPorPagar, CategoriaFinanciera, MovimientoFinanciero } = db;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const METODOS = ['Transferencia', 'Pago Móvil', 'Efectivo ($)', 'Efectivo (Bs)', 'Zelle', 'Punto de Venta'];
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

class ErrorPago extends Error {
    constructor(mensaje, status = 400) { super(mensaje); this.status = status; }
}

// Pago (total o parcial) de una compra a crédito: baja el saldo de su cuenta por pagar y asienta el egreso en caja.
// El gasto entra al balance el día que se paga (igual que una compra de contado), con la misma categoría que tendría de contado.
export async function POST(request, { params }) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;

    const { id } = await params;
    if (!UUID_REGEX.test(id)) return NextResponse.json({ error: 'Compra no encontrada' }, { status: 404 });

    const t = await sequelize.transaction();
    try {
        const body = await request.json();
        const monto = Number(body.monto);
        const moneda = body.moneda === 'BS' ? 'BS' : body.moneda === 'USD' ? 'USD' : null;
        const metodoPago = METODOS.includes(body.metodoPago) ? body.metodoPago : null;
        const referencia = String(body.referencia || '').trim().slice(0, 60) || null;
        if (!(monto > 0)) throw new ErrorPago('El monto del pago debe ser mayor a 0');
        if (!moneda) throw new ErrorPago('Moneda del pago inválida');
        if (!metodoPago) throw new ErrorPago('Elige el método de pago');

        const factura = await FacturaCompra.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!factura) throw new ErrorPago('Compra no encontrada', 404);
        const cxp = await CuentaPorPagar.findOne({ where: { facturaCompraId: factura.id }, transaction: t, lock: t.LOCK.UPDATE });
        if (!cxp) throw new ErrorPago('Esta compra no tiene cuenta por pagar: se registró de contado', 409);
        const saldo = Number(cxp.saldoPendiente);
        if (cxp.estado === 'Pagado' || !(saldo > 0)) throw new ErrorPago('Esta cuenta ya está pagada', 409);

        // La tasa la pone el servidor (la de hoy). Sin tasa registrada solo se acepta un pago en la moneda de la cuenta.
        const tasa = await tasaVigente({ transaction: t }).catch(() => null);
        if (!tasa && moneda !== cxp.moneda) throw new ErrorPago('No hay tasa BCV registrada hoy para convertir el pago', 409);
        const tasaUsada = tasa || Number(cxp.tasaCambio) || 1;

        let montoUsd = moneda === 'USD' ? r2(monto) : aDolares(monto, tasaUsada);
        let montoBs = moneda === 'BS' ? r2(monto) : aBolivares(monto, tasaUsada);
        let enMonedaCuenta = cxp.moneda === 'USD' ? montoUsd : montoBs;

        // Pagar de más no se permite; una diferencia mínima por la conversión (hasta $0,50) liquida exactamente el saldo
        const exceso = r2(enMonedaCuenta - saldo);
        if (exceso > 0.01) {
            const tolerancia = moneda === cxp.moneda ? 0.01 : (cxp.moneda === 'USD' ? 0.5 : 0.5 * tasaUsada);
            if (exceso > tolerancia) throw new ErrorPago(`El pago (${enMonedaCuenta.toFixed(2)} ${cxp.moneda}) supera el saldo pendiente (${saldo.toFixed(2)} ${cxp.moneda})`, 409);
            enMonedaCuenta = saldo;
            if (cxp.moneda === 'USD') montoUsd = saldo; else montoBs = saldo;
        }

        cxp.saldoPendiente = Math.max(0, r2(saldo - enMonedaCuenta));
        const liquidada = cxp.saldoPendiente <= 0.005;
        if (liquidada) {
            cxp.saldoPendiente = 0;
            cxp.estado = 'Pagado';
            factura.statusPago = 'Pagado';
            await factura.save({ transaction: t });
        }
        await cxp.save({ transaction: t });

        // Misma categoría que una compra de contado: la del gasto, o "Compras de Mercancía"
        let categoria = factura.esGasto && factura.categoriaGastoId ? await CategoriaFinanciera.findByPk(factura.categoriaGastoId, { transaction: t }) : null;
        if (!categoria) categoria = await CategoriaFinanciera.findOne({ where: { nombre: 'Compras de Mercancía' }, transaction: t })
            || await CategoriaFinanciera.create({ nombre: 'Compras de Mercancía', tipo: 'GASTO' }, { transaction: t });

        await MovimientoFinanciero.create({
            tipo: 'GASTO', fecha: fechaCaracas(), metodoPago, referencia: referencia || `Pago ${factura.numeroDocumento}`,
            montoUsd, montoVes: montoBs, tasaBcvAplicada: tasaUsada,
            descripcion: `${liquidada ? 'Pago' : 'Abono'} a proveedor - ${factura.esGasto ? 'gasto' : 'compra'} ${factura.tipoDocumento === 'FACTURA' ? 'factura' : 'nota de entrega'} Nro: ${factura.numeroDocumento}`,
            categoriaId: categoria.id, facturaCompraId: factura.id,
        }, { transaction: t });

        await t.commit();
        return NextResponse.json({ success: true, liquidada, saldoRestante: Number(cxp.saldoPendiente), moneda: cxp.moneda });
    } catch (error) {
        if (!t.finished) await t.rollback();
        if (error instanceof ErrorPago) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('Pago de cuenta por pagar:', error);
        return NextResponse.json({ error: 'No se pudo registrar el pago' }, { status: 500 });
    }
}
