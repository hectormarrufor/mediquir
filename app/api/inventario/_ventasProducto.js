// Total vendido por producto y renglones de venta escritos a mano (sin producto del catálogo).
// Imports relativos con extensión (sin alias "@/") para poder probarlo con un script de Node.
//
// Un renglón escrito a mano (isFicticio) conserva su texto: es lo que salió impreso en la factura y no cambia. Al ENLAZARLO se le pone
// el producto al que corresponde (productoId) solo para que cuente en el total vendido de ese producto; no mueve inventario (esos
// renglones van con afectaInventario = false) y la factura se sigue imprimiendo con su texto original.
import db from '../../../models/index.js';

const { sequelize, Producto, Marca } = db;
const consulta = (sql, replacements, transaction) => sequelize.query(sql, { replacements, type: sequelize.QueryTypes.SELECT, transaction });

// Mismo nombre aunque cambien mayúsculas, espacios o tildes ("Compresa de laparotomía" = "COMPRESA DE LAPAROTOMIA")
export const CLAVE_NOMBRE = `translate(upper(regexp_replace(btrim(d."nombreFicticio"), '[[:space:]]+', ' ', 'g')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN')`;
// Lo vendido en dólares sin IVA: las ventas en bolívares se pasan con la tasa de la venta
export const USD_RENGLON = `(CASE WHEN v.moneda = 'BS' THEN d.subtotal / NULLIF(v."tasaCambio", 0) ELSE d.subtotal END)`;
export const FECHA_VENTA = `(COALESCE(v."fechaEmision", v."createdAt") AT TIME ZONE 'America/Caracas')::date`;
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const codigoBase = (codigo) => String(codigo || '').replace(/-\d+$/, '');

export class ErrorVentasProducto extends Error {
    constructor(mensaje, status = 400) { super(mensaje); this.status = status; }
}

/** Total vendido de cada producto entre dos fechas (ventas no anuladas), con las devoluciones de las notas de crédito. */
export async function ventasPorProducto({ desde, hasta, agruparMarcas = false }) {
    const r = { desde, hasta };
    const [vendidos, devueltos, [sinProducto]] = await Promise.all([
        consulta(`SELECT p.id, p.codigo, p.nombre, m.nombre AS marca, SUM(d.cantidad)::int AS unidades, SUM(${USD_RENGLON})::float AS usd, COUNT(DISTINCT v.id)::int AS documentos
            FROM "VentaDetalles" d JOIN "Ventas" v ON v.id = d."ventaId" JOIN "Productos" p ON p.id = d."productoId" LEFT JOIN "Marcas" m ON m.id = p."marcaId"
            WHERE v."statusDespacho" <> 'Cancelado' AND ${FECHA_VENTA} BETWEEN :desde AND :hasta
            GROUP BY p.id, m.nombre`, r),
        consulta(`SELECT COALESCE(vd."productoId", nd."productoId") AS id, SUM(nd.cantidad)::int AS unidades
            FROM "NotaFiscalDetalles" nd JOIN "NotasFiscales" n ON n.id = nd."notaId" LEFT JOIN "VentaDetalles" vd ON vd.id = nd."ventaDetalleId"
            WHERE n.tipo = 'CREDITO' AND n.origen = 'VENTA' AND n.estado = 'EMITIDA' AND n.fecha BETWEEN :desde AND :hasta AND COALESCE(vd."productoId", nd."productoId") IS NOT NULL
            GROUP BY 1`, r),
        consulta(`SELECT COUNT(*)::int AS renglones, COALESCE(SUM(${USD_RENGLON}), 0)::float AS usd
            FROM "VentaDetalles" d JOIN "Ventas" v ON v.id = d."ventaId"
            WHERE d."productoId" IS NULL AND v."statusDespacho" <> 'Cancelado' AND ${FECHA_VENTA} BETWEEN :desde AND :hasta`, r),
    ]);
    const devPorId = new Map(devueltos.map((x) => [Number(x.id), x.unidades]));
    let filas = vendidos.map((x) => ({ ...x, devueltas: devPorId.get(Number(x.id)) || 0 }));
    if (agruparMarcas) {
        // Todas las marcas de un mismo producto (mismo código base: 0222, 0222-01...) en una sola fila
        const porBase = new Map();
        for (const f of filas) {
            const clave = codigoBase(f.codigo);
            const g = porBase.get(clave) || { id: clave, codigo: clave, nombre: f.nombre, marcas: [], unidades: 0, usd: 0, documentos: 0, devueltas: 0 };
            if (f.codigo === clave) g.nombre = f.nombre;
            if (f.marca && !g.marcas.includes(f.marca)) g.marcas.push(f.marca);
            g.unidades += f.unidades; g.usd += f.usd; g.documentos += f.documentos; g.devueltas += f.devueltas;
            porBase.set(clave, g);
        }
        filas = [...porBase.values()].map((g) => ({ ...g, marca: g.marcas.join(', ') }));
    }
    filas = filas.map((f) => ({ ...f, usd: r2(f.usd), neto: f.unidades - f.devueltas })).sort((a, b) => b.usd - a.usd);
    return {
        filas,
        totales: { unidades: filas.reduce((a, f) => a + f.unidades, 0), usd: r2(filas.reduce((a, f) => a + f.usd, 0)), productos: filas.length },
        sinProducto: { renglones: sinProducto.renglones, usd: r2(sinProducto.usd) },
    };
}

