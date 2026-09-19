import { NextResponse } from 'next/server';
import { Cliente } from '@/models';
import { requerirCliente } from '../../_lib/acceso';
import { creditoDeCliente } from '../_lib';

export const dynamic = 'force-dynamic';

// Crédito del cliente: días aprobados, máximo de pedidos a crédito activos, cuántos usa y cuántos le quedan
export async function GET() {
    const acceso = await requerirCliente();
    if (acceso.error) return acceso.error;
    try {
        const cliente = await Cliente.findByPk(acceso.clienteId, { attributes: ['id', 'diasCredito', 'maxPedidosCredito'] });
        if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
        const credito = await creditoDeCliente(cliente);
        return NextResponse.json({ ...credito, habilitado: credito.maxPedidos > 0 && credito.diasCredito > 0 });
    } catch (error) {
        console.error('B2B crédito:', error);
        return NextResponse.json({ error: 'No se pudo cargar tu crédito' }, { status: 500 });
    }
}
