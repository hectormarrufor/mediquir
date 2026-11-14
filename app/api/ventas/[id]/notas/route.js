import { NextResponse } from 'next/server';
import { Venta, sequelize } from '@/models';
import { rolDe } from '@/app/api/_lib/acceso';
import { requerirStaff } from '@/app/api/inventario/_lib';
import { aprobacionDisponible, marcarPorAprobar, avisarPorAprobar, nombreDeUsuario } from '@/app/api/_lib/aprobacion';
import { ErrorNota, emitirNotaVenta, notasDeVenta, calcularDiferencial, emitirNotaDiferencial, otrasFacturasDelCliente } from '@/app/api/_lib/notasFiscales';
import { tasaVigente } from '@/app/api/_lib/tasaBcv';
import { avisarCliente } from '@/app/api/_lib/avisosCliente';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Notas de crédito y de débito de una factura y lo que queda por acreditar de cada renglón
export async function GET(request, { params }) {
    const acceso = await requerirStaff(); // un vendedor ve las notas de SUS facturas (las suyas pasan por aprobación)
    if (acceso.error) return acceso.error;
    try {
        const { id } = await params;
        if (!UUID.test(id)) return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
        const venta = await Venta.findByPk(id);
        if (!venta) return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
        if (rolDe(acceso.sesion) === 'vendedor' && Number(venta.vendedorId) !== Number(acceso.sesion.id)) return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
        const datos = await notasDeVenta(venta);
        // Vista previa del diferencial cambiario con la tasa de hoy (?usd= tramo de la factura que se paga)
        let diferencial = null;
        try {
            const usd = new URL(request.url).searchParams.get('usd');
            diferencial = await calcularDiferencial({ venta, tasaHoy: await tasaVigente(), usdSolicitado: usd });
        } catch { diferencial = null; }
        return NextResponse.json({ ...datos, diferencial, otrasFacturas: await otrasFacturasDelCliente(venta) });
    } catch (error) {
        console.error('Notas de una factura:', error);
        return NextResponse.json({ error: 'No se pudieron cargar las notas' }, { status: 500 });
    }
}

// Emite una nota de crédito o de débito sobre la factura: { tipo, motivo, renglones, devuelveInventario }
export async function POST(request, { params }) {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;
    const esVend = rolDe(acceso.sesion) === 'vendedor';

    const t = await sequelize.transaction();
    try {
        const { id } = await params;
        if (!UUID.test(id)) throw new ErrorNota('Factura no encontrada', 404);
        const { tipo, motivo, renglones, devuelveInventario, usdDiferencial, otrasFacturasIds, numeroNota, numeroControl, fecha } = await request.json();

        const venta = await Venta.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!venta) throw new ErrorNota('Factura no encontrada', 404);
        // Un vendedor emite notas de crédito o débito normales sobre SUS facturas; quedan por aprobar (el diferencial cambiario es de administración)
        if (esVend) {
            if (Number(venta.vendedorId) !== Number(acceso.sesion.id)) throw new ErrorNota('Factura no encontrada', 404);
            if (!['CREDITO', 'DEBITO'].includes(tipo)) throw new ErrorNota('Tu rol no permite esta acción', 403);
            if (!(await aprobacionDisponible())) throw new ErrorNota('Todavía no está activada la aprobación de documentos: pídele a administración que emita la nota', 409);
        }

        const nota = tipo === 'DIFERENCIAL'
            ? await emitirNotaDiferencial({ venta, tasaHoy: await tasaVigente({ transaction: t }), usdSolicitado: usdDiferencial, usuarioId: Number(acceso.sesion.id) || null, transaction: t })
            : await emitirNotaVenta({ venta, tipo, renglones, motivo, devuelveInventario: Boolean(devuelveInventario), otrasFacturasIds, usuarioId: Number(acceso.sesion.id) || null, transaction: t, numeroManual: numeroNota || null, numeroControl: numeroControl || null, fecha: fecha || null });
        await t.commit();
        let porAprobar = false;
        if (esVend) {
            porAprobar = await marcarPorAprobar('NOTA', nota.id);
            if (porAprobar) await avisarPorAprobar({ tipoDoc: `la nota de ${nota.tipo === 'CREDITO' ? 'crédito' : 'débito'}`, numero: nota.numeroDocumento, vendedor: await nombreDeUsuario(acceso.sesion.id).catch(() => null) });
        }
        if (venta.tipoVenta === 'MAYOR') await avisarCliente(venta, 'NOTA_EMITIDA', { tipo: nota.tipo, numero: nota.numeroDocumento });
        return NextResponse.json({ success: true, nota: { ...(nota.toJSON?.() || nota), porAprobar } }, { status: 201 });
    } catch (error) {
        if (!t.finished) await t.rollback();
        if (error instanceof ErrorNota) return NextResponse.json({ error: error.message, codigo: error.codigo }, { status: error.status });
        console.error('Emitir nota:', error);
        return NextResponse.json({ error: 'No se pudo emitir la nota' }, { status: 500 });
    }
}
