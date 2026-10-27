import { NextResponse } from 'next/server';
import sequelize from '@/sequelize';
import Correlativo from '@/models/Correlativo';
import { requerirStaff } from '../inventario/_lib';

export const dynamic = 'force-dynamic';

// Correlativos con el número que de verdad sale después. El POS propone ese número: si la fila del correlativo
// quedó atrasada (p. ej. una factura creada desde la tienda o convertida), se usa el mayor ya emitido + 1, igual que
// hace el servidor al guardar. Así lo que ve el vendedor es lo que queda impreso.
export async function GET() {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;
    try {
        const [correlativos, maximos] = await Promise.all([
            Correlativo.findAll(),
            sequelize.query(
                `SELECT split_part("numeroDocumento", '-', 1) AS prefijo,
                        MAX(CAST(NULLIF(regexp_replace("numeroDocumento", '\\D', '', 'g'), '') AS bigint)) AS maximo
                 FROM "Ventas" WHERE "numeroDocumento" ~ '^(F|NE|V)-[0-9]+$' GROUP BY 1`,
                { type: sequelize.QueryTypes.SELECT }
            ),
        ]);
        const maxPorPrefijo = new Map(maximos.map((m) => [m.prefijo, Number(m.maximo) || 0]));
        const lista = correlativos.map((c) => {
            const j = c.toJSON();
            const maximo = maxPorPrefijo.get(j.prefijo);
            return maximo !== undefined ? { ...j, siguienteNumero: Math.max(Number(j.siguienteNumero) || 1, maximo + 1) } : j;
        });
        // Prefijo con documentos pero sin fila de correlativo: también se propone el siguiente al mayor emitido
        for (const [prefijo, maximo] of maxPorPrefijo) {
            if (!lista.some((c) => c.prefijo === prefijo)) lista.push({ prefijo, siguienteNumero: maximo + 1, cerosRelleno: 5 });
        }
        return NextResponse.json(lista);
    } catch (error) {
        console.error('Error obteniendo correlativos:', error);
        return NextResponse.json({ error: 'Error al obtener correlativos' }, { status: 500 });
    }
}
