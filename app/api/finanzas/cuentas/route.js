import { NextResponse } from 'next/server';
import sequelize from '@/sequelize';
import { aDolares } from '@/app/constants/facturacion';
import { requerirNoVendedor } from '../../_lib/acceso';
import { tasaVigente } from '../../_lib/tasaBcv';

export const dynamic = 'force-dynamic';

const hoyCaracas = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const dias = (desde, hasta) => Math.round((new Date(`${hasta}T00:00:00Z`) - new Date(`${desde}T00:00:00Z`)) / 86400000);
const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

const CONSULTAS = {
    // Cuentas por cobrar registradas + pedidos de contado todavía sin pagar (sin cuenta, p. ej. los del portal B2B)
    cobrar: `
        SELECT 'cuenta' AS origen, cc."id"::text AS id, cc."ventaId"::text AS "docId", v."numeroDocumento" AS documento, v."createdAt" AS emision,
               cc."fechaVencimiento" AS vence, cc."montoTotal"::float AS total, cc."saldoPendiente"::float AS saldo, cc."moneda"::text AS moneda, cc."tasaCambio"::float AS tasa,
               c."id" AS "contraId", c."nombre", c."identificacion", c."telefono"
        FROM "CuentasPorCobrar" cc JOIN "Clientes" c ON c."id" = cc."clienteId" LEFT JOIN "Ventas" v ON v."id" = cc."ventaId"
        UNION ALL
        SELECT 'pedido', v."id"::text, v."id"::text, v."numeroDocumento", v."createdAt", NULL::date, v."totalFinal"::float,
               GREATEST(v."totalFinal" - COALESCE((SELECT SUM(a."montoUsd") FROM "Abonos" a WHERE a."ventaId" = v."id"), 0), 0)::float,
               v."moneda"::text, v."tasaCambio"::float, c."id", c."nombre", c."identificacion", c."telefono"
        FROM "Ventas" v JOIN "Clientes" c ON c."id" = v."clienteId"
        WHERE v."statusPago" <> 'Pagado' AND v."statusDespacho" <> 'Cancelado'
          AND NOT EXISTS (SELECT 1 FROM "CuentasPorCobrar" x WHERE x."ventaId" = v."id")`,
    pagar: `
        SELECT 'cuenta' AS origen, cp."id"::text AS id, cp."facturaCompraId"::text AS "docId", f."numeroDocumento" AS documento, f."fechaFactura" AS emision,
               cp."fechaVencimiento" AS vence, cp."montoTotal"::float AS total, cp."saldoPendiente"::float AS saldo, cp."moneda"::text AS moneda, cp."tasaCambio"::float AS tasa,
               p."id" AS "contraId", p."nombre", p."identificacion", p."telefono"
        FROM "CuentasPorPagar" cp JOIN "Proveedores" p ON p."id" = cp."proveedorId" LEFT JOIN "FacturasCompras" f ON f."id" = cp."facturaCompraId"`,
};

const CUBETAS = [
    { clave: 'alDia', etiqueta: 'Al día / sin vencer' },
    { clave: 'v1a30', etiqueta: 'Vencido 1–30 días' },
    { clave: 'v31a60', etiqueta: 'Vencido 31–60 días' },
    { clave: 'v61a90', etiqueta: 'Vencido 61–90 días' },
    { clave: 'vMas90', etiqueta: 'Vencido +90 días' },
];

// Cuentas por cobrar o por pagar, todo expresado en USD, con su antigüedad calculada al día de hoy (Caracas)
export async function GET(request) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;

    try {
        const tipo = new URL(request.url).searchParams.get('tipo') === 'pagar' ? 'pagar' : 'cobrar';
        const hoy = hoyCaracas();
        const [filas, tasa] = await Promise.all([
            sequelize.query(CONSULTAS[tipo], { type: sequelize.QueryTypes.SELECT }),
            tasaVigente().catch(() => null),
        ]);

        const aUsd = (monto, moneda, tasaDoc) => (moneda === 'BS' ? aDolares(monto, tasaDoc || 1) : monto);
        const cuentas = filas
            .map((f) => {
                const saldo = aUsd(f.saldo, f.moneda, f.tasa);
                const vence = iso(f.vence);
                const diasParaVencer = vence ? dias(hoy, vence) : null;
                const estado = saldo <= 0 ? 'pagada' : diasParaVencer === null ? 'sin-fecha' : diasParaVencer < 0 ? 'vencida' : diasParaVencer <= 7 ? 'por-vencer' : 'al-dia';
                return {
                    id: f.id, origen: f.origen, docId: f.docId, documento: f.documento, emision: iso(f.emision), vence, diasParaVencer, estado,
                    total: aUsd(f.total, f.moneda, f.tasa), saldo, moneda: f.moneda,
                    contraparte: { id: f.contraId, nombre: f.nombre, identificacion: f.identificacion, telefono: f.telefono },
                };
            })
            .sort((a, b) => (a.vence || '9999').localeCompare(b.vence || '9999'));

        const pendientes = cuentas.filter((c) => c.saldo > 0);
        const suma = (lista) => Number(lista.reduce((a, c) => a + c.saldo, 0).toFixed(2));

        const cubetas = Object.fromEntries(CUBETAS.map((c) => [c.clave, 0]));
        for (const c of pendientes) {
            const atraso = c.diasParaVencer !== null && c.diasParaVencer < 0 ? -c.diasParaVencer : 0;
            const clave = !atraso ? 'alDia' : atraso <= 30 ? 'v1a30' : atraso <= 60 ? 'v31a60' : atraso <= 90 ? 'v61a90' : 'vMas90';
            cubetas[clave] += c.saldo;
        }

        const porContraparte = new Map();
        for (const c of pendientes) {
            const k = c.contraparte.id;
            const actual = porContraparte.get(k) || { id: k, nombre: c.contraparte.nombre || c.contraparte.identificacion, saldo: 0, documentos: 0 };
            actual.saldo += c.saldo; actual.documentos += 1;
            porContraparte.set(k, actual);
        }

        return NextResponse.json({
            tipo, tasa, hoy,
            resumen: {
                total: suma(pendientes),
                vencido: suma(pendientes.filter((c) => c.estado === 'vencida')),
                porVencer: suma(pendientes.filter((c) => c.estado === 'por-vencer')),
                documentos: pendientes.length,
                vencidos: pendientes.filter((c) => c.estado === 'vencida').length,
                contrapartes: porContraparte.size,
            },
            cubetas: CUBETAS.map((c) => ({ ...c, monto: Number(cubetas[c.clave].toFixed(2)) })),
            top: [...porContraparte.values()].sort((a, b) => b.saldo - a.saldo).slice(0, 6).map((c) => ({ ...c, saldo: Number(c.saldo.toFixed(2)) })),
            cuentas: pendientes,
        });
    } catch (error) {
        console.error('Cuentas:', error);
        return NextResponse.json({ error: 'No se pudieron cargar las cuentas' }, { status: 500 });
    }
}
