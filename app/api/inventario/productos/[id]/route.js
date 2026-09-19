import { NextResponse } from 'next/server';
import { requerirStaff, puedeEditarInventario } from '../../_lib';
import { aplicarLote } from '../_lote';

// PATCH /api/inventario/productos/:id   { cambios: { stockAlmacen: 40 }, esperado: { stockAlmacen: 42 } }
// Edición de una celda (o varias del mismo producto). `esperado.stockAlmacen` activa el control de concurrencia.
export async function PATCH(request, { params }) {
    try {
        const { sesion, error } = await requerirStaff();
        if (error) return error;
        if (!(await puedeEditarInventario(sesion))) {
            return NextResponse.json({ error: 'No tienes permiso para editar el inventario' }, { status: 403 });
        }

        const { id } = await params;
        const { cambios, esperado } = await request.json();

        const r = await aplicarLote([{ id: Number(id), cambios, esperado }]);
        if (r.error) return NextResponse.json({ error: r.error }, { status: r.status || 400 });
        if (r.errores.length) return NextResponse.json({ error: r.errores[0].error }, { status: 400 });

        const fila = r.rows[0];
        if (r.conflictos.length) {
            return NextResponse.json(
                { error: 'El stock cambió mientras editabas (probablemente una venta). Se actualizó con el valor actual.', conflicto: true, row: fila, grupos: r.grupos },
                { status: 409 }
            );
        }
        return NextResponse.json({ row: fila, grupos: r.grupos });
    } catch (err) {
        console.error('Error actualizando producto:', err);
        return NextResponse.json({ error: 'Error al actualizar el producto' }, { status: 500 });
    }
}
