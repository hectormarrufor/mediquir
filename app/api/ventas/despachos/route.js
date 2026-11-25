import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import db from '@/models/index';
import { requerirStaff } from '../../inventario/_lib';
import { USUARIOS_QUE_CAMBIAN_PRECIOS } from '../../_lib/preciosAcceso';
import { guardarChoferFrecuente } from '../choferes/route';
import { notificarCabezas } from '@/app/handlers/notificar';
import { avisarCliente } from '../../_lib/avisosCliente';
import {
    asegurarColumnasEmpaqueNotas,
    analizarEmpaquesBatch,
    sqlExcluirDesarmado,
} from '../../_lib/empaqueNotas';

export const dynamic = 'force-dynamic';

const { sequelize, Venta, SalidaInventario, User, Empleado } = db;

let tablaDespachosLista = false;
async function asegurarTablaDespachos(transaction) {
    if (tablaDespachosLista) return;
    await sequelize.query(
        `CREATE TABLE IF NOT EXISTS "DespachosAgencia" (
            "id" SERIAL PRIMARY KEY,
            "numero" VARCHAR(30) NOT NULL UNIQUE,
            "agencia" VARCHAR(120) NOT NULL,
            "choferNombre" VARCHAR(120) NOT NULL,
            "choferCedula" VARCHAR(30) NOT NULL,
            "choferEmpresa" VARCHAR(120) NOT NULL,
            "firmaChoferUrl" TEXT NOT NULL,
            "facturasConfirmadas" BOOLEAN NOT NULL DEFAULT TRUE,
            "entregadoPorId" INTEGER,
            "entregadoPorNombre" VARCHAR(120),
            "observacion" TEXT,
            "ventas" JSONB NOT NULL DEFAULT '[]'::jsonb,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
        { transaction }
    );
    tablaDespachosLista = true;
}

async function puedeCambiarAgencia(sesion) {
    if (!sesion?.id) return false;
    if (Number(sesion.id) === 1) return true;
    const u = await User.findByPk(Number(sesion.id), { attributes: ['id', 'user'] }).catch(() => null);
    return USUARIOS_QUE_CAMBIAN_PRECIOS.includes(String(u?.user || '').trim().toLowerCase());
}

// ==========================================================
// GET: Envíos pendientes de despacho (por agencia y retiro en tienda) + historial de Actas de Despacho
// ==========================================================
export async function GET() {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;

    try {
        await asegurarTablaDespachos();
        await asegurarColumnasEmpaqueNotas();
        const [puedeEditar, pendientes, actas] = await Promise.all([
            puedeCambiarAgencia(acceso.sesion),
            sequelize.query(
                `SELECT v."id", v."numeroDocumento" AS numero, v."tipoDocumento"::text AS "tipoDocumento",
                        v."tipoEntrega"::text AS "tipoEntrega", v."statusDespacho"::text AS "statusDespacho",
                        v."createdAt" AS fecha, v."empacadoAt", v."etiquetadoAt",
                        COALESCE(btrim(v."quienRetira"), '') AS agencia,
                        COALESCE(c."nombre", 'Cliente al detal') AS cliente,
                        COALESCE(c."identificacion", '') AS identificacion,
                        COALESCE(e."nombre" || ' ' || e."apellido", u."user", '') AS empacador,
                        (SELECT COUNT(*)::int FROM "VentaDetalles" d WHERE d."ventaId" = v."id") AS renglones,
                        (SELECT COALESCE(SUM(d."cantidad"), 0)::int FROM "VentaDetalles" d WHERE d."ventaId" = v."id") AS articulos
                 FROM "Ventas" v
                 LEFT JOIN "Clientes" c ON c."id" = v."clienteId"
                 LEFT JOIN "Usuarios" u ON u."id" = v."empacadorId"
                 LEFT JOIN "Empleados" e ON e."id" = u."empleadoId"
                 WHERE v."statusDespacho" NOT IN ('Cancelado', 'Completado')
                   AND v."empacadoAt" IS NOT NULL
                   AND v."tipoEntrega" <> 'sitio'
                   AND ${sqlExcluirDesarmado('v')}
                 ORDER BY v."empacadoAt" ASC, v."createdAt" ASC`,
                { type: sequelize.QueryTypes.SELECT }
            ),
            sequelize.query(
                `SELECT "id", "numero", "agencia", "choferNombre", "choferCedula", "choferEmpresa",
                        "firmaChoferUrl", "facturasConfirmadas", "entregadoPorNombre", "observacion",
                        "ventas", "createdAt"
                 FROM "DespachosAgencia"
                 ORDER BY "id" DESC
                 LIMIT 60`,
                { type: sequelize.QueryTypes.SELECT }
            ),
        ]);

        const analisisMapa = await analizarEmpaquesBatch(pendientes.map((p) => p.id));
        const pendientesEnriquecidos = pendientes.map((p) => {
            const nc = analisisMapa.get(String(p.id)) || null;
            const ajustado = nc && (nc.modificaEmpaque || nc.esAnulacionTotal);
            return {
                ...p,
                renglones: ajustado ? nc.renglonesEfectivos : p.renglones,
                articulos: ajustado ? nc.totalRestante : p.articulos,
                renglonesOriginales: p.renglones,
                articulosOriginales: p.articulos,
                ncAfectacion: nc,
            };
        });

        const pendientesDelivery = pendientesEnriquecidos.filter((p) => p.tipoEntrega !== 'pickup');
        const pendientesPickup = pendientesEnriquecidos.filter((p) => p.tipoEntrega === 'pickup');
        const retenidosPorNc = pendientesEnriquecidos.filter((p) => p.ncAfectacion?.bloqueaDespacho);

        return NextResponse.json({
            puedeCambiarAgencia: puedeEditar,
            pendientesDelivery,
            pendientesPickup,
            retenidosPorNc,
            actas,
        });
    } catch (error) {
        console.error('Error listando despachos pendientes:', error);
        return NextResponse.json({ error: 'No se pudieron cargar los envíos pendientes de despacho' }, { status: 500 });
    }
}

// ==========================================================
// PUT: Cambiar la agencia de envíos (o cambiar entre pickup / delivery) — Jolexi, Joalex o admin principal
// ==========================================================
export async function PUT(request) {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;

    try {
        const body = await request.json();
        const ventaId = body.ventaId;
        const agencia = String(body.agencia ?? '').trim().slice(0, 120);
        const tipoEntrega = ['delivery', 'pickup', 'flete'].includes(body.tipoEntrega) ? body.tipoEntrega : null;

        if (!ventaId) return NextResponse.json({ error: 'Falta el pedido' }, { status: 400 });
        const venta = await Venta.findByPk(ventaId);
        if (!venta) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
        if (['Cancelado', 'Completado'].includes(venta.statusDespacho)) {
            return NextResponse.json({ error: 'Este pedido ya fue despachado o cancelado' }, { status: 409 });
        }

        const puedeEditar = await puedeCambiarAgencia(acceso.sesion);
        const tieneAgencia = Boolean(String(venta.quienRetira || '').trim());
        const cambiaTipoEntrega = Boolean(tipoEntrega && tipoEntrega !== venta.tipoEntrega);
        if (!puedeEditar && (tieneAgencia || cambiaTipoEntrega || venta.tipoEntrega === 'pickup')) {
            return NextResponse.json({ error: 'Solo Jolexi o Joalex pueden cambiar una agencia ya asignada o el tipo de retiro' }, { status: 403 });
        }

        if (tipoEntrega) venta.tipoEntrega = tipoEntrega;
        if (venta.tipoEntrega === 'pickup') {
            venta.quienRetira = null;
        } else {
            if (!agencia) return NextResponse.json({ error: 'Indica la agencia de envíos' }, { status: 400 });
            venta.quienRetira = agencia;
            if (venta.clienteId) {
                await db.Cliente.update({ agenciaEnvioHabitual: agencia }, { where: { id: venta.clienteId } }).catch(() => null);
            }
        }
        await venta.save();

        return NextResponse.json({
            success: true,
            ventaId: venta.id,
            agencia: venta.quienRetira || '',
            tipoEntrega: venta.tipoEntrega,
        });
    } catch (error) {
        console.error('Error cambiando agencia:', error);
        return NextResponse.json({ error: 'No se pudo actualizar la agencia de envío' }, { status: 500 });
    }
}

// ==========================================================
// POST: Entregar un lote de pedidos pendientes a una agencia de envíos (con verificación de facturas, chofer, firma y Acta PDF)
// ==========================================================
export async function POST(request) {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;
    const yo = Number(acceso.sesion.id);

    await asegurarColumnasEmpaqueNotas();
    const t = await sequelize.transaction();
    try {
        await asegurarTablaDespachos(t);
        const body = await request.json();
        const ventaIds = Array.isArray(body.ventaIds) ? [...new Set(body.ventaIds.filter(Boolean))] : [];
        if (!ventaIds.length) {
            await t.rollback();
            return NextResponse.json({ error: 'Selecciona al menos un pedido para despachar' }, { status: 400 });
        }
        if (body.facturasConfirmadas !== true) {
            await t.rollback();
            return NextResponse.json({ error: 'Debes confirmar que tienes en la mano las facturas impresas de todos los pedidos' }, { status: 400 });
        }

        const limpia = (x, max) => String(x ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
        const choferNombre = limpia(body.choferNombre, 120);
        const choferCedula = limpia(body.choferCedula, 30).toUpperCase();
        const choferEmpresa = limpia(body.choferEmpresa || body.agencia, 120);
        const agencia = limpia(body.agencia || choferEmpresa, 120);
        const observacion = limpia(body.observacion || '', 400) || null;

        if (choferNombre.length < 3) { await t.rollback(); return NextResponse.json({ error: 'Escribe el nombre completo del chofer' }, { status: 400 }); }
        if (choferCedula.length < 5) { await t.rollback(); return NextResponse.json({ error: 'Escribe la cédula del chofer' }, { status: 400 }); }
        if (choferEmpresa.length < 2) { await t.rollback(); return NextResponse.json({ error: 'Indica la agencia de envíos' }, { status: 400 }); }

        const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(body.firma || ''));
        if (!m) { await t.rollback(); return NextResponse.json({ error: 'Falta la firma del chofer' }, { status: 400 }); }
        const bytes = Buffer.from(m[1], 'base64');
        if (bytes.length < 200) { await t.rollback(); return NextResponse.json({ error: 'La firma está en blanco' }, { status: 400 }); }
        if (bytes.length > 1024 * 1024) { await t.rollback(); return NextResponse.json({ error: 'La firma es demasiado grande' }, { status: 400 }); }

        const ventas = await Venta.findAll({
            where: { id: ventaIds },
            transaction: t,
            lock: t.LOCK.UPDATE,
        });
        if (ventas.length !== ventaIds.length) {
            await t.rollback();
            return NextResponse.json({ error: 'Uno o más pedidos no se encontraron' }, { status: 404 });
        }
        for (const v of ventas) {
            if (['Completado', 'Cancelado'].includes(v.statusDespacho)) {
                await t.rollback();
                return NextResponse.json({ error: `El pedido ${v.numeroDocumento} ya fue despachado o cancelado` }, { status: 409 });
            }
            if (!v.empacadoAt) {
                await t.rollback();
                return NextResponse.json({ error: `El pedido ${v.numeroDocumento} todavía no termina de empacarse` }, { status: 409 });
            }
        }

        const analisisMapa = await analizarEmpaquesBatch(ventaIds, t);
        for (const v of ventas) {
            const nc = analisisMapa.get(String(v.id));
            if (nc?.bloqueaDespacho) {
                await t.rollback();
                return NextResponse.json({ error: `El pedido ${v.numeroDocumento} recibió una nota de crédito después de empacarse. Resuelve el ajuste de la caja antes de despacharlo.` }, { status: 409 });
            }
            if (nc?.estadoEfectivo === 'DESARMADO') {
                await t.rollback();
                return NextResponse.json({ error: `La caja del pedido ${v.numeroDocumento} fue desarmada por nota de crédito y no se puede despachar.` }, { status: 409 });
            }
        }

        const detallesResumenRaw = await sequelize.query(
            `SELECT v."id", v."numeroDocumento", v."tipoDocumento"::text AS "tipoDocumento",
                    COALESCE(c."nombre", 'Cliente al detal') AS cliente,
                    COALESCE(c."identificacion", '') AS identificacion,
                    (SELECT COUNT(*)::int FROM "VentaDetalles" d WHERE d."ventaId" = v."id") AS renglones,
                    (SELECT COALESCE(SUM(d."cantidad"), 0)::int FROM "VentaDetalles" d WHERE d."ventaId" = v."id") AS articulos
             FROM "Ventas" v
             LEFT JOIN "Clientes" c ON c."id" = v."clienteId"
             WHERE v."id" IN (:ids)
             ORDER BY v."numeroDocumento" ASC`,
            { replacements: { ids: ventaIds }, type: sequelize.QueryTypes.SELECT, transaction: t }
        );
        const detallesResumen = detallesResumenRaw.map((d) => {
            const nc = analisisMapa.get(String(d.id));
            if (nc && (nc.modificaEmpaque || nc.esAnulacionTotal)) {
                return { ...d, renglones: nc.renglonesEfectivos, articulos: nc.totalRestante };
            }
            return d;
        });

        const usuario = await User.findByPk(yo, { include: [{ model: Empleado, as: 'empleado', attributes: ['nombre', 'apellido'] }], transaction: t });
        const entregadoPorNombre = (usuario?.empleado
            ? `${usuario.empleado.nombre || ''} ${usuario.empleado.apellido || ''}`.trim()
            : (usuario?.user || [acceso.sesion.nombre, acceso.sesion.apellido].filter(Boolean).join(' '))
        ).slice(0, 120) || 'Personal Mediquir';

        const blob = await put(`entregas/lotes/firma-chofer-${Date.now()}.png`, bytes, {
            access: 'public',
            contentType: 'image/png',
            addRandomSuffix: true,
        });

        await guardarChoferFrecuente({ nombre: choferNombre, cedula: choferCedula, empresa: choferEmpresa }, t).catch(() => null);

        const [{ maxId }] = await sequelize.query(`SELECT COALESCE(MAX("id"), 0)::int AS "maxId" FROM "DespachosAgencia"`, {
            type: sequelize.QueryTypes.SELECT,
            transaction: t,
        });
        const numeroActa = `DA-${String(maxId + 1).padStart(5, '0')}`;

        const [acta] = await sequelize.query(
            `INSERT INTO "DespachosAgencia"
                ("numero", "agencia", "choferNombre", "choferCedula", "choferEmpresa", "firmaChoferUrl",
                 "facturasConfirmadas", "entregadoPorId", "entregadoPorNombre", "observacion", "ventas", "createdAt", "updatedAt")
             VALUES
                (:numero, :agencia, :choferNombre, :choferCedula, :choferEmpresa, :firmaChoferUrl,
                 true, :entregadoPorId, :entregadoPorNombre, :observacion, :ventas::jsonb, NOW(), NOW())
             RETURNING "id", "numero", "agencia", "choferNombre", "choferCedula", "choferEmpresa",
                       "firmaChoferUrl", "facturasConfirmadas", "entregadoPorNombre", "observacion", "ventas", "createdAt"`,
            {
                replacements: {
                    numero: numeroActa,
                    agencia,
                    choferNombre,
                    choferCedula,
                    choferEmpresa,
                    firmaChoferUrl: blob.url,
                    entregadoPorId: yo,
                    entregadoPorNombre,
                    observacion,
                    ventas: JSON.stringify(detallesResumen),
                },
                type: sequelize.QueryTypes.SELECT,
                transaction: t,
            }
        );

        const ahora = new Date();
        const quienRetiraTexto = `${choferNombre} (C.I. ${choferCedula}) · ${choferEmpresa}`.slice(0, 255);
        for (const v of ventas) {
            v.statusDespacho = 'Completado';
            v.etiquetadoAt = v.etiquetadoAt || ahora;
            v.choferNombre = choferNombre;
            v.choferCedula = choferCedula;
            v.choferEmpresa = choferEmpresa;
            v.firmaChoferUrl = blob.url;
            v.facturaEntregadaChofer = true;
            v.entregadoPorId = yo;
            v.entregadoPorNombre = entregadoPorNombre;
            v.quienRetira = quienRetiraTexto;
            v.fechaHoraRetiro = ahora;
            await v.save({ transaction: t });
        }

        await SalidaInventario.update(
            { estado: 'Entregada' },
            { where: { ventaId: ventaIds }, transaction: t }
        );

        await t.commit();

        try {
            await notificarCabezas({
                title: `Despacho entregado a ${agencia} 🚚✅`,
                body: `${entregadoPorNombre} entregó ${ventas.length} pedido(s) a ${choferNombre} (C.I. ${choferCedula}) — Acta ${acta.numero}.`,
                url: `/superuser/ventas/despachos/${acta.id}/imprimir`,
                tipo: 'Info',
            });
            for (const v of ventas) {
                if (v.tipoVenta === 'MAYOR') await avisarCliente(v, 'DESPACHADO').catch(() => null);
            }
        } catch (e) {
            console.error('No se pudo notificar despacho en lote:', e.message);
        }

        return NextResponse.json({ success: true, acta });
    } catch (error) {
        await t.rollback().catch(() => null);
        console.error('Error registrando despacho a agencia:', error);
        return NextResponse.json({ error: error.message || 'No se pudo registrar el despacho' }, { status: 500 });
    }
}
