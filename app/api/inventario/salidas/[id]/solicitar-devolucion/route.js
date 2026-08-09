import { NextResponse } from "next/server";
import db from "@/models";
import { notificarAdministracion } from "@/app/handlers/notificar"; // O notificar a los almacenistas específicos

export async function POST(request, { params }) {
    const t = await db.sequelize.transaction();
    try {
        const { id } = await params;

        const salida = await db.SalidaInventario.findByPk(id, { 
            include: [{ model: db.Consumible, as: 'consumible' }],
            transaction: t 
        });

        if (!salida || salida.estado !== 'Entregada') {
            throw new Error("Este ítem no está en custodia activa.");
        }

        // Cambiamos el estado para que aparezca en el radar del almacén
        await salida.update({ estado: 'Esperando Devolucion' }, { transaction: t });

        // Avisamos al almacén que alguien está en ventanilla esperando para devolver algo
        await notificarAdministracion({
            title: `🔄 Devolución en Ventanilla`,
            body: `Un empleado quiere devolver: ${salida.consumible?.nombre}. Por favor, reciba el material y confirme en el sistema.`,
            url: `/superuser/inventario/salidas`,
            tipo: 'Info'
        });

        await t.commit();
        return NextResponse.json({ success: true, message: "Solicitud enviada al almacén." });

    } catch (error) {
        await t.rollback();
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}