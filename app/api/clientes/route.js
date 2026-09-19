import { NextResponse } from 'next/server';
import { Cliente } from '@/models';
import { rolDe } from '@/app/constants/roles';
import { filtrarCambiosCliente } from '@/app/constants/clienteCampos';
import { requerirStaff } from '../inventario/_lib';

// GET: Listar todos los clientes
export async function GET() {
    try {
        const clientes = await Cliente.findAll({
            order: [['createdAt', 'DESC']]
        });
        
        return NextResponse.json(clientes, { status: 200 });
    } catch (error) {
        console.error("Error al obtener clientes:", error);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}

// POST: Crear un nuevo cliente
export async function POST(req) {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;

    try {
        // Solo se guardan los campos permitidos; el crédito (días y cupo de pedidos) únicamente si quien registra es administrador,
        // porque un vendedor también puede registrar clientes y no debe darse crédito a sí mismo
        const { cambios, error: errorCampo } = filtrarCambiosCliente(await req.json(), { esAdmin: rolDe(acceso.sesion) === 'admin' });
        if (errorCampo) return NextResponse.json({ error: errorCampo }, { status: 400 });

        // Validación básica obligatoria
        if (!cambios.identificacion) {
            return NextResponse.json({ error: 'La identificación (RIF/Cédula) es obligatoria' }, { status: 400 });
        }

        const nuevoCliente = await Cliente.create(cambios);
        
        return NextResponse.json(nuevoCliente, { status: 201 });
    } catch (error) {
        console.error("Error al crear cliente:", error);
        
        // Manejo de errores de validación (Email inválido o RIF duplicado)
        if (error.name === 'SequelizeUniqueConstraintError') {
            return NextResponse.json({ error: 'Ya existe un cliente con esta identificación o correo electrónico' }, { status: 409 });
        }
        if (error.name === 'SequelizeValidationError') {
            const mensajes = error.errors.map(e => e.message).join(', ');
            return NextResponse.json({ error: mensajes }, { status: 400 });
        }

        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}