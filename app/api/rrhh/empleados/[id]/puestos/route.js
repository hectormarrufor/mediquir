import { NextResponse } from 'next/server';
import db from '../../../../../../models';

export async function GET(request, { params }) {
  const { empleadoId } = await params;
  try {
    const empleado = await db.Empleado.findByPk(empleadoId);
    if (!empleado) {
      return NextResponse.json({ message: 'Empleado no encontrado' }, { status: 404 });
    }

    const puestos = await empleado.getPuestos({
      through: { attributes: ['fechaAsignacion', 'fechaFin'] } // Incluye atributos de la tabla intermedia
    });

    return NextResponse.json(puestos);
  } catch (error) {
    console.error('Error fetching employee positions:', error);
    return NextResponse.json({ message: 'Error al obtener puestos del empleado', error: error.message }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  const { empleadoId } = await params;
  try {
    const body = await request.json(); // Espera { puestoId: 1, fechaAsignacion: 'YYYY-MM-DD' }
    const { puestoId, fechaAsignacion } = body;

    const empleado = await db.Empleado.findByPk(empleadoId);
    if (!empleado) {
      return NextResponse.json({ message: 'Empleado no encontrado' }, { status: 404 });
    }

    const puesto = await db.Puesto.findByPk(puestoId);
    if (!puesto) {
      return NextResponse.json({ message: 'Puesto no encontrado' }, { status: 404 });
    }

    // Asignar el puesto al empleado a través de la tabla intermedia
    const [empleadoPuesto, created] = await db.EmpleadoPuesto.findOrCreate({
      where: { empleadoId: empleado.id, puestoId: puesto.id, fechaFin: null }, // Busca una asignación activa
      defaults: { fechaAsignacion: fechaAsignacion || new Date() }
    });

    if (!created) {
      return NextResponse.json({ message: 'El empleado ya tiene este puesto asignado activamente.' }, { status: 409 });
    }

    return NextResponse.json(empleadoPuesto, { status: 201 });
  } catch (error) {
    console.error('Error assigning position to employee:', error);
    return NextResponse.json({ message: 'Error al asignar puesto a empleado', error: error.message }, { status: 400 });
  }
}