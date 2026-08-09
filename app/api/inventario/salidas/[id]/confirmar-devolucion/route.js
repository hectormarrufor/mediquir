import { NextResponse } from "next/server";
import db from "@/models";
import { notificarUsuario } from "@/app/handlers/notificar";

export async function POST(request, { params }) {
    const t = await db.sequelize.transaction();
    try {
        const { id } = await params;
        const { accion, motivoRechazo } = await request.json(); // accion = 'Aceptar' | 'Rechazar'

        const salida = await db.SalidaInventario.findByPk(id, { 
            include: [{ model: db.Consumible, as: 'consumible' }],
            transaction: t 
        });

        if (!salida || salida.estado !== 'Esperando Devolucion') {
            throw new Error("Este ítem no está esperando devolución.");
        }

        if (accion === 'Aceptar') {
            // 1. Liberamos la custodia
            await salida.update({ estado: 'Devuelta' }, { transaction: t });
            
            // 2. Regresamos el stock físico al almacén
            if (salida.consumible) {
                await salida.consumible.increment('stockAlmacen', { 
                    by: parseFloat(salida.cantidad), 
                    transaction: t 
                });
            }

            // 3. Le damos su "Paz y Salvo" al empleado
            await notificarUsuario(salida.solicitadoPorId, {
                title: `✅ Custodia Liberada`,
                body: `Almacén confirmó la recepción de ${salida.consumible?.nombre}. Ya no está bajo tu responsabilidad.`,
                url: `/superuser/en-mi-custodia`,
                tipo: 'Success'
            });

        } else {
            // Si el almacenista rechaza porque el equipo vino roto o incompleto
            await salida.update({ 
                estado: 'Entregada', // Vuelve a estar a cargo del empleado
                justificacion: `${salida.justificacion || ''} | DEVOLUCIÓN RECHAZADA: ${motivoRechazo}`
            }, { transaction: t });

            await notificarUsuario(salida.solicitadoPorId, {
                title: `❌ Devolución Rechazada`,
                body: `Almacén no aceptó la devolución de ${salida.consumible?.nombre}. Motivo: ${motivoRechazo}`,
                url: `/superuser/en-mi-custodia`,
                tipo: 'Error'
            });
        }

        await t.commit();
        return NextResponse.json({ success: true, message: `Devolución ${accion.toLowerCase()}a correctamente.` });

    } catch (error) {
        await t.rollback();
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}