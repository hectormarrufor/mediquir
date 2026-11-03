import { NextResponse } from 'next/server';
import { Op, fn, col } from 'sequelize';
import { Categoria, Marca, GrupoEquivalencia, Producto } from '@/models';
import { requerirStaff, puedeEditarInventario } from '../_lib';

// Cuántos productos usan cada categoría / marca / grupo (una consulta agrupada por campo)
const conteo = async (Modelo, campo) => {
    const filas = await Modelo.findAll({
        attributes: [campo, [fn('COUNT', col('id')), 'n']],
        where: { [campo]: { [Op.ne]: null } },
        group: [campo],
        raw: true,
    });
    return new Map(filas.map((f) => [f[campo], Number(f.n)]));
};

// GET /api/inventario/clasificacion -> marcas, categorías y grupos de equivalencia con cuántos productos usan cada uno,
// para la pantalla "Marcas, categorías y grupos" (y si la persona puede modificarlos).
export async function GET() {
    try {
        const { sesion, error } = await requerirStaff();
        if (error) return error;

        const [categorias, marcas, grupos, porCategoria, porMarca, porGrupo, gruposPorCategoria, puedeEditar] = await Promise.all([
            Categoria.findAll({ attributes: ['id', 'nombre', 'descripcion'], order: [['nombre', 'ASC']], raw: true }),
            Marca.findAll({ attributes: ['id', 'nombre', 'imagen'], order: [['nombre', 'ASC']], raw: true }),
            GrupoEquivalencia.findAll({ attributes: ['id', 'nombre', 'imagen', 'stockMinimoGlobal', 'categoriaId'], order: [['nombre', 'ASC']], raw: true }),
            conteo(Producto, 'categoriaId'),
            conteo(Producto, 'marcaId'),
            conteo(Producto, 'grupoEquivalenciaId'),
            conteo(GrupoEquivalencia, 'categoriaId'),
            puedeEditarInventario(sesion),
        ]);

        const nombreCategoria = new Map(categorias.map((c) => [c.id, c.nombre]));
        return NextResponse.json({
            categorias: categorias.map((c) => ({ ...c, nProductos: porCategoria.get(c.id) || 0, nGrupos: gruposPorCategoria.get(c.id) || 0 })),
            marcas: marcas.map((m) => ({ ...m, nProductos: porMarca.get(m.id) || 0 })),
            grupos: grupos.map((g) => ({ ...g, categoria: nombreCategoria.get(g.categoriaId) || null, nProductos: porGrupo.get(g.id) || 0 })),
            permisos: { editar: puedeEditar },
        });
    } catch (err) {
        console.error('Error cargando marcas, categorías y grupos:', err);
        return NextResponse.json({ error: 'No se pudieron cargar las marcas, categorías y grupos' }, { status: 500 });
    }
}
