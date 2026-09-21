import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { Categoria, Cliente, GrupoEquivalencia, Marca, Producto, Tag } from '@/models';
import { buscarProductos } from '@/app/helpers/busquedaProductos';
import { requerirCliente } from '../../_lib/acceso';
import { precioParaCliente } from '@/app/constants/facturacion';
import { presentacionesDe } from '@/app/constants/presentaciones';

export const dynamic = 'force-dynamic';

const TAMANO_PAGINA = 24;
const entero = (v, def) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : def);

// Catálogo con la tarifa que administración le configuró al cliente (Precio 6 por defecto, o Precio 7). Nunca devuelve costos ni la otra tarifa.
export async function GET(request) {
    const acceso = await requerirCliente();
    if (acceso.error) return acceso.error;

    try {
        const cliente = await Cliente.findByPk(acceso.clienteId, { attributes: ['tarifaPrecio'] });
        const tarifa = cliente?.tarifaPrecio || 'precio6';
        const { searchParams } = new URL(request.url);
        const q = (searchParams.get('q') || '').trim().slice(0, 80);
        const categoriaId = entero(searchParams.get('categoriaId'), null);
        const marcaId = entero(searchParams.get('marcaId'), null);
        const soloDisponibles = searchParams.get('disponibles') === '1';
        const pagina = entero(searchParams.get('page'), 1);

        // Solo productos con algún precio (el precio mayor cae al de venta si falta)
        const where = { [Op.and]: [{ [Op.or]: [{ precio6: { [Op.gt]: 0 } }, { precio7: { [Op.gt]: 0 } }, { costoUsd: { [Op.gt]: 0 } }] }] };
        if (categoriaId) where.categoriaId = categoriaId;
        if (marcaId) where.marcaId = marcaId;
        if (soloDisponibles) where.stockAlmacen = { [Op.gt]: 0 };

        const atributos = ['id', 'codigo', 'nombre', 'imagen', 'presentacion', 'unidadesPorCaja', 'cajasPorBulto', 'unidadesPorBulto', 'stockAlmacen', 'porcentajeIva', 'precio6', 'precio7', 'costoUsd'];
        const incluir = [
            { model: Categoria, as: 'categoria', attributes: ['id', 'nombre'] },
            { model: Marca, as: 'marca', attributes: ['id', 'nombre', 'imagen'] },
            { model: GrupoEquivalencia, as: 'grupoEquivalencia', attributes: ['nombre', 'imagen'] },
        ];

        let rows;
        let count;
        if (q) {
            // Misma búsqueda que la tienda: por palabras, en nombre, etiquetas, marca, código, grupo y categoría, sin tildes ni plurales y con
            // tolerancia a errores de tipeo; primero lo que coincide con todo y después lo que coincide en parte. Se ordena por relevancia
            // (con existencia primero) y luego se pagina.
            const todos = await Producto.findAll({
                where, attributes: atributos,
                include: [...incluir, { model: Tag, as: 'tags', attributes: ['id', 'nombre'], through: { attributes: [] } }],
            });
            const encontrados = buscarProductos(todos.map((p) => p.toJSON()), q, { desempate: (p) => (Number(p.stockAlmacen) > 0 ? 1 : 0) });
            count = encontrados.length;
            rows = encontrados.slice((pagina - 1) * TAMANO_PAGINA, pagina * TAMANO_PAGINA).map((j) => ({ toJSON: () => j }));
        } else {
            ({ rows, count } = await Producto.findAndCountAll({
                where, attributes: atributos, include: incluir,
                order: [['nombre', 'ASC']], limit: TAMANO_PAGINA, offset: (pagina - 1) * TAMANO_PAGINA,
            }));
        }

        const productos = rows.map((p) => {
            const j = p.toJSON();
            const precio = precioParaCliente(j, tarifa);
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
                // Presentaciones que se pueden pedir según lo que tenga llenado la ficha: unidad/par, caja y bulto (con sus unidades)
                presentaciones: presentacionesDe(j),
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
