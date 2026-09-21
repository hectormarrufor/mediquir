// Ruta: app/api/checkout/procesar/route.js

import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { notificarTodos, notificarCabezas } from '@/app/handlers/notificar';
import { Cliente, Producto, PagoSms, Venta, VentaDetalle, Correlativo, IntentoPago, sequelize } from '@/models';
import { tasaVigente } from '../../_lib/tasaBcv';
import { calcularFactura, precioVentaWeb, aBolivares } from '@/app/constants/facturacion';
import { presentacionDe } from '@/app/constants/presentaciones';
import { inicioDiaCaracas } from '@/app/constants/hora';
import { conciliarPagoTienda, TOLERANCIA_BS } from '../../_lib/pagoTienda';

class ErrorNegocio extends Error {}

// Rango aceptado para el delivery: el navegador lo calcula con Google Maps (el servidor no puede recalcular la ruta)
const DELIVERY_MIN = 1.5;
const DELIVERY_MAX = 200;

// Límites contra referencias falsas (el navegador reintenta con el mismo idIntento mientras espera el SMS: cuenta como UN intento)
const MAX_FALLOS = 5;            // intentos distintos sin coincidencia por IP o cédula en la ventana
const VENTANA_FALLOS_MIN = 30;
const MAX_REGISTROS_MANUALES_DIA = 3; // pedidos "por verificar" que una misma IP puede dejar en 24 horas

const ipDe = (req) => (req.headers.get('x-forwarded-for') || '').split(',')[0].trim().slice(0, 64) || req.headers.get('x-real-ip') || null;

// El intento se anota FUERA de la transacción de la compra: si la compra se deshace, el rastro del intento tiene que quedar
async function registrarIntento(datos) {
    try { await IntentoPago.create(datos); } catch (e) { console.error('No se pudo registrar el intento de pago:', e.message); }
}

