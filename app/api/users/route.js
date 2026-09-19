// app/api/users/route.js
import { Empleado, User } from '@/models';
import bcrypt from 'bcryptjs';
import { requerirStaff } from '../inventario/_lib';

// El hash de la contraseña no sale nunca de la API
const sinPassword = (usuario) => {
  const { password, ...resto } = usuario.toJSON ? usuario.toJSON() : usuario;
  return resto;
};

// GET /api/users - Obtener todos los usuarios (solo personal; el middleware ya exige sesión)
export async function GET() {
  const acceso = await requerirStaff();
  if (acceso.error) return acceso.error;
  try {
    const usuarios = await User.findAll({
      attributes: { exclude: ['password'] },
      include: [{ model: Empleado, as: 'empleado', attributes: ['nombre', 'apellido'] }],
    });
    return Response.json(usuarios, { status: 200 });
  } catch (error) {
    console.error('Error al obtener usuarios:', error.message);
    return Response.json({ error: 'Error al obtener usuarios' }, { status: 500 });
  }
}

// POST /api/users - Crear un nuevo usuario
//  · Si aún no existe ningún administrador, cualquiera puede crear EL PRIMERO (arranque del sistema, desde el login).
//  · Después, solo el personal con sesión crea usuarios, y solo un administrador puede darle isAdmin a alguien.
export async function POST(request) {
  try {
    const usuario = await request.json();
    const { user, password, empleadoId, clienteId } = usuario;
    let { isAdmin } = usuario;

    const hayAdmin = (await User.count({ where: { isAdmin: true } })) > 0;
    if (hayAdmin) {
      const acceso = await requerirStaff();
      if (acceso.error) return acceso.error;
      if (!acceso.sesion.isAdmin) isAdmin = false;
    } else if (!isAdmin) {
      return Response.json({ error: 'Aún no hay administrador: el primer usuario debe serlo' }, { status: 400 });
    }

    if (!user) return Response.json({ error: 'Usuario es requerido' }, { status: 400 });
    if (!password) return Response.json({ error: 'Contraseña es requerida' }, { status: 400 });
    if (!empleadoId && !clienteId && !isAdmin) {
      return Response.json({ error: 'Se requiere al menos un empleadoId, clienteId o isAdmin' }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, parseInt(process.env.SALT_ROUNDS));
    const nuevoUsuario = await User.create({ ...usuario, isAdmin: Boolean(isAdmin), password: hashedPassword });

    return Response.json(sinPassword(nuevoUsuario), { status: 201 });
  } catch (error) {
    console.error('Error al crear usuario:', error);
    return Response.json({ error: `Error al crear usuario: ${error.message}` }, { status: 500 });
  }
}
