import { NextResponse } from 'next/server';
import db from '@/models';
import { requerirAdministracion } from '../_lib';

export const dynamic = 'force-dynamic';

// Empleados activos para elegir en el formulario de recibos: solo lo necesario, y si ya tienen usuario (para confirmar desde su teléfono)
export async function GET() {
    const acceso = await requerirAdministracion();
    if (acceso.error) return acceso.error;
    try {
        const empleados = await db.Empleado.findAll({
            where: { estado: 'Activo' },
            attributes: ['id', 'nombre', 'apellido', 'cedula'],
            include: [
                { model: db.Puesto, as: 'puestos', attributes: ['nombre'], through: { attributes: [] } },
                { model: db.User, as: 'usuario', attributes: ['id'], required: false },
            ],
            order: [['nombre', 'ASC']],
        });
        return NextResponse.json(empleados.map((e) => ({
            id: e.id, nombre: `${e.nombre} ${e.apellido}`.trim(), cedula: e.cedula,
            cargo: (e.puestos || []).map((p) => p.nombre).join(' / '), tieneUsuario: Boolean(e.usuario),
        })));
    } catch (error) {
        console.error('Empleados para recibos:', error);
        return NextResponse.json({ error: 'No se pudieron cargar los empleados' }, { status: 500 });
    }
}
