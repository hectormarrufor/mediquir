import BcvPrecioHistorico from '@/models/BcvPrecioHistorico';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const historico = await BcvPrecioHistorico.findAll({
            // Ordenamos cronológicamente
            order: [
                ['fecha', 'ASC'],
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