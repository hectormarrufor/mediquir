import { NextResponse } from 'next/server';
import sequelize from '@/sequelize';
import { REGLAS, aBolivares } from '@/app/constants/facturacion';
import { CONFIG_FISCAL, MEMBRETE_MEDIQUIR } from '@/app/constants/empresa';
import { requerirNoVendedor } from '../../_lib/acceso';

export const dynamic = 'force-dynamic';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const num = (v) => Number(v) || 0;
const r2 = (v) => Number(num(v).toFixed(2));
const ALICUOTAS = [16, 8, 27];

// Monto de un documento en bolívares con la tasa DEL DOCUMENTO (los libros se llevan en Bs)
const aBs = (monto, moneda, tasa) => (moneda === 'BS' ? r2(monto) : aBolivares(num(monto), num(tasa) || 1));
const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

// Resumen del libro en el formato del libro declarativo: por tipo de operación, por alícuota y retenciones
function resumir(filas, { anuladas } = {}) {
    const facturas = filas.filter((f) => f.tipo === 'FAC');
    const retenciones = filas.filter((f) => f.tipo === 'RET');
    const suma = (lista, campo) => r2(lista.reduce((a, f) => a + num(f[campo]), 0));

    const porAlicuota = Object.fromEntries(ALICUOTAS.map((a) => [a, { base: 0, iva: 0 }]));
    for (const f of facturas.filter((x) => num(x.base) > 0 || num(x.iva) > 0)) {
        const a = porAlicuota[f.alicuota] || (porAlicuota[f.alicuota] = { base: 0, iva: 0 });
        a.base = r2(a.base + num(f.base)); a.iva = r2(a.iva + num(f.iva));
    }
    const retPorAlicuota = Object.fromEntries(ALICUOTAS.map((a) => [a, { base: 0, retenido: 0, cant: 0 }]));
    for (const f of retenciones) {
        const a = retPorAlicuota[f.alicuota] || (retPorAlicuota[f.alicuota] = { base: 0, retenido: 0, cant: 0 });
        a.base = r2(a.base + num(f.baseRetencion)); a.retenido = r2(a.retenido + num(f.ivaRetenido)); a.cant += 1;
    }

    return {
        totalTransacciones: filas.length,
        sinImpuesto: { monto: suma(facturas, 'exento'), cant: facturas.filter((f) => num(f.exento) > 0).length },
        totalImponible: { monto: suma(facturas, 'base'), cant: facturas.filter((f) => num(f.base) > 0).length },
        totalImpuesto: suma(facturas, 'iva'),
        totalGeneral: suma(facturas, 'total'),
        ivaRetenido: suma(retenciones, 'ivaRetenido'),
        descuentos: 0,
        notasCredito: { monto: 0, iva: 0, cant: 0 }, // el sistema aún no emite ni recibe notas de crédito
        anulaciones: anuladas || { monto: 0, iva: 0, cant: 0 },
        porAlicuota, retenciones: retPorAlicuota,
        exento: suma(facturas, 'exento'),
        totalRetenciones: { base: r2(Object.values(retPorAlicuota).reduce((a, x) => a + x.base, 0)), retenido: suma(retenciones, 'ivaRetenido'), cant: retenciones.length },
    };
}

// Fila de una retención tal como sale en el libro (tipo RET, transacción 03)
const filaRetencion = (r) => ({
    tipo: 'RET', fecha: iso(r.fecha), rif: r.contraparteRif || '', nombre: r.contraparteNombre || '', documento: r.comprobante,
    facturaAfectada: r.facturaAfectada, control: '', tipoTrans: '03',
    total: null, base: null, alicuota: num(r.alicuota), exento: null, iva: null, ivaRetenido: r2(r.ivaRetenido), baseRetencion: r2(r.baseImponible),
});

// Relación de retenciones (formato de "IVA retenido": comprobante, factura afectada, control y montos de la factura)
const detalleRetencion = (r, doc) => ({
    fecha: iso(r.fecha), rif: r.contraparteRif || '', nombre: r.contraparteNombre || '', tipoDoc: 'RET', comprobante: r.comprobante,
    control: r.numeroControlFactura || '', totalVentas: doc.total, base: r2(r.baseImponible), exento: r2(doc.total - num(r.baseImponible) - num(r.montoIva)),
    iva: r2(r.montoIva), facturaAfectada: r.facturaAfectada, ivaRetenido: r2(r.ivaRetenido), porcentaje: num(r.porcentajeRetencion),
});

