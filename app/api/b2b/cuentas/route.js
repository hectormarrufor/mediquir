import { NextResponse } from 'next/server';
import { requerirCliente } from '../../_lib/acceso';
import { hoyCaracas, resumenPedido, ventasDelCliente } from '../_lib';

export const dynamic = 'force-dynamic';

// Cuentas por pagar del cliente: facturas/pedidos con saldo, agrupados por antigüedad, y sus pagos recientes
export async function GET() {
    const acceso = await requerirCliente();
    if (acceso.error) return acceso.error;

    try {
        const hoy = hoyCaracas();
        const ventas = await ventasDelCliente(acceso.clienteId);

        const pedidos = ventas.map((v) => ({ venta: v, resumen: resumenPedido(v, hoy) }));
        const pendientes = pedidos
            .filter(({ resumen }) => resumen.cobro.saldo > 0)
            .map(({ resumen }) => ({
                id: resumen.id, numero: resumen.numero, fecha: resumen.fecha, total: resumen.total,
                saldo: resumen.cobro.saldo, vence: resumen.cobro.vence, estado: resumen.cobro.clave, etiqueta: resumen.cobro.etiqueta,
                diasParaVencer: resumen.cobro.diasParaVencer,
            }))
            .sort((a, b) => (a.vence || '9999').localeCompare(b.vence || '9999'));

        // Antigüedad de la deuda: por vencer / 1-30 / 31-60 / +60 días vencidos
        const cubetas = { alDia: 0, vencido1a30: 0, vencido31a60: 0, vencidoMas60: 0 };
        for (const p of pendientes) {
            const vencidos = p.diasParaVencer !== null && p.diasParaVencer < 0 ? -p.diasParaVencer : 0;
            if (!vencidos) cubetas.alDia += p.saldo;
            else if (vencidos <= 30) cubetas.vencido1a30 += p.saldo;
            else if (vencidos <= 60) cubetas.vencido31a60 += p.saldo;
            else cubetas.vencidoMas60 += p.saldo;
        }
        Object.keys(cubetas).forEach((k) => { cubetas[k] = Number(cubetas[k].toFixed(2)); });

        const pagos = pedidos
            .flatMap(({ venta }) => (venta.abonos || []).map((a) => ({
                id: a.id, fecha: a.fechaPago, pedido: venta.numeroDocumento, pedidoId: venta.id, metodo: a.metodoPago,
                referencia: a.referencia, montoUsd: Number(a.montoUsd), montoVes: Number(a.montoVes),
            })))
            .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
            .slice(0, 20);

        return NextResponse.json({
            totalPendiente: Number(pendientes.reduce((acc, p) => acc + p.saldo, 0).toFixed(2)),
            cubetas,
            pendientes,
            pagos,
        });
    } catch (error) {
        console.error('B2B cuentas:', error);
        return NextResponse.json({ error: 'No se pudieron cargar tus cuentas' }, { status: 500 });
    }
}
