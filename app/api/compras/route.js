import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import sequelize from '@/sequelize';
import db from '@/models';
const { Proveedor, Producto, EntradaInventario, FacturaCompra, CategoriaFinanciera, MovimientoFinanciero, CuentaPorPagar, User, Empleado } = db;

// GET: Listar historial de compras
export async function GET(request) {
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
    try {
        const body = await request.json();
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
            montoIva,
            montoRetencion,
            totalFinal,
            moneda,
            tasaCambio,
            metodoPago,
            referencia,
            registradoPorId
        } = body;

        if (!detalles || detalles.length === 0) {
            return NextResponse.json({ error: 'La compra no tiene productos' }, { status: 400 });
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
            const p6Nuevo = p6Actual > 0 ? Number((p6Actual * factorAumento).toFixed(2)) : 0;

            const p7Actual = Number(producto.precio7) || 0;
            const p7Nuevo = p7Actual > 0 ? Number((p7Actual * factorAumento).toFixed(2)) : 0;

            simulacionResultados.push({
                productoId: producto.id,
                nombre: producto.nombre,
                codigo: producto.codigo,
                stockActual,
                cantidadComprada,
                costoActual: Number(costoActual.toFixed(4)),
                nuevoCostoPonderado: Number(nuevoCostoPonderado.toFixed(4)),
                porcentajeAumento: Number(porcentajeAumento.toFixed(2)),
                precio6: { actual: p6Actual, nuevo: p6Nuevo },
                precio7: { actual: p7Actual, nuevo: p7Nuevo }
            });
        }

        if (simular) {
            return NextResponse.json({
                modoSimulacion: true,
                mensajePrompt: "Estos son los productos con su porcentaje de aumento ponderado, asi quedarian costo, precio6 y precio7. ¿Está seguro de que desea modificar estos precios?",
                detallesSimulacion: simulacionResultados
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
                registradoPorId: registradoPorId || null
            }, { transaction: t });

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
                    fecha: new Date(),
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
            return NextResponse.json({ success: true, message: 'Compra registrada con éxito.' });

        } catch (innerError) {
            if (!t.finished) await t.rollback();
            throw innerError;
        }

    } catch (error) {
        console.error('Error procesando compra:', error);
        return NextResponse.json({ error: 'Error interno', detalle: error.message }, { status: 500 });
    }
}