import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { Cliente , User, Empleado } from '@/models';
import { notificarCabezas } from '@/app/handlers/notificar';

export async function GET(request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;

    if (!token) {
      return Response.json({ error: 'No token provided' }, { status: 401 });
    }

    // 1. Verificación Matemática (Lo que ya tenías)
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 2. VERIFICACIÓN DE VIDA (LO NUEVO)
    // Buscamos si el usuario realmente existe en la BD y si está activo
    const usuarioDb = await User.findByPk(decoded.id, {
        attributes: ['id'], // Solo traemos lo necesario para ser rápidos
        include: [{model: Empleado, as: 'empleado', attributes: ["estado", "nombre", "apellido", "id"]},
      { model: Cliente, as: 'cliente', attributes: ['id', 'nombre'] }
      ] // Ejemplo si necesitas incluir relaciones
    });

    // Si no existe (fue borrado) o está inactivo -> ERROR 401
    if (decoded.id !== 1) {if (!usuarioDb || usuarioDb.empleado?.estado !== 'Activo') {
      notificarCabezas({
        title: 'Alerta de Seguridad',
        body: `Usuario ${usuarioDb.empleado?.nombre} ${usuarioDb.empleado?.apellido} intentó acceder pero está BORRADO o INACTIVO.`,
        url: 'superuser/rrhh/empleados/' + usuarioDb.empleado?.id // Link directo a la lista de empleados para revisión rápida
      })
         console.log(`\x1b[41m [SECURITY] Usuario ID ${decoded.id} intentó entrar pero está BORRADO o INACTIVO \x1b[0m`);
         // Opcional: Podrías borrar la cookie aquí mismo para limpiar
         return Response.json({ error: 'Usuario revocado' }, { status: 401 });
    }}

    // 3. Si pasó la prueba, retornamos la info (puedes retornar decoded o usuarioDb fresco)
    console.log(`\x1b[44m [DEBUG] Usuario verificado en BD. \x1b[0m`);
    
    return Response.json({
      rol: decoded.isAdmin ? "admin" : decoded.puestos.length > 0 ? decoded.puestos?.map(puesto => puesto.nombre).join(" - ") : "user", 
      id: decoded.id, 
      imagen: decoded.imagen,
      nombre: decoded.nombre, 
      apellido: decoded.apellido, 
      isAuthenticated: decoded.isAuthenticated, 
      isAdmin: decoded.isAdmin, 
      clienteId: usuarioDb.cliente?.id,
      isCliente: Boolean(usuarioDb.cliente?.id),
      empleadoId: usuarioDb.empleado?.id,
      departamentos: decoded.departamentos.length > 0 ? decoded.departamentos?.map(departamento => departamento.nombre) : [], 
      puestos: decoded.puestos.length > 0 ? decoded.puestos?.map(puesto => puesto.nombre) : []
    }, 
      { status: 200 }
    );
  } catch (error) {
    console.log(`\x1b[41m Error sesión: ${error.message} \x1b[0m`);
    // Si el token es inválido o expiró, jwt.verify lanza error, que cae aquí
    return Response.json({ error: 'Token inválido' }, { status: 401 });
  }
}