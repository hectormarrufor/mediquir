import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import sequelize from '@/sequelize'; // 🔥 IMPORTACIÓN CORRECTA DE LA INSTANCIA DE DB
import db from '@/models';
const { Venta, VentaDetalle, Producto, Marca, Correlativo, CategoriaFinanciera, MovimientoFinanciero, Cliente, User, Empleado, SalidaInventario } = db;
import { notificarTodos } from '@/app/handlers/notificar';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const fechaInicio = searchParams.get('fechaInicio');
        const fechaFin = searchParams.get('fechaFin');

        let whereClause = {};

        if (fechaInicio && fechaFin) {
            whereClause.createdAt = {
                [Op.between]: [`${fechaInicio} 00:00:00`, `${fechaFin} 23:59:59`]
            };
        } else if (fechaInicio) {
            whereClause.createdAt = {
                [Op.between]: [`${fechaInicio} 00:00:00`, `${fechaInicio} 23:59:59`]
            };
        }

        const ventas = await Venta.findAll({
            where: whereClause,
            include: [
                {
                    model: VentaDetalle,
                    as: 'detalles',
                    include: [{
                        model: Producto,
                        as: 'producto',
                        attributes: ['nombre', 'codigo', 'imagen'],
                        include: [{ model: Marca, as: 'marca', attributes: ['nombre', 'imagen'] }]
                    }]
                },
                {
                    model: Cliente,
                    as: 'cliente',
                    attributes: ['nombre', 'identificacion']
                },
                {
                    model: User,
                    as: 'vendedor',
                    attributes: ['id', 'user'],
                    include: [{
                        model: Empleado,
                        as: 'empleado',
                        attributes: ['nombre', 'apellido']
                    }]
                },
                {
                    model: MovimientoFinanciero,
                    as: 'movimientos'
                }
            ],
            order: [['createdAt', 'DESC']]
        });

        return NextResponse.json(ventas);
    } catch (error) {
        console.error('Error obteniendo ventas:', error);
        return NextResponse.json({ error: 'Error al obtener el registro de ventas' }, { status: 500 });
    }
}

