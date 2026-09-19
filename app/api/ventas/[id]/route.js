import { NextResponse } from 'next/server';
import db, { PagoSms } from '@/models/index';
const { 
    sequelize, Venta, VentaDetalle, Producto, SalidaInventario, 
    MovimientoFinanciero, CategoriaFinanciera, Cliente, Marca, 
    Correlativo, Abono, CuentaPorCobrar, User, Empleado, GrupoEquivalencia
} = db;

import { aBolivares, aDolares } from '@/app/constants/facturacion';
import { rolDe } from '@/app/constants/roles';
import { requerirStaff } from '../../inventario/_lib';
import { crearYNotificar, notificarCabezas, notificarUsuario } from '@/app/handlers/notificar';
import { RetencionIva } from '@/models';
import { faltantesDeEmpaque, reiniciarEmpaque } from '../_empaque';
import { borrarFotosSobrantes } from '../_fotosEmpaque';
import { registrarAbono, ErrorAbono } from '../../_lib/abonos';
import { recalcularCobro } from '../../_lib/retencionesVenta';
import { eliminarVenta, borrarArchivosDeVenta } from '../_eliminar';

// Error de reglas de logística (permisos, estados) con su código HTTP
class ErrorLogistica extends Error {
    constructor(mensaje, status = 400) { super(mensaje); this.status = status; }
}

// El vendedor solo firma; asignar, despachar y cobrar es de administración
const ACCIONES_VENDEDOR = ['FIRMAR_EMPAQUE', 'FIRMAR_ETIQUETADO'];

// Descuenta el stock y deja las salidas como "Empacada". Solo el MAYOR descuenta aquí: el detal y las ventas web ya
// descontaron al venderse (antes se descontaba de nuevo al empacar, restando el stock dos veces).
async function ejecutarEmpaque(venta, t, empacadorId) {
    if (venta.tipoVenta === 'MAYOR') {
        for (const item of venta.detalles) {
            if (item.isFicticio || item.afectaInventario === false) continue;
            const productoDB = await Producto.findByPk(item.productoId, { transaction: t, lock: t.LOCK.UPDATE });
            if (!productoDB) continue;
            const stock = Number(productoDB.stockAlmacen) || 0;
            if (stock < Number(item.cantidad)) {
                throw new ErrorLogistica(`Sin existencia suficiente de "${productoDB.nombre}" (hay ${stock}, se necesitan ${item.cantidad})`, 409);
            }
            productoDB.stockAlmacen = stock - Number(item.cantidad);
            productoDB.nroVentas = (Number(productoDB.nroVentas) || 0) + Number(item.cantidad);
            await productoDB.save({ transaction: t });
        }
    }
    await SalidaInventario.update(
        { estado: 'Empacada', despachadoPorId: Number(empacadorId) || null },
        { where: { ventaId: venta.id }, transaction: t }
    );
}

