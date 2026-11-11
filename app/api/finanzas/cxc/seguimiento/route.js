import { NextResponse } from 'next/server';
import sequelize from '@/sequelize';
import { requerirNoVendedor } from '../../../_lib/acceso';
import { MARCA_CIERRE, RETENCIONES_DESDE } from '../../../_lib/retencionesVenta';

export const dynamic = 'force-dynamic';

const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

// Dos listas para cobrar mejor:
//  · retencionSinComprobante: facturas donde el cliente retuvo el IVA y todavía no se cargaron los datos de su comprobante (hay que pedírselo).
//    Solo cuentan desde la primera quincena de noviembre de 2026.
//  · dicenPagaron: facturas que el cliente dice haber cerrado con su último pago, pero que aún tienen deuda.
export async function GET() {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    try {
        const q = (sql, replacements) => sequelize.query(sql, { type: sequelize.QueryTypes.SELECT, replacements });
        const [retenciones, dicen] = await Promise.all([
            q(`SELECT r.id, r."ventaId", r."facturaAfectada" AS documento, r.fecha, r.estado, r."ivaRetenido"::float AS "ivaRetenidoBs", r."porcentajeRetencion"::float AS pct,
                      r.comprobante, r."montoDeclarado"::float AS "montoDeclarado", v."numeroControl",
                      cl.id AS "clienteId", cl.nombre AS cliente, cl.identificacion AS rif, cl.telefono
                 FROM "RetencionesIva" r JOIN "Ventas" v ON v.id = r."ventaId" LEFT JOIN "Clientes" cl ON cl.id = v."clienteId"
                WHERE r.tipo = 'VENTA' AND r.estado IN ('PENDIENTE', 'POR_REVISAR') AND r.fecha >= :desde AND v."statusDespacho" <> 'Cancelado'
                ORDER BY r.fecha, r.id`, { desde: RETENCIONES_DESDE }),
            q(`SELECT c.id, c."ventaId", v."numeroDocumento" AS documento, c."saldoPendiente"::float AS saldo, c."montoTotal"::float AS monto, c.moneda::text AS moneda, c."tasaCambio"::float AS tasa,
                      cl.id AS "clienteId", cl.nombre AS cliente, cl.identificacion AS rif, cl.telefono,
                      (SELECT max(a."fechaPago") FROM "Abonos" a WHERE a."ventaId" = c."ventaId" AND a.notas LIKE :marca) AS declarada
                 FROM "CuentasPorCobrar" c JOIN "Ventas" v ON v.id = c."ventaId" LEFT JOIN "Clientes" cl ON cl.id = c."clienteId"
                WHERE c.estado <> 'Pagado' AND c."saldoPendiente" > 0.005 AND EXISTS (SELECT 1 FROM "Abonos" a WHERE a."ventaId" = c."ventaId" AND a.notas LIKE :marca)
                ORDER BY declarada, c.id`, { marca: `%${MARCA_CIERRE}%` }),
        ]);
        const hoy = Date.parse(`${iso(new Date())}T00:00:00Z`);
        const dias = (f) => (f ? Math.max(0, Math.round((hoy - Date.parse(`${iso(f)}T00:00:00Z`)) / 86400000)) : 0);
        const aUsd = (c) => (c.moneda === 'BS' ? Math.round((c.saldo / (c.tasa || 1)) * 100) / 100 : c.saldo);
        return NextResponse.json({
            retencionSinComprobante: retenciones.map((r) => ({ ...r, fecha: iso(r.fecha), dias: dias(r.fecha) })),
            dicenPagaron: dicen.map((c) => ({ ...c, saldo: aUsd(c), declarada: iso(c.declarada), dias: dias(c.declarada) })),
        });
    } catch (error) {
        console.error('Seguimiento de cuentas por cobrar:', error);
        return NextResponse.json({ error: 'No se pudo cargar el seguimiento' }, { status: 500 });
    }
}
