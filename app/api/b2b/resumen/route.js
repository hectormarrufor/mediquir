import { NextResponse } from 'next/server';
import { Cliente, Venta } from '@/models';
import { requerirCliente } from '../../_lib/acceso';
import { tasaVigente } from '../../_lib/tasaBcv';
import { ESTADOS_ACTIVOS, hoyCaracas, resumenPedido, ventasDelCliente } from '../_lib';

export const dynamic = 'force-dynamic';

// Tablero del cliente: pedidos en curso, saldo por pagar, lo vencido y lo próximo a vencer
export async function GET() {
    const acceso = await requerirCliente();
    if (acceso.error) return acceso.error;
    const { clienteId } = acceso;

    try {
        const hoy = hoyCaracas();
        const [cliente, ventas, tasa] = await Promise.all([
            Cliente.findByPk(clienteId, { attributes: ['id', 'nombre', 'identificacion', 'telefono', 'email', 'direccion'] }),
            ventasDelCliente(clienteId, { extraInclude: [], order: [['createdAt', 'DESC']] }),
            tasaVigente().catch(() => null),
        ]);
        if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });

        const pedidos = ventas.map((v) => resumenPedido(v, hoy));
        const conSaldo = pedidos.filter((p) => p.cobro.saldo > 0);
        const vencidos = conSaldo.filter((p) => p.cobro.clave === 'vencido');
        const proximo = conSaldo
            .filter((p) => p.cobro.clave === 'pendiente' && p.cobro.vence)
            .sort((a, b) => a.cobro.vence.localeCompare(b.cobro.vence))[0] || null;

        const suma = (lista) => Number(lista.reduce((acc, p) => acc + p.cobro.saldo, 0).toFixed(2));

        return NextResponse.json({
            cliente,
            tasa,
            pedidosActivos: pedidos.filter((p) => ESTADOS_ACTIVOS.includes(p.estado)).length,
            totalPedidos: pedidos.length,
            saldoPendiente: suma(conSaldo),
            facturasPendientes: conSaldo.length,
            saldoVencido: suma(vencidos),
            facturasVencidas: vencidos.length,
            proximoVencimiento: proximo ? { numero: proximo.numero, id: proximo.id, vence: proximo.cobro.vence, saldo: proximo.cobro.saldo } : null,
            ultimosPedidos: pedidos.slice(0, 6),
        });
    } catch (error) {
        console.error('B2B resumen:', error);
        return NextResponse.json({ error: 'No se pudo cargar tu resumen' }, { status: 500 });
    }
}
