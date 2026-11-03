import { NextResponse } from 'next/server';
import { Proveedor } from '@/models';
import { requerirStaff } from '@/app/api/inventario/_lib';
import { datosProveedor, rifRepetido } from './_datos';

// GET: proveedores ACTIVOS, para los selectores (registro de compras). La pantalla de proveedores usa /api/proveedores/resumen.
export async function GET() {
    const { error } = await requerirStaff();
    if (error) return error;
    try {
        const proveedores = await Proveedor.findAll({
            where: { activo: true },
            order: [['nombre', 'ASC']]
        });
        return NextResponse.json(proveedores);
    } catch (err) {
        console.error('Error al obtener proveedores:', err);
        return NextResponse.json({ error: 'Error al obtener la lista de proveedores' }, { status: 500 });
    }
}

// POST: crear un proveedor (desde la pantalla de proveedores o desde el registro de compras).
// El porcentaje de retención de IVA es obligatorio: no se asume 75 %.
export async function POST(request) {
    const { error } = await requerirStaff();
    if (error) return error;
    try {
        const { datos, error: invalido } = datosProveedor(await request.json(), { creando: true });
        if (invalido) return NextResponse.json({ error: invalido }, { status: 400 });

        const otro = await rifRepetido(datos.identificacion);
        if (otro) return NextResponse.json({ error: `Ya existe un proveedor con ese RIF: ${otro.nombre} (${otro.identificacion})` }, { status: 409 });

        const nuevoProveedor = await Proveedor.create(datos);
        return NextResponse.json(nuevoProveedor, { status: 201 });
    } catch (err) {
        console.error('Error al crear proveedor:', err);
        if (err.name === 'SequelizeUniqueConstraintError') {
            return NextResponse.json({ error: 'Ya existe un proveedor registrado con ese RIF' }, { status: 409 });
        }
        if (err.name === 'SequelizeValidationError') {
            return NextResponse.json({ error: err.errors.map((e) => e.message).join(', ') }, { status: 400 });
        }
        return NextResponse.json({ error: 'Error interno al registrar el proveedor' }, { status: 500 });
    }
}
