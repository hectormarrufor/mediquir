// app/api/rrhh/departamentos/[id]/route.js
import { NextResponse } from 'next/server';
import db from '../../../../../models';
import { requerirAdmin, limpiar } from '../../_lib';

export async function GET(request, { params }) {
  const { id } = await params;
  try {
    const departamento = await db.Departamento.findByPk(id, {
      include: [{
        model: db.Puesto,
        as: 'puestos',
        include: [{ model: db.Empleado, as: 'empleados', attributes: ['id', 'nombre', 'apellido', 'imagen', 'estado'], through: { attributes: [] } }],
      }],
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
  const acceso = await requerirAdmin();
  if (acceso.error) return acceso.error;
  const { id } = await params;
  try {
    const body = await request.json();
    const departamento = await db.Departamento.findByPk(id);
    if (!departamento) {
      return NextResponse.json({ message: 'Departamento no encontrado' }, { status: 404 });
    }
    const cambios = {};
    if ('nombre' in body) {
      cambios.nombre = limpiar(body.nombre);
      if (!cambios.nombre) return NextResponse.json({ message: 'El nombre es obligatorio' }, { status: 400 });
    }
    if ('descripcion' in body) cambios.descripcion = limpiar(body.descripcion);
    await departamento.update(cambios);
    return NextResponse.json(departamento);
  } catch (error) {
    console.error('Error updating departamento:', error);
    const duplicado = error.name === 'SequelizeUniqueConstraintError';
    return NextResponse.json({ message: duplicado ? 'Ya existe un departamento con ese nombre' : 'Error al actualizar departamento', error: error.message }, { status: duplicado ? 409 : 400 });
  }
}

export async function DELETE(request, { params }) {
  const acceso = await requerirAdmin();
  if (acceso.error) return acceso.error;
  const { id } = await params;
  try {
    const departamento = await db.Departamento.findByPk(id);
    if (!departamento) {
      return NextResponse.json({ message: 'Departamento no encontrado' }, { status: 404 });
    }
    // Los empleados cuelgan de los puestos: un departamento con puestos no se borra
    const puestos = await db.Puesto.count({ where: { departamentoId: id } });
    if (puestos > 0) {
      return NextResponse.json({ message: `Tiene ${puestos} puesto(s) asignado(s). Mueve o elimina esos puestos primero.` }, { status: 409 });
    }
    await departamento.destroy();
    return NextResponse.json({ message: 'Departamento eliminado exitosamente' }, { status: 200 });
  } catch (error) {
    console.error('Error deleting departamento:', error);
    return NextResponse.json({ message: 'Error al eliminar departamento', error: error.message }, { status: 500 });
  }
}
