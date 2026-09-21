import { NextResponse } from 'next/server';
import db from '../../../../../models';
import { requerirAdmin, limpiar } from '../../_lib';

export async function GET(request, { params }) {
  const { id } = await params;
  try {
    const puesto = await db.Puesto.findByPk(id);
    if (!puesto) {
      return NextResponse.json({ message: 'Puesto no encontrado' }, { status: 404 });
    }
    return NextResponse.json(puesto);
  } catch (error) {
    console.error('Error fetching puesto:', error);
    return NextResponse.json({ message: 'Error al obtener puesto', error: error.message }, { status: 500 });
  }
}

// Lista blanca: sirve tanto al formulario completo como a la edición de una celda en la hoja
export async function PUT(request, { params }) {
  const acceso = await requerirAdmin();
  if (acceso.error) return acceso.error;
  const { id } = await params;
  try {
    const body = await request.json();
    const puesto = await db.Puesto.findByPk(id);
    if (!puesto) {
      return NextResponse.json({ message: 'Puesto no encontrado' }, { status: 404 });
    }
    const cambios = {};
    if ('nombre' in body) {
      cambios.nombre = limpiar(body.nombre);
      if (!cambios.nombre) return NextResponse.json({ message: 'El nombre es obligatorio' }, { status: 400 });
    }
    if ('descripcion' in body) cambios.descripcion = limpiar(body.descripcion);
    if ('salarioBaseSugerido' in body) {
      const s = limpiar(body.salarioBaseSugerido);
      if (s !== null && !(Number(s) >= 0)) return NextResponse.json({ message: 'El salario debe ser un número mayor o igual a 0' }, { status: 400 });
      cambios.salarioBaseSugerido = s === null ? null : Number(s);
    }
    if ('departamentoId' in body) {
      const d = Number(body.departamentoId);
      if (!Number.isInteger(d) || !(await db.Departamento.count({ where: { id: d } }))) return NextResponse.json({ message: 'Departamento no válido' }, { status: 400 });
      cambios.departamentoId = d;
    }
    await puesto.update(cambios);
    return NextResponse.json(puesto);
  } catch (error) {
    console.error('Error updating puesto:', error);
    const duplicado = error.name === 'SequelizeUniqueConstraintError';
    return NextResponse.json({ message: duplicado ? 'Ya existe un puesto con ese nombre' : 'Error al actualizar puesto', error: error.message }, { status: duplicado ? 409 : 400 });
  }
}

export async function DELETE(request, { params }) {
  const acceso = await requerirAdmin();
  if (acceso.error) return acceso.error;
  const { id } = await params;
  try {
    const puesto = await db.Puesto.findByPk(id);
    if (!puesto) {
      return NextResponse.json({ message: 'Puesto no encontrado' }, { status: 404 });
    }
    const ocupantes = await db.EmpleadoPuesto.count({ where: { puestoId: id } });
    if (ocupantes > 0) {
      return NextResponse.json({ message: `Tiene ${ocupantes} empleado(s) asignado(s). Reasígnalos antes de eliminarlo.` }, { status: 409 });
    }
    await puesto.destroy();
    return NextResponse.json({ message: 'Puesto eliminado exitosamente' }, { status: 200 });
  } catch (error) {
    console.error('Error deleting puesto:', error);
    return NextResponse.json({ message: 'Error al eliminar puesto', error: error.message }, { status: 500 });
  }
}
