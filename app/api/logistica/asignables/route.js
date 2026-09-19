import { NextResponse } from 'next/server';
import { Empleado, User } from '@/models';
import { requerirNoVendedor } from '../../_lib/acceso';

export const dynamic = 'force-dynamic';

// Personal que puede recibir tareas de empaque y etiquetado. El valor es el id del USUARIO (no del empleado):
// es lo que guardan empacadorId / etiquetadorId en la venta.
export async function GET() {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;

    try {
        const usuarios = await User.findAll({
            where: { clienteId: null },
            attributes: ['id', 'user', 'empleadoId'],
            include: [{ model: Empleado, as: 'empleado', required: true, attributes: ['nombre', 'apellido', 'estado'] }],
            order: [['id', 'ASC']],
        });
        return NextResponse.json(
            usuarios
                .filter((u) => u.empleado?.estado === 'Activo')
                .map((u) => ({ id: u.id, nombre: `${u.empleado.nombre} ${u.empleado.apellido}`.trim() }))
        );
    } catch (error) {
        console.error('Personal asignable:', error);
        return NextResponse.json({ error: 'No se pudo cargar el personal' }, { status: 500 });
    }
}
