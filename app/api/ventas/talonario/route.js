import { NextResponse } from 'next/server';
import sequelize from '@/sequelize';
import { requerirNoVendedor } from '../../_lib/acceso';

export const dynamic = 'force-dynamic';

// Última factura de talonario cargada (la de mayor número de control): sirve de guía al cargar la siguiente (el número y el control NUNCA se inventan,
// los trae el talonario). Devuelve también el control siguiente SUGERIDO (el último + 1, con el mismo prefijo y relleno de ceros).
export async function GET() {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    try {
        const [ultima] = await sequelize.query(
            `SELECT "numeroDocumento" AS numero, "numeroControl" AS control FROM "Ventas"
              WHERE "facturaTalonario" = true AND "numeroControl" ~ '^[0-9]+-[0-9]+$'
              ORDER BY CAST(split_part("numeroControl", '-', 2) AS bigint) DESC, "createdAt" DESC LIMIT 1`,
            { type: sequelize.QueryTypes.SELECT },
        );
        if (!ultima) return NextResponse.json({ ultima: null, controlSugerido: null });
        const [prefijo, digitos] = String(ultima.control).split('-');
        const controlSugerido = `${prefijo}-${String(Number(digitos) + 1).padStart(digitos.length, '0')}`;
        return NextResponse.json({ ultima, controlSugerido });
    } catch (error) {
        console.error('Última factura de talonario:', error);
        return NextResponse.json({ error: 'No se pudo consultar' }, { status: 500 });
    }
}
