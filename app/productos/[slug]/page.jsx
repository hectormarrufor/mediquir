import { notFound, permanentRedirect } from 'next/navigation';
import { Categoria, GrupoEquivalencia, Marca, Producto, Tag } from '@/models';
import { precioVentaWeb } from '@/app/constants/facturacion';
import { SITIO, absoluta, idDeSlug, recortar, rutaCategoria, rutaProducto, urlImagen } from '@/app/lib/seo';
import { productoPublico } from '@/app/lib/productoPublico';
import FichaProductoTienda from '@/app/components/producto/FichaProducto';

// Ficha pública de cada producto: dirección propia (indexable), datos estructurados para Google y texto con los nombres populares
export const revalidate = 3600;

async function cargar(slug) {
    const id = idDeSlug(slug);
    if (!id) return null;
    try {
        return await Producto.findByPk(id, {
            include: [
                { model: Categoria, as: 'categoria', attributes: ['id', 'nombre'] },
                { model: Marca, as: 'marca', attributes: ['id', 'nombre', 'imagen'] },
                { model: GrupoEquivalencia, as: 'grupoEquivalencia', attributes: ['id', 'nombre', 'imagen'] },
                { model: Tag, as: 'tags', attributes: ['id', 'nombre'], through: { attributes: [] } },
            ],
        });
    } catch (e) {
        console.error('Ficha de producto:', e.message);
        return null;
    }
}

const imagenDe = (p) => urlImagen(p.imagen || p.grupoEquivalencia?.imagen || p.marca?.imagen);

export async function generateMetadata({ params }) {
    const { slug } = await params;
    const p = await cargar(slug);
    if (!p) return { title: 'Producto no encontrado', robots: { index: false } };
    const precio = precioVentaWeb(p);
    const titulo = `${p.nombre}${p.marca?.nombre ? ` ${p.marca.nombre}` : ''} — comprar en Ciudad Ojeda, Zulia`;
    const descripcion = recortar(p.descripcion ? `${p.nombre}${p.marca?.nombre ? ` ${p.marca.nombre}` : ''}. ${p.descripcion}` : `${p.nombre}${p.marca?.nombre ? `, marca ${p.marca.nombre}` : ''}. Desde $${precio.toFixed(2)}. Distribuidora de materiales médico-quirúrgicos en Ciudad Ojeda, Zulia: ventas al mayor y al detal, envíos a toda Venezuela.`);
    const img = imagenDe(p);
    return {
        title: titulo,
        description: descripcion,
        alternates: { canonical: rutaProducto(p) },
        openGraph: { title: titulo, description: descripcion, url: absoluta(rutaProducto(p)), type: 'website', locale: 'es_VE', siteName: SITIO.nombre, images: img ? [{ url: img }] : undefined },
        twitter: { card: 'summary_large_image', title: titulo, description: descripcion, images: img ? [img] : undefined },
    };
}

export default async function FichaProducto({ params }) {
    const { slug } = await params;
    const p = await cargar(slug);
    if (!p) notFound();
    if (slug !== rutaProducto(p).split('/').pop()) permanentRedirect(rutaProducto(p)); // una sola dirección por producto

    const precio = precioVentaWeb(p);
    const enStock = Number(p.stockAlmacen) > 0;
    const img = imagenDe(p);
    const url = absoluta(rutaProducto(p));

    // Productos parecidos: primero los del mismo grupo de equivalencia (alternativas), luego de la misma marca y categoría, luego los más vendidos de la categoría
    let relacionados = [];
    try {
        const candidatos = await Producto.findAll({
            where: { categoriaId: p.categoriaId },
            include: [
                { model: Marca, as: 'marca', attributes: ['id', 'nombre', 'imagen'] },
                { model: GrupoEquivalencia, as: 'grupoEquivalencia', attributes: ['id', 'nombre', 'imagen'] },
            ],
            attributes: { exclude: ['descripcion', 'puntosClave', 'fichaTecnica', 'infoAdicional'] },
            limit: 80, order: [['nroVentas', 'DESC']],
        });
        relacionados = candidatos
            .filter((r) => r.id !== p.id && precioVentaWeb(r) > 0)
            .map((r) => ({ r, puntos: (p.grupoEquivalenciaId && r.grupoEquivalenciaId === p.grupoEquivalenciaId ? 4 : 0) + (p.marcaId && r.marcaId === p.marcaId ? 2 : 0) + (Number(r.stockAlmacen) > 0 ? 1 : 0) }))
            .sort((a, b) => b.puntos - a.puntos)
            .slice(0, 10)
            .map(({ r }) => productoPublico(r));
    } catch { /* sin relacionados */ }

    const jsonLd = {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'Product',
                name: p.nombre,
                sku: p.codigo,
                ...(p.codigoBarras ? { gtin: p.codigoBarras } : {}),
                image: img ? [img] : undefined,
                description: p.descripcion || `${p.nombre}${p.marca?.nombre ? `, marca ${p.marca.nombre}` : ''}. Disponible en ${SITIO.nombre}, ${SITIO.ciudad}, ${SITIO.estado}.`,
                ...(Array.isArray(p.fichaTecnica) && p.fichaTecnica.length ? { additionalProperty: p.fichaTecnica.filter((x) => x?.etiqueta && x?.valor).slice(0, 20).map((x) => ({ '@type': 'PropertyValue', name: String(x.etiqueta), value: String(x.valor) })) } : {}),
                brand: p.marca?.nombre ? { '@type': 'Brand', name: p.marca.nombre } : undefined,
                category: p.categoria?.nombre,
                offers: {
                    '@type': 'Offer', url, priceCurrency: 'USD', price: precio.toFixed(2),
                    availability: enStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
                    itemCondition: 'https://schema.org/NewCondition',
                    seller: { '@type': 'Organization', name: SITIO.nombre },
                },
            },
            {
                '@type': 'BreadcrumbList',
                itemListElement: [
                    { '@type': 'ListItem', position: 1, name: 'Inicio', item: absoluta('/') },
                    ...(p.categoria ? [{ '@type': 'ListItem', position: 2, name: p.categoria.nombre, item: absoluta(rutaCategoria(p.categoria)) }] : []),
                    { '@type': 'ListItem', position: p.categoria ? 3 : 2, name: p.nombre, item: url },
                ],
            },
        ],
    };

    return (
        <>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
            <FichaProductoTienda producto={productoPublico(p)} relacionados={relacionados} />
        </>
    );
}