export async function POST(request) {
    const t = await sequelize.transaction();

    try {
        const body = await request.json();
        const {
            tipoVenta, tipoDocumento, clienteId, moneda, tasaCambio,
            condicionPago, quienRetira, costoFlete, subtotal, montoIva,
            totalFinal, detalles, metodoPago, referencia,
            numeroDocumentoManual,
            vendedorId
        } = body;

        if (!detalles || detalles.length === 0) {
            await t.rollback();
            return NextResponse.json({ error: 'El carrito está vacío' }, { status: 400 });
        }

        // --- 1. CORRELATIVO ---
        let prefijo = tipoDocumento === 'FACTURA' ? 'F' : (tipoDocumento === 'NOTA_ENTREGA' ? 'NE' : 'V');
        let corr = await Correlativo.findOne({ where: { prefijo }, transaction: t });

        if (!corr) {
            corr = await Correlativo.create({ prefijo, siguienteNumero: 1, cerosRelleno: 5 }, { transaction: t });
        }

        const numeroExtraido = parseInt(numeroDocumentoManual.replace(/\D/g, ''), 10);
        const numeroBase = (!isNaN(numeroExtraido) && numeroExtraido > 0) ? numeroExtraido : corr.siguienteNumero;
        corr.siguienteNumero = numeroBase + 1;
        await corr.save({ transaction: t });

        const numeroDocumento = numeroDocumentoManual;

        if (condicionPago === 'Credito') {
            let fechaVencimiento = new Date();
            fechaVencimiento.setDate(fechaVencimiento.getDate() + 15); // O los días de crédito correspondientes

            await CuentaPorCobrar.create({
                clienteId: clienteId || null,
                ventaId: nuevaVenta.id,
                montoTotal: Number(totalFinal),
                saldoPendiente: Number(totalFinal),
                moneda,
                tasaCambio: Number(tasaCambio) || 1.00,
                fechaVencimiento,
                estado: 'Pendiente'
            }, { transaction: t });
        }

        // --- 3. CREAR VENTA ---
        const nuevaVenta = await Venta.create({
            clienteId: clienteId || null,
            vendedorId: vendedorId || null,
            tipoVenta, tipoDocumento, numeroDocumento,
            statusDespacho: tipoVenta === 'DETAL' ? 'Completado' : 'Pendiente',
            moneda, tasaCambio: Number(tasaCambio) || 1.00,
            condicionPago, statusPago: condicionPago === 'Contado' ? 'Pagado' : 'Pendiente',
            fechaVencimiento, quienRetira: quienRetira || null,
            costoFlete: Number(costoFlete) || 0.00,
            subtotal: Number(subtotal), montoIva: Number(montoIva), totalFinal: Number(totalFinal)
        }, { transaction: t });

        // --- 4. DETALLES E INVENTARIO ---
        for (const item of detalles) {
            await VentaDetalle.create({
                ventaId: nuevaVenta.id,
                productoId: item.isFicticio ? null : item.productoId,
                isFicticio: item.isFicticio || false,
                nombreFicticio: item.isFicticio ? item.nombreFicticio : null,
                aplicaIva: item.aplicaIva,
                afectaInventario: item.afectaInventario,
                cantidad: Number(item.cantidad),
                precioUnitario: Number(item.precioUnitario),
                subtotal: Number(item.subtotal)
            }, { transaction: t });

            // Si no es ficticio y afecta inventario...
            if (!item.isFicticio && item.afectaInventario !== false) {
                const productoDB = await Producto.findByPk(item.productoId, { transaction: t });
                if (productoDB) {
                    // Si es detal, descuenta stock de inmediato. Si es mayor, se descontará al armar la caja, pero generamos la salida inicial.
                    if (tipoVenta === 'DETAL') {
                        productoDB.stockAlmacen = (Number(productoDB.stockAlmacen) || 0) - Number(item.cantidad);
                    }
                    productoDB.nroVentas = (Number(productoDB.nroVentas) || 0) + Number(item.cantidad);
                    await productoDB.save({ transaction: t });

                    // Registro histórico de salida
                    await SalidaInventario.create({
                        ventaId: nuevaVenta.id,
                        productoId: productoDB.id,
                        cantidad: Number(item.cantidad),
                        costoAlMomento: Number(productoDB.costoUsd) || 0,
                        justificacion: `Venta ${numeroDocumento}`,
                        estado: tipoVenta === 'DETAL' ? 'Entregada' : 'Pendiente',
                        solicitadoPorId: vendedorId || null
                    }, { transaction: t });
                }
            }
        }

        // --- 5. FINANZAS CONTADO (SEPARANDO TU DINERO DEL IVA DEL SENIAT) ---
        if (condicionPago === 'Contado') {
            // A. INGRESO REAL (Subtotal)
            let catVentas = await CategoriaFinanciera.findOne({ where: { nombre: 'Ingresos por Ventas' }, transaction: t });
            if (!catVentas) catVentas = await CategoriaFinanciera.create({ nombre: 'Ingresos por Ventas', tipo: 'INGRESO' }, { transaction: t });

            const mUsdSub = moneda === 'USD' ? Number(subtotal) : Number(subtotal) / Number(tasaCambio);
            const mBsSub = moneda === 'BS' ? Number(subtotal) : Number(subtotal) * Number(tasaCambio);

            await MovimientoFinanciero.create({
                tipo: 'INGRESO', fecha: new Date(), metodoPago, referencia,
                montoUsd: mUsdSub, tasaBcvAplicada: Number(tasaCambio), montoVes: mBsSub,
                descripcion: `Venta ${numeroDocumento} (Subtotal)`, categoriaId: catVentas.id, ventaId: nuevaVenta.id
            }, { transaction: t });

            // B. IMPUESTO DEL ESTADO (IVA Recaudado - No es tu ganancia)
            if (Number(montoIva) > 0) {
                let catIva = await CategoriaFinanciera.findOne({ where: { nombre: 'IVA Recaudado' }, transaction: t });
                if (!catIva) catIva = await CategoriaFinanciera.create({ nombre: 'IVA Recaudado', tipo: 'INGRESO' }, { transaction: t });

                const mUsdIva = moneda === 'USD' ? Number(montoIva) : Number(montoIva) / Number(tasaCambio);
                const mBsIva = moneda === 'BS' ? Number(montoIva) : Number(montoIva) * Number(tasaCambio);

                await MovimientoFinanciero.create({
                    tipo: 'INGRESO', fecha: new Date(), metodoPago, referencia,
                    montoUsd: mUsdIva, tasaBcvAplicada: Number(tasaCambio), montoVes: mBsIva,
                    descripcion: `IVA de Venta ${numeroDocumento} (Impuesto SENIAT)`, categoriaId: catIva.id, ventaId: nuevaVenta.id
                }, { transaction: t });
            }
        }

        await t.commit();

        // --- 6. NOTIFICACIÓN PUSH AL MAYOR ---
        if (tipoVenta === 'MAYOR') {
            try {
                const clienteDB = await Cliente.findByPk(clienteId);
                const nombreCliente = clienteDB ? (clienteDB.nombre || clienteDB.identificacion) : 'Cliente Desconocido';

                let nombreVendedor = 'Administración';
                if (vendedorId) {
                    const usuarioVendedor = await User.findByPk(vendedorId, { include: [{ model: Empleado, as: 'empleado' }] });
                    if (usuarioVendedor?.empleado) {
                        nombreVendedor = `${usuarioVendedor.empleado.nombre} ${usuarioVendedor.empleado.apellido}`;
                    } else if (usuarioVendedor) {
                        nombreVendedor = usuarioVendedor.user;
                    }
                }

                await notificarTodos({
                    title: 'Nuevo Pedido Mayorista 📦',
                    body: `Se ha creado un nuevo pedido de ${nombreCliente} por ${nombreVendedor}.`,
                    url: `/superuser/ventas`,
                    tipo: 'Info'
                });
            } catch (notifError) {
                console.error('Error enviando notificación Push:', notifError);
            }
        }

        return NextResponse.json({ success: true, message: 'Venta registrada', numeroDocumento, ventaId: nuevaVenta.id }, { status: 201 });

    } catch (error) {
        if (!t.finished) await t.rollback();
        console.error('Error procesando venta:', error);
        return NextResponse.json({ error: 'Error interno', detalle: error.message }, { status: 500 });
    }
}