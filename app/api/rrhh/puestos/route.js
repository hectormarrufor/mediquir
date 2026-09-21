import { NextResponse } from 'next/server';
import db from '../../../../models';
import { requerirAdmin } from '../_lib';

export async function GET(request) {
  try {
    const puestos = await db.Puesto.findAll({
      include: [
        { model: db.Departamento, as: 'departamento', attributes: ['id', 'nombre'] },
        { model: db.Empleado, as: 'empleados', attributes: ['id', 'nombre', 'apellido', 'imagen', 'estado'], through: { attributes: [] } },
      ],
      order: [['nombre', 'ASC']],
    });
    return NextResponse.json(puestos);
  } catch (error) {
    console.error('Error fetching puestos:', error);
    return NextResponse.json({ message: 'Error al obtener puestos', error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  const acceso = await requerirAdmin();
  if (acceso.error) return acceso.error;
  try {
    const body = await request.json();
    const nuevoPuesto = await db.Puesto.create(body);
    return NextResponse.json(nuevoPuesto, { status: 201 });
  } catch (error) {
    console.error('Error creating puesto:', error);
    return NextResponse.json({ message: 'Error al crear puesto', error: error.message }, { status: 400 });
  }
}
