import { NextResponse } from 'next/server';
import { sequelize } from '@/models';
import { requerirNoVendedor } from '@/app/api/_lib/acceso';
import { requerirStaff } from '@/app/api/inventario/_lib';
import { esFacturaAprobadaDe, esNotaAprobadaDe } from '@/app/api/_lib/aprobacion';
import { rolDe } from '@/app/constants/roles';
import { ErrorNumeracion, asignarControl, controlesLibres } from '@/app/api/_lib/numeracion';
import { FormaAnulada } from '@/models';
import { notificarAdmins } from '@/app/handlers/notificar';
import { nombreDeUsuario } from '@/app/api/_lib/aprobacion';

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
        const { origen, id, reasignar, accion, control: controlVisto, documento } = await request.json();
        if (esVend) {
            const suyo = !reasignar && UUID.test(String(id || '')) && (origen === 'VENTA' ? await esFacturaAprobadaDe(id, sesion.sesion.id) : origen === 'NOTA' && await esNotaAprobadaDe(id, sesion.sesion.id));
            if (!suyo) throw new ErrorNumeracion('Solo puedes imprimir tus facturas y notas ya aprobadas', 403);
        }
        if (!UUID.test(String(id || ''))) throw new ErrorNumeracion('Documento no encontrado', 404);
        if (reasignar && rolDe(acceso.sesion) !== 'admin') throw new ErrorNumeracion('Solo un administrador puede reasignar el número de control', 403);

        if (accion === 'DANAR_SIGUIENTE') {
            // La forma que iba a usarse se dañó antes de imprimir: ese número queda anotado como forma anulada y el siguiente pasa a ser el que se asigna
            const [libre] = await controlesLibres(1, t);
            if (!libre) throw new ErrorNumeracion('Antes de emitir documentos debes indicar el número de control de la forma libre con la que empiezas', 409, 'CONTROL_PENDIENTE');
            const n = Number(/^00-0*(\d+)$/.exec(libre)[1]);
            if (controlVisto && Number(String(controlVisto).replace(/\D/g, '')) !== n) throw new ErrorNumeracion(`El siguiente número de control cambió a ${libre}: vuelve a verificar la forma`, 409);
            await FormaAnulada.findOrCreate({ where: { numero: n }, defaults: { motivo: `Forma dañada antes de imprimir ${String(documento || '').slice(0, 60)}`.trim(), usuarioId: Number(sesion.sesion.id) || null }, transaction: t });
            const [siguiente] = await controlesLibres(1, t);
            await t.commit();
            if (esVend) {
                const quien = await nombreDeUsuario(sesion.sesion.id).catch(() => null);
                await notificarAdmins({ title: 'Forma dañada 🧾', body: `${quien || 'Un vendedor'} marcó como dañada la forma con el control ${libre} al imprimir ${String(documento || 'un documento').slice(0, 60)}. Quedó anotada como forma anulada.`, url: '/superuser/ventas/controles', tipo: 'Info' }).catch(() => {});
            }
            return NextResponse.json({ success: true, danada: libre, siguiente });
        }

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
