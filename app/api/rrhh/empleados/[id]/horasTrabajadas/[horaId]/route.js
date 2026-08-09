import { HorasTrabajadas } from "@/models";
import { NextResponse } from "next/server";

export async function PUT(req, { params }) {
    // The second parameter in the folder structure corresponds to the specific ID of the worked hour record
    // Usually, Next.js params object will capture the last dynamic segment.
    // Assuming the folder structure is app/api/rrhh/empleados/[empleadoId]/horasTrabajadas/[id]/route.js
    const { horaId: id } = await params; 

    try {
        const body = await req.json();
        const { horas, fecha, origen, inicio, fin, observaciones } = body;

        const horaTrabajada = await HorasTrabajadas.findByPk(id);

        if (!horaTrabajada) {
            return NextResponse.json({ message: "Hora trabajada no encontrada" }, { status: 404 });
        }

        // Update the fields
        await horaTrabajada.update({
            horas,
            fecha,
            origen,
            inicio,
            fin,
            observaciones,
        });

        return NextResponse.json(horaTrabajada, { status: 200 });
    } catch (error) {
        console.error("Error updating worked hour:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(req, { params }) {
    const { id } = await params;

    try {
        const horaTrabajada = await HorasTrabajadas.findByPk(id);

        if (!horaTrabajada) {
            return NextResponse.json({ message: "Hora trabajada no encontrada" }, { status: 404 });
        }

        await horaTrabajada.destroy();

        return NextResponse.json({ message: "Hora eliminada exitosamente" }, { status: 200 });
    } catch (error) {
        console.error("Error deleting worked hour:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}