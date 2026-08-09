import { NextResponse } from 'next/server';
import { SalidaInventario, Consumible, Activo, User, Empleado} from '@/models';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';

export async function GET(request) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('token')?.value;
        if (!token) {
            return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
        }

        const secret = new TextEncoder().encode(process.env.JWT_SECRET);
        const { payload } = await jwtVerify(token, secret);

        // Buscamos únicamente ítems ya firmados ('Entregada') de este usuario específico
        const misItems = await SalidaInventario.findAll({
            where: {
                solicitadoPorId: payload.id,
                estado: 'Entregada'
            },
            include: [
                { model: Consumible, as: 'consumible' },
                { model: Activo, as: 'activo' },
                { 
                    model: User, 
                    as: 'despachador', 
                    include: [{ model: Empleado, as: 'empleado' }] 
                }
            ],
            order: [['updatedAt', 'DESC']]
        });

        return NextResponse.json({ success: true, data: misItems });

    } catch (error) {
        console.error('Error obteniendo items en custodia:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}