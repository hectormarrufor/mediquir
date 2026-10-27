import { NextResponse } from 'next/server';
import db from '@/models';
import { requerirNoVendedor } from '../../../_lib/acceso';
import { aBolivares } from '@/app/constants/facturacion';
import { AGENTE_RETENCION } from '@/app/constants/empresa';
import { normalizarWhatsApp } from '@/app/constants/contacto';

export const dynamic = 'force-dynamic';

const { FacturaCompra, Proveedor, RetencionIva } = db;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Datos del comprobante de retención de IVA de una compra (para verlo, imprimirlo, guardarlo en PDF o enviarlo al proveedor)
export async function GET(request, { params }) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    try {
        const { id } = await params;
        const factura = await FacturaCompra.findOne({
            where: UUID.test(id) ? { id } : { numeroDocumento: id },
            include: [
                { model: Proveedor, as: 'proveedor', attributes: ['id', 'nombre', 'identificacion', 'direccion', 'telefono', 'email'] },
                { model: RetencionIva, as: 'retenciones' },
            ],
        });
        if (!factura) return NextResponse.json({ error: 'Compra no encontrada' }, { status: 404 });
        const ret = (factura.retenciones || []).find((x) => x.tipo === 'COMPRA' && x.comprobante);
        if (!ret) return NextResponse.json({ error: 'Esta compra no tiene comprobante de retención (una nota de entrega o una factura sin IVA no retiene)' }, { status: 404 });

        // Un comprobante puede agrupar varias facturas del proveedor: una línea por cada una, en el orden de sus fechas.
        // Todo el comprobante va en bolívares. La retención guarda base, IVA y retenido en Bs; el total de la factura se convierte con su tasa.
        const filas = await RetencionIva.findAll({ where: { tipo: 'COMPRA', comprobante: ret.comprobante }, include: [{ model: FacturaCompra, as: 'facturaCompra' }] });
        const lineas = filas
            .map((r) => ({ r, f: r.facturaCompra || factura }))
            .sort((a, b) => String(a.f.fechaFactura).localeCompare(String(b.f.fechaFactura)) || String(a.f.numeroDocumento).localeCompare(String(b.f.numeroDocumento)))
            .map(({ r, f }, i) => {
                const total = f.moneda === 'BS' ? r2(f.totalFinal) : aBolivares(Number(f.totalFinal), Number(f.tasaCambio) || 1);
                const base = r2(r.baseImponible);
                const iva = r2(r.montoIva);
                return {
                    oper: i + 1,
                    fechaDocumento: String(f.fechaFactura).slice(0, 10),
                    numeroFactura: f.numeroDocumento,
                    numeroControl: f.numeroControl || r.numeroControlFactura || '',
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
                nombre: ret.contraparteNombre || factura.proveedor?.nombre || '',
                rif: ret.contraparteRif || factura.proveedor?.identificacion || '',
                direccion: factura.proveedor?.direccion || '',
                telefono: factura.proveedor?.telefono || '',
            },
            lineas,
            totales: { base: suma('base'), iva: suma('iva'), retenido: suma('retenido') },
            compra: { id: factura.id, numeroDocumento: factura.numeroDocumento },
            whatsapp: normalizarWhatsApp(factura.proveedor?.telefono),
        });
    } catch (error) {
        console.error('Comprobante de retención:', error);
        return NextResponse.json({ error: 'No se pudo cargar el comprobante' }, { status: 500 });
    }
}
