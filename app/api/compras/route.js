import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import sequelize from '@/sequelize';
import db from '@/models';
import { requerirStaff } from '../inventario/_lib';
import { rolDe } from '@/app/constants/roles';
import { aBolivares } from '@/app/constants/facturacion';
import { fechaCaracas } from '@/app/constants/hora';
import { notificarCabezas } from '@/app/handlers/notificar';
import { siguienteComprobante, periodoDe } from '../_lib/retenciones';
import { ErrorNumeracion } from '../_lib/numeracion';
import { CONFIG_FISCAL } from '@/app/constants/empresa';
const { RetencionIva, Proveedor, Producto, EntradaInventario, FacturaCompra, CategoriaFinanciera, MovimientoFinanciero, CuentaPorPagar, User, Empleado } = db;

class ErrorCompra extends Error {
    constructor(mensaje, status = 400) { super(mensaje); this.status = status; }
}

// GET: Listar historial de compras
export async function GET(request) {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;
    try {
        const { searchParams } = new URL(request.url);
        const fechaInicio = searchParams.get('fechaInicio');
        const fechaFin = searchParams.get('fechaFin');

        let whereClause = {};
        if (fechaInicio && fechaFin) {
            whereClause.createdAt = { [Op.between]: [`${fechaInicio} 00:00:00`, `${fechaFin} 23:59:59`] };
        } else if (fechaInicio) {
            whereClause.createdAt = { [Op.between]: [`${fechaInicio} 00:00:00`, `${fechaInicio} 23:59:59`] };
        }

        // Un vendedor solo ve las compras que él registró
        if (rolDe(acceso.sesion) === 'vendedor') whereClause.registradoPorId = Number(acceso.sesion.id);

        const facturas = await FacturaCompra.findAll({
            where: whereClause,
            include: [
                { model: Proveedor, as: 'proveedor', attributes: ['id', 'nombre', 'identificacion'] },
                { 
                    model: User, 
                    as: 'registrador', 
                    attributes: ['id', 'user'],
                    include: [{ model: Empleado, as: 'empleado', attributes: ['nombre', 'apellido'] }]
                }
            ],
            order: [['createdAt', 'DESC']]
        });

        return NextResponse.json(facturas);
    } catch (error) {
        console.error('Error al obtener facturas de compra:', error);
        return NextResponse.json({ error: 'Error al obtener las compras' }, { status: 500 });
    }
}