async function libroCompras(q) {
    const [facturas, retenciones] = await Promise.all([
        q(`SELECT f."id", f."fechaFactura" AS emision, COALESCE(f."fechaRecepcion", f."fechaFactura") AS recepcion, f."numeroDocumento" AS numero, f."numeroControl" AS control,
                f."tipoTransaccion" AS "tipoTrans", f."moneda"::text AS moneda, f."tasaCambio"::float AS tasa, f."subtotal"::float AS subtotal, f."montoIva"::float AS iva,
                f."montoExento"::float AS exento, f."alicuotaIva"::float AS alicuota, f."totalFinal"::float AS total, p."identificacion" AS rif, p."nombre"
           FROM "FacturasCompras" f LEFT JOIN "Proveedores" p ON p."id" = f."proveedorId"
           WHERE f."tipoDocumento" = 'FACTURA' AND COALESCE(f."fechaRecepcion", f."fechaFactura") BETWEEN :desde AND :hasta
           ORDER BY COALESCE(f."fechaRecepcion", f."fechaFactura"), f."createdAt"`),
        q(`SELECT r.*, f."moneda"::text AS "monedaDoc", f."tasaCambio"::float AS "tasaDoc", f."totalFinal"::float AS "totalDoc"
           FROM "RetencionesIva" r LEFT JOIN "FacturasCompras" f ON f."id" = r."facturaCompraId"
           WHERE r."tipo" = 'COMPRA' AND r."fecha" BETWEEN :desde AND :hasta ORDER BY r."fecha", r."id"`),
    ]);

    const filasFac = facturas.map((f) => {
        const total = aBs(f.total, f.moneda, f.tasa);
        const iva = aBs(f.iva, f.moneda, f.tasa);
        const base = f.iva > 0 ? r2(aBs(f.subtotal, f.moneda, f.tasa) - aBs(f.exento, f.moneda, f.tasa)) : 0;
        return {
            tipo: 'FAC', fecha: iso(f.emision), rif: f.rif || '', nombre: f.nombre || '', documento: f.numero, facturaAfectada: '', control: f.control || '', tipoTrans: f.tipoTrans || '01',
            total, base, alicuota: f.iva > 0 ? num(f.alicuota) || REGLAS.alicuotaGeneral : 0, exento: r2(total - base - iva), iva, ivaRetenido: null,
        };
    });
    const filas = [...filasFac, ...retenciones.map(filaRetencion)].map((f, i) => ({ n: i + 1, ...f }));

    return {
        filas, resumen: resumir(filas), noFiscales: null,
        retencionesDetalle: retenciones.map((r) => detalleRetencion(r, { total: r.totalDoc ? aBs(r.totalDoc, r.monedaDoc, r.tasaDoc) : 0 })).map((d, i) => ({ n: i + 1, ...d })),
    };
}

