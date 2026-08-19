import { NextResponse } from 'next/server';
import db from '@/models';
const { CuentaPorPagar, Proveedor, FacturaCompra } = db;

export async function GET() {
    try {
        const cuentas = await CuentaPorPagar.findAll({
            include: [
                { model: Proveedor, as: 'proveedor', attributes: ['nombre', 'identificacion', 'telefono'] },
                { model: FacturaCompra, as: 'facturaCompra', attributes: ['numeroDocumento', 'tipoDocumento', 'fechaFactura'] }
            ],
            order: [['fechaVencimiento', 'ASC']]
        });
        return NextResponse.json(cuentas);
    } catch (error) {
        console.error('Error al obtener cuentas por pagar:', error);
        return NextResponse.json({ error: 'Error interno' }, { status: 500 });
    }
}