// app/api/rrhh/departamentos/route.js
import { NextResponse } from 'next/server';
import db from '../../../../models';
import { requerirAdmin, limpiar } from '../_lib';

export async function GET(request) {
  try {
    const departamentos = await db.Departamento.findAll({
      include: [{
        model: db.Puesto,
        as: 'puestos',
        include: [{
          model: db.Empleado,
          as: 'empleados',
          attributes: ['id', 'nombre', 'apellido', 'imagen', 'estado'],
          through: { attributes: [] },
        }],
      }],
      order: [['nombre', 'ASC'], [{ model: db.Puesto, as: 'puestos' }, 'nombre', 'ASC']],
    });
    return NextResponse.json(departamentos);
  } catch (error) {
    console.error('Error fetching departamentos:', error);
    return NextResponse.json({ message: 'Error al obtener departamentos', error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  const acceso = await requerirAdmin();
  if (acceso.error) return acceso.error;
  try {
    const body = await request.json();
    const nombre = limpiar(body.nombre);
    if (!nombre) return NextResponse.json({ message: 'El nombre es obligatorio' }, { status: 400 });
    const nuevoDepartamento = await db.Departamento.create({ nombre, descripcion: limpiar(body.descripcion) });
    return NextResponse.json(nuevoDepartamento, { status: 201 });
  } catch (error) {
    console.error('Error creating departamento:', error);
    const duplicado = error.name === 'SequelizeUniqueConstraintError';
    return NextResponse.json({ message: duplicado ? 'Ya existe un departamento con ese nombre' : 'Error al crear departamento', error: error.message }, { status: duplicado ? 409 : 400 });
  }
}
