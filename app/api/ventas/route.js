import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import db from '@/models';
import { notificarTodos } from '@/app/handlers/notificar';
const { Venta, VentaDetalle, Producto, Marca, Correlativo, CategoriaFinanciera, MovimientoFinanciero, Cliente, User, Empleado, sequelize } = db;

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const fechaInicio = searchParams.get('fechaInicio');
        const fechaFin = searchParams.get('fechaFin');

        let whereClause = {};

        // 🔥 FILTRADO INTELIGENTE POR RANGO DE FECHAS EN EL SERVIDOR 🔥
        if (fechaInicio && fechaFin) {
            whereClause.createdAt = {
                [Op.between]: [`${fechaInicio} 00:00:00`, `${fechaFin} 23:59:59`]
            };
        } else if (fechaInicio) {
            // Si por alguna razón solo envían inicio, filtra ese único día
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
                    model: User, // O el modelo que uses para los usuarios
                    as: 'vendedor', // El alias que le hayas puesto en models/index.js
                    attributes: ['id', 'user'],
                    include: [{
                        model: Empleado,
                        as: 'empleado',
                        attributes: ['nombre', 'apellido'] // Para traernos el nombre real
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
            vendedorId // 🔥 RECIBIMOS EL ID DEL USUARIO QUE ESTÁ HACIENDO LA VENTA
        } = body;

        if (!detalles || detalles.length === 0) {
            await t.rollback();
            return NextResponse.json({ error: 'El carrito está vacío' }, { status: 400 });
        }

        // --- 1. GESTIÓN INTELIGENTE DEL CORRELATIVO ---
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

        // --- 2. CÁLCULO DE VENCIMIENTO ---
        let fechaVencimiento = null;
        if (condicionPago === 'Credito') {
            fechaVencimiento = new Date();
            fechaVencimiento.setDate(fechaVencimiento.getDate() + 15);
        }

        // --- 3. CREAR LA VENTA ---
        const nuevaVenta = await Venta.create({
            clienteId: clienteId || null,
            vendedorId: vendedorId || null, // 🔥 Guardamos el ID del usuario que hace la venta
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
                productoId: item.productoId,
                cantidad: Number(item.cantidad),
                precioUnitario: Number(item.precioUnitario),
                subtotal: Number(item.subtotal)
            }, { transaction: t });

            const productoDB = await Producto.findByPk(item.productoId, { transaction: t });
            if (productoDB) {
                productoDB.stockAlmacen = (Number(productoDB.stockAlmacen) || 0) - Number(item.cantidad);
                productoDB.nroVentas = (Number(productoDB.nroVentas) || 0) + Number(item.cantidad);
                await productoDB.save({ transaction: t });
            }
        }

        // --- 5. FINANZAS (SOLO CONTADO) ---
        if (condicionPago === 'Contado') {
            let catVentas = await CategoriaFinanciera.findOne({ where: { nombre: 'Ingresos por Ventas' }, transaction: t });
            if (!catVentas) catVentas = await CategoriaFinanciera.create({ nombre: 'Ingresos por Ventas', tipo: 'INGRESO' }, { transaction: t });

            const mUsdSubtotal = moneda === 'USD' ? Number(subtotal) : Number(subtotal) / Number(tasaCambio);
            const mBsSubtotal = moneda === 'BS' ? Number(subtotal) : Number(subtotal) * Number(tasaCambio);

            await MovimientoFinanciero.create({
                tipo: 'INGRESO', fecha: new Date(), metodoPago, referencia,
                montoUsd: mUsdSubtotal, tasaBcvAplicada: Number(tasaCambio), montoVes: mBsSubtotal,
                descripcion: `Venta ${numeroDocumento}`, categoriaId: catVentas.id, ventaId: nuevaVenta.id
            }, { transaction: t });

            if (Number(montoIva) > 0) {
                let catIva = await CategoriaFinanciera.findOne({ where: { nombre: 'IVA Recaudado' }, transaction: t });
                if (!catIva) catIva = await CategoriaFinanciera.create({ nombre: 'IVA Recaudado', tipo: 'INGRESO' }, { transaction: t });

                const mUsdIva = moneda === 'USD' ? Number(montoIva) : Number(montoIva) / Number(tasaCambio);
                const mBsIva = moneda === 'BS' ? Number(montoIva) : Number(montoIva) * Number(tasaCambio);

                await MovimientoFinanciero.create({
                    tipo: 'INGRESO', fecha: new Date(), metodoPago, referencia,
                    montoUsd: mUsdIva, tasaBcvAplicada: Number(tasaCambio), montoVes: mBsIva,
                    descripcion: `IVA de Venta ${numeroDocumento}`, categoriaId: catIva.id, ventaId: nuevaVenta.id
                }, { transaction: t });
            }
        }
       


        // COMITEAMOS LA TRANSACCIÓN ANTES DE NOTIFICAR (Para asegurar que la venta exista)
        await t.commit();

        // --- 6. 🔥 NOTIFICACIÓN PUSH SI ES VENTA AL MAYOR 🔥 ---
        if (tipoVenta === 'MAYOR') {
            try {
                // Buscamos el nombre del cliente
                const clienteDB = await Cliente.findByPk(clienteId);
                const nombreCliente = clienteDB ? (clienteDB.nombre || clienteDB.identificacion) : 'Cliente Desconocido';

                // Buscamos el nombre del empleado que está haciendo la venta
                let nombreVendedor = 'Administración';
                if (vendedorId) {
                    const usuarioVendedor = await User.findByPk(vendedorId, {
                        include: [{ model: Empleado, as: 'empleado' }]
                    });
                    if (usuarioVendedor && usuarioVendedor.empleado) {
                        nombreVendedor = `${usuarioVendedor.empleado.nombre} ${usuarioVendedor.empleado.apellido}`;
                    } else if (usuarioVendedor) {
                        nombreVendedor = usuarioVendedor.user; // Si no tiene empleado, usamos su nombre de usuario
                    }
                }

                // Disparamos la notificación
                await notificarTodos({
                    title: 'Nuevo Pedido Mayorista 📦',
                    body: `Se ha creado un nuevo pedido de ${nombreCliente} por ${nombreVendedor}.`,
                    url: `/superuser/ventas`, // Puedes poner la ruta que usarás para ver la lista de ventas
                    tipo: 'Info'
                });
            } catch (notifError) {
                await t.rollback(); // 🔥 ROLLBACK SI FALLA LA NOTIFICACIÓN
                console.error('La venta se procesó pero falló la notificación Push:', notifError);
            }
        }

        return NextResponse.json({ success: true, message: 'Venta registrada', numeroDocumento, ventaId: nuevaVenta.id }, { status: 201 });

    } catch (error) {
        if (!t.finished) await t.rollback();
        console.error('Error procesando venta:', error);
        return NextResponse.json({ error: 'Error interno', detalle: error.message }, { status: 500 });
    }
}