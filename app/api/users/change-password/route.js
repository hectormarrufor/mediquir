import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { User } from '@/models';
import { getSesion } from '../../notificaciones/_lib';

// Cada persona cambia SU contraseña: el usuario sale de la sesión, no del cuerpo de la petición.
export async function POST(req) {
  try {
    const sesion = await getSesion();
    if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { currentPassword, newPassword } = await req.json();
    if (!currentPassword || !newPassword) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });
    if (String(newPassword).length < 6) return NextResponse.json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' }, { status: 400 });

    const user = await User.findByPk(sesion.id);
    if (!user) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });

    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) return NextResponse.json({ error: 'Contraseña actual incorrecta' }, { status: 401 });

    const hashedPassword = await bcrypt.hash(newPassword, parseInt(process.env.SALT_ROUNDS));
    await user.update({ password: hashedPassword });

    return NextResponse.json({ message: 'Contraseña actualizada correctamente', user: { id: user.id } });
  } catch (error) {
    console.error('Error cambiando contraseña:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
