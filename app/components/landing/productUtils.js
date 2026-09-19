// Utilidades compartidas por la landing (tarjeta, detalle, carrito y secciones).

const BLOB_BASE = process.env.NEXT_PUBLIC_BLOB_BASE_URL || '';

// Placeholder embebido: no depende de ningún archivo en /public y nunca da 404.
export const PLACEHOLDER_IMG =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">' +
        '<rect width="120" height="120" fill="#EEF4FA"/>' +
        '<path d="M52 34h16v18h18v16H68v18H52V68H34V52h18z" fill="#B7CEE6"/></svg>'
    );

const toUrl = (path) => {
    if (!path) return null;
    if (/^(https?:)?\/\//.test(path) || path.startsWith('data:')) return path;
    return `${BLOB_BASE}/${path}`;
};

// Orden de prioridad de imágenes: propia del producto > grupo de equivalencia, y luego la marca.
export function getProductImages(product) {
    const images = [];
    const push = (path, label) => {
        const src = toUrl(path);
        if (src && !images.some((img) => img.src === src)) images.push({ src, label });
    };

    push(product?.imagen || product?.grupoEquivalencia?.imagen, 'Producto');
    push(product?.marca?.imagen, 'Marca');

    if (images.length === 0) images.push({ src: PLACEHOLDER_IMG, label: 'Sin imagen', isPlaceholder: true });
    return images;
}

export const getMainImage = (product) => getProductImages(product)[0].src;

export function getPricing(product) {
    const stock = Number(product?.stockAlmacen) || 0;
    const precioBase = Number(product?.precio7) > 0 ? Number(product.precio7) : Number(product?.costoUsd) * 1.5;
    const porcentajeAhorro = Number(product?.porcentajeDescuento) || 0;
    const hasDiscount = porcentajeAhorro > 0;
    const precioFinal = hasDiscount ? precioBase - precioBase * (porcentajeAhorro / 100) : precioBase;

    return {
        stock,
        precioBase,
        porcentajeAhorro,
        hasDiscount,
        precioFinal,
        isOutOfStock: stock <= 0,
        isLowStock: stock > 0 && stock <= 5,
    };
}

export function getPresentacionLabel(product) {
    switch (product?.presentacion) {
        case 'par': return 'Par';
        case 'paqx2': return 'Paquete x2';
        case 'paqx4': return 'Paquete x4';
        case 'caja': return product.unidadesPorCaja ? `Caja x${product.unidadesPorCaja}` : 'Caja';
        default: return 'Unidad';
    }
}
