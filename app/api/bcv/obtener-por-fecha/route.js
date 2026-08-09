import BcvPrecioHistorico from '@/models/BcvPrecioHistorico';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    try {
        // Obtenemos el parámetro 'fecha' de la URL
        const fechaParam = request.nextUrl.searchParams.get('fecha');

        // Validamos que se haya enviado la fecha
        if (!fechaParam) {
            return NextResponse.json(
                { success: false, error: "El parámetro 'fecha' es requerido (ej: ?fecha=YYYY-MM-DD)" }, 
                { status: 400 }
            );
        }

        const historico = await BcvPrecioHistorico.findAll({
            where: {
                fecha: fechaParam
            },
            // Ordenamos cronológicamente por si hay múltiples tasas cargadas el mismo día
            order: [
                ['hora', 'ASC']
            ]
        });

        // Mapeamos incluyendo las nuevas monedas
        const data = historico.map(h => ({
            id: h.id,
            fecha: h.fecha,
            // Parseamos a Float para que el gráfico no falle
            monto: parseFloat(h.monto), 
            montoEur: h.montoEur ? parseFloat(h.montoEur) : 0, 
            montoUsdt: h.montoUsdt ? parseFloat(h.montoUsdt) : 0
        }));

        return NextResponse.json({ success: true, data });

    } catch (error) {
        console.error("Error obteniendo histórico BCV/Cripto:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}