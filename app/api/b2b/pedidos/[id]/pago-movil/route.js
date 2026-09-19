import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { Cliente, PagoSms, Venta, sequelize } from '@/models';
import { requerirCliente } from '@/app/api/_lib/acceso';
import { tasaVigente } from '@/app/api/_lib/tasaBcv';
import { registrarAbono, ErrorAbono } from '@/app/api/_lib/abonos';
import { notificarCabezas } from '@/app/handlers/notificar';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// El aviso del banco llega en segundos, pero el cliente puede reportarlo horas después: se aceptan pagos de los últimos días
const DIAS_VIGENCIA_PAGO = 3;
const TOLERANCIA_MONTO_BS = 0.01;
// Un pago que supera el saldo por menos de esto (USD) se toma como la liquidación (la tasa cambia de un día a otro)
const TOLERANCIA_SALDO_USD = 0.1;

class ErrorPago extends Error {
    constructor(mensaje, status = 400, { notificar = null } = {}) { super(mensaje); this.status = status; this.notificar = notificar; }
}

const fmtBs = (n) => `Bs ${Number(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// El cliente reporta un pago móvil que hizo para una factura a crédito: últimos 4 dígitos de la referencia + monto en Bs.
// El sistema lo busca entre los pagos recibidos del banco (que nadie haya usado) y, si coincide TODO, crea el abono.
// Se exige también el monto exacto para que nadie pueda reclamar el pago de otro cliente adivinando 4 dígitos.
export async function POST(request, { params }) {
    const acceso = await requerirCliente();
    if (acceso.error) return acceso.error;

    const t = await sequelize.transaction();
    let resultado = null;
    let aviso = null; // notificación a las cabezas, se envía después de cerrar la transacción
    try {
        const { id } = await params;
        if (!UUID.test(id)) throw new ErrorPago('Pedido no encontrado', 404);

        const { referencia, monto } = await request.json();
        const ref = String(referencia ?? '').replace(/\D/g, '');
        const montoBs = Number(monto);
        if (ref.length !== 4) throw new ErrorPago('Escribe los últimos 4 dígitos de la referencia del pago');
        if (!(montoBs > 0)) throw new ErrorPago('Escribe el monto que pagaste en bolívares');

        // Solo facturas a crédito del propio cliente (el clienteId sale del token, nunca del navegador)
        const venta = await Venta.findOne({ where: { id, clienteId: acceso.clienteId }, transaction: t, lock: t.LOCK.UPDATE });
        if (!venta) throw new ErrorPago('Pedido no encontrado', 404);
        if (venta.statusDespacho === 'Cancelado') throw new ErrorPago('Este pedido está cancelado', 409);
        if (venta.revisionStock === 'PENDIENTE') throw new ErrorPago('Tu pedido está en revisión de existencias: te avisaremos cuando puedas pagar', 409);
        if (venta.condicionPago !== 'Credito') throw new ErrorPago('Este pedido no es a crédito: el pago se coordina con administración', 409);
        if (venta.statusPago === 'Pagado') throw new ErrorPago('Este pedido ya está pagado', 409);

        const cliente = await Cliente.findByPk(acceso.clienteId, { attributes: ['nombre'], transaction: t });
        const desde = new Date(Date.now() - DIAS_VIGENCIA_PAGO * 24 * 60 * 60 * 1000);
        const candidatos = await PagoSms.findAll({
            where: { referencia: { [Op.endsWith]: ref }, procesado: false, createdAt: { [Op.gte]: desde } },
            transaction: t, lock: t.LOCK.UPDATE,
        });
        const coinciden = candidatos.filter((p) => Math.abs(Number(p.monto) - montoBs) <= TOLERANCIA_MONTO_BS);

        // No se distingue "referencia inexistente" de "monto distinto": así no se filtra información de pagos ajenos
        if (coinciden.length === 0) {
            throw new ErrorPago(
                'No encontramos un pago con esos datos. Revisa la referencia y el monto; si acabas de pagar, espera unos minutos, porque el aviso del banco puede tardar.',
                404,
                { notificar: {
                    title: '⚠️ Pago móvil reportado sin coincidencia',
                    body: `${cliente?.nombre || 'Un cliente'} reporta un pago de ${fmtBs(montoBs)} (ref. ****${ref}) para ${venta.numeroDocumento}, pero no aparece en Pagos Recibidos. Si el aviso del banco llega después, vincúlalo desde ahí.`,
                    url: '/superuser/pagos-recibidos', tag: `abono-b2b-sin-pago-${venta.id}`,
                } },
            );
        }
        if (coinciden.length > 1) {
            throw new ErrorPago(
                'Encontramos más de un pago con esos datos. Administración lo revisará y lo registrará a tu cuenta.',
                409,
                { notificar: {
                    title: '⚠️ Pago móvil ambiguo de cliente B2B',
                    body: `${cliente?.nombre || 'Un cliente'} reporta ${fmtBs(montoBs)} (ref. ****${ref}) para ${venta.numeroDocumento}, pero hay ${coinciden.length} pagos iguales. Vincula el correcto en Pagos Recibidos.`,
                    url: '/superuser/pagos-recibidos', tag: `abono-b2b-ambiguo-${venta.id}`,
                } },
            );
        }

        const pago = coinciden[0];
        const tasa = await tasaVigente({ transaction: t });
        let r;
        try {
            r = await registrarAbono({
                venta, monto: Number(pago.monto), moneda: 'BS', tasa, metodoPago: 'Pago Móvil', referencia: pago.referencia, pagoSms: pago,
                toleranciaUsd: TOLERANCIA_SALDO_USD, transaction: t,
            });
        } catch (e) {
            if (e instanceof ErrorAbono && e.codigo === 'EXCEDE_SALDO') {
                throw new ErrorPago(
                    'El pago es mayor que lo que debes de esta factura. Administración lo revisará y aplicará lo que corresponda.',
                    409,
                    { notificar: {
                        title: '⚠️ Pago de cliente B2B mayor al saldo',
                        body: `${cliente?.nombre || 'Un cliente'} pagó ${fmtBs(pago.monto)} (ref. ${pago.referencia}) y supera el saldo de ${venta.numeroDocumento}. Revísalo en Pagos Recibidos.`,
                        url: '/superuser/pagos-recibidos', tag: `abono-b2b-exceso-${venta.id}`,
                    } },
                );
            }
            throw e;
        }

        await t.commit();
        resultado = r;
        aviso = {
            title: r.liquidada ? '✅ Cliente B2B liquidó una factura' : '💵 Abono de cliente B2B',
            body: `${cliente?.nombre || 'Un cliente'} abonó $${r.abonoUsd.toFixed(2)} (${fmtBs(pago.monto)}, ref. ${pago.referencia}) a ${venta.numeroDocumento}. ${r.liquidada ? 'Queda pagada.' : `Saldo: ${r.monedaCuenta === 'USD' ? '$' : 'Bs '}${Number(r.saldoRestante).toFixed(2)}`}`,
            url: `/superuser/ventas/${venta.id}`, tag: `abono-b2b-${r.abono.id}`,
        };
    } catch (error) {
        if (!t.finished) await t.rollback();
        if (error instanceof ErrorPago) {
            if (error.notificar) await avisarCabezas(error.notificar);
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        if (error instanceof ErrorAbono) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('B2B pago móvil:', error);
        return NextResponse.json({ error: 'No se pudo registrar el pago' }, { status: 500 });
    }

    await avisarCabezas(aviso);
    return NextResponse.json({
        success: true, abonoUsd: resultado.abonoUsd, abonoBs: resultado.abonoBs,
        saldoRestante: resultado.saldoRestante, monedaCuenta: resultado.monedaCuenta, liquidada: resultado.liquidada,
    });
}

// Un fallo al notificar nunca debe deshacer ni ocultar un abono ya registrado
async function avisarCabezas(payload) {
    try {
        await notificarCabezas({ ...payload, tipo: 'Info' });
    } catch (e) {
        console.error('No se pudo avisar a las cabezas:', e.message);
    }
}
