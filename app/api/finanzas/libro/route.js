import { NextResponse } from 'next/server';
import sequelize from '@/sequelize';
import { REGLAS, aBolivares } from '@/app/constants/facturacion';
import { requerirNoVendedor } from '../../_lib/acceso';

export const dynamic = 'force-dynamic';

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const num = (v) => Number(v) || 0;
const r2 = (v) => Number(num(v).toFixed(2));

// Convierte un monto de un documento a bolívares con la tasa DEL DOCUMENTO (los libros se llevan en Bs)
const aBs = (monto, moneda, tasa) => (moneda === 'BS' ? r2(monto) : aBolivares(num(monto), num(tasa) || 1));

// Cierre mensual: Libro de Ventas, Libro de Compras, libro de caja y resumen de IVA del mes.
// OJO: es un BORRADOR para el contador. No se verificó contra la providencia vigente del SENIAT y el sistema no guarda
// número de control, factura afectada ni IVA retenido por el comprador (esas columnas van vacías).
export async function GET(request) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;

    try {
        const mes = new URL(request.url).searchParams.get('mes');
        if (!MES.test(mes || '')) return NextResponse.json({ error: 'Mes inválido (formato AAAA-MM)' }, { status: 400 });
        const desde = `${mes}-01`;
        const rep = { desde, mes };
        const q = (sql) => sequelize.query(sql, { replacements: rep, type: sequelize.QueryTypes.SELECT });
        const delMes = `date_trunc('month', :desde::date)`;

        const [ventas, compras, movimientos, anuladas] = await Promise.all([
            q(`SELECT v."id", (v."createdAt" AT TIME ZONE 'America/Caracas')::date AS fecha, v."tipoDocumento", v."numeroDocumento" AS numero, v."moneda"::text AS moneda,
                    v."tasaCambio"::float AS tasa, v."subtotal"::float AS subtotal, v."montoIva"::float AS iva, v."costoFlete"::float AS flete, v."totalFinal"::float AS total,
                    c."identificacion" AS rif, c."nombre",
                    COALESCE((SELECT SUM(d."subtotal") FROM "VentaDetalles" d WHERE d."ventaId" = v."id" AND d."aplicaIva" = true), 0)::float AS gravada
               FROM "Ventas" v LEFT JOIN "Clientes" c ON c."id" = v."clienteId"
               WHERE date_trunc('month', v."createdAt" AT TIME ZONE 'America/Caracas') = ${delMes} AND v."statusDespacho" <> 'Cancelado'
               ORDER BY v."createdAt", v."numeroDocumento"`),
            q(`SELECT f."id", f."fechaFactura" AS fecha, f."tipoDocumento", f."numeroDocumento" AS numero, f."moneda"::text AS moneda, f."tasaCambio"::float AS tasa,
                    f."subtotal"::float AS subtotal, f."montoIva"::float AS iva, f."montoRetencion"::float AS retencion, f."totalFinal"::float AS total,
                    p."identificacion" AS rif, p."nombre"
               FROM "FacturasCompras" f LEFT JOIN "Proveedores" p ON p."id" = f."proveedorId"
               WHERE date_trunc('month', f."fechaFactura") = ${delMes} ORDER BY f."fechaFactura", f."numeroDocumento"`),
            q(`SELECT m."fecha", m."tipo", COALESCE(c."nombre", 'Sin categoría') AS categoria, m."metodoPago" AS metodo, m."referencia", m."descripcion",
                    m."montoUsd"::float AS "montoUsd", m."tasaBcvAplicada"::float AS tasa, m."montoVes"::float AS "montoVes"
               FROM "MovimientosFinancieros" m LEFT JOIN "CategoriasFinancieras" c ON c."id" = m."categoriaId"
               WHERE date_trunc('month', m."fecha") = ${delMes} ORDER BY m."fecha", m."id"`),
            q(`SELECT COUNT(*)::int AS total FROM "Ventas" v WHERE date_trunc('month', v."createdAt" AT TIME ZONE 'America/Caracas') = ${delMes} AND v."statusDespacho" = 'Cancelado'`),
        ]);

        const iso = (d) => new Date(d).toISOString().slice(0, 10);

        // ---- Libro de ventas (en bolívares, con la tasa de cada documento) ----
        const filasVentas = ventas.map((v, i) => {
            const total = aBs(v.total, v.moneda, v.tasa);
            const iva = aBs(v.iva, v.moneda, v.tasa);
            const gravada = aBs(v.gravada, v.moneda, v.tasa);
            // Lo no gravado (renglones exentos y flete) va como exento; así base + exento + IVA = total
            const exento = r2(total - iva - gravada);
            return {
                n: i + 1, fecha: iso(v.fecha), tipoDocumento: v.tipoDocumento, numero: v.numero,
                rif: v.rif || 'CONSUMIDOR FINAL', nombre: v.nombre || 'Consumidor final (venta al detal)',
                moneda: v.moneda, tasa: r2(v.tasa), totalUsd: v.moneda === 'BS' ? r2(num(v.total) / (num(v.tasa) || 1)) : r2(v.total),
                total, exento, base: gravada, alicuota: iva > 0 ? REGLAS.alicuotaGeneral : 0, iva,
            };
        });

        // ---- Libro de compras ----
        const filasCompras = compras.map((c, i) => {
            const total = aBs(c.total, c.moneda, c.tasa);
            const iva = aBs(c.iva, c.moneda, c.tasa);
            const subtotal = aBs(c.subtotal, c.moneda, c.tasa);
            return {
                n: i + 1, fecha: iso(c.fecha), tipoDocumento: c.tipoDocumento, numero: c.numero, rif: c.rif || '', nombre: c.nombre || '',
                moneda: c.moneda, tasa: r2(c.tasa), total,
                exento: iva > 0 ? 0 : subtotal, base: iva > 0 ? subtotal : 0, alicuota: iva > 0 ? REGLAS.alicuotaGeneral : 0, iva,
                retenido: aBs(c.retencion, c.moneda, c.tasa),
            };
        });

        const suma = (lista, campo) => r2(lista.reduce((a, x) => a + num(x[campo]), 0));
        const totales = {
            ventas: { total: suma(filasVentas, 'total'), exento: suma(filasVentas, 'exento'), base: suma(filasVentas, 'base'), iva: suma(filasVentas, 'iva'), totalUsd: suma(filasVentas, 'totalUsd') },
            compras: { total: suma(filasCompras, 'total'), exento: suma(filasCompras, 'exento'), base: suma(filasCompras, 'base'), iva: suma(filasCompras, 'iva'), retenido: suma(filasCompras, 'retenido') },
        };

        return NextResponse.json({
            mes,
            aviso: 'Borrador para revisión del contador. No se verificó contra la providencia vigente del SENIAT; faltan número de control, factura afectada e IVA retenido por el comprador. Montos en bolívares, convertidos con la tasa de cada documento.',
            ventas: filasVentas,
            compras: filasCompras,
            movimientos: movimientos.map((m) => ({ ...m, fecha: iso(m.fecha) })),
            anuladas: anuladas[0].total,
            totales,
            iva: {
                debitoFiscal: totales.ventas.iva,
                creditoFiscal: totales.compras.iva,
                ivaRetenido: totales.compras.retenido,
                resultado: r2(totales.ventas.iva - totales.compras.iva), // positivo = IVA por pagar; negativo = crédito a favor
            },
        });
    } catch (error) {
        console.error('Libro mensual:', error);
        return NextResponse.json({ error: 'No se pudo generar el libro del mes' }, { status: 500 });
    }
}
