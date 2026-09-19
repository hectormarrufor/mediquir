import { NextResponse } from 'next/server';
import { requerirStaff } from '@/app/api/inventario/_lib';
import { rolDe } from '@/app/constants/roles';
import { notificarCabezas } from '@/app/handlers/notificar';
import db from '@/models/index';
import {
    buscarVentaParaEmpaque, imagenDe, nombreDe, codigoCoincide, modoVerificacion, opcionesDeMarca,
} from '../../_empaque';

const { sequelize, Venta, VentaEmpaqueItem } = db;

export const dynamic = 'force-dynamic';

class ErrorEmpaque extends Error {
    constructor(mensaje, status = 400, extra = {}) { super(mensaje); this.status = status; this.extra = extra; }
}

const nombreEmpleado = (u) => (u?.empleado ? `${u.empleado.nombre} ${u.empleado.apellido}`.trim() : u?.user || null);

// ==========================================================
// GET: estado del empaque (lo que el wizard necesita y lo que administración revisa como evidencia)
// ==========================================================
export async function GET(request, { params }) {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;
    try {
        const { id } = await params;
        const venta = await buscarVentaParaEmpaque(id);
        if (!venta) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });

        const yo = Number(acceso.sesion.id);
        const esVendedor = rolDe(acceso.sesion) === 'vendedor';
        // Un vendedor solo ve el empaque si es el suyo o si él vendió
        if (esVendedor && ![venta.empacadorId, venta.vendedorId].map(Number).includes(yo)) {
            return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });
        }

        const registros = await VentaEmpaqueItem.findAll({ where: { ventaId: venta.id } });
        const porDetalle = new Map(registros.map((r) => [r.ventaDetalleId, r]));

        const items = [];
        for (const d of venta.detalles) {
            const r = porDetalle.get(d.id);
            const modo = modoVerificacion(d);
            items.push({
                detalleId: d.id,
                nombre: nombreDe(d),
                marca: d.producto?.marca?.nombre || null,
                imagen: imagenDe(d.producto),
                cantidadPedida: Number(d.cantidad),
                modo,
                // No se envía el código esperado: se valida en el servidor
                opcionesMarca: modo === 'marca' && r?.estado !== 'OK' ? await opcionesDeMarca(d) : null,
                estado: r?.estado || 'PENDIENTE',
                cantidadEmpacada: r?.cantidadEmpacada != null ? Number(r.cantidadEmpacada) : null,
                metodo: r?.metodo || null,
                intentosFallidos: r?.intentosFallidos || 0,
                observacion: r?.observacion || null,
                verificadoAt: r?.verificadoAt || null,
            });
        }

        return NextResponse.json({
            venta: {
                id: venta.id, numeroDocumento: venta.numeroDocumento, statusDespacho: venta.statusDespacho,
                empacadorId: venta.empacadorId, empacadorNombre: nombreEmpleado(venta.empacador),
                empaqueIniciadoAt: venta.empaqueIniciadoAt, empacadoAt: venta.empacadoAt, empaqueVerificado: venta.empaqueVerificado,
                fotoCajaAbiertaUrl: venta.fotoCajaAbiertaUrl, fotoCajaSelladaUrl: venta.fotoCajaSelladaUrl,
            },
            esEmpacador: Number(venta.empacadorId) === yo,
            items,
        });
    } catch (error) {
        console.error('Error leyendo el empaque:', error);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}

