// app/api/rrhh/departamentos/route.js
import { NextResponse } from 'next/server';
import db from '../../../../models';

export async function GET(request) {
  try {
    const departamentos = await db.Departamento.findAll({
      include: [{
        model: db.Puesto,
        as: 'puestos',
        include: [{
          model: db.Empleado,
          as: 'empleados',
        }],
      }],
      order: [['nombre', 'ASC']],
    });
    return NextResponse.json(departamentos);
  } catch (error) {
    console.error('Error fetching departamentos:', error);
    return NextResponse.json({ message: 'Error al obtener departamentos', error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const nuevoDepartamento = await db.Departamento.create(body);
    return NextResponse.json(nuevoDepartamento, { status: 201 });
  } catch (error) {
    console.error('Error creating departamento:', error);
    return NextResponse.json({ message: 'Error al crear departamento', error: error.message }, { status: 400 });
  }
}