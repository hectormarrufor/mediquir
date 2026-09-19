import { NextResponse } from 'next/server';
import sequelize from '@/sequelize';
import { requerirStaff } from '../../inventario/_lib';
import { USD, alcanceDe } from '../_lib';

export const dynamic = 'force-dynamic';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const TAMANO = 15;
const ORDENABLES = { fecha: 'v."createdAt"', total: `(${USD})`, numero: 'v."numeroDocumento"' };

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
        const q = (searchParams.get('q') || '').trim().slice(0, 60);
        const pagina = Math.max(1, Number(searchParams.get('page')) || 1);
        const orden = ORDENABLES[searchParams.get('sort')] || ORDENABLES.fecha;
        const dir = searchParams.get('dir') === 'asc' ? 'ASC' : 'DESC';

        const alcance = alcanceDe(acceso.sesion);
        const replacements = { desde, hasta, q: `%${q}%`, limite: TAMANO, salto: (pagina - 1) * TAMANO, ...alcance.replacements };
        let filtro = `(v."createdAt" AT TIME ZONE 'America/Caracas')::date BETWEEN :desde AND :hasta${alcance.sql}`;
        if (tipo) { filtro += ' AND v."tipoVenta" = :tipo'; replacements.tipo = tipo; }
        if (estado) { filtro += ' AND v."statusDespacho" = :estado'; replacements.estado = estado; }
        if (pago) { filtro += ' AND v."statusPago" = :pago'; replacements.pago = pago; }
        if (q) filtro += ' AND (v."numeroDocumento" ILIKE :q OR c."nombre" ILIKE :q OR c."identificacion" ILIKE :q)';

        const desdeSql = `FROM "Ventas" v LEFT JOIN "Clientes" c ON c."id" = v."clienteId"
            LEFT JOIN "Usuarios" u ON u."id" = v."vendedorId" LEFT JOIN "Empleados" e ON e."id" = u."empleadoId"`;
        const consultar = (sql) => sequelize.query(sql, { replacements, type: sequelize.QueryTypes.SELECT });

        const [filas, [{ total }]] = await Promise.all([
            consultar(`SELECT v."id", v."numeroDocumento" AS numero, v."createdAt" AS fecha, v."tipoVenta" AS tipo, v."tipoDocumento", v."moneda",
                v."totalFinal"::float AS total, ${USD}::float AS "totalUsd", v."statusDespacho" AS estado, v."statusPago" AS pago, v."condicionPago",
                v."empacadoAt", v."etiquetadoAt", v."empacadorId", v."etiquetadorId",
                COALESCE(c."nombre", 'Cliente al detal') AS cliente, COALESCE(e."nombre" || ' ' || e."apellido", u."user") AS vendedor,
                (SELECT COALESCE(SUM(d."cantidad"), 0)::int FROM "VentaDetalles" d WHERE d."ventaId" = v."id") AS articulos
                ${desdeSql} WHERE ${filtro} ORDER BY ${orden} ${dir} LIMIT :limite OFFSET :salto`),
            consultar(`SELECT COUNT(*)::int AS total ${desdeSql} WHERE ${filtro}`),
        ]);

        return NextResponse.json({ ventas: filas, total, pagina, paginas: Math.max(1, Math.ceil(total / TAMANO)) });
    } catch (error) {
        console.error('Lista de ventas:', error);
        return NextResponse.json({ error: 'No se pudo cargar la lista de ventas' }, { status: 500 });
    }
}
