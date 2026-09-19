// app/api/users/[id]/route.js
import bcrypt from 'bcryptjs';
import { Empleado } from '@/models';
import User from '../../../../models/user';
import { requerirStaff } from '../../inventario/_lib';
import { requerirAdmin } from '../../_lib/acceso';

const sinPassword = (usuario) => {
  const { password, ...resto } = usuario.toJSON ? usuario.toJSON() : usuario;
  return resto;
};

export async function GET(request, { params }) {
  const acceso = await requerirStaff();
  if (acceso.error) return acceso.error;
  try {
    const { id } = await params;
    const user = await User.findByPk(id, {
      attributes: { exclude: ['password'] },
      include: [{ model: Empleado, as: 'empleado' }],
    });
    if (!user) return Response.json({ error: 'usuario no encontrado' }, { status: 404 });
    return Response.json(user);
  } catch (error) {
    console.error('Error al obtener usuario:', error);
    return Response.json({ error: 'Error al obtener usuario' }, { status: 500 });
  }
}

// El personal puede editar datos de un usuario; los campos de privilegio (isAdmin, empleado, cliente) solo un administrador.
export async function PUT(request, { params }) {
  const acceso = await requerirStaff();
  if (acceso.error) return acceso.error;
  try {
    const { id } = await params;
    const cambios = { ...(await request.json()) };
    const user = await User.findByPk(id);
    if (!user) return Response.json({ error: 'usuario no encontrado' }, { status: 404 });

    delete cambios.id;
    if (!acceso.sesion.isAdmin) {
      delete cambios.isAdmin;
      delete cambios.empleadoId;
      delete cambios.clienteId;
    }
    // La contraseña siempre se guarda con hash (antes se guardaba en texto plano y el usuario ya no podía entrar)
    if (cambios.password) cambios.password = await bcrypt.hash(cambios.password, parseInt(process.env.SALT_ROUNDS));
    else delete cambios.password;

    await user.update(cambios);
    return Response.json(sinPassword(await User.findByPk(id)));
  } catch (error) {
    console.error('Error al actualizar usuario:', error);
    return Response.json({ error: 'Error al actualizar usuario' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const acceso = await requerirAdmin();
  if (acceso.error) return acceso.error;
  try {
    const { id } = await params;
    const user = await User.findByPk(id);
    if (!user) return Response.json({ error: 'usuario no encontrado' }, { status: 404 });
    if (Number(id) === Number(acceso.sesion.id)) return Response.json({ error: 'No puedes eliminar tu propio usuario' }, { status: 400 });
    await user.destroy();
    return Response.json({ message: 'usuario eliminado' });
  } catch (error) {
    console.error('Error al eliminar usuario:', error);
    return Response.json({ error: 'Error al eliminar usuario' }, { status: 500 });
  }
}
