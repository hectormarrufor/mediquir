import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import db from '@/models';
import { requerirAdmin } from '@/app/api/_lib/acceso';

export const dynamic = 'force-dynamic';
const { Venta, VentaDetalle, Cliente, Producto } = db;

export async function GET(request) {
    const acceso = await requerirAdmin();
    if (acceso.error) return acceso.error;

    try {
        const q = String(new URL(request.url).searchParams.get('q') || '').trim();
        const where = {
            statusDespacho: { [Op.ne]: 'Cancelado' },
            clienteId: { [Op.ne]: null },
        };
        if (q) {
            where[Op.or] = [
                { numeroDocumento: { [Op.iLike]: `%${q}%` } },
                { '$cliente.nombre$': { [Op.iLike]: `%${q}%` } },
                { '$cliente.identificacion$': { [Op.iLike]: `%${q}%` } },
            ];
        }

        const ventas = await Venta.findAll({
            where,
            include: [
                {
                    model: Cliente,
                    as: 'cliente',
                    attributes: ['id', 'identificacion', 'nombre', 'direccion', 'telefono', 'email'],
                    required: true,
                },
                {
                    model: VentaDetalle,
                    as: 'detalles',
                    include: [
                        {
                            model: Producto,
                            as: 'producto',
                            attributes: ['id', 'codigo', 'nombre', 'porcentajeIva'],
                        },
                    ],
                },
            ],
            order: [['createdAt', 'DESC']],
            limit: 20,
            subQuery: false,
        });

        const resultado = ventas.map((v) => {
            const j = v.toJSON();
            const tasa = Number(j.tasaCambio) || 1;
            const enUsd = j.moneda === 'USD';
            return {
                id: j.id,
                numeroDocumento: j.numeroDocumento,
                tipoDocumento: j.tipoDocumento,
                fechaEmision: j.fechaEmision || j.createdAt,
                moneda: j.moneda,
                tasaCambio: tasa,
                condicionPago: j.condicionPago,
                totalFinal: Number(j.totalFinal) || 0,
                cliente: j.cliente,
                detalles: (j.detalles || []).map((d) => {
                    const precioOrig = Number(d.precioUnitario) || 0;
                    const precioBs = enUsd && tasa > 0 ? Math.round((precioOrig * tasa + Number.EPSILON) * 100) / 100 : precioOrig;
                    const alicuota = d.aplicaIva === false
                        ? 0
                        : (d.producto ? Number(d.producto.porcentajeIva) || 0 : 16);
                    return {
                        codigo: d.producto?.codigo || (d.isFicticio ? '1010' : ''),
                        descripcion: d.isFicticio ? (d.nombreFicticio || 'Artículo') : (d.producto?.nombre || 'Artículo'),
                        cantidad: Number(d.cantidad) || 1,
                        precioUnitarioBs: precioBs,
                        aplicaIva: alicuota > 0,
                        alicuota,
                    };
                }),
            };
        });

        return NextResponse.json(resultado);
    } catch (error) {
        console.error('Error listando ventas muestra:', error);
        return NextResponse.json({ error: 'No se pudieron cargar las ventas de muestra' }, { status: 500 });
    }
}
