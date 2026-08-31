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
            pagoOnlinePickup, 
            coordenadasGPS, 
            costoDelivery, 
            totalPagarUSD, 
            totalImpuestos, 
            tasaBcv, 
            pagoMovil 
        } = body;

        let pagoValidadoId = null;

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
                const productoBD = await Product.findByPk(productoObj.id, { transaction });
                
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

       // 3. VALIDACIÓN ATÓMICA DE PAGO MÓVIL (Referencia + Monto Exacto + SOLO DE HOY)
        if (requierePagoOnline) {
            const { referencia } = pagoMovil || {};
            
            if (!referencia || referencia.length < 4) {
                await transaction.rollback();
                return NextResponse.json(
                    { message: 'Debe ingresar los últimos 4 dígitos de la referencia de pago.' }, 
                    { status: 400 }
                );
            }
            
            // Definimos el inicio del día de hoy (00:00:00)
            const inicioHoy = new Date();
            inicioHoy.setHours(0, 0, 0, 0);

            // Buscamos por referencia, que no esté procesado Y que su fecha sea de hoy
            const pagoEncontrado = await PagoSms.findOne({
                where: {
                    referencia: { [Op.endsWith]: referencia },
                    procesado: false,
                    createdAt: { [Op.gte]: inicioHoy } // 🔥 Filtro estricto: Solo pagos desde hoy a las 12:00 AM
                },
                transaction
            });

            if (!pagoEncontrado) {
                await transaction.rollback();
                return NextResponse.json(
                    { message: 'No se encontró un pago pendiente de HOY con esa referencia. Verifica los datos.' }, 
                    { status: 400 }
                );
            }

            // Validación de seguridad: Comprobar el monto (con tolerancia de 1.5 Bs por redondeos)
            const montoPagoRegistrado = Number(pagoEncontrado.monto || pagoEncontrado.montoBs || 0);
            const diferenciaMonto = Math.abs(montoPagoRegistrado - totalPagarBS);

            if (diferenciaMonto > 1.5) {
                await transaction.rollback();
                return NextResponse.json(
                    { message: `El monto del pago registrado (Bs ${montoPagoRegistrado}) no coincide con el total de la orden (Bs ${totalPagarBS}).` }, 
                    { status: 400 }
                );
            }

            // Marcamos el pago como procesado para que no pueda ser reutilizado
            pagoEncontrado.procesado = true;
            await pagoEncontrado.save({ transaction });
            pagoValidadoId = pagoEncontrado.id;
        }

        // 4. GENERACIÓN DE CORRELATIVO PARA LA VENTA
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

        // 5. CREACIÓN DE LA VENTA
        const nuevaVenta = await Venta.create({
            clienteId: registroCliente.id,
            tipoVenta: 'DETAL',
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