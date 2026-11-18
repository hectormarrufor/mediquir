import { NextResponse } from 'next/server';
import { sequelize } from '@/models';
import { requerirNoVendedor } from '@/app/api/_lib/acceso';
import { requerirStaff } from '@/app/api/inventario/_lib';
import { esFacturaAprobadaDe, esNotaAprobadaDe } from '@/app/api/_lib/aprobacion';
import { rolDe } from '@/app/constants/roles';
import { ErrorNumeracion, asignarControl } from '@/app/api/_lib/numeracion';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Asigna el número de control de la forma libre a una factura ('VENTA') o a una nota ('NOTA') al imprimirla.
// Es un correlativo compartido y se da una sola vez por documento; `reasignar` (solo administrador) toma el siguiente si la forma se dañó.
export async function POST(request) {
    // Un vendedor solo puede pedir el control de una factura SUYA ya aprobada (para imprimirla); lo demás es de administración
    const sesion = await requerirStaff();
    if (sesion.error) return sesion.error;
    const esVend = rolDe(sesion.sesion) === 'vendedor';
    const acceso = esVend ? sesion : await requerirNoVendedor();
    if (acceso.error) return acceso.error;

    const t = await sequelize.transaction();
    try {
        const { origen, id, reasignar } = await request.json();
        if (esVend) {
            const suyo = !reasignar && UUID.test(String(id || '')) && (origen === 'VENTA' ? await esFacturaAprobadaDe(id, sesion.sesion.id) : origen === 'NOTA' && await esNotaAprobadaDe(id, sesion.sesion.id));
            if (!suyo) throw new ErrorNumeracion('Solo puedes imprimir tus facturas y notas ya aprobadas', 403);
        }
        if (!UUID.test(String(id || ''))) throw new ErrorNumeracion('Documento no encontrado', 404);
        if (reasignar && rolDe(acceso.sesion) !== 'admin') throw new ErrorNumeracion('Solo un administrador puede reasignar el número de control', 403);

        const r = await asignarControl({ origen, id, reasignar: Boolean(reasignar), transaction: t });
        await t.commit();
        return NextResponse.json({ success: true, ...r });
    } catch (error) {
        if (!t.finished) await t.rollback();
        if (error instanceof ErrorNumeracion) return NextResponse.json({ error: error.message, codigo: error.codigo }, { status: error.status });
        console.error('Asignar número de control:', error);
        return NextResponse.json({ error: 'No se pudo asignar el número de control' }, { status: 500 });
    }
}
