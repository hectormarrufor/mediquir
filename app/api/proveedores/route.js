import { NextResponse } from 'next/server';
import db from '@/models';
const { Proveedor } = db;

// GET: Listar todos los proveedores activos para poblar el select
export async function GET() {
    try {
        const proveedores = await Proveedor.findAll({
            where: { activo: true },
            order: [['nombre', 'ASC']]
        });
        return NextResponse.json(proveedores);
    } catch (error) {
        console.error('Error al obtener proveedores:', error);
        return NextResponse.json({ error: 'Error al obtener la lista de proveedores' }, { status: 500 });
    }
}

// POST: Crear un proveedor nuevo (desde el modal de compras)
export async function POST(request) {
    try {
        const body = await request.json();
        const {
            identificacion,
            nombre,
            telefono,
            email,
            direccion,
            esContribuyenteEspecial,
            retencionIvaPorDefecto,
            notas
        } = body;

        if (!identificacion || !nombre) {
            return NextResponse.json({ error: 'La identificación (RIF) y el nombre son obligatorios' }, { status: 400 });
        }

        const nuevoProveedor = await Proveedor.create({
            identificacion,
            nombre,
            telefono: telefono || null,
            email: email || null,
            direccion: direccion || null,
            esContribuyenteEspecial: esContribuyenteEspecial || false,
            retencionIvaPorDefecto: Number(retencionIvaPorDefecto) || 75,
            notas: notas || null,
            activo: true
        });

        return NextResponse.json(nuevoProveedor, { status: 201 });
    } catch (error) {
        console.error('Error al crear proveedor:', error);
        if (error.name === 'SequelizeUniqueConstraintError') {
            return NextResponse.json({ error: 'Ya existe un proveedor registrado con ese RIF/Identificación' }, { status: 400 });
        }
        return NextResponse.json({ error: 'Error interno al registrar el proveedor', detalle: error.message }, { status: 500 });
    }
}