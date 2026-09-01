// Ruta: app/api/checkout/procesar/route.js

import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { notificarTodos } from '@/app/handlers/notificar';
import { Cliente, Producto, PagoSms, Venta, VentaDetalle, Correlativo, MovimientoFinanciero, sequelize } from '@/models';

export async function POST(req) {
    const transaction = await sequelize.transaction();

    try {
        const body = await req.json();
        const {
            cart,
            cliente,
            metodoEntrega,
            pagoOnlinePickup,
            coordenadasGPS,
            costoDelivery,
            totalPagarUSD,
            totalImpuestos,
            tasaBcv,
            pagoMovil
        } = body;

        let pagoValidadoId = null;
        let pagoEncontrado = null; // Variable para almacenar el objeto del pago validado

        // Bandera central: ¿La compra requiere pago online previo?
        const requierePagoOnline = metodoEntrega === 'delivery' || Boolean(pagoOnlinePickup);

        // 1. GESTIÓN DEL CLIENTE (Búsqueda o creación automática)
        const [registroCliente] = await Cliente.findOrCreate({
            where: { identificacion: cliente.identificacion },
            defaults: {
                nombre: cliente.nombre,
                telefono: cliente.telefono,
                direccion: coordenadasGPS
                    ? `GPS: ${coordenadasGPS.lat}, ${coordenadasGPS.lng}`
                    : (cliente.direccion || 'Compra Web Online'),
                email: cliente.email || null,
            },
            transaction
        });

        // 2. PROCESAMIENTO DE ITEMS Y CÁLCULO FINANCIERO PREVIO
        let subtotalCalculado = 0;
        const detallesVentaData = [];

        for (const item of cart) {
            const productoObj = item.product || item;
            const cantidad = item.quantity || 1;
            const precioUnitario = Number(item.precioFinal ?? productoObj.precio ?? 0);
            const itemSubtotal = precioUnitario * cantidad;

            subtotalCalculado += itemSubtotal;

            const isFicticio = Boolean(productoObj.isFicticio);
            const afectaInventario = isFicticio ? false : (item.afectaInventario ?? true);

            const porcentajeIva = Number(productoObj.porcentajeIva || productoObj.porcentajeIvaProd || 0);
            const aplicaIva = isFicticio ? Boolean(productoObj.aplicaIva) : (porcentajeIva > 0);

            if (!isFicticio && productoObj.id && afectaInventario) {
                const productoBD = await Producto.findByPk(productoObj.id, { transaction });

                if (!productoBD || productoBD.stockAlmacen < cantidad) {
                    throw new Error(`Inventario insuficiente para el producto: ${productoObj.nombre || 'Desconocido'}`);
                }

                productoBD.stockAlmacen -= cantidad;
                await productoBD.save({ transaction });
            }

            detallesVentaData.push({
                productoId: isFicticio ? null : (productoObj.id || null),
                isFicticio: isFicticio,
                nombreFicticio: isFicticio ? (productoObj.nombre || 'Ítem Genérico') : null,
                cantidad: cantidad,
                precioUnitario: precioUnitario,
                subtotal: itemSubtotal,
                aplicaIva: aplicaIva,
                afectaInventario: afectaInventario
            });
        }

        const totalFinalCalculado = subtotalCalculado + Number(totalImpuestos) + Number(costoDelivery);
        const totalPagarBS = Number((totalFinalCalculado * Number(tasaBcv)).toFixed(2));

        // 3. GENERACIÓN DE CORRELATIVO PARA LA VENTA (Necesario antes de crear la venta)
        const tipoDoc = 'VENTA_RAPIDA';
        const prefijoCorr = 'V';

        let correlativoRegistro = await Correlativo.findOne({
            where: { prefijo: prefijoCorr },
            transaction
        });

        let numeroDocGenerado = `${prefijoCorr}-00001`;
        if (correlativoRegistro) {
            const num = correlativoRegistro.siguienteNumero;
            const ceros = correlativoRegistro.cerosRelleno || 5;
            numeroDocGenerado = `${prefijoCorr}-${String(num).padStart(ceros, '0')}`;

            correlativoRegistro.siguienteNumero += 1;
            await correlativoRegistro.save({ transaction });
        }

        // 4. CREACIÓN DE LA VENTA (Primero creamos la venta para obtener su ID)
        const nuevaVenta = await Venta.create({
            clienteId: registroCliente.id,
            tipoVenta: 'ONLINE',
            tipoDocumento: tipoDoc,
            numeroDocumento: numeroDocGenerado,
            costoFlete: Number(costoDelivery) || 0.00,
            statusDespacho: 'Pendiente',
            condicionPago: 'Contado',
            statusPago: requierePagoOnline ? 'Pagado' : 'Pendiente',
            moneda: 'USD',
            tasaCambio: Number(tasaBcv) || 1.00,
            subtotal: subtotalCalculado,
            montoIva: Number(totalImpuestos),
            tipoEntrega: metodoEntrega,
            totalDescuento: 0.00,
            totalFinal: totalFinalCalculado
        }, { transaction });

        // 5. VALIDACIÓN Y ENLACE ATÓMICO DE PAGO MÓVIL
        if (requierePagoOnline) {
            const { referencia } = pagoMovil || {};

            if (!referencia || referencia.length < 4) {
                await transaction.rollback();
                return NextResponse.json(
                    { message: 'Debe ingresar los últimos 4 dígitos de la referencia de pago.' },
                    { status: 400 }
                );
            }

            const inicioHoy = new Date();
            inicioHoy.setHours(0, 0, 0, 0);

            pagoEncontrado = await PagoSms.findOne({
                where: {
                    referencia: { [Op.endsWith]: referencia },
                    procesado: false,
                    createdAt: { [Op.gte]: inicioHoy }
                },
                transaction
            });

            if (!pagoEncontrado) {
                await transaction.rollback();
                return NextResponse.json(
                    {
                        errorType: 'PAGO_NO_ENCONTRADO',
                        message: 'No se encontró un pago pendiente de HOY con esa referencia. Verifica los datos.'
                    },
                    { status: 400 }
                );
            }

            // 🔥 VALIDACIÓN ESTRICTA DE MONTO EXACTO
            const montoPagoRegistrado = Number(pagoEncontrado.monto || pagoEncontrado.montoBs || 0);
            const diferenciaMonto = Math.abs(montoPagoRegistrado - totalPagarBS);

            // Tolerancia técnica de 0.05 solo para evitar errores matemáticos de punto flotante en JS
            if (diferenciaMonto > 0.05) {
                await transaction.rollback();
                return NextResponse.json(
                    { message: `El monto del pago registrado (Bs ${montoPagoRegistrado.toFixed(2)}) no coincide exactamente con el total de la orden (Bs ${totalPagarBS.toFixed(2)}).` },
                    { status: 400 }
                );
            }

            // Marcamos el pago como procesado y le asociamos la venta recién creada
            pagoEncontrado.procesado = true;
            pagoEncontrado.ventaId = nuevaVenta.id;
            await pagoEncontrado.save({ transaction });
            pagoValidadoId = pagoEncontrado.id;

            // Actualizamos la venta para asignarle el pagoSmsId
            nuevaVenta.pagoSmsId = pagoValidadoId;
            await nuevaVenta.save({ transaction });

            // 6. CREACIÓN DEL MOVIMIENTO FINANCIERO ASOCIADO AL PAGO SMS
            const tasaAplicada = Number(tasaBcv) || 1.00;
            await MovimientoFinanciero.create({
                tipo: 'INGRESO',
                fecha: new Date().toISOString().split('T')[0],
                metodoPago: 'Pago Móvil',
                referencia: pagoEncontrado.referencia,
                montoUsd: totalFinalCalculado,
                tasaBcvAplicada: tasaAplicada,
                montoVes: totalPagarBS,
                descripcion: `Ingreso por Venta Online #${nuevaVenta.numeroDocumento} - Pago Móvil (Banco: ${pagoEncontrado.banco || 'N/A'}, Ref: ${pagoEncontrado.referencia})`,
                ventaId: nuevaVenta.id,
                pagoSmsId: pagoEncontrado.id
            }, { transaction });
        }

        // 7. INSERCIÓN DE LOS DETALLES VINCULADOS A LA VENTA
        for (const detalle of detallesVentaData) {
            await VentaDetalle.create({
                ...detalle,
                ventaId: nuevaVenta.id
            }, { transaction });
        }

        await transaction.commit();

        try {
            await notificarTodos({
                tag: 'NUEVA_VENTA_WEB',
                title: `🛒 ¡Nueva Venta Online! (${numeroDocGenerado})`,
                body: `Cliente: ${cliente.nombre} | Total: $${totalFinalCalculado.toFixed(2)} (Bs ${totalPagarBS}) [${metodoEntrega.toUpperCase()}${pagoOnlinePickup ? ' - PREPAGADO' : ''}]`,
                url: `/superuser/ventas/${nuevaVenta.id}`
            });
        } catch (notifError) {
            console.error("Advertencia: No se pudo enviar la notificación push, pero la venta se procesó correctamente:", notifError);
        }

        return NextResponse.json({
            success: true,
            message: 'Venta web procesada y registrada exitosamente',
            numeroDocumento: numeroDocGenerado,
            ventaId: nuevaVenta.id
        }, { status: 200 });

    } catch (error) {
        await transaction.rollback();
        console.error("Error crítico procesando Venta Web con VentaDetalle:", error);
        return NextResponse.json(
            { message: error.message || 'Error interno al registrar la venta.' },
            { status: 500 }
        );
    }
}