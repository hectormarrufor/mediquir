// Ruta: app/api/checkout/procesar/route.js

import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { notificarTodos } from '@/app/handlers/notificar';
import { Cliente, Producto, PagoSms, Venta, VentaDetalle, Correlativo, MovimientoFinanciero, sequelize } from '@/models';
import { tasaVigente } from '../../_lib/tasaBcv';
import { calcularFactura, precioVentaWeb, aBolivares } from '@/app/constants/facturacion';

class ErrorNegocio extends Error {}

// Rango aceptado para el delivery: el navegador lo calcula con Google Maps (el servidor no puede recalcular la ruta)
const DELIVERY_MIN = 1.5;
const DELIVERY_MAX = 200;

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
            pagoMovil
        } = body;

        let pagoValidadoId = null;
        let pagoEncontrado = null; // Variable para almacenar el objeto del pago validado

        if (!Array.isArray(cart) || cart.length === 0) throw new ErrorNegocio('El carrito está vacío');
        if (!cliente?.identificacion || !cliente?.nombre) throw new ErrorNegocio('Faltan los datos del cliente');
        if (!['pickup', 'delivery'].includes(metodoEntrega)) throw new ErrorNegocio('Método de entrega inválido');

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

        // 2. EL SERVIDOR CALCULA TODO: precios, IVA, total y tasa salen de la base de datos, no del navegador
        const tasaBcv = await tasaVigente({ transaction });
        const lineas = [];
        for (const item of cart) {
            const productoBD = await Producto.findByPk((item.product || item).id, { transaction, lock: transaction.LOCK.UPDATE });
            if (!productoBD) throw new ErrorNegocio('Un producto del carrito ya no existe');
            lineas.push({ productoBD, cantidad: item.quantity });
        }

        let factura;
        try {
            factura = calcularFactura({
                renglones: lineas.map(({ productoBD, cantidad }) => {
                    const porcentajeIva = Number(productoBD.porcentajeIva) || 0;
                    return { precioUnitario: precioVentaWeb(productoBD), cantidad, aplicaIva: porcentajeIva > 0, porcentajeIva };
                }),
                costoFlete: metodoEntrega === 'delivery' ? Math.min(Math.max(Number(costoDelivery) || 0, DELIVERY_MIN), DELIVERY_MAX) : 0,
            });
        } catch (e) {
            throw new ErrorNegocio(e.message);
        }

        const detallesVentaData = [];
        lineas.forEach(({ productoBD }, i) => {
            const renglon = factura.renglones[i];
            if ((Number(productoBD.stockAlmacen) || 0) < renglon.cantidad) {
                throw new ErrorNegocio(`Inventario insuficiente para el producto: ${productoBD.nombre}`);
            }
            detallesVentaData.push({
                productoId: productoBD.id,
                isFicticio: false,
                nombreFicticio: null,
                cantidad: renglon.cantidad,
                precioUnitario: renglon.precioUnitario,
                subtotal: renglon.monto,
                aplicaIva: renglon.aplicaIva,
                afectaInventario: true,
            });
        });
        for (let i = 0; i < lineas.length; i++) {
            lineas[i].productoBD.stockAlmacen = Number(lineas[i].productoBD.stockAlmacen) - factura.renglones[i].cantidad;
            await lineas[i].productoBD.save({ transaction });
        }

        const subtotalCalculado = factura.subtotal;
        const totalFinalCalculado = factura.totalFinal;
        const totalPagarBS = aBolivares(totalFinalCalculado, tasaBcv);

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
            costoFlete: factura.flete,
            statusDespacho: 'Pendiente',
            condicionPago: 'Contado',
            statusPago: requierePagoOnline ? 'Pagado' : 'Pendiente',
            moneda: 'USD',
            tasaCambio: tasaBcv,
            subtotal: subtotalCalculado,
            montoIva: factura.montoIva,
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

            // Tolerancia de 1 céntimo: el total ya viene calculado con aritmética exacta
            if (diferenciaMonto > 0.01) {
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
            const tasaAplicada = tasaBcv;
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
                body: `Cliente: ${cliente.nombre} | Total: $${totalFinalCalculado.toFixed(2)} (Bs ${totalPagarBS.toFixed(2)}) [${metodoEntrega.toUpperCase()}${pagoOnlinePickup ? ' - PREPAGADO' : ''}]`,
                url: `/superuser/ventas/${nuevaVenta.id}`
            });
        } catch (notifError) {
            console.error("Advertencia: No se pudo enviar la notificación push, pero la venta se procesó correctamente:", notifError);
        }

        return NextResponse.json({
            success: true,
            message: 'Venta web procesada y registrada exitosamente',
            numeroDocumento: numeroDocGenerado,
            ventaId: nuevaVenta.id,
            totalUsd: totalFinalCalculado,
            totalBs: totalPagarBS,
        }, { status: 200 });

    } catch (error) {
        if (!transaction.finished) await transaction.rollback();
        if (error instanceof ErrorNegocio) return NextResponse.json({ message: error.message }, { status: 400 });
        console.error("Error crítico procesando Venta Web con VentaDetalle:", error);
        return NextResponse.json({ message: 'Error interno al registrar la venta.' }, { status: 500 });
    }
}