// Usuarios que pueden ser asignados a logística: deben existir y ser personal (no clientes)
async function validarPersonal(ids, t) {
    for (const id of ids.filter(Boolean)) {
        const u = await User.findByPk(Number(id), { attributes: ['id', 'empleadoId', 'clienteId'], transaction: t });
        if (!u || !u.empleadoId || u.clienteId) throw new ErrorLogistica('El empacador y el etiquetador deben ser personal de la empresa');
    }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ==========================================
// 🚀 GET: OBTENER DETALLE DE VENTA Y SU ENTORNO
// ==========================================
export async function GET(request, { params }) {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;
    try {
        const { id } = await params;
        let whereClause = {};

        if (UUID_REGEX.test(id)) {
            whereClause.id = id;
        } else {
            whereClause.numeroDocumento = id;
        }

        const venta = await Venta.findOne({
            where: whereClause,
            include: [
                {
                    model: VentaDetalle,
                    as: 'detalles',
                    include: [{
                        model: Producto,
                        as: 'producto',
                        attributes: ['nombre', 'codigo', 'imagen', 'stockAlmacen'],
                        include: [{ model: Marca, as: 'marca', attributes: ['nombre', 'imagen'] }, {model: GrupoEquivalencia, as: 'grupoEquivalencia', attributes: ['nombre', 'imagen']}]
                    }]
                },
                { model: Cliente, as: 'cliente', attributes: ['id', 'nombre', 'identificacion', 'direccion', 'esContribuyenteEspecial', 'retencionIvaPorDefecto'] },
                { model: RetencionIva, as: 'retenciones' },
                { model: MovimientoFinanciero, as: 'movimientos',
                    include: [{ model: PagoSms, as: 'pagoSms' }]
                 },
                { model: SalidaInventario, as: 'salidasInventario' },
                { model: CuentaPorCobrar, as: 'cuentaPorCobrar' }, // 🔥 INCLUIDO PARA EL DASHBOARD
                { model: Abono, as: 'abonos' },                   // 🔥 INCLUIDO PARA EL DASHBOARD
                { 
                    model: User, 
                    as: 'vendedor', 
                    attributes: ['id', 'user'],
                    include: [{ model: Empleado, as: 'empleado', attributes: ['nombre', 'apellido'] }] 
                },
                { model: User, as: 'empacador', attributes: ['id', 'user'], include: [{ model: Empleado, as: 'empleado', attributes: ['nombre', 'apellido'] }] },
                { model: User, as: 'etiquetador', attributes: ['id', 'user'], include: [{ model: Empleado, as: 'empleado', attributes: ['nombre', 'apellido'] }] }
            ]
        });

        if (!venta) {
            return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });
        }

        // Un vendedor solo ve lo suyo y sin datos financieros (movimientos, cuentas por cobrar, abonos, costos)
        if (rolDe(acceso.sesion) === 'vendedor') {
            const yo = Number(acceso.sesion.id);
            if (![venta.vendedorId, venta.empacadorId, venta.etiquetadorId].map(Number).includes(yo)) {
                return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });
            }
            const j = venta.toJSON();
            j.movimientos = [];
            j.cuentaPorCobrar = [];
            j.abonos = [];
            j.salidasInventario = (j.salidasInventario || []).map(({ costoAlMomento, ...resto }) => resto);
            return NextResponse.json(j);
        }

        return NextResponse.json(venta);
    } catch (error) {
        console.error('Error obteniendo detalle de venta:', error);
        return NextResponse.json({ error: 'Error interno del servidor', detalle: error.message }, { status: 500 });
    }
}