// ==========================================================
// POST: VERIFICAR_ITEM (solo el empacador asignado) · LIBERAR_ITEM (administración)
// ==========================================================
export async function POST(request, { params }) {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;
    const yo = Number(acceso.sesion.id);
    const esVendedor = rolDe(acceso.sesion) === 'vendedor';

    const t = await sequelize.transaction();
    let novedad = null;
    try {
        const { id } = await params;
        const { accion, detalleId, codigo, escaneado, marcaElegida, cantidad, observacion } = await request.json();

        const venta = await buscarVentaParaEmpaque(id, { transaction: t });
        if (!venta) throw new ErrorEmpaque('Documento no encontrado', 404);
        // Bloqueo de la fila (no se puede con los joins): dos toques seguidos no verifican el mismo renglón dos veces
        await Venta.findByPk(venta.id, { attributes: ['id'], transaction: t, lock: t.LOCK.UPDATE });
        const detalle = venta.detalles.find((d) => d.id === detalleId);
        if (!detalle) throw new ErrorEmpaque('Ese producto no pertenece a este pedido', 404);
        if (['Cancelado', 'Completado'].includes(venta.statusDespacho)) throw new ErrorEmpaque('Este pedido ya está cerrado', 409);
        if (venta.empacadoAt) throw new ErrorEmpaque('El empaque ya fue firmado: la evidencia no se puede modificar', 409);

        // ---- Administración libera un renglón con novedad para que el empacador lo vuelva a verificar ----
        if (accion === 'LIBERAR_ITEM') {
            if (esVendedor) throw new ErrorEmpaque('Tu rol no permite esta acción', 403);
            const reg = await VentaEmpaqueItem.findOne({ where: { ventaDetalleId: detalle.id }, transaction: t });
            if (!reg || reg.estado !== 'NOVEDAD') throw new ErrorEmpaque('Ese renglón no tiene una novedad pendiente', 409);
            reg.estado = 'PENDIENTE';
            reg.cantidadEmpacada = null;
            reg.observacion = `Novedad anterior: ${reg.observacion || 's/n'}`;
            await reg.save({ transaction: t });
            await t.commit();
            return NextResponse.json({ success: true });
        }

        if (accion !== 'VERIFICAR_ITEM') throw new ErrorEmpaque('Acción no válida');
        if (Number(venta.empacadorId) !== yo) throw new ErrorEmpaque('Este empaque no está asignado a ti', 403);

        const [reg] = await VentaEmpaqueItem.findOrCreate({
            where: { ventaDetalleId: detalle.id },
            defaults: { ventaId: venta.id, ventaDetalleId: detalle.id, cantidadPedida: Number(detalle.cantidad) },
            transaction: t,
        });
        if (reg.estado === 'OK') throw new ErrorEmpaque('Este producto ya fue verificado', 409);
        if (reg.estado === 'NOVEDAD') throw new ErrorEmpaque('Este producto tiene una novedad reportada: espera a que administración la resuelva', 409);

        // 1) ¿Es el producto correcto?
        const modo = modoVerificacion(detalle);
        let metodo = 'manual';
        let coincide = true;
        if (modo === 'codigo') {
            coincide = codigoCoincide(detalle.producto.codigo, codigo, Boolean(escaneado));
            metodo = escaneado && coincide ? 'escaneo' : 'codigo';
        } else if (modo === 'marca') {
            coincide = String(marcaElegida || '') === detalle.producto.marca.nombre;
            metodo = 'marca';
        }
        if (!coincide) {
            // Se guarda el intento fallido (es un error que el sistema evitó) y se responde sin revertirlo
            reg.intentosFallidos += 1;
            await reg.save({ transaction: t });
            await t.commit();
            const msg = modo === 'codigo'
                ? 'Ese código no corresponde al producto pedido. Revisa que estés tomando el producto correcto.'
                : 'Esa no es la marca del producto pedido. Revisa que estés tomando el producto correcto.';
            return NextResponse.json({ error: msg, intentosFallidos: reg.intentosFallidos }, { status: 422 });
        }

        // 2) ¿La cantidad coincide con lo pedido?
        const cant = Number(cantidad);
        if (cantidad === '' || cantidad == null || !Number.isFinite(cant) || cant < 0) throw new ErrorEmpaque('Escribe cuántas unidades metiste');
        const pedida = Number(detalle.cantidad);

        if (!venta.empaqueIniciadoAt) venta.empaqueIniciadoAt = new Date();
        reg.metodo = metodo;
        reg.cantidadEmpacada = cant;
        reg.verificadoAt = new Date();

        if (cant !== pedida) {
            const motivo = String(observacion || '').trim();
            if (motivo.length < 5) throw new ErrorEmpaque('La cantidad no coincide con lo pedido: explica el motivo', 400, { requiereMotivo: true });
            reg.estado = 'NOVEDAD';
            reg.observacion = motivo.slice(0, 500);
            novedad = { numero: venta.numeroDocumento, nombre: nombreDe(detalle), pedida, cant, motivo: reg.observacion, ventaId: venta.id };
        } else {
            reg.estado = 'OK';
        }
        await reg.save({ transaction: t });
        await venta.save({ transaction: t });
        await t.commit();

        if (novedad) {
            try {
                await notificarCabezas({
                    title: 'Novedad en un empaque ⚠️',
                    body: `Pedido ${novedad.numero}: "${novedad.nombre}" pedido ${novedad.pedida}, el empacador reporta ${novedad.cant}. Motivo: ${novedad.motivo}`,
                    url: `/superuser/ventas/${novedad.ventaId}`, tipo: 'Alerta',
                });
            } catch (e) {
                console.error('No se pudo avisar la novedad de empaque:', e.message);
            }
        }
        return NextResponse.json({ success: true, estado: reg.estado });
    } catch (error) {
        if (!t.finished) await t.rollback();
        if (error instanceof ErrorEmpaque) return NextResponse.json({ error: error.message, ...error.extra }, { status: error.status });
        console.error('Error verificando el empaque:', error);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}
