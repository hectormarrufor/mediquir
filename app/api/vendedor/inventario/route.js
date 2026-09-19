import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { Categoria, GrupoEquivalencia, Marca, Producto } from '@/models';
import { preciosBase, precioUnitario } from '@/app/constants/facturacion';
import { requerirStaff } from '../../inventario/_lib';

export const dynamic = 'force-dynamic';

const TAMANO_PAGINA = 40;
const entero = (v, def) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : def);

// Consulta de inventario en solo lectura: existencia y precios de venta. Esta ruta nunca lee ni devuelve costos.
export async function GET(request) {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;

    try {
        const { searchParams } = new URL(request.url);
        const q = (searchParams.get('q') || '').trim().slice(0, 80);
        const categoriaId = entero(searchParams.get('categoriaId'), null);
        const marcaId = entero(searchParams.get('marcaId'), null);
        const pagina = entero(searchParams.get('page'), 1);
        const estado = searchParams.get('estado'); // agotados | bajos | disponibles

        const where = {};
        if (q) where[Op.or] = [{ nombre: { [Op.iLike]: `%${q}%` } }, { codigo: { [Op.iLike]: `%${q}%` } }];
        if (categoriaId) where.categoriaId = categoriaId;
        if (marcaId) where.marcaId = marcaId;
        if (estado === 'agotados') where.stockAlmacen = { [Op.lte]: 0 };
        if (estado === 'disponibles') where.stockAlmacen = { [Op.gt]: 0 };

        const { rows, count } = await Producto.findAndCountAll({
            where,
            // costoUsd solo se pide para completar precios faltantes y NUNCA sale en la respuesta
            attributes: ['id', 'codigo', 'nombre', 'imagen', 'presentacion', 'unidadesPorCaja', 'stockAlmacen', 'stockMinimo', 'porcentajeIva', 'precio6', 'precio7', 'porcentajeDescuento', 'costoUsd'],
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
            const b = preciosBase(j, { sinCosto: true });
            // Precios tal como están guardados (null = sin precio asignado): la consulta no rellena nada a partir del costo
            const real = (v) => (Number(v) > 0 ? precioUnitario(v) : null);
            const stock = Math.floor(Number(j.stockAlmacen) || 0);
            return {
                id: j.id, codigo: j.codigo, nombre: j.nombre, imagen: j.imagen, marca: j.marca, categoria: j.categoria,
                grupoEquivalencia: j.grupoEquivalencia, presentacion: j.presentacion, unidadesPorCaja: j.unidadesPorCaja,
                stock, bajo: stock > 0 && stock <= (Number(j.stockMinimo) || 0),
                porcentajeIva: Number(j.porcentajeIva) || 0, descuento: b.descuento,
                precio7: real(j.precio7), precio6: real(j.precio6),
            };
        }).filter((p) => estado !== 'bajos' || p.bajo);

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
        console.error('Consulta de inventario:', error);
        return NextResponse.json({ error: 'No se pudo cargar el inventario' }, { status: 500 });
    }
}
