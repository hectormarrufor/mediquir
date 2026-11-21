import { NextResponse } from 'next/server';
import sequelize from '@/sequelize';
import { requerirStaff } from '../../../inventario/_lib';

export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;

    try {
        const { id } = await params;
        const numId = Number(id) || 0;
        if (!numId) return NextResponse.json({ error: 'Acta inválida' }, { status: 400 });

        const [acta] = await sequelize.query(
            `SELECT "id", "numero", "agencia", "choferNombre", "choferCedula", "choferEmpresa",
                    "firmaChoferUrl", "facturasConfirmadas", "entregadoPorNombre", "observacion",
                    "ventas", "createdAt"
             FROM "DespachosAgencia"
             WHERE "id" = :id`,
            { replacements: { id: numId }, type: sequelize.QueryTypes.SELECT }
        );
        if (!acta) return NextResponse.json({ error: 'Acta de despacho no encontrada' }, { status: 404 });

        return NextResponse.json({ acta });
    } catch (error) {
        console.error('Error cargando acta de despacho:', error);
        return NextResponse.json({ error: 'No se pudo cargar el acta de despacho' }, { status: 500 });
    }
}
