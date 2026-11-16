import { NextResponse } from 'next/server';
import db from '@/models';
import sequelize from '@/sequelize';
import { requerirNoVendedor } from '../../../_lib/acceso';
import { primerReciboLibre } from '../../../recibos/_lib';
import { fechaCaracas } from '@/app/constants/hora';
import { numeroALetras } from '@/app/utils/numeroALetras';

export const dynamic = 'force-dynamic';
const { Recibo } = db;
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const TIPOS = { FACTURA: 'FAC', NOTA_ENTREGA: 'N/E', VENTA_RAPIDA: 'V/R' };

// «Pago móvil», «Transferencia»… del abono → la forma de pago del recibo
const formaDe = (metodos) => {
    const t = metodos.join(' ').toLowerCase();
    if (/cheque/.test(t)) return 'CHEQUE';
    if (/transfer|pago m[oó]vil|zelle|dep[oó]sito/.test(t)) return 'TRANSFERENCIA';
    if (/efectivo|divisa|cash/.test(t)) return 'EFECTIVO';
    return 'OTRO';
};
const unicos = (lista) => [...new Set(lista.map((x) => String(x ?? '').trim()).filter(Boolean))];

// Recibo de cobranza: de los abonos que el usuario elige (todos del mismo cliente) arma un recibo numerado, en bolívares, con una línea por factura.
// Si ya existe un recibo con esos mismos abonos, se devuelve ese (reimprimir no gasta otro número). Body: { abonoIds: [..] }
export async function POST(request) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    try {
        const body = await request.json();
        const ids = [...new Set((Array.isArray(body?.abonoIds) ? body.abonoIds : []).map(Number))].filter((n) => Number.isInteger(n) && n > 0).sort((a, b) => a - b);
        if (!ids.length) return NextResponse.json({ error: 'Elige al menos un abono' }, { status: 400 });
        if (ids.length > 60) return NextResponse.json({ error: 'Un recibo admite hasta 60 abonos' }, { status: 400 });
        const clave = ids.join(',');

        const previo = await Recibo.findOne({ where: { anulado: false, [db.Sequelize.Op.and]: [db.Sequelize.where(db.Sequelize.literal(`"detalle"->>'clave'`), clave)] } });
        if (previo) return NextResponse.json({ ...previo.toJSON(), yaExistia: true });

        const filas = await sequelize.query(
            `SELECT a.id, a."fechaPago" AS fecha, a."metodoPago" AS metodo, a.referencia, a."montoUsd"::float AS "montoUsd",
                    COALESCE(NULLIF(a."montoBs", 0), a."montoUsd" * a."tasaCambio")::float AS "montoBs",
                    v."numeroDocumento" AS documento, v."tipoDocumento"::text AS "tipoDoc", (COALESCE(v."fechaEmision", v."createdAt") AT TIME ZONE 'America/Caracas')::date AS emision,
                    v."clienteId", cl.nombre AS cliente, cl.identificacion AS rif,
                    (SELECT ve.nombre FROM "ComisionesVenta" cv JOIN "VendedoresComision" ve ON ve.id = cv."vendedorId" WHERE cv."ventaId" = v.id AND cv.concepto = 'FACTURA' LIMIT 1) AS vendedor
               FROM "Abonos" a JOIN "Ventas" v ON v.id = a."ventaId" LEFT JOIN "Clientes" cl ON cl.id = v."clienteId"
              WHERE a.id IN (:ids) ORDER BY v."fechaEmision", v."numeroDocumento", a.id`,
            { replacements: { ids }, type: sequelize.QueryTypes.SELECT },
        );
        if (filas.length !== ids.length) return NextResponse.json({ error: 'Alguno de los abonos ya no existe: actualiza la pantalla' }, { status: 404 });
        if (new Set(filas.map((f) => f.clienteId)).size > 1) return NextResponse.json({ error: 'Los abonos de un recibo deben ser de un solo cliente' }, { status: 400 });
        if (filas.some((f) => !(f.montoUsd > 0) || !(f.montoBs > 0))) return NextResponse.json({ error: 'No se puede hacer recibo de un ajuste (monto negativo o en cero)' }, { status: 400 });

        const cliente = filas[0].cliente || 'Cliente';
        const totalBs = r2(filas.reduce((t, f) => t + f.montoBs, 0));
        const totalUsd = r2(filas.reduce((t, f) => t + f.montoUsd, 0));
        const metodos = unicos(filas.map((f) => f.metodo));
        const referencias = unicos(filas.map((f) => f.referencia));
        const fechas = filas.map((f) => iso(f.fecha)).sort();
        const vendedores = unicos(filas.map((f) => f.vendedor));
        const concepto = `PAGO POR ${(metodos.length ? metodos.join(' / ') : 'ABONO').toUpperCase()}${referencias.length ? ` · REF. ${referencias.join(', ')}` : ''}`;
        const detalle = {
            clave, abonoIds: ids, totalUsd,
            lineas: filas.map((f) => ({ abonoId: f.id, emision: iso(f.emision), tipo: TIPOS[f.tipoDoc] || String(f.tipoDoc || '').slice(0, 3), documento: f.documento, cliente: f.cliente, montoBs: r2(f.montoBs), montoUsd: r2(f.montoUsd) })),
            pago: { desde: fechas[0], hasta: fechas[fechas.length - 1], metodos, referencias },
            vendedor: vendedores.length === 1 ? vendedores[0] : null,
        };
        const datos = {
            tipo: 'RECIBIDO_DE', fecha: fechaCaracas(), lugar: 'Ciudad Ojeda', personaNombre: cliente.slice(0, 200), personaIdentificacion: filas[0].rif || null,
            moneda: 'BS', monto: totalBs, montoLetras: `${numeroALetras(totalBs)} Bolívares`, concepto: concepto.slice(0, 1500),
            formaPago: formaDe(metodos), referencia: referencias.join(', ').slice(0, 100) || null, banco: null, detalle,
            creadoPorId: Number(acceso.sesion?.id) || null,
        };
        const recibo = await Recibo.create({ ...datos, numero: await primerReciboLibre() });
        return NextResponse.json(recibo, { status: 201 });
    } catch (error) {
        if (error?.name === 'SequelizeUniqueConstraintError') return NextResponse.json({ error: 'Otro recibo tomó ese número a la vez: vuelve a intentar' }, { status: 409 });
        console.error('Recibo de cobranza:', error);
        return NextResponse.json({ error: 'No se pudo generar el recibo' }, { status: 500 });
    }
}
