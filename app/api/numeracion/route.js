import { NextResponse } from 'next/server';
import { sequelize } from '@/models';
import { requerirAdmin, requerirNoVendedor } from '@/app/api/_lib/acceso';
import { rolDe } from '@/app/constants/roles';
import { ErrorNumeracion, configurarNumeracion, estadoNumeracion } from '@/app/api/_lib/numeracion';

export const dynamic = 'force-dynamic';

// Estado de la numeración fiscal: facturas, notas de crédito, notas de débito y número de control
export async function GET() {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    try {
        return NextResponse.json({ series: await estadoNumeracion(), puedeEditar: rolDe(acceso.sesion) === 'admin' });
    } catch (error) {
        console.error('Numeración:', error);
        return NextResponse.json({ error: 'No se pudo cargar la numeración' }, { status: 500 });
    }
}

// Dice con qué número sale el PRÓXIMO documento de una serie: { clave: 'NC', siguiente: '02325' }. Solo administrador.
export async function PUT(request) {
    const acceso = await requerirAdmin();
    if (acceso.error) return acceso.error;

    const t = await sequelize.transaction();
    try {
        const { clave, siguiente } = await request.json();
        const r = await configurarNumeracion({ clave, siguiente, transaction: t });
        await t.commit();
        return NextResponse.json({ success: true, ...r });
    } catch (error) {
        if (!t.finished) await t.rollback();
        if (error instanceof ErrorNumeracion) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('Configurar numeración:', error);
        return NextResponse.json({ error: 'No se pudo guardar la numeración' }, { status: 500 });
    }
}
