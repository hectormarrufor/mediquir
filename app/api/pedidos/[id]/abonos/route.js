import { NextResponse } from 'next/server';
import { Pedido, Abono, BcvPrecioHistorico } from '@/models';
import sequelize from '@/sequelize';

// GET: Listar todos los abonos de un pedido específico
export async function GET(req, { params }) {
    try {
        const { id } = await params;
        const abonos = await Abono.findAll({
            where: { pedidoId: id },
            order: [['fechaPago', 'ASC']]
        });
        return NextResponse.json(abonos, { status: 200 });
    } catch (error) {
        return NextResponse.json({ error: 'Error al obtener abonos' }, { status: 500 });
    }
}

// POST: Registrar un nuevo abono
export async function POST(req, { params }) {
    const t = await sequelize.transaction();

    try {
        const { id } = await params;
        const body = await req.json();

        // Recibimos: fechaPago, montoUsd (lo que abonó en dólares), metodoPago y referencia
        const { fechaPago, montoUsd, metodoPago, referencia, notas } = body;

        const pedido = await Pedido.findByPk(id, { transaction: t });
        if (!pedido) throw new Error('Pedido no encontrado');
        if (pedido.statusPago === 'Pagado') throw new Error('Este pedido ya está pagado en su totalidad');

        // 1. Buscar la tasa BCV de ese día específico
        const tasaHistorica = await BcvPrecioHistorico.findOne({
            where: { fecha: fechaPago },
            order: [['hora', 'DESC']], // Tomamos la última tasa reportada ese día
            transaction: t
        });

        if (!tasaHistorica) {
            throw new Error(`No hay una tasa BCV registrada para la fecha ${fechaPago}. Por favor, registre la tasa en el sistema primero.`);
        }

        const tasaBcv = parseFloat(tasaHistorica.monto);
        const montoUsdFloat = parseFloat(montoUsd);

        // 2. Calcular los Bolívares equivalentes
        const montoVesCalculado = montoUsdFloat * tasaBcv;

        // 3. Crear el Abono
        await Abono.create({
            pedidoId: pedido.id,
            fechaPago,
            metodoPago,
            referencia,
            montoUsd: montoUsdFloat,
            tasaBcvAplicada: tasaBcv,
            montoVes: montoVesCalculado,
            notas
        }, { transaction: t });

        await MovimientoFinanciero.create({
            tipo: 'INGRESO',
            fecha: fechaPago,
            metodoPago,
            referencia,
            montoUsd: montoUsdFloat,
            tasaBcvAplicada: tasaBcv,
            montoVes: montoVesCalculado,
            descripcion: `Abono automático de Pedido #${pedido.id}`,
            categoriaId: 1, // Suponiendo que el ID 1 es la categoría "Abono de Pedido"
            pedidoId: pedido.id,
            abonoId: nuevoAbono.id
        }, { transaction: t });

        // 4. Calcular el total pagado hasta ahora (sumando todos los abonos previos + este nuevo)
        const todosLosAbonos = await Abono.findAll({
            where: { pedidoId: pedido.id },
            transaction: t
        });

        const totalAbonadoUsd = todosLosAbonos.reduce((sum, abono) => sum + parseFloat(abono.montoUsd), 0);
        const totalPedidoUsd = parseFloat(pedido.total);

        // 5. Verificar si con este abono se saldó la deuda
        // Usamos una pequeña tolerancia (0.01) por temas de redondeo decimal
        if (totalAbonadoUsd >= (totalPedidoUsd - 0.01)) {
            await pedido.update({ statusPago: 'Pagado' }, { transaction: t });
        } else if (pedido.statusPago === 'Vencido' && totalAbonadoUsd < totalPedidoUsd) {
            // Si estaba vencido pero abonó algo, sigue vencido (o podrías cambiarlo a Pendiente según tu regla de negocio)
        }

        await t.commit();

        return NextResponse.json({
            message: 'Abono registrado exitosamente',
            montoVes: montoVesCalculado,
            nuevoStatus: totalAbonadoUsd >= (totalPedidoUsd - 0.01) ? 'Pagado' : pedido.statusPago
        }, { status: 201 });

    } catch (error) {
        await t.rollback();
        console.error("Error al registrar abono:", error);
        return NextResponse.json({ error: error.message || 'Error interno del servidor' }, { status: 500 });
    }
}