async function libroVentas(q) {
    const [facturas, retenciones, anuladas, noFiscales] = await Promise.all([
        q(`SELECT v."id", (v."createdAt" AT TIME ZONE 'America/Caracas')::date AS emision, v."numeroDocumento" AS numero, v."numeroControl" AS control, v."tipoTransaccion" AS "tipoTrans",
                v."moneda"::text AS moneda, v."tasaCambio"::float AS tasa, v."montoIva"::float AS iva, v."totalFinal"::float AS total, c."identificacion" AS rif, c."nombre",
                COALESCE((SELECT SUM(d."subtotal") FROM "VentaDetalles" d WHERE d."ventaId" = v."id" AND d."aplicaIva" = true), 0)::float AS gravada
           FROM "Ventas" v LEFT JOIN "Clientes" c ON c."id" = v."clienteId"
           WHERE v."tipoDocumento" = 'FACTURA' AND v."statusDespacho" <> 'Cancelado' AND (v."createdAt" AT TIME ZONE 'America/Caracas')::date BETWEEN :desde AND :hasta
           ORDER BY v."createdAt", v."numeroDocumento"`),
        q(`SELECT r.*, v."moneda"::text AS "monedaDoc", v."tasaCambio"::float AS "tasaDoc", v."totalFinal"::float AS "totalDoc"
           FROM "RetencionesIva" r LEFT JOIN "Ventas" v ON v."id" = r."ventaId"
           WHERE r."tipo" = 'VENTA' AND r."fecha" BETWEEN :desde AND :hasta ORDER BY r."fecha", r."id"`),
        q(`SELECT v."moneda"::text AS moneda, v."tasaCambio"::float AS tasa, v."totalFinal"::float AS total, v."montoIva"::float AS iva FROM "Ventas" v
           WHERE v."tipoDocumento" = 'FACTURA' AND v."statusDespacho" = 'Cancelado' AND (v."createdAt" AT TIME ZONE 'America/Caracas')::date BETWEEN :desde AND :hasta`),
        q(`SELECT v."moneda"::text AS moneda, v."tasaCambio"::float AS tasa, v."totalFinal"::float AS total FROM "Ventas" v
           WHERE v."tipoDocumento" <> 'FACTURA' AND v."statusDespacho" <> 'Cancelado' AND (v."createdAt" AT TIME ZONE 'America/Caracas')::date BETWEEN :desde AND :hasta`),
    ]);

    const filasFac = facturas.map((v) => {
        const total = aBs(v.total, v.moneda, v.tasa);
        const iva = aBs(v.iva, v.moneda, v.tasa);
        const base = r2(aBs(v.gravada, v.moneda, v.tasa));
        return {
            tipo: 'FAC', fecha: iso(v.emision), rif: v.rif || 'CONSUMIDOR FINAL', nombre: v.nombre || 'Consumidor final (venta al detal)', documento: v.numero, facturaAfectada: '',
            control: v.control || '', tipoTrans: v.tipoTrans || '01',
            total, base, alicuota: iva > 0 ? REGLAS.alicuotaGeneral : 0, exento: r2(total - base - iva), iva, ivaRetenido: null,
        };
    });
    const filas = [...filasFac, ...retenciones.map(filaRetencion)].map((f, i) => ({ n: i + 1, ...f }));
    const anul = { monto: r2(anuladas.reduce((a, v) => a + aBs(v.total, v.moneda, v.tasa), 0)), iva: r2(anuladas.reduce((a, v) => a + aBs(v.iva, v.moneda, v.tasa), 0)), cant: anuladas.length };

    return {
        filas, resumen: resumir(filas, { anuladas: anul }),
        // Documentos que no son factura (notas de entrega, ventas rápidas) no van al libro fiscal; se avisa para que no "desaparezcan" en silencio
        noFiscales: { cant: noFiscales.length, total: r2(noFiscales.reduce((a, v) => a + aBs(v.total, v.moneda, v.tasa), 0)) },
        retencionesDetalle: retenciones.map((r) => detalleRetencion(r, { total: r.totalDoc ? aBs(r.totalDoc, r.monedaDoc, r.tasaDoc) : 0 })).map((d, i) => ({ n: i + 1, ...d })),
    };
}

// Libros de compras y de ventas de un rango de fechas (?desde=AAAA-MM-DD&hasta=AAAA-MM-DD) o de un mes (?mes=AAAA-MM).
// OJO: replica el formato del libro de ejemplo, pero NO está verificado contra la providencia vigente del SENIAT.
export async function GET(request) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;

    try {
        const params = new URL(request.url).searchParams;
        let desde = params.get('desde');
        let hasta = params.get('hasta');
        const mes = params.get('mes');
        if (mes) {
            if (!MES.test(mes)) return NextResponse.json({ error: 'Mes inválido (formato AAAA-MM)' }, { status: 400 });
            desde = `${mes}-01`;
            hasta = new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(5, 7), 0)).toISOString().slice(0, 10);
        }
        if (!FECHA.test(desde || '') || !FECHA.test(hasta || '') || desde > hasta) return NextResponse.json({ error: 'Rango de fechas inválido' }, { status: 400 });

        const q = (sql) => sequelize.query(sql, { replacements: { desde, hasta }, type: sequelize.QueryTypes.SELECT });
        const [compras, ventas] = await Promise.all([libroCompras(q), libroVentas(q)]);

        return NextResponse.json({
            desde, hasta,
            empresa: { nombre: MEMBRETE_MEDIQUIR.nombre, rif: MEMBRETE_MEDIQUIR.rif, agencia: CONFIG_FISCAL.agencia, estacion: CONFIG_FISCAL.estacion },
            aviso: 'Formato basado en el libro de ejemplo; no verificado contra la providencia vigente del SENIAT. Revísalo con tu contador. Montos en bolívares, convertidos con la tasa de cada documento.',
            compras, ventas,
            iva: {
                debitoFiscal: ventas.resumen.totalImpuesto, creditoFiscal: compras.resumen.totalImpuesto,
                ivaRetenidoPorClientes: ventas.resumen.ivaRetenido, ivaRetenidoAProveedores: compras.resumen.ivaRetenido,
                // IVA del periodo = débito - crédito - retenciones que te hicieron los clientes (ya pagadas por ellos al SENIAT)
                resultado: r2(ventas.resumen.totalImpuesto - compras.resumen.totalImpuesto - ventas.resumen.ivaRetenido),
            },
        });
    } catch (error) {
        console.error('Libros:', error);
        return NextResponse.json({ error: 'No se pudieron generar los libros' }, { status: 500 });
    }
}
