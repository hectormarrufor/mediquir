import { NextResponse } from 'next/server';
import { Proveedor } from '@/models';
import { rolDe } from '@/app/constants/roles';
import { requerirStaff } from '@/app/api/inventario/_lib';
import { datosProveedor, rifRepetido } from '../_datos';

// PUT /api/proveedores/:id  -> cambiar sus datos, su retención de IVA o desactivarlo (activo: false: deja de salir al registrar compras;
// no se borra porque sus compras, cuentas por pagar y retenciones lo siguen usando). Un vendedor no cambia proveedores.
export async function PUT(request, { params }) {
    const { sesion, error } = await requerirStaff();
    if (error) return error;
    if (rolDe(sesion) === 'vendedor') return NextResponse.json({ error: 'No tienes permiso para cambiar proveedores' }, { status: 403 });

    try {
        const { id } = await params;
        const proveedor = await Proveedor.findByPk(id);
        if (!proveedor) return NextResponse.json({ error: 'Ese proveedor ya no existe' }, { status: 404 });

        const { datos, error: invalido } = datosProveedor(await request.json(), { creando: false });
        if (invalido) return NextResponse.json({ error: invalido }, { status: 400 });
        if (datos.identificacion) {
            const otro = await rifRepetido(datos.identificacion, proveedor.id);
            if (otro) return NextResponse.json({ error: `Ese RIF ya es de otro proveedor: ${otro.nombre} (${otro.identificacion})` }, { status: 409 });
        }

        await proveedor.update(datos);
        return NextResponse.json(proveedor);
    } catch (err) {
        console.error('Error al actualizar proveedor:', err);
        if (err.name === 'SequelizeValidationError') {
            return NextResponse.json({ error: err.errors.map((e) => e.message).join(', ') }, { status: 400 });
        }
        return NextResponse.json({ error: 'No se pudo actualizar el proveedor' }, { status: 500 });
    }
}
