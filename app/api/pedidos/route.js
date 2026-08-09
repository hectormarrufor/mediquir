import { NextResponse } from 'next/server';
import { Pedido, PedidoRenglon, Cliente, Producto } from '@/models';
import sequelize from '@/sequelize'; // Importamos la instancia para usar Transacciones

// GET: Listar todos los pedidos (Ideal para tu panel de control)
export async function GET() {
    try {
        const pedidos = await Pedido.findAll({
            include: [
                {
                    model: Cliente,
                    as: 'cliente',
                    attributes: ['id', 'identificacion', 'nombre', 'razonSocial'] 
                }
            ],
            order: [['createdAt', 'DESC']]
        });
        
        return NextResponse.json(pedidos, { status: 200 });
    } catch (error) {
        console.error("Error al obtener pedidos:", error);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}

// POST: Crear un nuevo pedido con sus renglones
export async function POST(req) {
    // Iniciamos una transacción para asegurar que se guarde todo o no se guarde nada
    const t = await sequelize.transaction(); 
    
    try {
        const body = await req.json();
        const { clienteId, esFacturado, costoFlete, quienRetira, fechaHoraRetiro, renglones } = body;
        
        // Validación básica
        if (!clienteId || !quienRetira || !fechaHoraRetiro || !renglones || renglones.length === 0) {
            return NextResponse.json({ error: 'Faltan datos obligatorios o el pedido no tiene productos' }, { status: 400 });
        }

        let subtotalAcumulado = 0;
        let montoIvaAcumulado = 0;
        const renglonesPreparados = [];

        // 1. Procesar cada renglón validando precios y calculando totales
        for (const item of renglones) {
            const producto = await Producto.findByPk(item.productoId, { transaction: t });
            
            if (!producto) {
                throw new Error(`El producto con ID ${item.productoId} ya no existe en el inventario`);
            }

            const precioBase = parseFloat(producto.precio);
            const cantidad = parseInt(item.cantidadSolicitada);
            
            // Si el pedido es facturado, leemos el IVA del producto, si no, es 0
            const porcentajeIvaApli = esFacturado ? parseFloat(producto.porcentajeIva || 16.00) : 0;
            
            const renglonSubtotal = precioBase * cantidad;
            const renglonIva = renglonSubtotal * (porcentajeIvaApli / 100);

            subtotalAcumulado += renglonSubtotal;
            montoIvaAcumulado += renglonIva;

            // Congelamos (Snapshots) los valores en el tiempo para el historial
            renglonesPreparados.push({
                productoId: producto.id,
                cantidadSolicitada: cantidad,
                cantidadDespachada: 0, // Siempre inicia en 0
                precioFijo: precioBase, 
                porcentajeIvaFijo: porcentajeIvaApli
            });
        }

        const costoFleteFinal = parseFloat(costoFlete || 0);
        const totalFinal = subtotalAcumulado + montoIvaAcumulado + costoFleteFinal;

        // 2. Crear la cabecera del Pedido
        const nuevoPedido = await Pedido.create({
            clienteId,
            esFacturado,
            costoFlete: costoFleteFinal,
            quienRetira,
            fechaHoraRetiro,
            statusDespacho: 'Pendiente', // El estatus inicial por defecto
            subtotal: subtotalAcumulado,
            montoIva: montoIvaAcumulado,
            total: totalFinal
        }, { transaction: t });

        // 3. Asociar el ID del nuevo pedido a los renglones y crearlos de forma masiva (Bulk)
        const renglonesConIdPedido = renglonesPreparados.map(r => ({ ...r, pedidoId: nuevoPedido.id }));
        await PedidoRenglon.bulkCreate(renglonesConIdPedido, { transaction: t });

        // Si todo salió bien, confirmamos los cambios en la base de datos
        await t.commit();
        
        return NextResponse.json(nuevoPedido, { status: 201 });
    } catch (error) {
        // Si algo falla, revertimos cualquier cambio hecho durante este proceso
        await t.rollback();
        console.error("Error al crear el pedido:", error);
        return NextResponse.json({ error: error.message || 'Error interno del servidor' }, { status: 500 });
    }
}