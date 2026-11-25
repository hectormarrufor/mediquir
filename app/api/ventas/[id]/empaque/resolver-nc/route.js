import { NextResponse } from 'next/server';
import db from '@/models';
import { requerirStaff } from '@/app/api/inventario/_lib';
import { rolDe } from '@/app/constants/roles';
import { entregaDe } from '@/app/constants/presentaciones';
import { reiniciarEmpaque } from '@/app/api/ventas/_empaque';
import {
    asegurarColumnasEmpaqueNotas,
    analizarEmpaqueConNotas,
    detalleEfectivo,
} from '@/app/api/_lib/empaqueNotas';
import { notificarCabezas, notificarUsuario } from '@/app/handlers/notificar';

export const dynamic = 'force-dynamic';

const { sequelize, Venta, VentaDetalle, Producto, SalidaInventario, VentaEmpaqueItem } = db;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class ErrorResolucion extends Error {
    constructor(mensaje, status = 400) { super(mensaje); this.status = status; }
}

async function reintegrarUnidadesPendientes({ venta, analisis, transaction: t }) {
    if (venta.tipoVenta === 'ONLINE' || venta.tipoEntrega === 'sitio') return 0;
    let totalReintegrado = 0;
    for (const c of analisis.cambios) {
        if (c.isFicticio || c.afectaInventario === false || !c.productoId || c.devuelveInventarioPendiente <= 0) continue;
        const producto = await Producto.findByPk(c.productoId, { transaction: t, lock: t.LOCK.UPDATE });
        if (!producto) continue;
        if (producto.inventarioAuditado) {
            producto.stockAlmacen = Number(producto.stockAlmacen || 0) + c.devuelveInventarioPendiente;
        }
        producto.nroVentas = Math.max(0, (Number(producto.nroVentas) || 0) - c.devuelveInventarioPendiente);
        await producto.save({ transaction: t });
        totalReintegrado += c.devuelveInventarioPendiente;
    }
    return totalReintegrado;
}

async function actualizarSalidasPostAjuste({ ventaId, cambios, estadoPositivo, estadoCero, transaction: t }) {
    const porProducto = new Map();
    for (const c of cambios) {
        if (c.isFicticio || c.afectaInventario === false || !c.productoId) continue;
        const pid = Number(c.productoId);
        porProducto.set(pid, (porProducto.get(pid) || 0) + c.restante);
    }
    for (const [productoId, sumaRestante] of porProducto) {
        const salidas = await SalidaInventario.findAll({
            where: { ventaId, productoId },
            order: [['id', 'ASC']],
            transaction: t,
            lock: t.LOCK.UPDATE,
        });
        if (!salidas.length) continue;
        if (sumaRestante <= 0) {
            for (const s of salidas) {
                s.estado = estadoCero;
                if (estadoCero === 'Pendiente') s.despachadoPorId = null;
                await s.save({ transaction: t });
            }
        } else {
            const principal = salidas[0];
            principal.cantidad = sumaRestante;
            principal.estado = estadoPositivo;
            if (estadoPositivo === 'Pendiente') principal.despachadoPorId = null;
            await principal.save({ transaction: t });
            for (let i = 1; i < salidas.length; i++) {
                salidas[i].estado = estadoCero;
                await salidas[i].save({ transaction: t });
            }
        }
    }
}

export async function GET(_request, { params }) {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;
    try {
        await asegurarColumnasEmpaqueNotas();
        const { id } = await params;
        const where = UUID_REGEX.test(id) ? { id } : { numeroDocumento: id };
        const venta = await Venta.findOne({ where });
        if (!venta) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });

        const analisis = await analizarEmpaqueConNotas(venta.id);
        return NextResponse.json({
            venta: {
                id: venta.id,
                numeroDocumento: venta.numeroDocumento,
                statusDespacho: venta.statusDespacho,
                tipoEntrega: venta.tipoEntrega,
                quienRetira: venta.quienRetira || '',
                empacadoAt: venta.empacadoAt,
                empacadorId: venta.empacadorId,
            },
            analisis,
        });
    } catch (error) {
        console.error('Error consultando resolución de NC en empaque:', error);
        return NextResponse.json({ error: 'No se pudo consultar el ajuste de la caja' }, { status: 500 });
    }
}

