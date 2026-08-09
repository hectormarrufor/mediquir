// app/api/clientes/[id]/route.js
import { Empleado } from '@/models';
import User from '../../../../models/user';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const user = await User.findByPk(id, {
      include: [{model: Empleado, as: 'empleado'}] // Agregar asociaciones si es necesario
    });
    if (!user) {
      return Response.json({ error: 'usuario no encontrado' }, { status: 404 });
    }
    return Response.json(user);
  } catch (error) {
    console.error(`Error al obtener usuario ${params.id}:`, error);
    return Response.json({ error: 'Error al obtener usuario' }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const updatedUser = await request.json();
    const user = await User.findByPk(id);
    if (!user) {
      return Response.json({ error: 'usuario no encontrado' }, { status: 404 });
    }
    await user.update(updatedUser);
    const updatedUserBD = await User.findByPk(id);
    return Response.json(updatedUserBD);
  } catch (error) {
    console.error(`Error al actualizar usuario ${params.id}:`, error);
    return Response.json({ error: 'Error al actualizar usuario' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const user = await User.findByPk(id);
    if (!user) {
      return Response.json({ error: 'usuario no encontrado' }, { status: 404 });
    }
    await user.destroy();
    return Response.json({ message: 'usuario eliminado' });
  } catch (error) {
    console.error(`Error al eliminar usuario ${params.id}:`, error);
    return Response.json({ error: 'Error al eliminar usuario' }, { status: 500 });
  }
}