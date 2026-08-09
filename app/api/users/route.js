// app/api/users/route.js
import { Empleado, User } from '@/models';
import bcrypt from 'bcryptjs'; // No olvides importar bcrypt

// GET /api/users - Obtener todos los usuarios
export async function GET() {
  try {
    const usuarios = await User.findAll(
      {
        include: [
          {
            model: Empleado, // Importamos el modelo Empleado
            as: 'empleado', // Asegúrate de que el alias coincida con tu asociación en el modelo User
            attributes: ['nombre', 'apellido'] // Solo traemos el nombre y apellido del empleado
          }
        ]
      }
    );

    return Response.json(usuarios, { status: 200 });
  } catch (error) {
    console.log(`\x1b[32m\x1b[41m [ERROR]: Error al obtener usuarios: ${error.message} \x1b[0m`);
    return Response.json({ error:  `Error al obtener usuarios: ${error.message}` }, { status: 500 });
  }
}


// POST /api/users - Crear un nuevo usuario
export async function POST(request) {
  
  try {
    const usuario = await request.json();
    const {user, password, empleadoId, isAdmin, clienteId} = usuario;
    
    // Validación básica
    if (!user) {
      console.log(`\x1b[41m [ERROR]: Se requiere ingresar un usuario \x1b[0m`);
      throw new Error('Usuario es requerido');
    }
    if (!password) {
      console.log(`\x1b[41m [ERROR]: Se requiere ingresar una contraseña \x1b[0m`);
      throw new Error('Contraseña es requerida');
    }
   if (!empleadoId && !clienteId && !isAdmin) {
      console.log(`\x1b[41m [ERROR]: Se requiere al menos un empleadoId, clienteId o isAdmin \x1b[0m`);
      throw new Error('Se requiere al menos un empleadoId, clienteId o isAdmin');
    }

    // --- SOLUCIÓN: Encriptar la contraseña ---
    const hashedPassword = await bcrypt.hash(password, parseInt(process.env.SALT_ROUNDS));

    // Creamos el usuario, pero sobreescribimos el password con la versión hasheada
    let nuevoUsuario = await User.create({
        ...usuario, // Trae todos los demás campos (user, empleadoId, etc.)
        password: hashedPassword // Reemplaza la contraseña en texto plano
    });
   
    return Response.json(nuevoUsuario, { status: 201 });
  } catch (error) {
    return Response.json({ error: `Error al crear usuario: ${error}`  }, { status: 500 });
  }
}