// ==========================================
// 📦 PUT: GESTIÓN LOGÍSTICA (EMPACAR, DESPACHAR Y ABONAR)
// ==========================================
export async function PUT(request, { params }) {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;
    const rol = rolDe(acceso.sesion);
    const yo = Number(acceso.sesion.id);

    const t = await sequelize.transaction();

    try {
        const { id } = await params;
        const body = await request.json();
        const { accion, empacadorId, etiquetadorId, quienRetira, fechaHoraRetiro, costoFlete } = body;

        const venta = await Venta.findByPk(id, {
            include: [{ model: VentaDetalle, as: 'detalles' }],
            transaction: t
        });

        if (!venta) {
            await t.rollback();
            return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 });
        }

        if (rol === 'vendedor' && !ACCIONES_VENDEDOR.includes(accion)) {
            await t.rollback();
            return NextResponse.json({ error: 'Tu rol solo permite firmar tus tareas de empaque y etiquetado' }, { status: 403 });
        }

        const cerrada = ['Cancelado', 'Completado'].includes(venta.statusDespacho);
        if (venta.revisionStock === 'PENDIENTE' && ['ASIGNAR', 'EMPACAR', 'FIRMAR_EMPAQUE', 'FIRMAR_ETIQUETADO', 'DESPACHAR', 'ABONAR'].includes(accion)) {
            throw new ErrorLogistica('Este pedido está en revisión de existencias: confírmalo (o ajústalo) antes de continuar', 409);
        }

        // Número de control de la factura (dato fiscal para el libro de ventas)
        if (accion === 'NUMERO_CONTROL') {
            if (venta.tipoDocumento !== 'FACTURA') throw new ErrorLogistica('Solo las facturas llevan número de control');
            venta.numeroControl = String(body.numeroControl || '').trim().slice(0, 30) || null;
            await venta.save({ transaction: t });
            await t.commit();
            return NextResponse.json({ success: true });
        }

        // ==========================================================
        // 📋 ASIGNAR: la administración indica quién empaca y quién etiqueta (no toca el stock)
        // ==========================================================
        if (accion === 'ASIGNAR') {
            if (cerrada) throw new ErrorLogistica('Este pedido ya está cerrado', 409);
            if (venta.empacadoAt && Number(empacadorId) !== Number(venta.empacadorId)) throw new ErrorLogistica('El empaque ya fue firmado: no se puede cambiar al empacador', 409);
            if (venta.etiquetadoAt && Number(etiquetadorId) !== Number(venta.etiquetadorId)) throw new ErrorLogistica('El etiquetado ya fue firmado: no se puede cambiar al etiquetador', 409);
            if (!empacadorId || !etiquetadorId) throw new ErrorLogistica('Indica quién empaca y quién etiqueta');

            await validarPersonal([empacadorId, etiquetadorId], t);
            const cambioEmpacador = Number(venta.empacadorId) !== Number(empacadorId);
            const cambioEtiquetador = Number(venta.etiquetadorId) !== Number(etiquetadorId);
            // La evidencia (renglones verificados y fotos) es de una sola persona: si cambia el empacador se empieza de cero
            if (cambioEmpacador && venta.empacadorId) await reiniciarEmpaque(venta, t);
            venta.empacadorId = Number(empacadorId);
            venta.etiquetadorId = Number(etiquetadorId);
            venta.asignadoAt = new Date();
            await venta.save({ transaction: t });
            await t.commit();

            try {
                const url = `/superuser/ventas/${venta.id}`;
                if (cambioEmpacador) await notificarUsuario(Number(empacadorId), { title: 'Tienes un pedido por empacar 📦', body: `Pedido ${venta.numeroDocumento}: empácalo paso a paso desde tu teléfono; al terminar quedas como responsable.`, url: `${url}/empacar`, tipo: 'Info' });
                if (cambioEtiquetador) await notificarUsuario(Number(etiquetadorId), { title: 'Tienes un pedido por etiquetar 🏷️', body: `Pedido ${venta.numeroDocumento}: etiqueta las cajas cuando estén empacadas y firma.`, url, tipo: 'Info' });
            } catch (e) {
                console.error('No se pudo notificar la asignación:', e.message);
            }
            return NextResponse.json({ success: true, message: 'Personal asignado' });
        }

        // ==========================================================
        // ✍️ FIRMAR_EMPAQUE: solo el empacador asignado. Descuenta el stock (mayor) y deja constancia con fecha y hora
        // ==========================================================
        if (accion === 'FIRMAR_EMPAQUE') {
            if (Number(venta.empacadorId) !== yo) throw new ErrorLogistica('Este empaque no está asignado a ti', 403);
            if (venta.empacadoAt) throw new ErrorLogistica('Ya firmaste este empaque', 409);
            if (cerrada) throw new ErrorLogistica('Este pedido ya está cerrado', 409);

            const faltantes = await faltantesDeEmpaque(venta, t);
            if (faltantes.length) throw new ErrorLogistica(faltantes[0], 409);

            await ejecutarEmpaque(venta, t, yo);
            venta.statusDespacho = 'Empacado';
            venta.empacadoAt = new Date();
            venta.empaqueVerificado = true;
            await venta.save({ transaction: t });
            await t.commit();

            // Solo quedan las dos fotos definitivas: las repetidas se borran del Blob (si falla, el cron lo reintenta al vencer el plazo)
            try {
                await borrarFotosSobrantes(venta);
            } catch (e) {
                console.error('No se pudieron borrar las fotos repetidas:', e.message);
            }
            return NextResponse.json({ success: true, message: 'Empaque firmado' });
        }

        // ==========================================================
        // 🏷️ FIRMAR_ETIQUETADO: solo el etiquetador asignado, y después de que el empaque esté firmado
        // ==========================================================
        if (accion === 'FIRMAR_ETIQUETADO') {
            if (Number(venta.etiquetadorId) !== yo) throw new ErrorLogistica('Este etiquetado no está asignado a ti', 403);
            if (venta.etiquetadoAt) throw new ErrorLogistica('Ya firmaste este etiquetado', 409);
            if (cerrada) throw new ErrorLogistica('Este pedido ya está cerrado', 409);
            if (!venta.empacadoAt) throw new ErrorLogistica('Primero debe firmarse el empaque', 409);

            venta.etiquetadoAt = new Date();
            await venta.save({ transaction: t });
            await t.commit();

            try {
                await notificarCabezas({ title: 'Pedido listo para despachar ✅', body: `El pedido ${venta.numeroDocumento} ya está empacado y etiquetado.`, url: `/superuser/ventas/${venta.id}` });
            } catch (e) {
                console.error('No se pudo avisar a administración:', e.message);
            }
            return NextResponse.json({ success: true, message: 'Etiquetado firmado' });
        }

        // ==========================================================
        // 🔥 EMPACAR (atajo de administración): asigna y empaca en un solo paso. El empaque queda a nombre del empacador indicado.
        // ==========================================================
        if (accion === 'EMPACAR') {
            if (cerrada) throw new ErrorLogistica('Este pedido ya está cerrado', 409);
            if (venta.empacadoAt) throw new ErrorLogistica('Este pedido ya fue empacado', 409);
            if (!empacadorId || !etiquetadorId) throw new ErrorLogistica('Indica quién empaca y quién etiqueta');
            await validarPersonal([empacadorId, etiquetadorId], t);

            await ejecutarEmpaque(venta, t, empacadorId);
            venta.statusDespacho = 'Empacado';
            venta.empacadorId = Number(empacadorId);
            venta.etiquetadorId = Number(etiquetadorId);
            venta.asignadoAt = venta.asignadoAt || new Date();
            venta.empacadoAt = new Date();
            await venta.save({ transaction: t });

            await t.commit();
            return NextResponse.json({ success: true, message: 'Caja armada, personal asignado y stock descontado' });
        }

        // ==========================================================
        // 🚚 DATOS_ENVIO: quién retira el pedido (empresa de transporte o chofer) y el flete que se le cobra al cliente.
        // Se puede fijar en cualquier momento antes del despacho. El flete se suma al total de la factura (sin IVA) y a lo que debe el cliente.
        // ==========================================================
        if (accion === 'DATOS_ENVIO') {
            if (cerrada) throw new ErrorLogistica('Este pedido ya está cerrado', 409);
            if (venta.tipoEntrega === 'pickup') throw new ErrorLogistica('Este pedido es retiro en tienda: no lleva transporte ni flete', 409);

            const flete = Math.round(Number(body.costoFlete ?? venta.costoFlete ?? 0) * 100) / 100;
            if (!Number.isFinite(flete) || flete < 0) throw new ErrorLogistica('El flete debe ser un monto igual o mayor a 0');
            const actual = Number(venta.costoFlete) || 0;

            if (flete !== actual) {
                if (venta.statusPago === 'Pagado') throw new ErrorLogistica('Esta factura ya está pagada: el flete no se puede cambiar', 409);
                venta.costoFlete = flete;
                venta.totalFinal = Math.round((Number(venta.subtotal) + Number(venta.montoIva) + flete) * 100) / 100;
                const cxc = await CuentaPorCobrar.findOne({ where: { ventaId: venta.id }, transaction: t });
                if (cxc) { cxc.montoTotal = venta.totalFinal; await cxc.save({ transaction: t }); }
                await venta.save({ transaction: t });
                await recalcularCobro(venta, t); // el saldo vuelve a ser total - abonos (retención incluida)
            }
            venta.quienRetira = String(body.quienRetira ?? '').trim().slice(0, 120) || null;
            await venta.save({ transaction: t });
            await t.commit();
            return NextResponse.json({ success: true, totalFinal: venta.totalFinal });
        }

        // ==========================================================
        // 🔥 ACCIÓN 2: DESPACHAR (Chofer, Fecha/Hora, y Gasto de Flete)
        // ==========================================================
        if (accion === 'DESPACHAR') {
            if (venta.statusDespacho === 'Completado') throw new ErrorLogistica('Este pedido ya fue despachado', 409);
            if (venta.statusDespacho === 'Cancelado') throw new ErrorLogistica('Este pedido está cancelado', 409);
            venta.statusDespacho = 'Completado';
            venta.quienRetira = quienRetira;
            venta.fechaHoraRetiro = fechaHoraRetiro ? new Date(fechaHoraRetiro) : new Date();
            // El flete que se le cobra al cliente (venta.costoFlete) se fija en DATOS_ENVIO; aquí solo se asienta lo que pagó la empresa
            await venta.save({ transaction: t });

            // Marcamos las salidas de inventario como Entregadas
            await SalidaInventario.update(
                { estado: 'Entregada' },
                { where: { ventaId: venta.id }, transaction: t }
            );

            // GESTIÓN FINANCIERA DEL FLETE (GASTO)
            const fleteNum = Number(costoFlete) || 0;
            if (fleteNum > 0) {
                let catFlete = await CategoriaFinanciera.findOne({ where: { nombre: 'Gasto por Fletes' }, transaction: t });
                if (!catFlete) catFlete = await CategoriaFinanciera.create({ nombre: 'Gasto por Fletes', tipo: 'GASTO' }, { transaction: t });

                const tasa = Number(venta.tasaCambio) || 1.00;
                let montoUsd = 0;
                let montoVes = 0;

                if (venta.moneda === 'USD') {
                    montoUsd = fleteNum;
                    montoVes = aBolivares(fleteNum, tasa);
                } else {
                    montoVes = fleteNum;
                    montoUsd = tasa > 0 ? aDolares(fleteNum, tasa) : 0;
                }

                await MovimientoFinanciero.create({
                    tipo: 'GASTO',
                    fecha: new Date(),
                    metodoPago: 'Efectivo / Transferencia',
                    referencia: `Flete Despacho ${venta.numeroDocumento}`,
                    montoUsd: Number(montoUsd.toFixed(2)),
                    tasaBcvAplicada: tasa,
                    montoVes: Number(montoVes.toFixed(2)),
                    descripcion: `Pago de flete a chofer (${quienRetira}) por despacho de venta ${venta.numeroDocumento}`,
                    categoriaId: catFlete.id,
                    ventaId: venta.id
                }, { transaction: t });
            }

            await t.commit();
            return NextResponse.json({ success: true, message: 'Despacho registrado y gasto de flete asentado' });
        }

        // ==========================================================
        // 🔥 ACCIÓN 3: ABONAR (Pagos parciales o totales de CxC)
        // ==========================================================
        if (accion === 'ABONAR') {
            const { montoAbono, metodoPago, referencia, monedaAbono, tasaCambioAbono } = body;

            // Mismo registro que usan el vínculo de pagos móviles y el pago del cliente B2B: baja el saldo y asienta el ingreso
            // repartido entre "Ingreso por Cobranza" e "IVA Recaudado"
            try {
                await registrarAbono({
                    venta, monto: montoAbono, moneda: monedaAbono,
                    tasa: Number(tasaCambioAbono) > 0 ? Number(tasaCambioAbono) : Number(venta.tasaCambio),
                    metodoPago, referencia, transaction: t,
                });
            } catch (e) {
                if (e instanceof ErrorAbono) throw new ErrorLogistica(e.message, e.status);
                throw e;
            }

            await t.commit();
            return NextResponse.json({ success: true, message: 'Abono registrado y saldo actualizado exitosamente.' });
        }

        await t.rollback();
        return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });

    } catch (error) {
        if (!t.finished) await t.rollback();
        if (error instanceof ErrorLogistica) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('Error procesando PUT de venta:', error);
        return NextResponse.json({ error: 'Error interno', detalle: error.message }, { status: 500 });
    }
}

