import { NextResponse } from "next/server";
import { HorasTrabajadas, Empleado, User } from "@/models";
import { Op } from "sequelize";
import { notificarUsuario } from "@/app/handlers/notificar";

export async function GET() {
    try {
        const horas = await HorasTrabajadas.findAll({
            where: {
                origen: { [Op.ne]: 'odt' } // Traer todo lo que NO sea 'odt' (ej: 'manual', 'taller')
            },
            include: [
                { 
                    model: Empleado, 
                    attributes: ['id', 'nombre', 'apellido', 'imagen']
                }
            ]
        });
        return NextResponse.json(horas);
    } catch (error) {
        console.log("Error en GET /rrhh/horas-manuales:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        const body = await req.json();
        const { empleadoId, fecha, horas, inicio, fin, observaciones, creadorId } = body;

        const creador = await User.findByPk(creadorId, {include: [{model: Empleado, as: 'empleado'}]});
        const empleado = await Empleado.findByPk(empleadoId);

        const nuevoRegistro = await HorasTrabajadas.create({
            empleadoId,
            fecha,
            horas,
            inicio,
            fin,
            observaciones,
            origen: 'manual', // Importante para distinguirlo de ODTs
            creadorId: creadorId
        });

        

        notificarUsuario(1 , {
            title: "Nueva Hora Manual Registrada",
            body: `${creador.empleado.nombre} ${creador.empleado.apellido} ha registrado ${horas} horas para ${empleado.nombre} ${empleado.apellido} el día ${new Date(fecha).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}.`,
            url: "/superuser/rrhh/empleados/" + empleadoId,
        })

        return NextResponse.json(nuevoRegistro);
    } catch (error) {
        console.log("Error en POST /rrhh/horas-manuales:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}