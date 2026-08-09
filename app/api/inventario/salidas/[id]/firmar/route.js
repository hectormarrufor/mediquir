import { NextResponse } from "next/server";
import db from "@/models";
import { notificarCabezas } from "@/app/handlers/notificar";

export async function POST(request, { params }) {
    const t = await db.sequelize.transaction();
    try {
        const { id } = await params;
        const { accion, motivoRechazo } = await request.json(); // accion = 'Aceptar' | 'Rechazar'

        const salida = await db.SalidaInventario.findByPk(id, { 
            include: [{ model: db.Consumible, as: 'consumible' }],
            transaction: t 
        });

        if (!salida || salida.estado !== 'Esperando Firma') {
            throw new Error("Este vale ya no está pendiente de firma.");
        }

        if (accion === 'Aceptar') {
            await salida.update({ estado: 'Entregada' }, { transaction: t });
            
            // Avisar a Presidencia / Almacén que todo está en orden
            await notificarCabezas({
                title: `✅ Custodia Firmada`,
                body: `El empleado aceptó la entrega de: ${salida.consumible?.nombre}.`,
                url: `/superuser/inventario/salidas`,
                tipo: 'Info'
            });
        } else {
            // Si el empleado dice "yo no pedí eso" o "llegó roto"
            await salida.update({ 
                estado: 'Rechazada',
                justificacion: `${salida.justificacion || ''} | RECHAZADO POR EMPLEADO: ${motivoRechazo}`
            }, { transaction: t });

            // 🚨 Alerta roja a la gerencia
            await notificarCabezas({
                title: `❌ Material RECHAZADO por Empleado`,
                body: `La entrega de ${salida.consumible?.nombre} fue rechazada. Motivo: ${motivoRechazo}`,
                url: `/superuser/inventario/salidas`,
                tipo: 'Critico'
            });
        }

        await t.commit();
        return NextResponse.json({ success: true, message: `Recepción ${accion.toLowerCase()}a digitalmente.` });

    } catch (error) {
        await t.rollback();
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}