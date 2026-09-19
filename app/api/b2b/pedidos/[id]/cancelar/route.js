import { NextResponse } from 'next/server';
import { Abono, Cliente, CuentaPorCobrar, SalidaInventario, Venta, sequelize } from '@/models';
import { notificarTodos } from '@/app/handlers/notificar';
import { requerirCliente } from '../../../../_lib/acceso';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// El cliente puede cancelar mientras el pedido siga "recibido" (nadie lo ha empacado) y sin pagos ni crédito asociados.
// En ese punto el stock no se ha descontado, así que no hay nada que devolver al inventario.
export async function POST(request, { params }) {
    const acceso = await requerirCliente();
    if (acceso.error) return acceso.error;

    const t = await sequelize.transaction();
    try {
        const { id } = await params;
        if (!UUID.test(id)) { await t.rollback(); return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 }); }

        const venta = await Venta.findOne({ where: { id, clienteId: acceso.clienteId }, transaction: t, lock: t.LOCK.UPDATE });
        if (!venta) { await t.rollback(); return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 }); }

        const [cxc, abonos] = await Promise.all([
            CuentaPorCobrar.count({ where: { ventaId: venta.id }, transaction: t }),
            Abono.count({ where: { ventaId: venta.id }, transaction: t }),
        ]);
        if (venta.statusDespacho !== 'Pendiente' || cxc > 0 || abonos > 0) {
            await t.rollback();
            return NextResponse.json({ error: 'Este pedido ya no se puede cancelar desde aquí. Comunícate con nosotros.' }, { status: 409 });
        }

        venta.statusDespacho = 'Cancelado';
        await venta.save({ transaction: t });
        await SalidaInventario.update({ estado: 'Cancelada' }, { where: { ventaId: venta.id }, transaction: t });
        await t.commit();

        try {
            const cliente = await Cliente.findByPk(acceso.clienteId, { attributes: ['nombre'] });
            await notificarTodos({
                title: 'Pedido B2B cancelado',
                body: `${cliente?.nombre || 'Un cliente'} canceló el pedido ${venta.numeroDocumento}.`,
                url: `/superuser/ventas/${venta.id}`,
                tipo: 'Alerta',
            });
        } catch (e) {
            console.error('B2B: no se pudo notificar la cancelación:', e.message);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        if (!t.finished) await t.rollback();
        console.error('B2B cancelar:', error);
        return NextResponse.json({ error: 'No se pudo cancelar el pedido' }, { status: 500 });
    }
}
