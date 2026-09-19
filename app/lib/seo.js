// Datos y utilidades para el posicionamiento en buscadores (SEO). Sin base de datos: se puede importar desde cualquier parte.
import { MEMBRETE_MEDIQUIR } from '@/app/constants/empresa';

// Dirección pública del sitio. En Vercel define NEXT_PUBLIC_SITE_URL=https://mediquir.com
export const SITIO = {
    url: (process.env.NEXT_PUBLIC_SITE_URL || 'https://mediquir.com').replace(/\/+$/, ''),
    nombre: 'Mediquir',
    razonSocial: MEMBRETE_MEDIQUIR.nombre,
    ciudad: 'Ciudad Ojeda',
    estado: 'Zulia',
    direccion: 'Calle Venezuela entre Av. Bolívar y Av. Alonso, Sector Casco Central, Ciudad Ojeda, Estado Zulia',
    telefono: '+58-414-9701172',
    whatsapp: '584141680773',
    email: MEMBRETE_MEDIQUIR.email,
    instagram: 'https://instagram.com/mediquirca',
    logo: '/tenants/mediquir/logo.png',
    imagenSocial: '/tenants/mediquir/hero-1-lg.jpg',
};

export const TITULO_HOME = 'Mediquir | Materiales y equipos médico-quirúrgicos en Ciudad Ojeda, Zulia · Envíos a toda Venezuela';
export const DESCRIPCION_HOME = 'Compra insumos médicos, materiales y equipos quirúrgicos en Mediquir, Ciudad Ojeda (Zulia): jeringas, guantes, mascarillas, catéteres, gasas y más. Ventas al mayor y al detal con envíos a toda Venezuela.';

const sinTildes = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');

// "Jeringa 10cc 21g X 1 1/2" -> "jeringa-10cc-21g-x-1-1-2"
export const slugify = (texto) => sinTildes(texto).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/g, '') || 'producto';

export const rutaProducto = (p) => `/productos/${slugify(p.nombre)}-${p.id}`;
export const rutaCategoria = (c) => `/categoria/${slugify(c.nombre)}-${c.id}`;
export const idDeSlug = (slug) => { const m = /-(\d+)$/.exec(String(slug || '')); return m ? Number(m[1]) : null; };
export const absoluta = (ruta) => (/^https?:\/\//.test(ruta) ? ruta : `${SITIO.url}${ruta.startsWith('/') ? '' : '/'}${ruta}`);

// Las imágenes se guardan como nombre de archivo en Vercel Blob
export const urlImagen = (ruta) => {
    if (!ruta) return null;
    if (/^(https?:)?\/\//.test(ruta)) return ruta;
    const base = (process.env.NEXT_PUBLIC_BLOB_BASE_URL || '').replace(/\/+$/, '');
    return `${base}/${String(ruta).replace(/^\/+/, '')}`;
};

// Descripción corta (máx. ~155 caracteres) para el resultado de Google
export const recortar = (texto, max = 155) => {
    const t = String(texto || '').replace(/\s+/g, ' ').trim();
    return t.length <= max ? t : `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
};

// Etiquetas sin repetir singular y plural, para mostrarlas como "también se busca como..."
export function etiquetasVisibles(tags, max = 14) {
    const nombres = [...new Set((tags || []).map((t) => t.nombre).filter(Boolean))].sort((a, b) => a.length - b.length);
    const vistas = [];
    nombres.forEach((n) => { if (!vistas.some((v) => n === `${v}s` || n === `${v}es` || v === `${n}s` || v === `${n}es`)) vistas.push(n); });
    return vistas.slice(0, max);
}
