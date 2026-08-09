import { notificarUsuario } from "@/app/handlers/notificar";
import { Empleado, HorasTrabajadas, User } from "@/models";
import { NextResponse } from "next/server";


export async function GET(req) {
    try {
        const horas = await HorasTrabajadas.findAll();
        return NextResponse.json(horas, { status: 200 });
    } catch (error) {
        console.error("Error fetching worked hours:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}


export async function POST(req, { params }) {

    const { id } = await params;
    try {
        const body = await req.json();

        const {nombre, apellido} = await Empleado.findByPk(id);

        const {
            fecha,
            horas,
            inicio,
            fin,
            origen,
            observaciones,
            creadorId
        } = body;

        const creador = await User.findByPk(creadorId, {include: [{model: Empleado, as: 'empleado'}]});
        const creadorNombre = creador.empleado.nombre;
        const creadorApellido = creador.empleado.apellido;


        const nuevasHoras = await HorasTrabajadas.create({
            horas,
            fecha,
            origen,
            inicio,
            fin,
            observaciones,
            empleadoId: id,
            creadorId,
        });

        

        notificarUsuario(1, {
            title: "Nueva Hora Manual Registrada",
            body: `${creadorNombre} ${creadorApellido} ha registrado ${horas} horas para ${nombre} ${apellido} el día ${new Date(fecha).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}.`,
            url: "/superuser/rrhh/empleados/" + id,
        })



        return NextResponse.json(nuevasHoras, { status: 201 });
    } catch (error) {
        console.log(error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(req, { params }) {
    const { id } = await params;
    try {
        const hora = await HorasTrabajadas.findOne({
            where: {
                id
            },
        });
        if (!hora) {
            return NextResponse.json({ message: "Hora no encontrada" }, { status: 404 });
        }
        await hora.destroy();
        return NextResponse.json({ message: "Hora eliminada exitosamente" }, { status: 200 });
    } catch (error) {
        console.error("Error deleting worked hour:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}