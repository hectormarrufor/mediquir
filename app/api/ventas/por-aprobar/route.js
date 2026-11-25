import { NextResponse } from 'next/server';
import { sequelize } from '@/models';
import { getSesion } from '@/app/api/notificaciones/_lib';
import { puedeAprobar, aprobar, avisarAprobado } from '@/app/api/_lib/aprobacion';
import { aplicarEfectosVenta, avisarPedidoMayor, ErrorEfectos } from '@/app/api/_lib/efectosVenta';
import { aplicarEfectosNota, ErrorNota } from '@/app/api/_lib/notasFiscales';
import { asegurarColumnasEmpaqueNotas, notificarCajaRetenidaPorNc } from '@/app/api/_lib/empaqueNotas';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function requerirAprobador() {
    const sesion = await getSesion();
    if (!sesion) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
    if (!(await puedeAprobar(sesion))) return { error: NextResponse.json({ error: 'No tienes permiso para aprobar documentos' }, { status: 403 }) };
    return { sesion };
}

// Facturas y notas de crédito/débito de los vendedores que esperan aprobación, en orden de número de control
export async function GET() {
    const a = await requerirAprobador();
    if (a.error) return a.error;
    try {
        const consulta = (sql) => sequelize.query(sql, { type: sequelize.QueryTypes.SELECT });
        const nombre = `COALESCE(e."nombre" || ' ' || e."apellido", u."user")`;
        const [facturas, notas] = await Promise.all([
            consulta(`SELECT v."id", v."id" AS "ventaId", 'FACTURA' AS tipo, v."numeroDocumento" AS numero, v."numeroControl", v."createdAt" AS fecha, v."moneda"::text AS moneda,
                    v."totalFinal"::float AS total, COALESCE(c."nombre", 'Cliente al detal') AS cliente, ${nombre} AS vendedor
                FROM "Ventas" v LEFT JOIN "Clientes" c ON c."id" = v."clienteId" LEFT JOIN "Usuarios" u ON u."id" = v."vendedorId" LEFT JOIN "Empleados" e ON e."id" = u."empleadoId"
                WHERE v."aprobacionEstado" = 'PENDIENTE' AND v."tipoDocumento" = 'FACTURA'`),
            consulta(`SELECT n."id", COALESCE(n."ventaId", (n."facturasAfectadas"->0->>'ventaId')::uuid) AS "ventaId", (CASE WHEN n."tipo" = 'CREDITO' THEN 'NOTA_CREDITO' ELSE 'NOTA_DEBITO' END) AS tipo,
                    n."numeroDocumento" AS numero, n."numeroControl", n."createdAt" AS fecha, n."moneda"::text AS moneda, n."totalFinal"::float AS total,
                    COALESCE(c."nombre", 'Cliente al detal') AS cliente, ${nombre} AS vendedor, n."estado" AS estado
                FROM "NotasFiscales" n LEFT JOIN "Ventas" v ON v."id" = COALESCE(n."ventaId", (n."facturasAfectadas"->0->>'ventaId')::uuid)
                    LEFT JOIN "Clientes" c ON c."id" = n."clienteId" LEFT JOIN "Usuarios" u ON u."id" = COALESCE(n."registradoPorId", v."vendedorId") LEFT JOIN "Empleados" e ON e."id" = u."empleadoId"
                WHERE n."aprobacionEstado" = 'PENDIENTE' AND n."origen" = 'VENTA'`),
        ]);
        // Orden por número de control (con ceros a la izquierda); sin control, al final por fecha
        const clave = (d) => String(d.numeroControl || '').replace(/\D/g, '').padStart(12, '0');
        const documentos = [...facturas, ...notas].sort((x, y) => {
            if (!x.numeroControl !== !y.numeroControl) return x.numeroControl ? -1 : 1;
            return clave(x).localeCompare(clave(y)) || new Date(x.fecha) - new Date(y.fecha);
        });
        return NextResponse.json({ documentos, total: documentos.length });
    } catch (error) {
        // Migración sin correr: no hay nada por aprobar todavía
        if (error?.original?.code === '42703' || /aprobacionEstado/.test(error?.message || '')) return NextResponse.json({ documentos: [], total: 0, sinMigrar: true });
        console.error('Documentos por aprobar:', error);
        return NextResponse.json({ error: 'No se pudieron cargar los documentos por aprobar' }, { status: 500 });
    }
}

// Aprueba un documento: { tipo: 'VENTA' | 'NOTA', id }. Desde ahí se puede imprimir.
// Al aprobarlo se aplican sus efectos (inventario, cuenta por cobrar, caja, comisión): todo en una transacción; si algo falla sigue por aprobar.
export async function POST(request) {
    const a = await requerirAprobador();
    if (a.error) return a.error;
    await asegurarColumnasEmpaqueNotas();
    const t = await sequelize.transaction();
    try {
        const { tipo, id } = await request.json();
        if (!['VENTA', 'NOTA'].includes(tipo) || !UUID.test(String(id))) { await t.rollback(); return NextResponse.json({ error: 'Documento inválido' }, { status: 400 }); }
        const ok = await aprobar(tipo, id, Number(a.sesion.id), t);
        if (!ok) { await t.rollback(); return NextResponse.json({ error: 'Ese documento ya no está por aprobar' }, { status: 409 }); }
        const efectos = tipo === 'VENTA' ? await aplicarEfectosVenta({ ventaId: id, transaction: t }) : await aplicarEfectosNota({ notaId: id, transaction: t });
        await t.commit();
        if (tipo === 'VENTA' && efectos.aplicado) await avisarPedidoMayor(efectos.venta);
        if (tipo === 'NOTA' && efectos.avisoPostEmpaque) await notificarCajaRetenidaPorNc(efectos.avisoPostEmpaque);
        await avisarAprobado({ tipo, id, aprobadorId: Number(a.sesion.id) }); // el vendedor se entera: ya puede imprimirla
        return NextResponse.json({ success: true });
    } catch (error) {
        if (!t.finished) await t.rollback();
        if (error instanceof ErrorEfectos || error instanceof ErrorNota) return NextResponse.json({ error: error.message }, { status: error.status || 409 });
        console.error('Aprobar documento:', error);
        return NextResponse.json({ error: 'No se pudo aprobar el documento' }, { status: 500 });
    }
}
