// app/api/rrhh/empleados-sin-talla/route.js
import { Empleado } from "@/models";
import { NextResponse } from "next/server";

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const campo = searchParams.get('campo'); // ejemplo: 'tallaCalzado'

    if (!campo) return NextResponse.json({ error: "Campo requerido" }, { status: 400 });

    try {
        const empleados = await Empleado.findAll({
            attributes: ['id', 'nombre', 'apellido', 'imagen', 'cedula'],
            where: {
                estado: 'Activo',
                [campo]: null // Busca donde sea nulo
            },
            order: [['nombre', 'ASC']]
        });
        return NextResponse.json(empleados);
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}