/** Nombres escritos a mano sin enlazar (o ya enlazados) con lo vendido en cada uno, de mayor a menor. */
export async function ventasSinProducto({ desde = null, enlazados = false }) {
    const condiciones = `d."nombreFicticio" IS NOT NULL AND btrim(d."nombreFicticio") <> '' AND v."statusDespacho" <> 'Cancelado' ${desde ? `AND ${FECHA_VENTA} >= :desde` : ''}`;
    if (enlazados) {
        return consulta(`SELECT ${CLAVE_NOMBRE} AS nombre, p.id AS "productoId", p.codigo, p.nombre AS producto, m.nombre AS marca,
                COUNT(*)::int AS renglones, SUM(d.cantidad)::int AS unidades, SUM(${USD_RENGLON})::float AS usd, MAX(${FECHA_VENTA})::text AS ultima
            FROM "VentaDetalles" d JOIN "Ventas" v ON v.id = d."ventaId" JOIN "Productos" p ON p.id = d."productoId" LEFT JOIN "Marcas" m ON m.id = p."marcaId"
            WHERE ${condiciones} AND d."isFicticio" = true
            GROUP BY 1, p.id, m.nombre ORDER BY usd DESC NULLS LAST LIMIT 2000`, { desde });
    }
    return consulta(`SELECT ${CLAVE_NOMBRE} AS nombre, COUNT(*)::int AS renglones, SUM(d.cantidad)::int AS unidades, SUM(${USD_RENGLON})::float AS usd,
            MAX(${FECHA_VENTA})::text AS ultima, (array_agg(DISTINCT v."numeroDocumento"))[1:4] AS documentos
        FROM "VentaDetalles" d JOIN "Ventas" v ON v.id = d."ventaId"
        WHERE ${condiciones} AND d."productoId" IS NULL
        GROUP BY 1 ORDER BY usd DESC NULLS LAST LIMIT 2000`, { desde });
}

/**
 * Variante de marca nueva de un producto: copia su ficha (nombre, categoría, grupo, IVA, presentación y precios) con la otra marca,
 * sin stock ni foto, y el siguiente código de la familia (0129 -> 0129-02 si ya existe 0129-01).
 */
