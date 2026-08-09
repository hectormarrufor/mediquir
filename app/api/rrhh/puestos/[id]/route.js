import { NextResponse } from 'next/server';
import db from '../../../../../models';

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

export async function PUT(request, { params }) {
  const { id } = await params;
  try {
    const body = await request.json();
    const puesto = await db.Puesto.findByPk(id);
    if (!puesto) {
      return NextResponse.json({ message: 'Puesto no encontrado' }, { status: 404 });
    }
    await puesto.update(body);
    return NextResponse.json(puesto);
  } catch (error) {
    console.error('Error updating puesto:', error);
    return NextResponse.json({ message: 'Error al actualizar puesto', error: error.message }, { status: 400 });
  }
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  try {
    const puesto = await db.Puesto.findByPk(id);
    if (!puesto) {
      return NextResponse.json({ message: 'Puesto no encontrado' }, { status: 404 });
    }
    await puesto.destroy(); // O considerar eliminación lógica si aplica a puestos
    return NextResponse.json({ message: 'Puesto eliminado exitosamente' }, { status: 200 });
  } catch (error) {
    console.error('Error deleting puesto:', error);
    return NextResponse.json({ message: 'Error al eliminar puesto', error: error.message }, { status: 500 });
  }
}