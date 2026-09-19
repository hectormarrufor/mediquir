import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { Categoria, GrupoEquivalencia, Marca, Producto } from '@/models';
import { requerirCliente } from '../../_lib/acceso';
import { precioMayor } from '@/app/constants/facturacion';

export const dynamic = 'force-dynamic';

const TAMANO_PAGINA = 24;
const entero = (v, def) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : def);

// Catálogo con precio MAYOR (Precio 6). Nunca devuelve costos ni el precio de detal.
export async function GET(request) {
    const acceso = await requerirCliente();
    if (acceso.error) return acceso.error;

    try {
        const { searchParams } = new URL(request.url);
        const q = (searchParams.get('q') || '').trim().slice(0, 80);
        const categoriaId = entero(searchParams.get('categoriaId'), null);
        const marcaId = entero(searchParams.get('marcaId'), null);
        const soloDisponibles = searchParams.get('disponibles') === '1';
        const pagina = entero(searchParams.get('page'), 1);

        // Solo productos con algún precio (el precio mayor cae al de venta si falta)
        const where = { [Op.and]: [{ [Op.or]: [{ precio6: { [Op.gt]: 0 } }, { precio7: { [Op.gt]: 0 } }, { costoUsd: { [Op.gt]: 0 } }] }] };
        if (q) where[Op.and].push({ [Op.or]: [{ nombre: { [Op.iLike]: `%${q}%` } }, { codigo: { [Op.iLike]: `%${q}%` } }] });
        if (categoriaId) where.categoriaId = categoriaId;
        if (marcaId) where.marcaId = marcaId;
        if (soloDisponibles) where.stockAlmacen = { [Op.gt]: 0 };

        const { rows, count } = await Producto.findAndCountAll({
            where,
            attributes: ['id', 'codigo', 'nombre', 'imagen', 'presentacion', 'unidadesPorCaja', 'stockAlmacen', 'porcentajeIva', 'precio6', 'precio7', 'costoUsd'],
            include: [
                { model: Categoria, as: 'categoria', attributes: ['id', 'nombre'] },
                { model: Marca, as: 'marca', attributes: ['id', 'nombre', 'imagen'] },
                { model: GrupoEquivalencia, as: 'grupoEquivalencia', attributes: ['imagen'] },
            ],
            order: [['nombre', 'ASC']],
            limit: TAMANO_PAGINA,
            offset: (pagina - 1) * TAMANO_PAGINA,
        });

        const productos = rows.map((p) => {
            const j = p.toJSON();
            const precio = precioMayor(j);
            return {
                id: j.id,
                codigo: j.codigo,
                nombre: j.nombre,
                imagen: j.imagen,
                marca: j.marca,
                categoria: j.categoria,
                grupoEquivalencia: j.grupoEquivalencia,
                presentacion: j.presentacion,
                unidadesPorCaja: j.unidadesPorCaja,
                disponible: Math.max(0, Math.floor(Number(j.stockAlmacen) || 0)),
                porcentajeIva: Number(j.porcentajeIva) || 0,
                precio,
            };
        });

        // Filtros disponibles (solo en la primera página, el resto no los necesita)
        let filtros;
        if (pagina === 1) {
            const [categorias, marcas] = await Promise.all([
                Categoria.findAll({ attributes: ['id', 'nombre'], order: [['nombre', 'ASC']] }),
                Marca.findAll({ attributes: ['id', 'nombre'], order: [['nombre', 'ASC']] }),
            ]);
            filtros = { categorias, marcas };
        }

        return NextResponse.json({ productos, total: count, pagina, paginas: Math.max(1, Math.ceil(count / TAMANO_PAGINA)), filtros });
    } catch (error) {
        console.error('B2B catálogo:', error);
        return NextResponse.json({ error: 'No se pudo cargar el catálogo' }, { status: 500 });
    }
}
