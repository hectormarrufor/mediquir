// app/api/rrhh/departamentos/[id]/route.js
import { NextResponse } from 'next/server';
import db from '../../../../../models';

export async function GET(request, { params }) {
  const { id } = await params;
  try {
    const departamento = await db.Departamento.findByPk(id, {
      include: [{
        model: db.Empleado,
        as: 'empleados',
      }]
    });
    if (!departamento) {
      return NextResponse.json({ message: 'Departamento no encontrado' }, { status: 404 });
    }
    return NextResponse.json(departamento);
  } catch (error) {
    console.error('Error fetching departamento:', error);
    return NextResponse.json({ message: 'Error al obtener departamento', error: error.message }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  const { id } = await params;
  try {
    const body = await request.json();
    const departamento = await db.Departamento.findByPk(id);
    if (!departamento) {
      return NextResponse.json({ message: 'Departamento no encontrado' }, { status: 404 });
    }
    await departamento.update(body);
    return NextResponse.json(departamento);
  } catch (error) {
    console.error('Error updating departamento:', error);
    return NextResponse.json({ message: 'Error al actualizar departamento', error: error.message }, { status: 400 });
  }
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  try {
    const departamento = await db.Departamento.findByPk(id);
    if (!departamento) {
      return NextResponse.json({ message: 'Departamento no encontrado' }, { status: 404 });
    }

    // Opcional: Verificar si hay empleados en este departamento antes de eliminar
    const empleadosCount = await db.Empleado.count({ where: { departamentoId: id } });
    if (empleadosCount > 0) {
      return NextResponse.json({ message: 'No se puede eliminar el departamento porque tiene empleados asignados.' }, { status: 400 });
    }
    
    await departamento.destroy();
    return NextResponse.json({ message: 'Departamento eliminado exitosamente' }, { status: 200 });
  } catch (error) {
    console.error('Error deleting departamento:', error);
    return NextResponse.json({ message: 'Error al eliminar departamento', error: error.message }, { status: 500 });
  }
}