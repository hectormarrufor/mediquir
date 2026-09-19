import { NextResponse } from 'next/server';
import { Producto, Categoria, Marca, GrupoEquivalencia } from '@/models';
import { requerirStaff } from '../_lib';
import { leerParametros, construirWhere } from '../productos/_consulta';

const ETIQUETAS = { 6: 'Precio 6 (Mayor)', 7: 'Precio 7 (Detal)' };
const num = (v) => (v === null || v === undefined ? null : Number(v));
const texto = (v) => String(v ?? '').toLowerCase();

// GET /api/inventario/lista-precios?precio=6|7[&conStock=1][&sinPrecio=1][&filtros=1&q=..&categoriaId=..]
//
// Devuelve TODOS los productos (o los que cumplen los filtros) con el precio elegido, listos para armar un PDF.
// La imagen de cada producto sale por JERARQUÍA: 1) imagen del producto, 2) imagen de su grupo de
// equivalencia, 3) imagen de su marca. `origen` indica de cuál salió.
export async function GET(request) {
    try {
        const { error } = await requerirStaff();
        if (error) return error;

        const params = new URL(request.url).searchParams;
        const precio = params.get('precio') === '6' ? 6 : 7;
        const campo = precio === 6 ? 'precio6' : 'precio7';
        const soloConStock = params.get('conStock') === '1';
        const incluirSinPrecio = params.get('sinPrecio') === '1';
        const where = params.get('filtros') === '1' ? construirWhere(leerParametros(params)) : {};

        const productos = await Producto.findAll({
            attributes: ['id', 'codigo', 'nombre', 'imagen', 'presentacion', 'unidadesPorCaja', 'stockAlmacen', 'precio6', 'precio7', 'porcentajeIva'],
            include: [
                { model: Categoria, as: 'categoria', attributes: ['nombre'] },
                { model: Marca, as: 'marca', attributes: ['nombre', 'imagen'] },
                { model: GrupoEquivalencia, as: 'grupoEquivalencia', attributes: ['nombre', 'imagen'] },
            ],
            where,
            subQuery: false,
        });

        let omitidosSinPrecio = 0;
        let omitidosSinStock = 0;
        const filas = [];

        productos.forEach((p) => {
            const j = p.toJSON();
            const valor = num(j[campo]);
            if (soloConStock && !(num(j.stockAlmacen) > 0)) { omitidosSinStock += 1; return; }
            if (!incluirSinPrecio && !(valor > 0)) { omitidosSinPrecio += 1; return; }

            // Jerarquía de la imagen: producto -> grupo de equivalencia -> marca
            const origen = j.imagen ? 'producto' : j.grupoEquivalencia?.imagen ? 'grupo' : j.marca?.imagen ? 'marca' : null;
            const imagen = origen === 'producto' ? j.imagen : origen === 'grupo' ? j.grupoEquivalencia.imagen : origen === 'marca' ? j.marca.imagen : null;

            filas.push({
                id: j.id,
                codigo: j.codigo,
                nombre: j.nombre,
                marca: j.marca?.nombre || '',
                categoria: j.categoria?.nombre || 'Sin categoría',
                grupo: j.grupoEquivalencia?.nombre || null,
                presentacion: j.presentacion,
                unidadesPorCaja: num(j.unidadesPorCaja),
                precio: valor,
                porcentajeIva: num(j.porcentajeIva) ?? 0,
                imagen,
                origen,
            });
        });

        // Categoría -> (grupo o nombre, para que los hermanos queden juntos) -> nombre
        filas.sort((a, b) => a.categoria.localeCompare(b.categoria, 'es')
            || texto(a.grupo || a.nombre).localeCompare(texto(b.grupo || b.nombre), 'es')
            || texto(a.nombre).localeCompare(texto(b.nombre), 'es'));

        return NextResponse.json({
            precio,
            etiqueta: ETIQUETAS[precio],
            fecha: new Date().toISOString(),
            total: filas.length,
            omitidosSinPrecio,
            omitidosSinStock,
            filas,
        });
    } catch (err) {
        console.error('Error generando la lista de precios:', err);
        return NextResponse.json({ error: 'Error al preparar la lista de precios' }, { status: 500 });
    }
}
