import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { Categoria, Producto } from '@/models';
import { precioVentaWeb } from '@/app/constants/facturacion';
import { SITIO, absoluta, idDeSlug, recortar, rutaCategoria, rutaProducto, urlImagen } from '@/app/lib/seo';
import estilos from '@/app/components/seo/seo.module.css';

// Página pública de cada categoría: lista sus productos con enlaces indexables
export const revalidate = 3600;

async function cargar(slug) {
    const id = idDeSlug(slug);
    if (!id) return null;
    try {
        const categoria = await Categoria.findByPk(id, { attributes: ['id', 'nombre'] });
        if (!categoria) return null;
        const productos = await Producto.findAll({
            where: { categoriaId: id }, order: [['nombre', 'ASC']], limit: 400,
            attributes: ['id', 'nombre', 'imagen', 'precio7', 'costoUsd', 'porcentajeDescuento', 'stockAlmacen'],
        });
        return { categoria, productos };
    } catch (e) {
        console.error('Categoría:', e.message);
        return null;
    }
}

export async function generateMetadata({ params }) {
    const { slug } = await params;
    const datos = await cargar(slug);
    if (!datos) return { title: 'Categoría no encontrada', robots: { index: false } };
    const { categoria, productos } = datos;
    const titulo = `${categoria.nombre}: comprar en Ciudad Ojeda, Zulia · Envíos a toda Venezuela`;
    const descripcion = recortar(`${productos.length} productos de ${categoria.nombre} en Mediquir, Ciudad Ojeda (Zulia): ${productos.slice(0, 4).map((p) => p.nombre).join(', ')} y más. Al mayor y al detal, con envíos nacionales.`);
    return {
        title: titulo,
        description: descripcion,
        alternates: { canonical: rutaCategoria(categoria) },
        openGraph: { title: titulo, description: descripcion, url: absoluta(rutaCategoria(categoria)), type: 'website', locale: 'es_VE', siteName: SITIO.nombre },
    };
}

export default async function PaginaCategoria({ params }) {
    const { slug } = await params;
    const datos = await cargar(slug);
    if (!datos) notFound();
    const { categoria, productos } = datos;
    if (slug !== rutaCategoria(categoria).split('/').pop()) permanentRedirect(rutaCategoria(categoria));

    const jsonLd = {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'CollectionPage', name: categoria.nombre, url: absoluta(rutaCategoria(categoria)),
                mainEntity: { '@type': 'ItemList', itemListElement: productos.slice(0, 50).map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: absoluta(rutaProducto(p)), name: p.nombre })) },
            },
            {
                '@type': 'BreadcrumbList',
                itemListElement: [
                    { '@type': 'ListItem', position: 1, name: 'Inicio', item: absoluta('/') },
                    { '@type': 'ListItem', position: 2, name: categoria.nombre, item: absoluta(rutaCategoria(categoria)) },
                ],
            },
        ],
    };

    return (
        <main className={estilos.pagina}>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
            <nav className={estilos.migas} aria-label="Ruta"><Link href="/">Inicio</Link> › {categoria.nombre}</nav>
            <section className={estilos.panel}>
                <h1 className={estilos.titulo}>{categoria.nombre} en Ciudad Ojeda, Zulia</h1>
                <p className={estilos.sub}>
                    {productos.length} productos de {categoria.nombre.toLowerCase()} para clínicas, hospitales, farmacias y consultorios. Venta al mayor y al detal, con envíos a toda Venezuela. <Link href="/envios-nacionales">Envíos nacionales</Link>.
                </p>
                <div className={estilos.rejilla}>
                    {productos.map((p) => (
                        <Link key={p.id} className={estilos.tarjeta} href={rutaProducto(p)}>
                            {urlImagen(p.imagen) ? <img src={urlImagen(p.imagen)} alt={p.nombre} loading="lazy" /> : null}
                            <span>{p.nombre}</span>
                            <b>Ref ${precioVentaWeb(p).toFixed(2)}</b>
                        </Link>
                    ))}
                </div>
            </section>
        </main>
    );
}
