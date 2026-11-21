import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { GrupoEquivalencia, Marca, Producto, sequelize } from '@/models';
import { rolDe } from '@/app/constants/roles';
import { requerirStaff } from '../_lib';

export const dynamic = 'force-dynamic';

const LIMITE = 30;
const USD_RENGLON = `(CASE WHEN v.moneda = 'BS' THEN d.subtotal / NULLIF(v."tasaCambio", 0) ELSE d.subtotal END)`;
const FECHA_VENTA = `(COALESCE(v."fechaEmision", v."createdAt") AT TIME ZONE 'America/Caracas')::date`;

export async function GET(request) {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;

    try {
        const esVendedor = rolDe(acceso.sesion) === 'vendedor';
        const sp = new URL(request.url).searchParams;
        const productoId = Number(sp.get('productoId')) || 0;

        // Modo 1: historial detallado de movimientos (Kardex) de un producto específico
        if (productoId > 0) {
            const [ventas, devoluciones, compras] = await Promise.all([
                sequelize.query(
                    `SELECT v.id, v."numeroDocumento" AS numero, v."tipoDocumento"::text AS "tipoDoc",
                            COALESCE(v."fechaEmision", v."createdAt") AS fecha,
                            COALESCE(c.nombre, 'Cliente al detal') AS tercero,
                            d.cantidad::int AS cantidad,
                            (${USD_RENGLON} / NULLIF(d.cantidad, 0))::float AS "precioUsd",
                            (${USD_RENGLON})::float AS "subtotalUsd"
                     FROM "VentaDetalles" d
                     JOIN "Ventas" v ON v.id = d."ventaId"
                     LEFT JOIN "Clientes" c ON c.id = v."clienteId"
                     WHERE d."productoId" = :pid AND v."statusDespacho" <> 'Cancelado'
                     ORDER BY COALESCE(v."fechaEmision", v."createdAt") DESC
                     LIMIT 60`,
                    { replacements: { pid: productoId }, type: sequelize.QueryTypes.SELECT }
                ),
                sequelize.query(
                    `SELECT n.id, n."numeroDocumento" AS numero, 'NOTA_CREDITO' AS "tipoDoc",
                            n."createdAt" AS fecha,
                            COALESCE(c.nombre, 'Cliente') AS tercero,
                            nd.cantidad::int AS cantidad
                     FROM "NotaFiscalDetalles" nd
                     JOIN "NotasFiscales" n ON n.id = nd."notaId"
                     LEFT JOIN "VentaDetalles" vd ON vd.id = nd."ventaDetalleId"
                     LEFT JOIN "Clientes" c ON c.id = n."clienteId"
                     WHERE COALESCE(vd."productoId", nd."productoId") = :pid
                       AND n.tipo = 'CREDITO' AND n.origen = 'VENTA' AND n.estado = 'EMITIDA'
                     ORDER BY n."createdAt" DESC
                     LIMIT 30`,
                    { replacements: { pid: productoId }, type: sequelize.QueryTypes.SELECT }
                ),
                sequelize.query(
                    `SELECT COALESCE(fc.id::text, e.id::text) AS id,
                            fc.id AS "compraId",
                            COALESCE(fc."numeroDocumento", 'Entrada #' || e.id) AS numero,
                            COALESCE(fc."tipoDocumento"::text, 'COMPRA') AS "tipoDoc",
                            COALESCE(e.fecha, e.created_at) AS fecha,
                            COALESCE(pr.nombre, 'Proveedor') AS tercero,
                            ROUND(e.cantidad)::int AS cantidad,
                            e.costo_unitario::float AS "costoUsd"
                     FROM "EntradasInventario" e
                     LEFT JOIN "FacturasCompras" fc ON fc.id = e.factura_compra_id
                     LEFT JOIN "Proveedores" pr ON pr.id = COALESCE(e.proveedor_id, fc."proveedorId")
                     WHERE e.producto_id = :pid AND e.estado <> 'Cancelada'
                     ORDER BY COALESCE(e.fecha, e.created_at) DESC
                     LIMIT 40`,
                    { replacements: { pid: productoId }, type: sequelize.QueryTypes.SELECT }
                ),
            ]);

            const movimientos = [
                ...ventas.map((v) => ({
                    key: `V-${v.id}-${v.cantidad}-${v.fecha}`,
                    tipo: 'VENTA',
                    url: `/superuser/ventas/${v.id}`,
                    numero: v.numero,
                    tipoDoc: v.tipoDoc,
                    fecha: v.fecha,
                    tercero: v.tercero,
                    cantidad: -Math.abs(Number(v.cantidad) || 0),
                    ...(esVendedor ? {} : { precioUsd: Number(v.precioUsd) || 0, subtotalUsd: Number(v.subtotalUsd) || 0 }),
                })),
                ...devoluciones.map((d) => ({
                    key: `D-${d.id}-${d.cantidad}-${d.fecha}`,
                    tipo: 'DEVOLUCION',
                    url: null,
                    numero: d.numero,
                    tipoDoc: d.tipoDoc,
                    fecha: d.fecha,
                    tercero: d.tercero,
                    cantidad: Math.abs(Number(d.cantidad) || 0),
                })),
                ...compras.map((c) => ({
                    key: `C-${c.id}-${c.cantidad}-${c.fecha}`,
                    tipo: 'COMPRA',
                    url: c.compraId && !esVendedor ? `/superuser/compras/${c.compraId}` : null,
                    numero: c.numero,
                    tipoDoc: c.tipoDoc,
                    fecha: c.fecha,
                    tercero: c.tercero,
                    cantidad: Math.abs(Number(c.cantidad) || 0),
                    ...(esVendedor ? {} : { precioUsd: Number(c.costoUsd) || 0 }),
                })),
            ].sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 80);

            return NextResponse.json({ movimientos });
        }

        // Modo 2: buscador de productos con resumen de ventas y entradas
        const q = (sp.get('q') || '').trim().slice(0, 80);
        const where = {};
        if (q) {
            where[Op.and] = q.split(/\s+/).filter(Boolean).slice(0, 5).map((palabra) => ({
                [Op.or]: [
                    { nombre: { [Op.iLike]: `%${palabra}%` } },
                    { codigo: { [Op.iLike]: `%${palabra}%` } },
                ],
            }));
        }

        const filas = await Producto.findAll({
            where,
            attributes: ['id', 'codigo', 'nombre', 'presentacion', 'unidadesPorCaja', 'stockAlmacen', 'stockMinimo', 'nroVentas', 'imagen'],
            include: [
                { model: Marca, as: 'marca', attributes: ['nombre', 'imagen'] },
                { model: GrupoEquivalencia, as: 'grupoEquivalencia', attributes: ['imagen'] },
            ],
            order: q ? [['nombre', 'ASC']] : [['nroVentas', 'DESC'], ['nombre', 'ASC']],
            limit: LIMITE,
        });

        const ids = filas.map((p) => p.id);
        let ventasMap = new Map();
        let devMap = new Map();
        let comprasMap = new Map();

        if (ids.length > 0) {
            const [aggVentas, aggDev, aggCompras] = await Promise.all([
                sequelize.query(
                    `SELECT d."productoId" AS id,
                            COUNT(DISTINCT v.id)::int AS ventas,
                            COALESCE(SUM(d.cantidad), 0)::int AS unidades,
                            COALESCE(SUM(${USD_RENGLON}), 0)::float AS usd,
                            MAX(${FECHA_VENTA})::text AS "ultimaVenta"
                     FROM "VentaDetalles" d
                     JOIN "Ventas" v ON v.id = d."ventaId"
                     WHERE d."productoId" IN (:ids) AND v."statusDespacho" <> 'Cancelado'
                     GROUP BY d."productoId"`,
                    { replacements: { ids }, type: sequelize.QueryTypes.SELECT }
                ),
                sequelize.query(
                    `SELECT COALESCE(vd."productoId", nd."productoId") AS id,
                            COALESCE(SUM(nd.cantidad), 0)::int AS devueltas
                     FROM "NotaFiscalDetalles" nd
                     JOIN "NotasFiscales" n ON n.id = nd."notaId"
                     LEFT JOIN "VentaDetalles" vd ON vd.id = nd."ventaDetalleId"
                     WHERE COALESCE(vd."productoId", nd."productoId") IN (:ids)
                       AND n.tipo = 'CREDITO' AND n.origen = 'VENTA' AND n.estado = 'EMITIDA'
                     GROUP BY 1`,
                    { replacements: { ids }, type: sequelize.QueryTypes.SELECT }
                ),
                sequelize.query(
                    `SELECT e.producto_id AS id,
                            COUNT(*)::int AS compras,
                            COALESCE(SUM(ROUND(e.cantidad)), 0)::int AS unidades,
                            MAX((COALESCE(e.fecha, e.created_at) AT TIME ZONE 'America/Caracas')::date)::text AS "ultimaCompra"
                     FROM "EntradasInventario" e
                     WHERE e.producto_id IN (:ids) AND e.estado <> 'Cancelada'
                     GROUP BY e.producto_id`,
                    { replacements: { ids }, type: sequelize.QueryTypes.SELECT }
                ),
            ]);

            ventasMap = new Map(aggVentas.map((r) => [Number(r.id), r]));
            devMap = new Map(aggDev.map((r) => [Number(r.id), Number(r.devueltas) || 0]));
            comprasMap = new Map(aggCompras.map((r) => [Number(r.id), r]));
        }

        const productos = filas.map((p) => {
            const j = p.toJSON();
            const stock = Math.floor(Number(j.stockAlmacen) || 0);
            const v = ventasMap.get(Number(j.id));
            const devueltas = devMap.get(Number(j.id)) || 0;
            const c = comprasMap.get(Number(j.id));
            const unidadesVendidas = Number(v?.unidades) || 0;
            const netoVendido = unidadesVendidas - devueltas;

            return {
                id: j.id,
                codigo: j.codigo,
                nombre: j.nombre,
                marca: j.marca?.nombre || null,
                presentacion: j.presentacion,
                unidadesPorCaja: j.unidadesPorCaja,
                imagen: j.imagen || null,
                grupoEquivalencia: j.grupoEquivalencia ? { imagen: j.grupoEquivalencia.imagen } : null,
                marcaImagen: j.marca?.imagen || null,
                stock,
                bajo: stock > 0 && stock <= (Number(j.stockMinimo) || 0),
                ventasCount: Number(v?.ventas) || 0,
                unidadesVendidas,
                unidadesDevueltas: devueltas,
                netoVendido,
                ultimaVenta: v?.ultimaVenta || null,
                comprasCount: Number(c?.compras) || 0,
                unidadesCompradas: Number(c?.unidades) || 0,
                ultimaCompra: c?.ultimaCompra || null,
                ...(esVendedor ? {} : { totalUsd: Math.round(((Number(v?.usd) || 0) + Number.EPSILON) * 100) / 100 }),
            };
        });

        // Si no hay búsqueda, ordenamos por mayor cantidad de ventas reales primero
        if (!q) {
            productos.sort((a, b) => (b.unidadesVendidas - a.unidadesVendidas) || (b.ventasCount - a.ventasCount));
        }

        return NextResponse.json({ productos, hayMas: filas.length >= LIMITE });
    } catch (error) {
        console.error('Cardex de producto:', error);
        return NextResponse.json({ error: 'No se pudo consultar el cardex del producto' }, { status: 500 });
    }
}
