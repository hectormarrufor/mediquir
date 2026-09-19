import { NextResponse } from 'next/server';
import { Categoria, Marca, GrupoEquivalencia, Tag } from '@/models';
import { requerirStaff } from '../../_lib';

// GET /api/inventario/productos/opciones -> listas para los filtros y las celdas desplegables (una sola petición)
export async function GET() {
    try {
        const { error } = await requerirStaff();
        if (error) return error;

        const [categorias, marcas, grupos, tags] = await Promise.all([
            Categoria.findAll({ attributes: ['id', 'nombre'], order: [['nombre', 'ASC']], raw: true }),
            Marca.findAll({ attributes: ['id', 'nombre'], order: [['nombre', 'ASC']], raw: true }),
            GrupoEquivalencia.findAll({ attributes: ['id', 'nombre', 'categoriaId'], order: [['nombre', 'ASC']], raw: true }),
            Tag.findAll({ attributes: ['id', 'nombre'], order: [['nombre', 'ASC']], raw: true }),
        ]);
        return NextResponse.json({ categorias, marcas, grupos, tags });
    } catch (err) {
        console.error('Error cargando opciones de inventario:', err);
        return NextResponse.json({ error: 'Error al cargar las opciones' }, { status: 500 });
    }
}
