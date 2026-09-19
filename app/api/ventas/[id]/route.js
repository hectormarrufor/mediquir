import { NextResponse } from 'next/server';
import db, { PagoSms } from '@/models/index';
const { 
    sequelize, Venta, VentaDetalle, Producto, SalidaInventario, 
    MovimientoFinanciero, CategoriaFinanciera, Cliente, Marca, 
    Correlativo, Abono, CuentaPorCobrar, User, Empleado, GrupoEquivalencia
} = db;

import { aBolivares, aDolares } from '@/app/constants/facturacion';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ==========================================
// 🚀 GET: OBTENER DETALLE DE VENTA Y SU ENTORNO
// ==========================================
export async function GET(request, { params }) {
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
                        attributes: ['nombre', 'codigo', 'imagen'],
                        include: [{ model: Marca, as: 'marca', attributes: ['nombre', 'imagen'] }, {model: GrupoEquivalencia, as: 'grupoEquivalencia', attributes: ['nombre', 'imagen']}]
                    }]
                },
                { model: Cliente, as: 'cliente', attributes: ['nombre', 'identificacion', 'direccion'] },
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

        // ==========================================================
        // 🔥 ACCIÓN 1: EMPACAR (Asigna personal, descuenta stock y crea salidas)
        // ==========================================================
        if (accion === 'EMPACAR') {
            venta.statusDespacho = 'Empacado';
            venta.empacadorId = empacadorId || null;
            venta.etiquetadorId = etiquetadorId || null;
            await venta.save({ transaction: t });

            for (const item of venta.detalles) {
                if (!item.isFicticio && item.afectaInventario !== false) {
                    const productoDB = await Producto.findByPk(item.productoId, { transaction: t });
                    if (productoDB) {
                        productoDB.stockAlmacen = (Number(productoDB.stockAlmacen) || 0) - Number(item.cantidad);
                        productoDB.nroVentas = (Number(productoDB.nroVentas) || 0) + Number(item.cantidad);
                        await productoDB.save({ transaction: t });
                    }
                }
            }

            // Actualizamos el estado de la salida de inventario a 'Empacada'
            await SalidaInventario.update(
                { estado: 'Empacada', despachadoPorId: Number(empacadorId) || null },
                { where: { ventaId: venta.id }, transaction: t }
            );

            await t.commit();
            return NextResponse.json({ success: true, message: 'Caja armada, personal asignado y stock descontado' });
        }

        // ==========================================================
        // 🔥 ACCIÓN 2: DESPACHAR (Chofer, Fecha/Hora, y Gasto de Flete)
        // ==========================================================
        if (accion === 'DESPACHAR') {
            venta.statusDespacho = 'Completado';
            venta.quienRetira = quienRetira;
            venta.fechaHoraRetiro = fechaHoraRetiro ? new Date(fechaHoraRetiro) : new Date();
            venta.costoFlete = Number(costoFlete) || 0;
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

            // 1. Buscamos la Cuenta por Cobrar vinculada a esta venta
            const cxc = await CuentaPorCobrar.findOne({ where: { ventaId: venta.id }, transaction: t });

            if (!cxc) {
                await t.rollback();
                return NextResponse.json({ error: 'Esta venta no tiene una Cuenta por Cobrar asociada' }, { status: 404 });
            }

            if (cxc.estado === 'Pagado') {
                await t.rollback();
                return NextResponse.json({ error: 'Esta cuenta ya está pagada en su totalidad' }, { status: 400 });
            }

            // 2. Validaciones y conversión EXACTA (dólares <-> bolívares a la tasa del pago)
            const monto = Number(montoAbono);
            if (!(monto > 0)) { await t.rollback(); return NextResponse.json({ error: 'El monto del abono debe ser mayor a 0' }, { status: 400 }); }
            if (!['USD', 'BS'].includes(monedaAbono)) { await t.rollback(); return NextResponse.json({ error: 'Moneda del abono inválida' }, { status: 400 }); }
            const tasaAbono = Number(tasaCambioAbono) > 0 ? Number(tasaCambioAbono) : Number(venta.tasaCambio);
            if (!(tasaAbono > 0)) { await t.rollback(); return NextResponse.json({ error: 'Tasa de cambio inválida' }, { status: 400 }); }

            const abonoUsd = monedaAbono === 'USD' ? monto : aDolares(monto, tasaAbono);
            const abonoBs = monedaAbono === 'BS' ? monto : aBolivares(monto, tasaAbono);
            // A la moneda de la cuenta (la que se descuenta del saldo)
            const montoAbonadoHomologado = cxc.moneda === 'USD' ? abonoUsd : abonoBs;

            // 3. Abono histórico (con las columnas reales de la tabla Abonos)
            const nuevoAbono = await Abono.create({
                ventaId: venta.id,
                fechaPago: new Date(),
                metodoPago: metodoPago || 'No especificado',
                referencia: referencia || null,
                montoUsd: abonoUsd,
                montoVes: abonoBs,
                montoBs: abonoBs,
                tasaBcvAplicada: tasaAbono,
                tasaCambio: tasaAbono,
            }, { transaction: t });

            // 4. Actualizar saldos (sin decimales flotantes sobrantes)
            cxc.saldoPendiente = Math.max(0, Number((Number(cxc.saldoPendiente) - montoAbonadoHomologado).toFixed(2)));

            // Si se completó el pago, pasar a histórico
            if (cxc.saldoPendiente <= 0) {
                cxc.estado = 'Pagado';
                venta.statusPago = 'Pagado'; // Mutamos también la cabecera de la venta
                await venta.save({ transaction: t });
            }
            await cxc.save({ transaction: t });

            // 5. Asentar Ingreso Financiero
            let catAbono = await CategoriaFinanciera.findOne({ where: { nombre: 'Ingreso por Cobranza (CxC)' }, transaction: t });
            if (!catAbono) catAbono = await CategoriaFinanciera.create({ nombre: 'Ingreso por Cobranza (CxC)', tipo: 'INGRESO' }, { transaction: t });

            await MovimientoFinanciero.create({
                tipo: 'INGRESO',
                fecha: new Date(),
                metodoPago,
                referencia: referencia || `Abono CxC - Doc: ${venta.numeroDocumento}`,
                montoUsd: abonoUsd,
                tasaBcvAplicada: tasaAbono,
                montoVes: abonoBs,
                descripcion: `Abono a Cuenta por Cobrar - Venta ${venta.numeroDocumento}`,
                categoriaId: catAbono.id,
                ventaId: venta.id,
                abonoId: nuevoAbono.id
            }, { transaction: t });

            await t.commit();
            return NextResponse.json({ success: true, message: 'Abono registrado y saldo actualizado exitosamente.' });
        }

        await t.rollback();
        return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });

    } catch (error) {
        if (!t.finished) await t.rollback();
        console.error('Error procesando PUT de venta:', error);
        return NextResponse.json({ error: 'Error interno', detalle: error.message }, { status: 500 });
    }
}