export async function POST(request, { params }) {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;
    const yo = Number(acceso.sesion.id);
    const esVendedor = rolDe(acceso.sesion) === 'vendedor';

    await asegurarColumnasEmpaqueNotas();
    const t = await sequelize.transaction();
    let aviso = null;
    try {
        const { id } = await params;
        const body = await request.json();
        const { accion, observacion = '', reintegrarInventario = false, mantenerEmpacador = true } = body;
        if (!['DESARMAR_CAJA', 'AJUSTAR_CAJA', 'REEMPACAR', 'DESPACHAR_SIN_CAMBIOS'].includes(accion)) {
            throw new ErrorResolucion('Acción no válida');
        }

        const where = UUID_REGEX.test(id) ? { id } : { numeroDocumento: id };
        const venta = await Venta.findOne({ where, transaction: t, lock: t.LOCK.UPDATE });
        if (!venta) throw new ErrorResolucion('Documento no encontrado', 404);
        if (!venta.empacadoAt) throw new ErrorResolucion('Este pedido aún no se ha empacado', 409);
        if (['Completado', 'Cancelado'].includes(venta.statusDespacho)) {
            throw new ErrorResolucion('Este pedido ya fue despachado o cancelado', 409);
        }

        const analisis = await analizarEmpaqueConNotas(venta.id, t);
        if (!analisis?.tieneNc && analisis?.estadoEfectivo !== 'PENDIENTE') {
            throw new ErrorResolucion('Este pedido no tiene notas de crédito activas ni ajustes pendientes', 409);
        }

        const obsLimpia = String(observacion || '').trim().slice(0, 500);
        const snap = JSON.stringify({ notaIds: analisis.notas.map((n) => n.id), accion });

        if (accion === 'DESARMAR_CAJA') {
            if (!analisis.esAnulacionTotal && analisis.totalRestante > 0) {
                throw new ErrorResolucion('Solo se puede desarmar la caja por completo cuando la nota de crédito anula toda la mercancía', 409);
            }
            if (reintegrarInventario === true && analisis.devuelveInventarioPendienteTotal > 0) {
                await reintegrarUnidadesPendientes({ venta, analisis, transaction: t });
            }
            await SalidaInventario.update({ estado: 'Devuelta' }, { where: { ventaId: venta.id }, transaction: t });
            await sequelize.query(
                `UPDATE "Ventas"
                 SET "empaqueNcEstado" = 'DESARMADO',
                     "empaqueNcResueltoAt" = NOW(),
                     "empaqueNcResueltoPorId" = :yo,
                     "empaqueNcNota" = :nota,
                     "empaqueNcSnapshot" = CAST(:snap AS jsonb)
                 WHERE id = :id`,
                { replacements: { id: venta.id, yo, nota: obsLimpia || 'Caja desarmada por anulación total con NC', snap }, transaction: t },
            );
            aviso = {
                titulo: `Caja desarmada · ${venta.numeroDocumento}`,
                cuerpo: `Se desarmó la caja de ${venta.numeroDocumento} por nota de crédito total y salió de pendientes de despacho.`,
            };
        } else if (accion === 'AJUSTAR_CAJA') {
            if (analisis.totalRestante <= 0) {
                throw new ErrorResolucion('No quedan productos por entregar en este pedido: usa «Desarmar caja»', 409);
            }
            if (reintegrarInventario === true && analisis.devuelveInventarioPendienteTotal > 0) {
                await reintegrarUnidadesPendientes({ venta, analisis, transaction: t });
            }
            const detalles = await VentaDetalle.findAll({
                where: { ventaId: venta.id },
                include: [{ model: Producto, as: 'producto', attributes: ['id', 'presentacion', 'unidadesPorCaja', 'cajasPorBulto', 'unidadesPorBulto'] }],
                transaction: t,
            });
            const detPorId = new Map(detalles.map((d) => [d.id, d]));
            const items = await VentaEmpaqueItem.findAll({ where: { ventaId: venta.id }, transaction: t, lock: t.LOCK.UPDATE });
            const itemPorDet = new Map(items.map((it) => [it.ventaDetalleId, it]));

            for (const c of analisis.cambios) {
                const it = itemPorDet.get(c.detalleId);
                if (!it) continue;
                if (c.restante <= 0) {
                    await it.destroy({ transaction: t });
                    continue;
                }
                if (c.sacar > 0) {
                    const d = detPorId.get(c.detalleId);
                    const dEf = d ? detalleEfectivo(d, c.restante) : null;
                    const entrega = dEf && !dEf.isFicticio && dEf.producto ? entregaDe(dEf, dEf.producto) : [];
                    const conteo = { BULTO: 0, CAJA: 0, UNIDAD: 0 };
                    entrega.forEach((e) => { conteo[e.nivel] = e.cantidad; });
                    it.cantidadPedida = c.restante;
                    it.cantidadEmpacada = c.restante;
                    if (entrega.length) {
                        it.bultosEmpacados = conteo.BULTO;
                        it.cajasEmpacadas = conteo.CAJA;
                        it.sueltasEmpacadas = conteo.UNIDAD;
                    }
                    const notaAj = `Ajustado por NC (-${c.sacar} und)`;
                    it.observacion = it.observacion ? `${it.observacion} · ${notaAj}`.slice(0, 500) : notaAj;
                    await it.save({ transaction: t });
                }
            }

            await actualizarSalidasPostAjuste({
                ventaId: venta.id,
                cambios: analisis.cambios,
                estadoPositivo: 'Empacada',
                estadoCero: 'Devuelta',
                transaction: t,
            });

            await sequelize.query(
                `UPDATE "Ventas"
                 SET "empaqueNcEstado" = 'AJUSTADO',
                     "empaqueNcResueltoAt" = NOW(),
                     "empaqueNcResueltoPorId" = :yo,
                     "empaqueNcNota" = :nota,
                     "empaqueNcSnapshot" = CAST(:snap AS jsonb)
                 WHERE id = :id`,
                { replacements: { id: venta.id, yo, nota: obsLimpia || 'Caja ajustada retirando los productos acreditados por NC', snap }, transaction: t },
            );
            aviso = {
                titulo: `Caja ajustada · ${venta.numeroDocumento}`,
                cuerpo: `Se ajustó la caja de ${venta.numeroDocumento} (${analisis.totalRestante} und finales) y quedó lista para despachar.`,
            };
        } else if (accion === 'REEMPACAR') {
            if (analisis.totalRestante <= 0) {
                throw new ErrorResolucion('No quedan productos por entregar en este pedido: usa «Desarmar caja»', 409);
            }
            // Devuelve al stock exactamente las unidades que seguían descontadas (restante + lo no devuelto por NC)
            // para que al volver a firmar el empaque (`ejecutarEmpaque`) el stock final quede descontando solo `restante`.
            if (venta.tipoVenta !== 'ONLINE' && venta.tipoEntrega !== 'sitio') {
                for (const c of analisis.cambios) {
                    if (c.isFicticio || c.afectaInventario === false || !c.productoId) continue;
                    const devolver = c.restante + c.devuelveInventarioPendiente;
                    if (devolver <= 0) continue;
                    const producto = await Producto.findByPk(c.productoId, { transaction: t, lock: t.LOCK.UPDATE });
                    if (!producto) continue;
                    if (producto.inventarioAuditado) {
                        producto.stockAlmacen = Number(producto.stockAlmacen || 0) + devolver;
                    }
                    producto.nroVentas = Math.max(0, (Number(producto.nroVentas) || 0) - devolver);
                    await producto.save({ transaction: t });
                }
            }

            await actualizarSalidasPostAjuste({
                ventaId: venta.id,
                cambios: analisis.cambios,
                estadoPositivo: 'Pendiente',
                estadoCero: 'Cancelada',
                transaction: t,
            });

            const empacadorPrevio = venta.empacadorId;
            await reiniciarEmpaque(venta, t);
            venta.empacadoAt = null;
            venta.etiquetadoAt = null;
            venta.statusDespacho = 'Pendiente';
            if (mantenerEmpacador !== true) {
                venta.empacadorId = null;
                venta.etiquetadorId = null;
                venta.asignadoAt = null;
            }
            await venta.save({ transaction: t });

            await sequelize.query(
                `UPDATE "Ventas"
                 SET "empaqueNcEstado" = NULL,
                     "empaqueNcResueltoAt" = NOW(),
                     "empaqueNcResueltoPorId" = :yo,
                     "empaqueNcNota" = :nota,
                     "empaqueNcSnapshot" = NULL
                 WHERE id = :id`,
                { replacements: { id: venta.id, yo, nota: obsLimpia || 'Devuelto a pendientes por empacar para re-empaque tras NC' }, transaction: t },
            );

            aviso = {
                titulo: `Re-empaque requerido · ${venta.numeroDocumento}`,
                cuerpo: `El pedido ${venta.numeroDocumento} volvió a Pendientes por Empacar tras una nota de crédito (${analisis.totalRestante} und por empacar).`,
                empacadorId: mantenerEmpacador === true ? empacadorPrevio : null,
                urlEmpacador: `/superuser/ventas/${venta.id}/empacar`,
            };
        } else if (accion === 'DESPACHAR_SIN_CAMBIOS') {
            if (esVendedor) throw new ErrorResolucion('Solo administración puede autorizar despachar sin cambios físicos tras una nota de crédito', 403);
            if (obsLimpia.length < 5) throw new ErrorResolucion('Explica el motivo por el cual se despacha sin modificar la caja (mínimo 5 caracteres)');
            await sequelize.query(
                `UPDATE "Ventas"
                 SET "empaqueNcEstado" = 'DESPACHAR_IGUAL',
                     "empaqueNcResueltoAt" = NOW(),
                     "empaqueNcResueltoPorId" = :yo,
                     "empaqueNcNota" = :nota,
                     "empaqueNcSnapshot" = CAST(:snap AS jsonb)
                 WHERE id = :id`,
                { replacements: { id: venta.id, yo, nota: obsLimpia, snap }, transaction: t },
            );
            aviso = {
                titulo: `Despacho autorizado tras NC · ${venta.numeroDocumento}`,
                cuerpo: `Se autorizó despachar ${venta.numeroDocumento} sin modificar la caja. Motivo: ${obsLimpia}`,
            };
        }

        await t.commit();

        if (aviso) {
            notificarCabezas({
                title: aviso.titulo,
                body: aviso.cuerpo,
                url: `/superuser/ventas/${venta.id}`,
                tipo: 'Info',
            }).catch(() => null);
            if (aviso.empacadorId) {
                notificarUsuario(Number(aviso.empacadorId), {
                    title: aviso.titulo,
                    body: aviso.cuerpo,
                    url: aviso.urlEmpacador || `/superuser/ventas/${venta.id}`,
                    tipo: 'Alerta',
                }).catch(() => null);
            }
        }

        const analisisFinal = await analizarEmpaqueConNotas(venta.id);
        return NextResponse.json({ success: true, analisis: analisisFinal });
    } catch (error) {
        if (!t.finished) await t.rollback();
        if (error instanceof ErrorResolucion) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('Error resolviendo NC en empaque:', error);
        return NextResponse.json({ error: 'No se pudo procesar el ajuste del empaque' }, { status: 500 });
    }
}
