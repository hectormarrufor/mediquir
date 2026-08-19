import { NextResponse } from 'next/server';
import db from '@/models';
const { CuentaPorCobrar, Cliente, Venta } = db;

export async function GET() {
    try {
        const cuentas = await CuentaPorCobrar.findAll({
            include: [
                { model: Cliente, as: 'cliente', attributes: ['nombre', 'identificacion', 'telefono'] },
                { model: Venta, as: 'venta', attributes: ['numeroDocumento', 'tipoDocumento', 'createdAt'] }
            ],
            order: [['fechaVencimiento', 'ASC']]
        });
        return NextResponse.json(cuentas);
    } catch (error) {
        console.error('Error al obtener cuentas por cobrar:', error);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}