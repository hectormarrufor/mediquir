import { Op } from 'sequelize';
import BcvPrecioHistorico from '@/models/BcvPrecioHistorico';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    try {
        // Obtenemos el parámetro 'fecha' de la URL
        const fechaParam = request.nextUrl.searchParams.get('fecha');

        // Validamos que se haya enviado la fecha con formato YYYY-MM-DD
        if (!fechaParam || !/^\d{4}-\d{2}-\d{2}$/.test(String(fechaParam))) {
            return NextResponse.json(
                { success: false, error: "El parámetro 'fecha' es requerido (ej: ?fecha=YYYY-MM-DD)" }, 
                { status: 400 }
            );
        }

        const [historico, filaVigente] = await Promise.all([
            BcvPrecioHistorico.findAll({
                where: {
                    fecha: fechaParam
                },
                // Ordenamos cronológicamente por si hay múltiples tasas cargadas el mismo día
                order: [
                    ['hora', 'ASC']
                ]
            }),
            BcvPrecioHistorico.findOne({
                where: { fecha: { [Op.lte]: fechaParam } },
                order: [['fecha', 'DESC'], ['id', 'DESC']],
            }),
        ]);

        // Mapeamos incluyendo las nuevas monedas
        const data = historico.map(h => ({
            id: h.id,
            fecha: h.fecha,
            // Parseamos a Float para que el gráfico no falle
            monto: parseFloat(h.monto), 
            montoEur: h.montoEur ? parseFloat(h.montoEur) : 0, 
            montoUsdt: h.montoUsdt ? parseFloat(h.montoUsdt) : 0
        }));

        const vigente = filaVigente ? {
            id: filaVigente.id,
            fecha: filaVigente.fecha,
            monto: parseFloat(filaVigente.monto),
            montoEur: filaVigente.montoEur ? parseFloat(filaVigente.montoEur) : 0,
            montoUsdt: filaVigente.montoUsdt ? parseFloat(filaVigente.montoUsdt) : 0,
        } : null;

        return NextResponse.json({ success: true, data, vigente });

    } catch (error) {
        console.error("Error obteniendo histórico BCV/Cripto:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}