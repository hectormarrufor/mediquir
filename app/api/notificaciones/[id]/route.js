import { NextResponse } from 'next/server';
import { Notificacion, User } from '@/models'; // Solo necesitamos estos modelos
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';

export async function DELETE(request, { params }) {
    try {
        // 1. Obtener ID de la URL (Recuerda que en Next.js 15 params es una promesa)
        const { id } = await params;

        // 2. Autenticación (Reutilizada de tu GET)
        const cookieStore = await cookies();
        const token = cookieStore.get('token')?.value;

        if (!token) {
            return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
        }

        // 3. Verificar Token
        const secret = new TextEncoder().encode(process.env.JWT_SECRET);
        const { payload } = await jwtVerify(token, secret);

        // 4. Verificar Permisos de Administrador
        // Buscamos al usuario para confirmar que tenga permisos para borrar.
        const usuario = await User.findByPk(payload.id);

        if (!usuario) {
            return NextResponse.json({ success: false, error: 'Usuario no encontrado' }, { status: 404 });
        }

        // ASUMIMOS que tu modelo User tiene el campo 'isAdmin' como mostraste antes.
        // Si usas roles por string, cambia esto a: if (usuario.rol !== 'Admin')
        if (!usuario.isAdmin) {
            return NextResponse.json(
                { success: false, error: 'Prohibido. Solo los administradores pueden borrar el historial.' },
                { status: 403 }
            );
        }

        // 5. Ejecutar la eliminación en la Base de Datos
        const filasBorradas = await Notificacion.destroy({
            where: { id: id }
        });

        if (filasBorradas === 0) {
            return NextResponse.json({ success: false, error: 'La notificación no existe o ya fue borrada' }, { status: 404 });
        }

        return NextResponse.json({ success: true, message: 'Notificación eliminada' });

    } catch (error) {
        console.error('Error eliminando notificación:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}