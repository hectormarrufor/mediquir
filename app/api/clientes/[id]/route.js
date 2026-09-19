import { NextResponse } from 'next/server';
import sequelize from '@/sequelize';
import { Cliente, Venta } from '@/models';
import { rolDe } from '@/app/constants/roles';
import { requerirStaff } from '../../inventario/_lib';
import { creditoDeCliente } from '../../b2b/_lib';
import { filtrarCambiosCliente } from '@/app/constants/clienteCampos';

const USD = `(CASE WHEN "moneda" = 'BS' THEN "totalFinal" / NULLIF("tasaCambio", 0) ELSE "totalFinal" END)`;

// GET: ficha de un cliente con sus últimas ventas/pedidos y los totales de TODAS sus compras.
// (Antes usaba un modelo "Pedido" que ya no existe, por eso la ficha daba "error al cargar el cliente".)
export async function GET(req, { params }) {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;
    try {
        const { id } = await params;
        const cliente = await Cliente.findByPk(id);
        if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });

        const json = cliente.toJSON();
        // Un vendedor ve la ficha del cliente pero no su historial ni sus montos
        if (rolDe(acceso.sesion) === 'vendedor') return NextResponse.json({ ...json, pedidos: [], resumen: null }, { status: 200 });

        const [ventas, [totales]] = await Promise.all([
            Venta.findAll({ where: { clienteId: cliente.id }, order: [['createdAt', 'DESC']], limit: 10,
                attributes: ['id', 'numeroDocumento', 'createdAt', 'statusDespacho', 'statusPago', 'condicionPago', 'fechaVencimiento', 'moneda', 'tasaCambio', 'totalFinal'] }),
            sequelize.query(
                `SELECT COALESCE(SUM(${USD}) FILTER (WHERE "statusDespacho" <> 'Cancelado'), 0)::float AS "totalGastado",
                    COALESCE(SUM(GREATEST(${USD} - COALESCE((SELECT SUM(a."montoUsd") FROM "Abonos" a WHERE a."ventaId" = "Ventas"."id"), 0), 0))
                        FILTER (WHERE "statusDespacho" <> 'Cancelado' AND "statusPago" <> 'Pagado'), 0)::float AS "deudaPendiente",
                    COUNT(*) FILTER (WHERE "statusDespacho" <> 'Cancelado')::int AS cantidad
                 FROM "Ventas" WHERE "clienteId" = :id`,
                { replacements: { id: cliente.id }, type: sequelize.QueryTypes.SELECT }
            ),
        ]);

        const pedidos = ventas.map((v) => ({
            id: v.id, numero: v.numeroDocumento, createdAt: v.createdAt, statusDespacho: v.statusDespacho, statusPago: v.statusPago,
            condicionPago: v.condicionPago, fechaVencimiento: v.fechaVencimiento,
            total: v.moneda === 'BS' ? Number(v.totalFinal) / (Number(v.tasaCambio) || 1) : Number(v.totalFinal),
        }));
        const credito = await creditoDeCliente(cliente);
        return NextResponse.json({ ...json, pedidos, resumen: totales, credito }, { status: 200 });
    } catch (error) {
        console.error('Error al obtener cliente:', error.message);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}

// PUT: Actualizar un cliente existente
export async function PUT(req, { params }) {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;
    const rol = rolDe(acceso.sesion);
    if (rol === 'vendedor') return NextResponse.json({ error: 'Tu rol no permite esta acción' }, { status: 403 });

    try {
        const { id } = await params;
        // Solo se guardan los campos permitidos (el crédito, únicamente si quien edita es administrador)
        const { cambios, error: errorCampo } = filtrarCambiosCliente(await req.json(), { esAdmin: rol === 'admin' });
        if (errorCampo) return NextResponse.json({ error: errorCampo }, { status: 400 });

        const cliente = await Cliente.findByPk(id);

        if (!cliente) {
            return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
        }

        await cliente.update(cambios);

        return NextResponse.json({ message: 'Cliente actualizado exitosamente', cliente }, { status: 200 });
    } catch (error) {
        console.error("Error al actualizar cliente:", error);
        
        if (error.name === 'SequelizeUniqueConstraintError') {
            return NextResponse.json({ error: 'La identificación o el correo ingresado ya pertenece a otro cliente' }, { status: 409 });
        }
        if (error.name === 'SequelizeValidationError') {
            const mensajes = error.errors.map(e => e.message).join(', ');
            return NextResponse.json({ error: mensajes }, { status: 400 });
        }

        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}

// DELETE: Eliminar un cliente
export async function DELETE(req, { params }) {
    try {
        const { id } = await params;
        const cliente = await Cliente.findByPk(id);

        if (!cliente) {
            return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
        }

        await cliente.destroy();

        return NextResponse.json({ message: 'Cliente eliminado exitosamente' }, { status: 200 });
    } catch (error) {
        console.error("Error al eliminar cliente:", error);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}