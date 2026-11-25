import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { Cliente, Marca, Producto, Venta, VentaDetalle, VentaEmpaqueItem } from '@/models';
import { aDolares } from '@/app/constants/facturacion';
import { requerirStaff } from '../../inventario/_lib';
import { tasaVigente } from '../../_lib/tasaBcv';
import { asegurarColumnasEmpaqueNotas, analizarEmpaquesBatch, detalleEfectivo } from '../../_lib/empaqueNotas';

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

const tarea = (v, analisis = null) => {
    const cambioPorDet = new Map((analisis?.cambios || []).map((c) => [c.detalleId, c]));
    const usarEfectivo = Boolean(analisis && !v.empacadoAt && (analisis.modificaEmpaque || analisis.esAnulacionTotal));
    const detallesActivos = [];
    for (const d of v.detalles) {
        const c = cambioPorDet.get(d.id);
        const cant = usarEfectivo && c ? c.restante : Number(d.cantidad);
        if (usarEfectivo && cant <= 0) continue;
        const dEf = usarEfectivo ? detalleEfectivo(d, cant) : d;
        detallesActivos.push({
            id: d.id,
            nombre: d.isFicticio ? d.nombreFicticio : d.producto?.nombre,
            codigo: d.producto?.codigo || null,
            marca: d.producto?.marca?.nombre || null,
            imagen: d.producto?.imagen || null,
            cantidad: cant,
            cantidadOriginal: Number(d.cantidad),
            // Lo que pidió el cliente ("2 × Caja x100"); null si se pidió por unidad o es un pedido sin presentación
            pedido: dEf.presentacionPedida && dEf.presentacionPedida !== 'UNIDAD' && dEf.cantidadPresentacion
                ? `${dEf.cantidadPresentacion} × ${dEf.presentacionPedida === 'CAJA' ? 'Caja' : 'Bulto'} x${dEf.unidadesPorPresentacion}` : null,
        });
    }
    const ajustadoPostEmpaque = Boolean(analisis && v.empacadoAt && (analisis.modificaEmpaque || analisis.esAnulacionTotal));
    return {
        id: v.id,
        numero: v.numeroDocumento,
        fecha: v.createdAt,
        cliente: v.cliente?.nombre || 'Cliente al detal',
        tipoEntrega: v.tipoEntrega,
        empacado: Boolean(v.empacadoAt),
        modificadoPorNc: Boolean(analisis?.modificaEmpaque),
        articulos: ajustadoPostEmpaque ? analisis.totalRestante : detallesActivos.reduce((a, d) => a + Number(d.cantidad), 0),
        renglones: detallesActivos.length,
        detalles: detallesActivos,
    };
};

// Tablero del vendedor: lo que tiene por empacar/etiquetar, lo que ya firmó y cómo va vendiendo. Solo datos suyos, sin costos.
export async function GET() {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;
    const yo = Number(acceso.sesion.id);

    try {
        await asegurarColumnasEmpaqueNotas();
        const desde = inicioDeHoy();
        const abiertas = { statusDespacho: { [Op.notIn]: CERRADOS } };

        const [porEmpacarRaw, porEmpacarDisponiblesRaw, porEtiquetarRaw, porEntregarRaw, enviosEmpacadosRows, firmadas, ventasHoy, pedidosEnCursoRaw, tasa] = await Promise.all([
            Venta.findAll({ where: { empacadorId: yo, empacadoAt: null, ...abiertas }, include: INCLUDE_TAREA, order: [['createdAt', 'ASC']] }),
            Venta.findAll({
                where: {
                    empacadorId: null,
                    empacadoAt: null,
                    ...abiertas,
                    [Op.and]: [
                        { [Op.or]: [{ revisionStock: null }, { revisionStock: { [Op.ne]: 'PENDIENTE' } }] },
                        { [Op.or]: [{ verificacionPago: null }, { verificacionPago: { [Op.ne]: 'POR_VERIFICAR' } }] },
                    ],
                },
                include: INCLUDE_TAREA,
                order: [['createdAt', 'ASC']],
            }),
            Venta.findAll({ where: { etiquetadorId: yo, etiquetadoAt: null, ...abiertas }, include: INCLUDE_TAREA, order: [['createdAt', 'ASC']] }),
            // Ya empacados (retiro por cliente o por chofer/agencia): esperan ser entregados / despachados
            Venta.findAll({ where: { [Op.or]: [{ empacadorId: yo }, { etiquetadorId: yo }, { vendedorId: yo }], empacadoAt: { [Op.ne]: null }, tipoEntrega: { [Op.ne]: 'sitio' }, ...abiertas }, include: INCLUDE_TAREA, order: [['createdAt', 'ASC']] }),
            // Total global de envíos ya empacados pendientes de despacho (cualquier agencia o cliente en Mediquir)
            Venta.findAll({ where: { empacadoAt: { [Op.ne]: null }, tipoEntrega: { [Op.ne]: 'sitio' }, ...abiertas }, attributes: ['id'], raw: true }),
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

        const todosIds = [
            ...porEmpacarRaw, ...porEmpacarDisponiblesRaw, ...porEtiquetarRaw, ...porEntregarRaw, ...pedidosEnCursoRaw, ...enviosEmpacadosRows,
        ].map((v) => v.id);
        const analisisMapa = await analizarEmpaquesBatch(todosIds);
        const ncDe = (id) => analisisMapa.get(String(id)) || null;

        const visiblePorEmpacar = (v) => {
            const nc = ncDe(v.id);
            return !nc?.anuladaTotalParaEmpaque && nc?.estadoEfectivo !== 'DESARMADO';
        };
        const porEmpacar = porEmpacarRaw.filter(visiblePorEmpacar);
        const porEmpacarDisponibles = porEmpacarDisponiblesRaw.filter(visiblePorEmpacar);
        const porEtiquetar = porEtiquetarRaw.filter((v) => {
            const nc = ncDe(v.id);
            if (!v.empacadoAt && nc?.anuladaTotalParaEmpaque) return false;
            return nc?.estadoEfectivo !== 'DESARMADO';
        });
        const porEntregar = porEntregarRaw.filter((v) => ncDe(v.id)?.estadoEfectivo !== 'DESARMADO');
        const pedidosEnCurso = pedidosEnCursoRaw.filter((v) => {
            const nc = ncDe(v.id);
            if (!v.empacadoAt && nc?.anuladaTotalParaEmpaque) return false;
            return nc?.estadoEfectivo !== 'DESARMADO';
        });
        const enviosActivos = enviosEmpacadosRows.filter((v) => ncDe(v.id)?.estadoEfectivo !== 'DESARMADO');
        const enviosPorDespachar = enviosActivos.length;
        const enviosConNcPendiente = enviosActivos.filter((v) => ncDe(v.id)?.bloqueaDespacho).length;

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
            porEmpacar: porEmpacar.map((v) => {
                const t = tarea(v, ncDe(v.id));
                return { ...t, verificados: verificados.get(v.id) || 0, iniciado: Boolean(v.empaqueIniciadoAt) || verificados.has(v.id) };
            }),
            porEmpacarDisponibles: porEmpacarDisponibles.map((v) => tarea(v, ncDe(v.id))),
            porEtiquetar: porEtiquetar.map((v) => tarea(v, ncDe(v.id))),
            porEntregar: porEntregar.map((v) => {
                const nc = ncDe(v.id);
                return { ...tarea(v, nc), transporte: v.quienRetira || '', empaqueNc: nc };
            }),
            enviosPorDespachar,
            enviosConNcPendiente,
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
