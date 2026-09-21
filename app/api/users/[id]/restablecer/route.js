import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { User } from '@/models';
import { requerirAdmin } from '../../../_lib/acceso';
import { claveTemporal } from '../../../_lib/claveTemporal';

export const dynamic = 'force-dynamic';

// Restablece la contraseña de un usuario EMPLEADO: genera una clave temporal (recuperación de contraseña).
// Solo administradores. La clave se devuelve UNA vez; en la base queda únicamente su hash.
// (Los usuarios de clientes se restablecen desde su ficha: /api/clientes/[id]/acceso.)
export async function POST(request, { params }) {
    const acceso = await requerirAdmin();
    if (acceso.error) return acceso.error;
    try {
        const { id } = await params;
        const usuario = await User.findByPk(id);
        if (!usuario) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
        if (!usuario.empleadoId) return NextResponse.json({ error: 'Este usuario no pertenece a un empleado' }, { status: 400 });
        if (Number(id) === Number(acceso.sesion.id)) return NextResponse.json({ error: 'Para cambiar tu propia contraseña usa tu perfil' }, { status: 400 });

        const clave = claveTemporal();
        await usuario.update({ password: await bcrypt.hash(clave, parseInt(process.env.SALT_ROUNDS)) });
        return NextResponse.json({ user: usuario.user, password: clave });
    } catch (error) {
        console.error('Restablecer contraseña de empleado:', error);
        return NextResponse.json({ error: 'No se pudo restablecer la contraseña' }, { status: 500 });
    }
}