export async function crearVariante({ baseId, marca, transaction: t }) {
    const base = await Producto.findByPk(Number(baseId), { transaction: t });
    if (!base) throw new ErrorVentasProducto('El producto de base no existe', 404);
    const nombreMarca = String(marca || '').trim().toUpperCase();
    if (!nombreMarca) throw new ErrorVentasProducto('Escribe la marca de la variante');
    const [m] = await Marca.findOrCreate({ where: { nombre: nombreMarca }, transaction: t });
    const raiz = codigoBase(base.codigo);
    const [ya] = await consulta(`SELECT p.id, p.codigo FROM "Productos" p WHERE (p.codigo = :raiz OR p.codigo LIKE :patron) AND p."marcaId" = :marca LIMIT 1`, { raiz, patron: `${raiz}-%`, marca: m.id }, t);
    if (ya) throw new ErrorVentasProducto(`Ya existe esa marca para este producto: ${ya.codigo}. Enlaza a ese.`, 409);
    const codigos = await consulta(`SELECT codigo FROM "Productos" WHERE codigo LIKE :patron`, { patron: `${raiz}-%` }, t);
    const siguiente = codigos.reduce((max, c) => Math.max(max, Number((/-(\d+)$/.exec(c.codigo) || [])[1]) || 0), 0) + 1;
    const codigo = `${raiz}-${String(siguiente).padStart(2, '0')}`;
    return Producto.create({
        nombre: base.nombre, codigo, marcaId: m.id, categoriaId: base.categoriaId, grupoEquivalenciaId: base.grupoEquivalenciaId,
        porcentajeIva: base.porcentajeIva, presentacion: base.presentacion, unidadesPorCaja: base.unidadesPorCaja, cajasPorBulto: base.cajasPorBulto,
        unidadesPorBulto: base.unidadesPorBulto, precio6: base.precio6, precio7: base.precio7, porcentajeDescuento: base.porcentajeDescuento,
        costoUsd: base.costoUsd, stockAlmacen: 0, stockMinimo: 0, nroVentas: 0, imagen: null,
    }, { transaction: t });
}

/** Enlaza al producto todos los renglones escritos a mano con ese nombre (de cualquier fecha). Devuelve cuántos. */
export async function enlazarNombre({ nombre, productoId, transaction: t }) {
    const producto = await Producto.findByPk(Number(productoId), { transaction: t, lock: t.LOCK.UPDATE });
    if (!producto) throw new ErrorVentasProducto('El producto no existe', 404);
    const [suma] = await consulta(`SELECT COUNT(*)::int AS renglones, COALESCE(SUM(d.cantidad) FILTER (WHERE v."statusDespacho" <> 'Cancelado'), 0)::int AS unidades
        FROM "VentaDetalles" d JOIN "Ventas" v ON v.id = d."ventaId" WHERE d."productoId" IS NULL AND d."nombreFicticio" IS NOT NULL AND ${CLAVE_NOMBRE} = :nombre`, { nombre }, t);
    if (!suma.renglones) throw new ErrorVentasProducto('Ya no hay renglones sin enlazar con ese nombre', 404);
    await sequelize.query(`UPDATE "VentaDetalles" d SET "productoId" = :pid, "isFicticio" = true
        WHERE d."productoId" IS NULL AND d."nombreFicticio" IS NOT NULL AND ${CLAVE_NOMBRE} = :nombre`, { replacements: { pid: producto.id, nombre }, transaction: t });
    // «Más vendidos» de la tienda: el producto suma las unidades que se le acaban de reconocer
    producto.nroVentas = (Number(producto.nroVentas) || 0) + suma.unidades;
    await producto.save({ transaction: t });
    return { renglones: suma.renglones, unidades: suma.unidades, producto: { id: producto.id, codigo: producto.codigo, nombre: producto.nombre } };
}

/** Deshace el enlace de un nombre con un producto (vuelven a ser renglones sin producto). */
export async function desenlazarNombre({ nombre, productoId, transaction: t }) {
    const producto = await Producto.findByPk(Number(productoId), { transaction: t, lock: t.LOCK.UPDATE });
    if (!producto) throw new ErrorVentasProducto('El producto no existe', 404);
    const [suma] = await consulta(`SELECT COUNT(*)::int AS renglones, COALESCE(SUM(d.cantidad) FILTER (WHERE v."statusDespacho" <> 'Cancelado'), 0)::int AS unidades
        FROM "VentaDetalles" d JOIN "Ventas" v ON v.id = d."ventaId" WHERE d."isFicticio" = true AND d."productoId" = :pid AND ${CLAVE_NOMBRE} = :nombre`, { pid: producto.id, nombre }, t);
    if (!suma.renglones) throw new ErrorVentasProducto('No hay renglones enlazados con ese nombre y ese producto', 404);
    await sequelize.query(`UPDATE "VentaDetalles" d SET "productoId" = NULL WHERE d."isFicticio" = true AND d."productoId" = :pid AND ${CLAVE_NOMBRE} = :nombre`,
        { replacements: { pid: producto.id, nombre }, transaction: t });
    producto.nroVentas = Math.max(0, (Number(producto.nroVentas) || 0) - suma.unidades);
    await producto.save({ transaction: t });
    return { renglones: suma.renglones };
}
