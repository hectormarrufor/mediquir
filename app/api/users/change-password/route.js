import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { User } from '@/models';

export async function POST(req) {
  try {
    const { userId, currentPassword, newPassword } = await req.json();
    console.log(userId, currentPassword, newPassword)

    if (!userId || !currentPassword || !newPassword) {
      return NextResponse.json(
        { error: 'Faltan datos' },
        { status: 400 }
      );
    }

    // Buscar usuario en la base de datos
    const user = await User.findByPk(userId);
    if (!user) {
      return NextResponse.json(
        { error: 'Usuario no encontrado' },
        { status: 404 }
      );
    }

    // Verificar contraseña actual
    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Contraseña actual incorrecta' },
        { status: 401 }
      );
    }

    // Encriptar nueva contraseña
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Actualizar en la base de datos
    await user.update({ password: hashedPassword });

    return NextResponse.json({
      message: 'Contraseña actualizada correctamente',
      user: { id: user.id, email: user.email },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}