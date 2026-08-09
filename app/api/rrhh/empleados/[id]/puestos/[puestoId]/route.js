import { NextResponse } from 'next/server';
import db from '../../../../../../../models';

export async function DELETE(request, { params }) {
  const { empleadoId, puestoId } = await params;
  try {
    const empleadoPuesto = await db.EmpleadoPuesto.findOne({
      where: {
        empleadoId: empleadoId,
        puestoId: puestoId,
        fechaFin: null // Solo desasignar si está activo
      }
    });

    if (!empleadoPuesto) {
      return NextResponse.json({ message: 'Asignación de puesto no encontrada o ya finalizada' }, { status: 404 });
    }

    // Marcar como finalizado en lugar de eliminar
    await empleadoPuesto.update({ fechaFin: new Date() });

    return NextResponse.json({ message: 'Puesto desasignado exitosamente' }, { status: 200 });
  } catch (error) {
    console.error('Error deassigning position from employee:', error);
    return NextResponse.json({ message: 'Error al desasignar puesto de empleado', error: error.message }, { status: 500 });
  }
}