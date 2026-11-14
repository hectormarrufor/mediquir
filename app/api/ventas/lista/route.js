import { NextResponse } from 'next/server';
import sequelize from '@/sequelize';
import { requerirStaff } from '../../inventario/_lib';
import { USD, alcanceDe } from '../_lib';
import { idsPorAprobar } from '../../_lib/aprobacion';

export const dynamic = 'force-dynamic';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const TAMANO = 15;
const ORDENABLES = { fecha: 'x."fecha"', total: 'x."totalUsd"', numero: 'x."numero"' };
const DOCUMENTOS = ['FACTURA', 'NOTA_ENTREGA', 'VENTA_RAPIDA', 'NOTA_CREDITO', 'NOTA_DEBITO'];
// Monto de una nota en dólares (la de crédito resta)
const NOTA_USD = `(CASE WHEN n."moneda" = 'BS' THEN n."totalFinal" / NULLIF(n."tasaCambio", 0) ELSE n."totalFinal" END * (CASE WHEN n."tipo" = 'CREDITO' THEN -1 ELSE 1 END))`;
// Estado de pago que se muestra: una venta sin pagar cuya fecha de pago ya pasó (hora de Caracas) es "Vencido"
const PAGO = `(CASE WHEN v."statusPago" <> 'Pagado' AND v."statusDespacho" <> 'Cancelado' AND v."fechaVencimiento" IS NOT NULL
    AND (v."fechaVencimiento" AT TIME ZONE 'America/Caracas')::date < (now() AT TIME ZONE 'America/Caracas')::date THEN 'Vencido' ELSE v."statusPago"::text END)`;

