// Ruta: app/api/checkout/procesar/route.js

import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { PagoSms, Venta, VentaDetalle, Product, Cliente, Correlativo, sequelize } from '@/lib/sequelize'; 
import { notificarTodos } from '@/app/handlers/notificar';

export async function POST(req) {
    const transaction = await sequelize.transaction();

    try {
        const body = await req.json();
        const { 
            cart, 
            cliente, 
            metodoEntrega, 
            coordenadasGPS, 
            costoDelivery, 
            totalPagarUSD, 
            totalImpuestos, 
            tasaBcv, 
            pagoMovil 
        } = body;

        let pagoValidadoId = null;

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

        // 2. VALIDACIÓN ATÓMICA DE PAGO MÓVIL (Si es Delivery)
        if (metodoEntrega === 'delivery') {
            const { referencia, telefono } = pagoMovil;
            
            const pagoEncontrado = await PagoSms.findOne({
                where: {
                    referencia: { [Op.endsWith]: referencia },
                    telefono: telefono,
                    procesado: false 
                },
                transaction
            });

            if (!pagoEncontrado) {
                await transaction.rollback();
                return NextResponse.json(
                    { message: 'Pago móvil no encontrado o ya fue procesado. Verifica los datos.' }, 
                    { status: 400 }
                );
            }

            pagoEncontrado.procesado = true;
            await pagoEncontrado.save({ transaction });
            pagoValidadoId = pagoEncontrado.id;
        }

        // 3. GENERACIÓN DE CORRELATIVO PARA LA VENTA
        const tipoDoc = metodoEntrega === 'delivery' ? 'FACTURA' : 'VENTA_RAPIDA';
        const prefijoCorr = tipoDoc === 'FACTURA' ? 'F' : 'V';
        
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

        // 4. PROCESAMIENTO DE ITEMS Y DETALLES DE LA VENTA
        let subtotalCalculado = 0;
        const detallesVentaData = [];

        for (const item of cart) {
            // Soportamos la estructura que viene del carrito web o posibles ítems adaptados
            const productoObj = item.product || item;
            const cantidad = item.quantity || 1;
            const precioUnitario = Number(item.precioFinal ?? productoObj.precio ?? 0);
            const itemSubtotal = precioUnitario * cantidad;
            
            subtotalCalculado += itemSubtotal;

            const isFicticio = Boolean(productoObj.isFicticio);
            const afectaInventario = isFicticio ? false : (item.afectaInventario ?? true);
            
            // Cálculo de IVA basado en el modelo VentaDetalle
            const porcentajeIva = Number(productoObj.porcentajeIva || productoObj.porcentajeIvaProd || 0);
            const aplicaIva = isFicticio ? Boolean(productoObj.aplicaIva) : (porcentajeIva > 0);

            // Si el producto es real y afecta inventario, validamos y descontamos stock en BD
            if (!isFicticio && productoObj.id && afectaInventario) {
                const productoBD = await Product.findByPk(productoObj.id, { transaction });
                
                if (!productoBD || productoBD.stockAlmacen < cantidad) {
                    throw new Error(`Inventario insuficiente para el producto: ${productoObj.nombre || 'Desconocido'}`);
                }

                productoBD.stockAlmacen -= cantidad;
                await productoBD.save({ transaction });
            }

            // Construcción del detalle adaptada exactamente a tu modelo VentaDetalle.js
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

        // 5. CREACIÓN DE LA VENTA
        const nuevaVenta = await Venta.create({
            clienteId: registroCliente.id,
            tipoVenta: 'DETAL',
            tipoDocumento: tipoDoc,
            numeroDocumento: numeroDocGenerado,
            costoFlete: Number(costoDelivery) || 0.00,
            statusDespacho: 'Pendiente', 
            condicionPago: 'Contado',
            statusPago: metodoEntrega === 'delivery' ? 'Pagado' : 'Pendiente', 
            moneda: 'USD',
            tasaCambio: Number(tasaBcv) || 1.00,
            subtotal: subtotalCalculado,
            montoIva: Number(totalImpuestos),
            totalDescuento: 0.00,
            totalFinal: totalFinalCalculado,
            pagoSmsId: pagoValidadoId 
        }, { transaction });

        // 6. INSERCIÓN DE LOS DETALLES VINCULADOS A LA VENTA
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
                body: `Cliente: ${cliente.nombre} | Total: $${totalFinalCalculado.toFixed(2)} (${metodoEntrega.toUpperCase()})`,
                url: `/superuser/ventas/${nuevaVenta.id}`
            });
        } catch (notifError) {
            // Registramos el error de notificación para depurar, pero no bloqueamos la respuesta exitosa al cliente
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