// ==========================================
// 🗑️ DELETE: ELIMINAR ÚLTIMA VENTA Y REVERTIR
// ==========================================
export async function DELETE(request, { params }) {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;
    if (rolDe(acceso.sesion) === 'vendedor') return NextResponse.json({ error: 'Tu rol no permite eliminar ventas' }, { status: 403 });

    const t = await sequelize.transaction();

    try {
        const { id } = await params;

        const ventaAMatar = await Venta.findByPk(id, {
            include: [{ model: VentaDetalle, as: 'detalles' }],
            transaction: t
        });

        if (!ventaAMatar) {
            await t.rollback();
            return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 });
        }

        // Regla de oro: Verificar si es la última venta registrada
        const ultimaVenta = await Venta.findOne({
            order: [['createdAt', 'DESC']],
            transaction: t
        });

        if (!ultimaVenta || ultimaVenta.id !== ventaAMatar.id) {
            await t.rollback();
            return NextResponse.json({
                error: 'Seguridad del Sistema: Solo se permite eliminar la última venta registrada.'
            }, { status: 400 });
        }

        // Elimina la venta con TODO lo que cuelga de ella: inventario, notas de crédito y débito, retenciones, abonos, cuenta por cobrar,
        // movimientos, evidencia de empaque y notificaciones; libera el pago móvil enlazado y retrocede los correlativos
        const { archivos, controles, resumen } = await eliminarVenta({ venta: ventaAMatar, transaction: t });

        await t.commit();

        // Archivos del Blob (comprobantes de retención y fotos de empaque): fuera de la transacción para no retenerla durante la red
        let archivosBorrados = 0;
        try {
            archivosBorrados = await borrarArchivosDeVenta(ventaAMatar.numeroDocumento, archivos);
        } catch (e) {
            console.error('No se pudieron borrar los archivos del Blob de la venta eliminada:', archivos, e.message);
        }

        const partes = [];
        if (resumen.notas) partes.push(`${resumen.notas} nota(s) de crédito o débito`);
        if (resumen.retenciones) partes.push('su retención de IVA');
        if (archivosBorrados) partes.push(`${archivosBorrados} archivo(s) del Blob`);
        return NextResponse.json({
            success: true,
            message: `La última venta fue eliminada con todo su rastro${partes.length ? ` (${partes.join(', ')})` : ''} y los correlativos retrocedieron.${controles.length ? ` Los números de control ya asignados (${controles.join(', ')}) no retroceden solos: ajústalos en Numeración fiscal si esa forma no se gastó.` : ''}`,
            ...resumen, archivosBorrados, controles,
        }, { status: 200 });

    } catch (error) {
        if (!t.finished) await t.rollback();
        console.error('Error al eliminar la última venta:', error);
        return NextResponse.json({ error: 'Error interno al procesar la eliminación', detalle: error.message }, { status: 500 });
    }
}