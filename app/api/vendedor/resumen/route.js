import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { Cliente, Marca, Producto, Venta, VentaDetalle, VentaEmpaqueItem } from '@/models';
import { aDolares } from '@/app/constants/facturacion';
import { requerirStaff } from '../../inventario/_lib';
import { tasaVigente } from '../../_lib/tasaBcv';

export const dynamic = 'force-dynamic';

const CERRADOS = ['Cancelado', 'Completado'];

// Inicio del día de hoy en Caracas (UTC-4 todo el año)
const inicioDeHoy = () => {
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    return new Date(`${hoy}T00:00:00-04:00`);
};

const totalEnUsd = (v) => (v.moneda === 'BS' ? aDolares(Number(v.totalFinal), Number(v.tasaCambio)) : Number(v.totalFinal));

const INCLUDE_TAREA = [
    { model: Cliente, as: 'cliente', attributes: ['nombre'] },
    {
        model: VentaDetalle, as: 'detalles', attributes: ['id', 'cantidad', 'isFicticio', 'nombreFicticio', 'presentacionPedida', 'cantidadPresentacion', 'unidadesPorPresentacion'],
        include: [{ model: Producto, as: 'producto', attributes: ['nombre', 'codigo', 'imagen'], include: [{ model: Marca, as: 'marca', attributes: ['nombre'] }] }],
    },
];

const tarea = (v) => ({
    id: v.id,
    numero: v.numeroDocumento,
    fecha: v.createdAt,
    cliente: v.cliente?.nombre || 'Cliente al detal',
    tipoEntrega: v.tipoEntrega,
    empacado: Boolean(v.empacadoAt),
    articulos: v.detalles.reduce((a, d) => a + Number(d.cantidad), 0),
    detalles: v.detalles.map((d) => ({
        id: d.id,
        nombre: d.isFicticio ? d.nombreFicticio : d.producto?.nombre,
        codigo: d.producto?.codigo || null,
        marca: d.producto?.marca?.nombre || null,
        imagen: d.producto?.imagen || null,
        cantidad: Number(d.cantidad),
        // Lo que pidió el cliente ("2 × Caja x100"); null si se pidió por unidad o es un pedido sin presentación
        pedido: d.presentacionPedida && d.presentacionPedida !== 'UNIDAD' && d.cantidadPresentacion
            ? `${d.cantidadPresentacion} × ${d.presentacionPedida === 'CAJA' ? 'Caja' : 'Bulto'} x${d.unidadesPorPresentacion}` : null,
    })),
});

// Tablero del vendedor: lo que tiene por empacar/etiquetar, lo que ya firmó y cómo va vendiendo. Solo datos suyos, sin costos.
export async function GET() {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;
    const yo = Number(acceso.sesion.id);

    try {
        const desde = inicioDeHoy();
        const abiertas = { statusDespacho: { [Op.notIn]: CERRADOS } };

        const [porEmpacar, porEtiquetar, firmadas, ventasHoy, pedidosEnCurso, tasa] = await Promise.all([
            Venta.findAll({ where: { empacadorId: yo, empacadoAt: null, ...abiertas }, include: INCLUDE_TAREA, order: [['createdAt', 'ASC']] }),
            Venta.findAll({ where: { etiquetadorId: yo, etiquetadoAt: null, ...abiertas }, include: INCLUDE_TAREA, order: [['createdAt', 'ASC']] }),
            Venta.findAll({
                where: { [Op.or]: [{ empacadorId: yo, empacadoAt: { [Op.ne]: null } }, { etiquetadorId: yo, etiquetadoAt: { [Op.ne]: null } }] },
                include: [{ model: Cliente, as: 'cliente', attributes: ['nombre'] }],
                order: [['updatedAt', 'DESC']], limit: 8,
            }),
            Venta.findAll({ where: { vendedorId: yo, createdAt: { [Op.gte]: desde }, statusDespacho: { [Op.ne]: 'Cancelado' } }, attributes: ['id', 'tipoVenta', 'moneda', 'tasaCambio', 'totalFinal'] }),
            Venta.findAll({
                where: { vendedorId: yo, tipoVenta: 'MAYOR', ...abiertas },
                include: [{ model: Cliente, as: 'cliente', attributes: ['nombre'] }],
                order: [['createdAt', 'DESC']], limit: 8,
            }),
            tasaVigente().catch(() => null),
        ]);

        // Avance del empaque paso a paso: cuántos productos ya verificó de cada pedido
        const idsEmpacar = porEmpacar.map((v) => v.id);
        const verificados = new Map();
        if (idsEmpacar.length) {
            const items = await VentaEmpaqueItem.findAll({ where: { ventaId: idsEmpacar, estado: 'OK' }, attributes: ['ventaId'], raw: true });
            items.forEach((i) => verificados.set(i.ventaId, (verificados.get(i.ventaId) || 0) + 1));
        }

        const detal = ventasHoy.filter((v) => v.tipoVenta === 'DETAL');
        const suma = (lista) => Number(lista.reduce((a, v) => a + totalEnUsd(v), 0).toFixed(2));

        return NextResponse.json({
            tasa,
            porEmpacar: porEmpacar.map((v) => ({ ...tarea(v), renglones: v.detalles.length, verificados: verificados.get(v.id) || 0, iniciado: Boolean(v.empaqueIniciadoAt) || verificados.has(v.id) })),
            porEtiquetar: porEtiquetar.map(tarea),
            firmadas: firmadas.map((v) => ({
                id: v.id, numero: v.numeroDocumento, cliente: v.cliente?.nombre || 'Cliente al detal',
                empaque: v.empacadorId === yo ? v.empacadoAt : null,
                etiquetado: v.etiquetadorId === yo ? v.etiquetadoAt : null,
            })),
            hoy: { ventas: ventasHoy.length, totalUsd: suma(ventasHoy), detal: detal.length, detalUsd: suma(detal) },
            pedidosEnCurso: pedidosEnCurso.map((v) => ({
                id: v.id, numero: v.numeroDocumento, cliente: v.cliente?.nombre || '—', estado: v.statusDespacho,
                fecha: v.createdAt, total: totalEnUsd(v), empacado: Boolean(v.empacadoAt), etiquetado: Boolean(v.etiquetadoAt),
            })),
        });
    } catch (error) {
        console.error('Resumen del vendedor:', error);
        return NextResponse.json({ error: 'No se pudo cargar tu panel' }, { status: 500 });
    }
}