export async function POST(request) {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;
    const esVend = rolDe(acceso.sesion) === 'vendedor';
    try {
        const body = await request.json();
        if (esVend) body.registradoPorId = Number(acceso.sesion.id); // la compra queda a nombre de quien la registra
        const {
            simular,
            proveedorId, 
            nuevoProveedor, 
            tipoDocumento, 
            numeroDocumento, 
            fechaFactura,
            condicionPago, 
            diasCredito,   
            detalles, 
            subtotal,
            montoIva: montoIvaCliente,
            montoRetencion: montoRetencionCliente,
            totalFinal: totalFinalCliente,
            moneda,
            tasaCambio,
            metodoPago,
            referencia,
            registradoPorId,
            numeroControl: numeroControlCliente,
            fechaRecepcion,
            montoExento: montoExentoCliente,
            porcentajeRetencion: porcentajeRetencionCliente,
            aplicarRetencion
        } = body;

        // Un vendedor registra la compra (stock y costo) pero NO cambia precios de venta
        if (esVend && Array.isArray(detalles)) detalles.forEach((d) => { d.aceptarCambioPrecio = false; });

        if (!detalles || detalles.length === 0) {
            return NextResponse.json({ error: 'La compra no tiene productos' }, { status: 400 });
        }

        // No se compra ni se vende a granel: toda cantidad es un entero positivo
        const cantidadInvalida = detalles.find((item) => !Number.isInteger(Number(item.cantidad)) || Number(item.cantidad) < 1);
        if (cantidadInvalida) {
            return NextResponse.json({ error: 'Las cantidades deben ser números enteros mayores a 0' }, { status: 400 });
        }

        // Tipo de documento y montos fiscales: los decide el servidor.
        //  · NOTA DE ENTREGA: no es un documento fiscal. Sin IVA, sin retención, sin número de control y no entra al libro de compras.
        //  · FACTURA: lleva IVA, número de control y la empresa (agente de retención) le retiene al proveedor el 75 % o el 100 % del IVA.
        //    La retención se calcula aquí (el navegador solo puede pedir NO retener con aplicarRetencion = false) y genera su comprobante con el correlativo.
        if (!['FACTURA', 'NOTA_ENTREGA'].includes(tipoDocumento)) {
            return NextResponse.json({ error: 'Tipo de documento inválido: una compra es una factura o una nota de entrega' }, { status: 400 });
        }
        const esFactura = tipoDocumento === 'FACTURA';
        const montoIva = esFactura ? Math.max(0, Number(montoIvaCliente) || 0) : 0;
        const montoExento = esFactura ? Math.max(0, Number(montoExentoCliente) || 0) : 0;
        const numeroControl = esFactura ? numeroControlCliente : null;
        const totalFinal = Math.round((Number(subtotal || 0) + montoIva) * 100) / 100;
        const porcentajeRetencion = [75, 100].includes(Number(porcentajeRetencionCliente)) ? Number(porcentajeRetencionCliente) : CONFIG_FISCAL.porcentajeRetencionCompras;
        const retiene = CONFIG_FISCAL.agenteRetencionIva && esFactura && montoIva > 0 && aplicarRetencion !== false;
        const montoRetencion = retiene ? Math.round(montoIva * porcentajeRetencion) / 100 : 0;

        // Datos fiscales coherentes: no se puede retener más IVA del que tiene la factura
        if (Number(montoRetencion) > Number(montoIva) + 0.005) {
            return NextResponse.json({ error: 'La retención no puede ser mayor que el IVA de la factura' }, { status: 400 });
        }

        const simulacionResultados = [];

        // --- FASE 1: SIMULACIÓN DE COSTOS PONDERADOS ---
        for (const item of detalles) {
            // Aseguramos buscar por el ID correcto independientemente de cómo venga en el objeto
            const prodId = item.productoId || item.id;
            const producto = await Producto.findByPk(prodId);
            if (!producto) continue;

            const stockActual = Number(producto.stockAlmacen) || 0;
            const costoActual = Number(producto.costoUsd) || 0;
            const cantidadComprada = Number(item.cantidad) || 0;
            const precioCompraUsd = moneda === 'BS' ? Number(item.precioCompraUnitario) / Number(tasaCambio) : Number(item.precioCompraUnitario);

            let nuevoCostoPonderado = costoActual;
            if (stockActual + cantidadComprada > 0) {
                const valorInventarioViejo = stockActual * costoActual;
                const valorCompraNueva = cantidadComprada * precioCompraUsd;
                nuevoCostoPonderado = (valorInventarioViejo + valorCompraNueva) / (stockActual + cantidadComprada);
            } else {
                nuevoCostoPonderado = precioCompraUsd;
            }

            let porcentajeAumento = 0;
            if (costoActual > 0) {
                porcentajeAumento = ((nuevoCostoPonderado - costoActual) / costoActual) * 100;
            } else {
                porcentajeAumento = 100;
            }

            const factorAumento = 1 + (porcentajeAumento / 100);

            const p6Actual = Number(producto.precio6) || 0;
            // Los precios se guardan con 3 decimales (así están en la base): antes se recortaban a 2 y un precio de 0.003 se perdía
            const p6Nuevo = p6Actual > 0 ? Number((p6Actual * factorAumento).toFixed(3)) : 0;

            const p7Actual = Number(producto.precio7) || 0;
            const p7Nuevo = p7Actual > 0 ? Number((p7Actual * factorAumento).toFixed(3)) : 0;

            simulacionResultados.push({
                productoId: producto.id,
                nombre: producto.nombre,
                codigo: producto.codigo,
                stockActual,
                cantidadComprada,
                costoActual: Number(costoActual.toFixed(5)),
                nuevoCostoPonderado: Number(nuevoCostoPonderado.toFixed(5)), // el costo por unidad se guarda con 5 decimales
                porcentajeAumento: Number(porcentajeAumento.toFixed(2)),
                precio6: { actual: p6Actual, nuevo: p6Nuevo },
                precio7: { actual: p7Actual, nuevo: p7Nuevo }
            });
        }

        if (simular) {
            return NextResponse.json({
                modoSimulacion: true,
                mensajePrompt: "Estos son los productos con su porcentaje de aumento ponderado, asi quedarian costo, precio6 y precio7. ¿Está seguro de que desea modificar estos precios?",
                detallesSimulacion: esVend
                    ? simulacionResultados.map(({ costoActual, nuevoCostoPonderado, porcentajeAumento, precio6, precio7, ...resto }) => ({ ...resto, soloRegistro: true }))
                    : simulacionResultados
            });
        }

        // --- FASE 2: EJECUCIÓN DEFINITIVA (Transacción real) ---
        const t = await sequelize.transaction();

        try {
            let idProveedorFinal = proveedorId;
            if (!idProveedorFinal && nuevoProveedor) {
                const provCreado = await Proveedor.create({
                    identificacion: nuevoProveedor.identificacion,
                    nombre: nuevoProveedor.nombre,
                    telefono: nuevoProveedor.telefono,
                    email: nuevoProveedor.email,
                    direccion: nuevoProveedor.direccion,
                    esContribuyenteEspecial: nuevoProveedor.esContribuyenteEspecial || false,
                    retencionIvaPorDefecto: nuevoProveedor.retencionIvaPorDefecto || 75,
                    notas: nuevoProveedor.notas
                }, { transaction: t });
                idProveedorFinal = provCreado.id;
            }

            // El mismo documento del mismo proveedor no se registra dos veces (duplicaría el inventario y la retención)
            const repetida = await FacturaCompra.findOne({ where: { proveedorId: idProveedorFinal, tipoDocumento, numeroDocumento }, attributes: ['id'], transaction: t });
            if (repetida) throw new ErrorCompra(`Ya registraste ${esFactura ? 'la factura' : 'la nota de entrega'} ${numeroDocumento} de este proveedor`, 409);

            let fechaVencimiento = null;
            if (condicionPago === 'Credito' && Number(diasCredito) > 0) {
                const baseDate = fechaFactura ? new Date(fechaFactura) : new Date();
                fechaVencimiento = new Date(baseDate);
                fechaVencimiento.setDate(fechaVencimiento.getDate() + Number(diasCredito));
            }

            const nuevaFacturaCompra = await FacturaCompra.create({
                proveedorId: idProveedorFinal,
                tipoDocumento,
                numeroDocumento,
                fechaFactura: fechaFactura || new Date(),
                condicionPago,
                diasCredito: Number(diasCredito) || 0,
                fechaVencimiento,
                statusPago: condicionPago === 'Contado' ? 'Pagado' : 'Pendiente',
                moneda,
                tasaCambio: Number(tasaCambio) || 1.00,
                subtotal: Number(subtotal) || 0,
                montoIva: Number(montoIva) || 0,
                montoRetencion: Number(montoRetencion) || 0,
                totalFinal: Number(totalFinal) || 0,
                registradoPorId: registradoPorId || null,
                numeroControl: String(numeroControl || '').trim().slice(0, 30) || null,
                fechaRecepcion: fechaRecepcion || fechaFactura || fechaCaracas(),
                montoExento: Number(montoExento) || 0,
                alicuotaIva: 16
            }, { transaction: t });

            // Comprobante de retención de IVA (la empresa le retiene al proveedor). Quedan guardados en bolívares para el libro de compras.
            let comprobanteRetencion = null;
            if (montoRetencion > 0) {
                const prov = await Proveedor.findByPk(idProveedorFinal, { attributes: ['identificacion', 'nombre'], transaction: t });
                if (!String(prov?.identificacion || '').trim()) throw new ErrorCompra('El proveedor no tiene RIF: complétalo para poder emitir el comprobante de retención de IVA', 400);
                const aBs = (v) => (moneda === 'BS' ? Number(Number(v).toFixed(2)) : aBolivares(Number(v), Number(tasaCambio) || 1));
                const fechaRet = fechaRecepcion || fechaFactura || fechaCaracas();
                comprobanteRetencion = await siguienteComprobante(fechaRet, t);
                await RetencionIva.create({
                    tipo: 'COMPRA', fecha: fechaRet, periodo: periodoDe(fechaRet), comprobante: comprobanteRetencion,
                    facturaAfectada: numeroDocumento, numeroControlFactura: String(numeroControl || '').trim().slice(0, 30) || null,
                    contraparteRif: prov?.identificacion || null, contraparteNombre: prov?.nombre || null,
                    baseImponible: aBs(Number(subtotal) - Number(montoExento || 0)), alicuota: 16, montoIva: aBs(montoIva),
                    porcentajeRetencion: Number(porcentajeRetencion) || 75, ivaRetenido: aBs(montoRetencion),
                    tasaCambio: Number(tasaCambio) || 1, facturaCompraId: nuevaFacturaCompra.id, registradoPorId: registradoPorId || null,
                }, { transaction: t });
            }

            // Recorremos los detalles y cruzamos con los resultados de la simulación mediante el ID
            for (const item of detalles) {
                const pId = item.productoId || item.id;
                const sim = simulacionResultados.find(s => s.productoId === pId);
                if (!sim) continue;

                const producto = await Producto.findByPk(pId, { transaction: t });
                if (!producto) continue;

                producto.stockAlmacen = Number(producto.stockAlmacen || 0) + Number(item.cantidad);
                producto.costoUsd = sim.nuevoCostoPonderado;

                // Si el usuario aceptó el cambio para este ítem específico
                if (item.aceptarCambioPrecio !== false) {
                    if (sim.precio6.nuevo > 0) producto.precio6 = sim.precio6.nuevo;
                    if (sim.precio7.nuevo > 0) producto.precio7 = sim.precio7.nuevo;
                }

                await producto.save({ transaction: t });

                await EntradaInventario.create({
                    facturaCompraId: nuevaFacturaCompra.id,
                    productoId: producto.id,
                    proveedorId: idProveedorFinal,
                    cantidad: item.cantidad,
                    costoUnitario: sim.nuevoCostoPonderado,
                    justificacion: `Compra ${tipoDocumento} Nro: ${numeroDocumento}`,
                    estado: 'Recibida',
                    registradoPorId: registradoPorId || null
                }, { transaction: t });
            }

            const montoGastoNeto = Number(totalFinal) - (Number(montoRetencion) || 0);

            if (condicionPago === 'Contado') {
                let catCompras = await CategoriaFinanciera.findOne({ where: { nombre: 'Compras de Mercancía' }, transaction: t });
                if (!catCompras) catCompras = await CategoriaFinanciera.create({ nombre: 'Compras de Mercancía', tipo: 'GASTO' }, { transaction: t });

                const mUsdGasto = moneda === 'USD' ? montoGastoNeto : montoGastoNeto / Number(tasaCambio);
                const mBsGasto = moneda === 'BS' ? montoGastoNeto : montoGastoNeto * Number(tasaCambio);

                await MovimientoFinanciero.create({
                    tipo: 'GASTO',
                    fecha: fechaCaracas(),
                    metodoPago: metodoPago || 'Efectivo',
                    referencia: referencia || numeroDocumento,
                    montoUsd: Number(mUsdGasto.toFixed(2)),
                    tasaBcvAplicada: Number(tasaCambio),
                    montoVes: Number(mBsGasto.toFixed(2)),
                    descripcion: `Pago ${tipoDocumento} Nro: ${numeroDocumento}`,
                    categoriaId: catCompras.id,
                    facturaCompraId: nuevaFacturaCompra.id
                }, { transaction: t });
            } else {
                await CuentaPorPagar.create({
                    proveedorId: idProveedorFinal,
                    facturaCompraId: nuevaFacturaCompra.id,
                    montoTotal: montoGastoNeto,
                    saldoPendiente: montoGastoNeto,
                    moneda,
                    tasaCambio: Number(tasaCambio) || 1.00,
                    fechaVencimiento,
                    estado: 'Pendiente'
                }, { transaction: t });
            }

            await t.commit();

            // Si la compra la registró alguien que no es administrador, las cabezas se enteran
            if (rolDe(acceso.sesion) !== 'admin') {
                try {
                    await notificarCabezas({
                        title: 'Compra registrada 🧾',
                        body: `${[acceso.sesion.nombre, acceso.sesion.apellido].filter(Boolean).join(' ') || 'Un empleado'} registró la compra ${numeroDocumento} por ${moneda === 'BS' ? 'Bs ' : '$'}${Number(totalFinal || 0).toFixed(2)}${condicionPago === 'Credito' ? ' a crédito' : ''}.`,
                        url: '/superuser/compras', tipo: 'Info',
                    });
                } catch (e) {
                    console.error('No se pudo avisar de la compra:', e.message);
                }
            }
            return NextResponse.json({ success: true, message: 'Compra registrada con éxito.', comprobanteRetencion });

        } catch (innerError) {
            if (!t.finished) await t.rollback();
            throw innerError;
        }

    } catch (error) {
        if (error instanceof ErrorCompra) return NextResponse.json({ error: error.message }, { status: error.status });
        // Falta indicar con qué número empieza la numeración de comprobantes de retención (código RETENCION_PENDIENTE)
        if (error instanceof ErrorNumeracion) return NextResponse.json({ error: error.message, codigo: error.codigo }, { status: error.status });
        console.error('Error procesando compra:', error);
        return NextResponse.json({ error: 'Error interno', detalle: error.message }, { status: 500 });
    }
}