async function fallosRecientes({ ip, identificacion, idIntento }) {
    const [fila] = await sequelize.query(
        `SELECT COUNT(DISTINCT COALESCE("idIntento", "id"::text))::int AS n FROM "IntentosPago"
         WHERE "resultado" IN ('NO_ENCONTRADO', 'MONTO') AND "createdAt" >= now() - (:min || ' minutes')::interval
           AND ("ip" = :ip OR "identificacion" = :identificacion) AND COALESCE("idIntento", '') <> :idIntento`,
        { replacements: { min: String(VENTANA_FALLOS_MIN), ip: ip || '-', identificacion: identificacion || '-', idIntento: idIntento || '' }, type: sequelize.QueryTypes.SELECT }
    );
    return fila?.n || 0;
}

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
            direccionMapa,
            costoDelivery,
            pagoMovil,
            verificacionManual, // el cliente dice haber pagado pero su pago no aparece: se registra el pedido para que administración lo verifique
        } = body;

        const ip = ipDe(req);
        const idIntento = String(body.idIntento || '').slice(0, 64) || null;
        let pagoEncontrado = null; // pago móvil (SMS) que coincide con la compra

        if (!Array.isArray(cart) || cart.length === 0) throw new ErrorNegocio('El carrito está vacío');
        if (!cliente?.identificacion || !cliente?.nombre) throw new ErrorNegocio('Faltan los datos del cliente');
        // 'nacional' = fuera de la zona de delivery: envío por Zoom con cobro a destino (sin flete en esta venta ni movimiento de tesorería)
        if (!['pickup', 'delivery', 'nacional'].includes(metodoEntrega)) throw new ErrorNegocio('Método de entrega inválido');

        // Bandera central: ¿La compra requiere pago online previo?
        const requierePagoOnline = metodoEntrega !== 'pickup' || Boolean(pagoOnlinePickup);

        // Referencia: solo dígitos; se comparan los últimos 4 (así se guardan los SMS)
        const referencia4 = requierePagoOnline ? String(pagoMovil?.referencia || '').replace(/\D/g, '').slice(-4) : '';
        if (requierePagoOnline && referencia4.length < 4) {
            await transaction.rollback();
            return NextResponse.json({ message: 'Debe ingresar los últimos 4 dígitos de la referencia de pago.' }, { status: 400 });
        }
        if (requierePagoOnline) {
            const fallos = await fallosRecientes({ ip, identificacion: cliente.identificacion, idIntento });
            if (fallos >= MAX_FALLOS) {
                await transaction.rollback();
                await registrarIntento({ ip, identificacion: cliente.identificacion, idIntento, referencia: referencia4, resultado: 'BLOQUEADO', detalle: `${fallos} intentos sin coincidencia en ${VENTANA_FALLOS_MIN} minutos` });
                return NextResponse.json({ message: 'Hiciste varios intentos de pago que no coinciden con ningún pago recibido. Por seguridad esperamos un rato: escríbenos por WhatsApp con tu comprobante y lo verificamos manualmente.' }, { status: 429 });
            }
        }

        // Destino de la entrega (delivery o envío nacional): lo que entendió Google + coordenadas, para el repartidor
        const lat = Number(coordenadasGPS?.lat);
        const lng = Number(coordenadasGPS?.lng);
        const textoDireccion = String(direccionMapa || '').trim().slice(0, 300);
        const direccionEntrega = metodoEntrega !== 'pickup' && Number.isFinite(lat) && Number.isFinite(lng)
            ? `${textoDireccion ? textoDireccion + ' ' : ''}(GPS: ${lat.toFixed(6)}, ${lng.toFixed(6)})`
            : null;

        // 1. GESTIÓN DEL CLIENTE (Búsqueda o creación automática)
        const [registroCliente, clienteNuevo] = await Cliente.findOrCreate({
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

        // Los datos enmascarados (con asteriscos) solo existen para clientes que ya están guardados: se usan los de su ficha
        if (clienteNuevo && [cliente.nombre, cliente.telefono, cliente.email].some((v) => String(v || '').includes('*'))) throw new ErrorNegocio('Revisa tus datos: no pueden llevar asteriscos');
        cliente.nombre = registroCliente.nombre;

        // 2. EL SERVIDOR CALCULA TODO: precios, IVA, total y tasa salen de la base de datos, no del navegador
        const tasaBcv = await tasaVigente({ transaction });
        const lineas = [];
        const productosPorId = new Map(); // una sola instancia por producto: dos renglones (unidades y caja) descuentan del mismo stock
        for (const item of cart) {
            const id = (item.product || item).id;
            let productoBD = productosPorId.get(id);
            if (!productoBD) {
                productoBD = await Producto.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
                if (!productoBD) throw new ErrorNegocio('Un producto del carrito ya no existe');
                productosPorId.set(id, productoBD);
            }
            // La presentación pedida (unidad o caja) se valida contra la ficha: solo se guarda si la cantidad cuadra con lo que trae
            let presentacion = { presentacionPedida: null, cantidadPresentacion: null, unidadesPorPresentacion: null };
            const pres = ['UNIDAD', 'CAJA'].includes(item.presentacion) ? presentacionDe(productoBD, item.presentacion) : null;
            const n = Number(item.cantidadPres);
            if (pres && Number.isInteger(n) && n >= 1 && n * pres.unidades === Number(item.quantity)) {
                presentacion = { presentacionPedida: pres.clave, cantidadPresentacion: n, unidadesPorPresentacion: pres.unidades };
            }
            lineas.push({ productoBD, cantidad: item.quantity, presentacion });
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
        const acumulado = new Map();
        lineas.forEach(({ productoBD, presentacion }, i) => {
            const renglon = factura.renglones[i];
            const yaPedido = (acumulado.get(productoBD.id) || 0) + renglon.cantidad;
            acumulado.set(productoBD.id, yaPedido);
            if ((Number(productoBD.stockAlmacen) || 0) < yaPedido) {
                throw new ErrorNegocio(`Inventario insuficiente para el producto: ${productoBD.nombre}`);
            }
            detallesVentaData.push({
                productoId: productoBD.id,
                isFicticio: false,
                nombreFicticio: null,
                cantidad: renglon.cantidad,
                ...presentacion,
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

        // Pago móvil: se busca el SMS (de ayer o de hoy, hora de Caracas) que termine en esa referencia y traiga EXACTAMENTE el total.
        // Entre varios con la misma terminación gana el del monto exacto. Sin SMS: el cliente puede reintentar (el banco a veces tarda) o,
        // si asegura haber pagado, dejar el pedido "por verificar" (verificacionManual).
        let porVerificar = false;
        if (requierePagoOnline) {
            const candidatos = await PagoSms.findAll({
                where: { referencia: { [Op.endsWith]: referencia4 }, procesado: false, createdAt: { [Op.gte]: inicioDiaCaracas(-1) } },
                order: [['createdAt', 'ASC']],
                transaction, lock: transaction.LOCK.UPDATE,
            });
            pagoEncontrado = candidatos.find((p) => Math.abs(Number(p.monto) - totalPagarBS) <= TOLERANCIA_BS) || null;

            if (!pagoEncontrado && candidatos.length > 0) {
                const montoSms = Number(candidatos[0].monto);
                await transaction.rollback();
                await registrarIntento({ ip, identificacion: cliente.identificacion, idIntento, referencia: referencia4, montoBs: totalPagarBS, resultado: 'MONTO', detalle: `SMS por Bs ${montoSms.toFixed(2)}, la compra era por Bs ${totalPagarBS.toFixed(2)}` });
                return NextResponse.json({ message: `El monto del pago registrado (Bs ${montoSms.toFixed(2)}) no coincide exactamente con el total de la orden (Bs ${totalPagarBS.toFixed(2)}).` }, { status: 400 });
            }

            if (!pagoEncontrado) {
                if (!verificacionManual) {
                    await transaction.rollback();
                    await registrarIntento({ ip, identificacion: cliente.identificacion, idIntento, referencia: referencia4, montoBs: totalPagarBS, resultado: 'NO_ENCONTRADO', detalle: 'Sin SMS con esa referencia' });
                    return NextResponse.json({ errorType: 'PAGO_NO_ENCONTRADO', message: 'No se encontró un pago reciente con esa referencia. Verifica los datos.' }, { status: 400 });
                }
                // Registro para verificación: con límites para que nadie reserve inventario con pagos inventados
                const abiertos = await Venta.count({ where: { clienteId: registroCliente.id, verificacionPago: 'POR_VERIFICAR', statusDespacho: { [Op.ne]: 'Cancelado' } }, transaction });
                if (abiertos > 0) {
                    await transaction.rollback();
                    return NextResponse.json({ message: 'Ya tienes un pedido con pago por verificar. Cuando lo confirmemos podrás hacer otro; si es urgente, escríbenos por WhatsApp.' }, { status: 409 });
                }
                const [{ n: manualesIp }] = await sequelize.query(
                    `SELECT COUNT(*)::int AS n FROM "IntentosPago" WHERE "resultado" = 'REGISTRADO_MANUAL' AND "ip" = :ip AND "createdAt" >= now() - interval '24 hours'`,
                    { replacements: { ip: ip || '-' }, type: sequelize.QueryTypes.SELECT }
                );
                if (manualesIp >= MAX_REGISTROS_MANUALES_DIA) {
                    await transaction.rollback();
                    await registrarIntento({ ip, identificacion: cliente.identificacion, idIntento, referencia: referencia4, resultado: 'BLOQUEADO', detalle: 'Demasiados pedidos por verificar desde la misma conexión' });
                    return NextResponse.json({ message: 'Demasiados pedidos pendientes de verificación desde esta conexión. Escríbenos por WhatsApp para ayudarte.' }, { status: 429 });
                }
                porVerificar = true;
            }
        }

        // 3. GENERACIÓN DE CORRELATIVO PARA LA VENTA (Necesario antes de crear la venta)
        const tipoDoc = 'VENTA_RAPIDA';
        const prefijoCorr = 'V';

        let correlativoRegistro = await Correlativo.findOne({
            where: { prefijo: prefijoCorr },
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!correlativoRegistro) {
            correlativoRegistro = await Correlativo.create({ prefijo: prefijoCorr, siguienteNumero: 1, cerosRelleno: 5 }, { transaction });
        }

        // Nunca por debajo del mayor número ya emitido: antes, sin la fila del correlativo, todas las compras web usaban V-00001
        const [{ maximo }] = await sequelize.query(
            `SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace("numeroDocumento", '\\D', '', 'g'), '') AS bigint)), 0) AS maximo
             FROM "Ventas" WHERE "numeroDocumento" LIKE :patron`,
            { replacements: { patron: `${prefijoCorr}-%` }, type: sequelize.QueryTypes.SELECT, transaction }
        );
        const num = Math.max(correlativoRegistro.siguienteNumero, Number(maximo) + 1);
        const ceros = correlativoRegistro.cerosRelleno || 5;
        const numeroDocGenerado = `${prefijoCorr}-${String(num).padStart(ceros, '0')}`;
        correlativoRegistro.siguienteNumero = num + 1;
        await correlativoRegistro.save({ transaction });

        // 4. CREACIÓN DE LA VENTA (Primero creamos la venta para obtener su ID)
        const nuevaVenta = await Venta.create({
            clienteId: registroCliente.id,
            tipoVenta: 'ONLINE',
            tipoDocumento: tipoDoc,
            numeroDocumento: numeroDocGenerado,
            costoFlete: factura.flete,
            statusDespacho: 'Pendiente',
            condicionPago: 'Contado',
            // Pagado se marca al conciliar el SMS (más abajo); "por verificar" y retiro sin pago online quedan Pendiente
            statusPago: 'Pendiente',
            verificacionPago: porVerificar ? 'POR_VERIFICAR' : null,
            referenciaDeclarada: porVerificar ? referencia4 : null,
            verificacionAt: porVerificar ? new Date() : null,
            verificacionNota: porVerificar ? 'El cliente asegura haber pagado por Pago Móvil pero no llegó el SMS. Confirma en el banco (referencia y monto) o rechaza el pedido.' : null,
            moneda: 'USD',
            tasaCambio: tasaBcv,
            subtotal: subtotalCalculado,
            montoIva: factura.montoIva,
            tipoEntrega: metodoEntrega === 'nacional' ? 'flete' : metodoEntrega,
            direccionEntrega,
            quienRetira: metodoEntrega === 'nacional' ? 'Zoom (envío nacional, cobro a destino)' : null,
            totalDescuento: 0.00,
            totalFinal: totalFinalCalculado
        }, { transaction });

        // 5. El SMS encontrado se une a la compra: pago usado, compra pagada y dinero asentado (subtotal + IVA; el delivery no es ingreso)
        //    Los movimientos usan la fecha de Caracas, no la del servidor.
        // (se hace después de insertar los renglones, ver más abajo)

        // 7. INSERCIÓN DE LOS DETALLES VINCULADOS A LA VENTA
        for (const detalle of detallesVentaData) {
            await VentaDetalle.create({
                ...detalle,
                ventaId: nuevaVenta.id
            }, { transaction });
        }

        if (pagoEncontrado) await conciliarPagoTienda({ venta: nuevaVenta, pago: pagoEncontrado, origen: 'CHECKOUT', transaction });

        await transaction.commit();

        if (requierePagoOnline) {
            await registrarIntento({
                ip, identificacion: cliente.identificacion, idIntento, referencia: referencia4, montoBs: totalPagarBS, ventaId: nuevaVenta.id,
                resultado: porVerificar ? 'REGISTRADO_MANUAL' : 'OK', detalle: porVerificar ? 'Pedido registrado para verificación de pago' : `Conciliado con el SMS #${pagoEncontrado.id}`,
            });
        }

        if (porVerificar) {
            try {
                await notificarCabezas({
                    tag: `PAGO_POR_VERIFICAR_${nuevaVenta.id}`,
                    title: `🕵️ Pago por verificar (${numeroDocGenerado})`,
                    body: `${cliente.nombre} dice haber pagado Bs ${totalPagarBS.toFixed(2)} (ref ${referencia4}) pero el SMS no llegó. Confírmalo en el banco o recházalo.`,
                    url: `/superuser/ventas/${nuevaVenta.id}`,
                });
            } catch (notifError) {
                console.error('No se pudo avisar del pago por verificar:', notifError);
            }
            return NextResponse.json({
                success: true, pendienteVerificacion: true,
                message: 'Pedido registrado. Estamos verificando tu pago; te confirmaremos apenas lo veamos en el banco.',
                numeroDocumento: numeroDocGenerado, ventaId: nuevaVenta.id, totalUsd: totalFinalCalculado, totalBs: totalPagarBS,
            }, { status: 200 });
        }

        try {
            await notificarTodos({
                tag: 'NUEVA_VENTA_WEB',
                title: `🛒 ¡Nueva Venta Online! (${numeroDocGenerado})`,
                body: `Cliente: ${cliente.nombre} | Total: $${totalFinalCalculado.toFixed(2)} (Bs ${totalPagarBS.toFixed(2)}) [${metodoEntrega === 'nacional' ? 'ENVÍO NACIONAL ZOOM' : metodoEntrega.toUpperCase()}${pagoOnlinePickup ? ' - PREPAGADO' : ''}]`,
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