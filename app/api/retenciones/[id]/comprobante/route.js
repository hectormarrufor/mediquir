import { NextResponse } from 'next/server';
import sequelize from '@/sequelize';
import db from '@/models';
import { requerirNoVendedor } from '../../../_lib/acceso';
import { aBolivares } from '@/app/constants/facturacion';
import { AGENTE_RETENCION } from '@/app/constants/empresa';
import { normalizarWhatsApp } from '@/app/constants/contacto';

export const dynamic = 'force-dynamic';

const { FacturaCompra, Proveedor, RetencionIva } = db;
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const claveRif = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// Datos de la planilla (comprobante de retención de IVA) a partir de UNA RETENCIÓN, tenga o no su factura de compra enlazada:
// sirve para ver, imprimir, guardar en PDF y entregar al proveedor desde la lista de retenciones del cierre.
// Un comprobante puede agrupar varias facturas del proveedor: una línea por cada una.
export async function GET(request, { params }) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    try {
        const { id } = await params;
        const ret = await RetencionIva.findByPk(Number(id));
        if (!ret || ret.tipo !== 'COMPRA') return NextResponse.json({ error: 'Esa retención no existe o no es una retención a un proveedor' }, { status: 404 });
        if (!ret.comprobante) return NextResponse.json({ error: 'Esta retención todavía no tiene número de comprobante' }, { status: 404 });

        const filas = await RetencionIva.findAll({ where: { tipo: 'COMPRA', comprobante: ret.comprobante }, include: [{ model: FacturaCompra, as: 'facturaCompra' }] });
        const conFactura = filas.find((r) => r.facturaCompra)?.facturaCompra || null;
        // El proveedor: el de la factura enlazada o, si no la hay, el que tiene ese RIF
        let proveedor = null;
        if (conFactura) proveedor = await Proveedor.findByPk(conFactura.proveedorId, { attributes: ['id', 'nombre', 'identificacion', 'direccion', 'telefono'] });
        if (!proveedor && ret.contraparteRif) {
            const [p] = await sequelize.query(`SELECT id, nombre, identificacion, direccion, telefono FROM "Proveedores" WHERE regexp_replace(upper(identificacion), '[^A-Z0-9]', '', 'g') = :rif LIMIT 1`,
                { replacements: { rif: claveRif(ret.contraparteRif) }, type: sequelize.QueryTypes.SELECT });
            proveedor = p || null;
        }

        const lineas = filas
            .map((r) => ({ r, f: r.facturaCompra }))
            .sort((a, b) => String(a.f?.fechaFactura || a.r.fecha).localeCompare(String(b.f?.fechaFactura || b.r.fecha)) || String(a.f?.numeroDocumento || a.r.facturaAfectada).localeCompare(String(b.f?.numeroDocumento || b.r.facturaAfectada)))
            .map(({ r, f }, i) => {
                const base = r2(r.baseImponible);
                const iva = r2(r.montoIva);
                // Sin factura enlazada no se conoce el total del documento: se toma base + IVA (sin exento)
                const total = f ? (f.moneda === 'BS' ? r2(f.totalFinal) : aBolivares(Number(f.totalFinal), Number(f.tasaCambio) || 1)) : r2(base + iva);
                return {
                    oper: i + 1,
                    fechaDocumento: String(f?.fechaFactura || r.fecha).slice(0, 10),
                    numeroFactura: f?.numeroDocumento || r.facturaAfectada,
                    numeroControl: f?.numeroControl || r.numeroControlFactura || '',
                    tipoTrans: '01',
                    total, exento: r2(total - base - iva), base, alicuota: Number(r.alicuota), iva, retenido: r2(r.ivaRetenido), porcentaje: Number(r.porcentajeRetencion),
                };
            });
        const suma = (k) => r2(lineas.reduce((a, l) => a + l[k], 0));
        const fecha = String(ret.fecha).slice(0, 10);

        return NextResponse.json({
            id: ret.id,
            comprobante: ret.comprobante,
            fecha,
            ano: fecha.slice(0, 4),
            mes: fecha.slice(5, 7),
            agente: AGENTE_RETENCION,
            sujeto: {
                nombre: ret.contraparteNombre || proveedor?.nombre || '',
                rif: ret.contraparteRif || proveedor?.identificacion || '',
                direccion: proveedor?.direccion || '',
                telefono: proveedor?.telefono || '',
            },
            lineas,
            totales: { base: suma('base'), iva: suma('iva'), retenido: suma('retenido') },
            compra: conFactura ? { id: conFactura.id, numeroDocumento: conFactura.numeroDocumento } : null,
            whatsapp: normalizarWhatsApp(proveedor?.telefono),
        });
    } catch (error) {
        console.error('Planilla de retención:', error);
        return NextResponse.json({ error: 'No se pudo cargar la planilla de retención' }, { status: 500 });
    }
}