// ==========================================
// 🗑️ DELETE: ELIMINAR ÚLTIMA VENTA Y REVERTIR
// ==========================================
export async function DELETE(request, { params }) {
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

        // Revertir inventario si afectaba almacén y la venta era DETAL, ONLINE o ya estaba empacada/completada
        for (const item of ventaAMatar.detalles) {
            if (!item.isFicticio && item.afectaInventario !== false) {
                if (
                    ventaAMatar.tipoVenta === 'DETAL' || 
                    ventaAMatar.tipoVenta === 'ONLINE' || // 👈 Añadido para incluir las ventas online
                    ventaAMatar.statusDespacho === 'Empacado' || 
                    ventaAMatar.statusDespacho === 'Completado'
                ) {
                    const producto = await Producto.findByPk(item.productoId, { transaction: t });
                    if (producto) {
                        producto.stockAlmacen = Number(producto.stockAlmacen) + Number(item.cantidad);
                        producto.nroVentas = Math.max(0, Number(producto.nroVentas) - Number(item.cantidad));
                        await producto.save({ transaction: t });
                    }
                }
            }
        }

        // 🔥 DESTRUIR EN CASCADA TODOS LOS REGISTROS ASOCIADOS (INCLUYENDO CUENTAS Y ABONOS) 🔥
        await MovimientoFinanciero.destroy({ where: { ventaId: id }, transaction: t });
        await SalidaInventario.destroy({ where: { ventaId: id }, transaction: t });
        await Abono.destroy({ where: { ventaId: id }, transaction: t });              // Novedad: Borra historial de pagos
        await CuentaPorCobrar.destroy({ where: { ventaId: id }, transaction: t });    // Novedad: Borra la cuenta por cobrar
        await VentaDetalle.destroy({ where: { ventaId: id }, transaction: t });

        // Destruir venta principal
        await ventaAMatar.destroy({ transaction: t });

        // Retroceder correlativo
        let prefijo = ventaAMatar.tipoDocumento === 'FACTURA' ? 'F' : (ventaAMatar.tipoDocumento === 'NOTA_ENTREGA' ? 'NE' : 'V');
        let corr = await Correlativo.findOne({ where: { prefijo }, transaction: t });

        if (corr && corr.siguienteNumero > 1) {
            corr.siguienteNumero -= 1;
            await corr.save({ transaction: t });
        }

        await t.commit();

        return NextResponse.json({
            success: true,
            message: 'La última venta fue eliminada (junto con su cuenta por cobrar y abonos) y el correlativo retrocedió.'
        }, { status: 200 });

    } catch (error) {
        if (!t.finished) await t.rollback();
        console.error('Error al eliminar la última venta:', error);
        return NextResponse.json({ error: 'Error interno al procesar la eliminación', detalle: error.message }, { status: 500 });
    }
}