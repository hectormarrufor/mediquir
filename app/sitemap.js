import { Categoria, Producto } from '@/models';
import { SITIO, rutaCategoria, rutaProducto } from '@/app/lib/seo';

export const dynamic = 'force-dynamic'; // se arma con los productos de ese momento; Google lo pide pocas veces

// Mapa del sitio: portada, categorías y cada producto (con su fecha de última modificación)
export default async function sitemap() {
    const base = [
        { url: `${SITIO.url}/`, changeFrequency: 'daily', priority: 1 },
        { url: `${SITIO.url}/envios-nacionales`, changeFrequency: 'monthly', priority: 0.5 },
    ];
    try {
        const [categorias, productos] = await Promise.all([
            Categoria.findAll({ attributes: ['id', 'nombre'] }),
            Producto.findAll({ attributes: ['id', 'nombre', 'updatedAt'] }),
        ]);
        return [
            ...base,
            ...categorias.map((c) => ({ url: `${SITIO.url}${rutaCategoria(c)}`, changeFrequency: 'weekly', priority: 0.8 })),
            ...productos.map((p) => ({ url: `${SITIO.url}${rutaProducto(p)}`, lastModified: p.updatedAt, changeFrequency: 'weekly', priority: 0.6 })),
        ];
    } catch (e) {
        console.error('sitemap:', e.message);
        return base;
    }
}