// Lista paginada de ventas con filtros en el servidor (antes se descargaban todas las del periodo y se filtraba en el navegador)
export async function GET(request) {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;

    try {
        const { searchParams } = new URL(request.url);
        const desde = searchParams.get('desde');
        const hasta = searchParams.get('hasta');
        if (!FECHA.test(desde || '') || !FECHA.test(hasta || '')) return NextResponse.json({ error: 'Rango de fechas inválido' }, { status: 400 });

        const tipo = ['DETAL', 'MAYOR', 'ONLINE'].includes(searchParams.get('tipo')) ? searchParams.get('tipo') : null;
        const estado = ['Pendiente', 'Empacado', 'Parcial', 'Completado', 'Cancelado'].includes(searchParams.get('estado')) ? searchParams.get('estado') : null;
        const pago = ['Pendiente', 'Pagado', 'Vencido'].includes(searchParams.get('pago')) ? searchParams.get('pago') : null;
        const doc = DOCUMENTOS.includes(searchParams.get('doc')) ? searchParams.get('doc') : null;
        const q = (searchParams.get('q') || '').trim().slice(0, 60);
        const pagina = Math.max(1, Number(searchParams.get('page')) || 1);
        const orden = ORDENABLES[searchParams.get('sort')] || ORDENABLES.fecha;
        const dir = searchParams.get('dir') === 'asc' ? 'ASC' : 'DESC';

        const alcance = alcanceDe(acceso.sesion);
        const replacements = { desde, hasta, q: `%${q}%`, limite: TAMANO, salto: (pagina - 1) * TAMANO, ...alcance.replacements };
        let filtro = `(v."createdAt" AT TIME ZONE 'America/Caracas')::date BETWEEN :desde AND :hasta${alcance.sql}`;
        if (tipo) { filtro += ' AND v."tipoVenta" = :tipo'; replacements.tipo = tipo; }
        if (estado) { filtro += ' AND v."statusDespacho" = :estado'; replacements.estado = estado; }
        // "Vencido" = venta sin pagar cuya fecha de pago ya pasó (antes el filtro buscaba un estado que casi nunca se guarda y salía vacío)
        if (pago) { filtro += ` AND ${PAGO} = :pago`; replacements.pago = pago; }
        const soloVentas = ['FACTURA', 'NOTA_ENTREGA', 'VENTA_RAPIDA'].includes(doc);
        if (soloVentas) { filtro += ' AND v."tipoDocumento" = :doc'; replacements.doc = doc; }
        if (q) filtro += ' AND (v."numeroDocumento" ILIKE :q OR c."nombre" ILIKE :q OR c."identificacion" ILIKE :q)';

        const desdeSql = `FROM "Ventas" v LEFT JOIN "Clientes" c ON c."id" = v."clienteId"
            LEFT JOIN "Usuarios" u ON u."id" = v."vendedorId" LEFT JOIN "Empleados" e ON e."id" = u."empleadoId"`;
        const consultar = (sql) => sequelize.query(sql, { replacements, type: sequelize.QueryTypes.SELECT });

        // Notas de crédito y débito emitidas a clientes: entran a la lista salvo que se filtre por algo que solo tienen las ventas
        // (despacho o pago) o por otro tipo de documento. El tipo de venta (detal/mayor/online) es el de la factura que afectan.
        const incluyeNotas = !estado && !pago && (!doc || doc === 'NOTA_CREDITO' || doc === 'NOTA_DEBITO');
        const incluyeVentas = !doc || soloVentas;
        let filtroNota = `n."origen" = 'VENTA' AND n."fecha" BETWEEN :desde AND :hasta${alcance.sql}`;
        if (tipo) filtroNota += ' AND v."tipoVenta" = :tipo';
        if (doc === 'NOTA_CREDITO') filtroNota += ` AND n."tipo" = 'CREDITO'`;
        if (doc === 'NOTA_DEBITO') filtroNota += ` AND n."tipo" = 'DEBITO'`;
        if (q) filtroNota += ' AND (n."numeroDocumento" ILIKE :q OR c."nombre" ILIKE :q OR c."identificacion" ILIKE :q)';
        const desdeNota = `FROM "NotasFiscales" n LEFT JOIN "Ventas" v ON v."id" = COALESCE(n."ventaId", (n."facturasAfectadas"->0->>'ventaId')::uuid)
            LEFT JOIN "Clientes" c ON c."id" = n."clienteId"
            LEFT JOIN "Usuarios" u ON u."id" = v."vendedorId" LEFT JOIN "Empleados" e ON e."id" = u."empleadoId"`;

        const partes = [];
        if (incluyeVentas) partes.push(`SELECT v."id", v."id" AS "ventaId", v."numeroDocumento" AS numero, v."createdAt" AS fecha, v."tipoVenta" AS tipo, v."tipoDocumento"::text AS "tipoDocumento", v."moneda"::text AS moneda,
                v."totalFinal"::float AS total, ${USD}::float AS "totalUsd", v."statusDespacho"::text AS estado, ${PAGO} AS pago, v."condicionPago"::text AS "condicionPago",
                v."empacadoAt", v."etiquetadoAt", v."empacadorId", v."etiquetadorId",
                COALESCE(c."nombre", 'Cliente al detal') AS cliente, COALESCE(e."nombre" || ' ' || e."apellido", u."user") AS vendedor,
                (SELECT COALESCE(SUM(d."cantidad"), 0)::int FROM "VentaDetalles" d WHERE d."ventaId" = v."id") AS articulos,
                (SELECT r."estado" FROM "RetencionesIva" r WHERE r."ventaId" = v."id" LIMIT 1) AS retencion
                ${desdeSql} WHERE ${filtro}`);
        if (incluyeNotas) partes.push(`SELECT n."id", v."id" AS "ventaId", n."numeroDocumento" AS numero, n."createdAt" AS fecha, v."tipoVenta" AS tipo,
                (CASE WHEN n."tipo" = 'CREDITO' THEN 'NOTA_CREDITO' ELSE 'NOTA_DEBITO' END) AS "tipoDocumento", n."moneda"::text AS moneda,
                (n."totalFinal" * (CASE WHEN n."tipo" = 'CREDITO' THEN -1 ELSE 1 END))::float AS total, ${NOTA_USD}::float AS "totalUsd",
                (CASE WHEN n."estado" = 'ANULADA' THEN 'Anulada' ELSE 'Emitida' END) AS estado, NULL::text AS pago, NULL::text AS "condicionPago",
                NULL::timestamptz AS "empacadoAt", NULL::timestamptz AS "etiquetadoAt", NULL::int AS "empacadorId", NULL::int AS "etiquetadorId",
                COALESCE(c."nombre", 'Cliente al detal') AS cliente, COALESCE(e."nombre" || ' ' || e."apellido", u."user") AS vendedor, NULL::int AS articulos,
                NULL::text AS retencion
                ${desdeNota} WHERE ${filtroNota}`);
        if (!partes.length) return NextResponse.json({ ventas: [], total: 0, pagina, paginas: 1 });
        const unidas = partes.join(' UNION ALL ');

        const [filas, [{ total }]] = await Promise.all([
            consultar(`SELECT * FROM (${unidas}) x ORDER BY ${orden} ${dir}, x."id" LIMIT :limite OFFSET :salto`),
            consultar(`SELECT COUNT(*)::int AS total FROM (${unidas}) x`),
        ]);

        // Facturas y notas de vendedores que esperan aprobación (no se imprimen todavía)
        const esNotaFila = (f) => f.tipoDocumento === 'NOTA_CREDITO' || f.tipoDocumento === 'NOTA_DEBITO';
        const [pv, pn] = await Promise.all([
            idsPorAprobar('VENTA', filas.filter((f) => f.tipoDocumento === 'FACTURA').map((f) => f.id)),
            idsPorAprobar('NOTA', filas.filter(esNotaFila).map((f) => f.id)),
        ]);
        const ventas = filas.map((f) => ((esNotaFila(f) ? pn : pv).has(String(f.id)) ? { ...f, porAprobar: true } : f));
        return NextResponse.json({ ventas, total, pagina, paginas: Math.max(1, Math.ceil(total / TAMANO)) });
    } catch (error) {
        console.error('Lista de ventas:', error);
        return NextResponse.json({ error: 'No se pudo cargar la lista de ventas' }, { status: 500 });
    }
}
