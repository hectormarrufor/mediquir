import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { Categoria, GrupoEquivalencia, Marca, Producto, Tag } from '@/models';
import { precioVentaWeb } from '@/app/constants/facturacion';
import { presentacionesDe } from '@/app/constants/presentaciones';
import { SITIO, absoluta, etiquetasVisibles, idDeSlug, recortar, rutaCategoria, rutaProducto, urlImagen } from '@/app/lib/seo';
import estilos from '@/app/components/seo/seo.module.css';

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
    const descripcion = recortar(`${p.nombre}${p.marca?.nombre ? `, marca ${p.marca.nombre}` : ''}. Desde $${precio.toFixed(2)}. Distribuidora de materiales médico-quirúrgicos en Ciudad Ojeda, Zulia: ventas al mayor y al detal, envíos a toda Venezuela.`);
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
    const presentaciones = presentacionesDe(p);
    const etiquetas = etiquetasVisibles(p.tags);
    const url = absoluta(rutaProducto(p));

    // Otros productos de la misma categoría (enlaces internos que ayudan a Google a recorrer el catálogo)
    let relacionados = [];
    try {
        relacionados = await Producto.findAll({ where: { categoriaId: p.categoriaId }, attributes: ['id', 'nombre', 'imagen', 'precio7', 'costoUsd', 'porcentajeDescuento'], limit: 8, order: [['nroVentas', 'DESC']] });
        relacionados = relacionados.filter((r) => r.id !== p.id).slice(0, 6);
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
                description: `${p.nombre}${p.marca?.nombre ? `, marca ${p.marca.nombre}` : ''}. Disponible en ${SITIO.nombre}, ${SITIO.ciudad}, ${SITIO.estado}.`,
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

    const whatsapp = `https://wa.me/${SITIO.whatsapp}?text=${encodeURIComponent(`Hola, quiero información sobre: ${p.nombre}`)}`;

    return (
        <main className={estilos.pagina}>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
            <nav className={estilos.migas} aria-label="Ruta">
                <Link href="/">Inicio</Link>
                {p.categoria && <> › <Link href={rutaCategoria(p.categoria)}>{p.categoria.nombre}</Link></>}
                {' › '}{p.nombre}
            </nav>

            <article className={`${estilos.panel} ${estilos.producto}`}>
                <div className={estilos.foto}>
                    {img ? <img src={img} alt={p.nombre} width={380} height={340} /> : <span>Sin imagen</span>}
                </div>
                <div>
                    {p.marca?.nombre && <div className={estilos.marca}>{p.marca.nombre}</div>}
                    <h1 className={estilos.titulo}>{p.nombre}</h1>
                    <div className={estilos.precio}>Ref ${precio.toFixed(2)}</div>
                    <div className={estilos.sub}>{presentaciones[0].etiqueta} · precio sin IVA · código {p.codigo}</div>

                    <h2 className={estilos.h2}>Cómo puedes comprarlo</h2>
                    <ul className={estilos.lista}>
                        {presentaciones.map((x) => <li key={x.clave}>{x.etiqueta}{x.unidades > 1 ? ` (${x.unidades} ${x.corto === 'und' ? 'unidades' : x.corto})` : ''}</li>)}
                    </ul>
                    <div className={estilos.sub}>{enStock ? 'Disponible para entrega inmediata en Ciudad Ojeda y envío a toda Venezuela.' : 'Consulta disponibilidad: lo conseguimos para ti.'}</div>

                    <Link className={estilos.boton} href={`/?buscar=${encodeURIComponent(p.nombre)}#productos-section`}>Comprar en la tienda</Link>
                    <a className={estilos.botonAlt} href={whatsapp} target="_blank" rel="noopener noreferrer">Preguntar por WhatsApp</a>

                    {etiquetas.length > 0 && (
                        <>
                            <h2 className={estilos.h2}>También se busca como</h2>
                            <div className={estilos.chips}>{etiquetas.map((t) => <span key={t} className={estilos.chip}>{t}</span>)}</div>
                        </>
                    )}
                </div>
            </article>

            <section className={`${estilos.panel} ${estilos.texto}`} style={{ marginTop: 16 }}>
                <h2 className={estilos.h2} style={{ marginTop: 0 }}>{p.nombre} en Ciudad Ojeda, Zulia</h2>
                <p>
                    En {SITIO.nombre} ({SITIO.razonSocial}) vendemos materiales y equipos médico-quirúrgicos al mayor y al detal desde {SITIO.ciudad}, estado {SITIO.estado}.
                    {' '}Hacemos envíos a toda Venezuela: estás en Maracaibo, Caracas, Valencia o en cualquier otra ciudad, te lo hacemos llegar. <Link href="/envios-nacionales">Ver cómo son los envíos nacionales</Link>.
                </p>
                <p>Estamos en {SITIO.direccion}. Escríbenos por WhatsApp o llámanos al {SITIO.telefono.replace('+58-', '0')}.</p>
            </section>

            {relacionados.length > 0 && (
                <section className={estilos.panel} style={{ marginTop: 16 }}>
                    <h2 className={estilos.h2} style={{ marginTop: 0 }}>Más de {p.categoria?.nombre || 'esta categoría'}</h2>
                    <div className={estilos.rejilla}>
                        {relacionados.map((r) => (
                            <Link key={r.id} className={estilos.tarjeta} href={rutaProducto(r)}>
                                {urlImagen(r.imagen) ? <img src={urlImagen(r.imagen)} alt={r.nombre} loading="lazy" /> : null}
                                <span>{r.nombre}</span>
                                <b>Ref ${precioVentaWeb(r).toFixed(2)}</b>
                            </Link>
                        ))}
                    </div>
                </section>
            )}
        </main>
    );
}
