import { NextResponse } from "next/server";
import { HorasTrabajadas } from "@/models";

export async function DELETE(req, { params }) {
    try {
        const { id } = params;
        const deleted = await HorasTrabajadas.destroy({ where: { id } });

        if (deleted === 0) {
            return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });
        }

        return NextResponse.json({ message: "Registro eliminado correctamente" });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}