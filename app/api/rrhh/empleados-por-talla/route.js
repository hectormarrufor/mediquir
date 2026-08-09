import { Empleado } from "@/models";
import { NextResponse } from "next/server";

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const campo = searchParams.get('campo'); // ej: tallaCalzado
    const valor = searchParams.get('valor'); // ej: 43, L, o 'null'

    if (!campo) return NextResponse.json({ error: "Campo requerido" }, { status: 400 });

    try {
        // Construimos el filtro dinámicamente
        const whereClause = { estado: 'Activo' };

        if (valor === 'null' || valor === 'Sin Especificar' || !valor) {
            whereClause[campo] = null;
        } else {
            whereClause[campo] = valor;
        }

        const empleados = await Empleado.findAll({
            attributes: ['id', 'nombre', 'apellido', 'imagen', 'cedula'], // Traemos puestos si quieres ver el cargo
            where: whereClause,
            order: [['nombre', 'ASC']]
        });

        return NextResponse.json(empleados);
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}