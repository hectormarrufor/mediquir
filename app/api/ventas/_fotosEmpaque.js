import { list, del } from '@vercel/blob';

// Política de retención de las fotos de empaque:
//  · Al firmar el empaque se borran las fotos repetidas (solo quedan las dos definitivas).
//  · Pasado este plazo desde el despacho se borran también las definitivas (es la ventana para reclamos).
//  · Las fotos de empaques abandonados (pedido cancelado o nunca firmado) se borran antes.
export const DIAS_RETENCION_FOTOS = 90;
export const DIAS_CANCELADAS = 7;
export const DIAS_SIN_FIRMAR = 30;

// Si la venta era un recibo V- que se convirtió en factura, las fotos siguen bajo el número anterior
const prefijosDe = (venta) => [venta.numeroDocumento, venta.numeroDocumentoAnterior].filter(Boolean).map((n) => `empaques/${n}/`);

// Todas las fotos del pedido que hay en el Blob
async function fotosEnBlob(venta) {
    const urls = [];
    for (const prefix of prefijosDe(venta)) {
        let cursor;
        do {
            const pagina = await list({ prefix, cursor });
            urls.push(...pagina.blobs.map((b) => b.url));
            cursor = pagina.hasMore ? pagina.cursor : undefined;
        } while (cursor);
    }
    return urls;
}

// Borra las fotos del pedido que ya no son definitivas (las repetidas). Devuelve cuántas borró.
export async function borrarFotosSobrantes(venta) {
    const definitivas = new Set([venta.fotoCajaAbiertaUrl, venta.fotoCajaSelladaUrl].filter(Boolean));
    const sobrantes = (await fotosEnBlob(venta)).filter((u) => !definitivas.has(u));
    if (sobrantes.length) await del(sobrantes);
    return sobrantes.length;
}

// Borra TODAS las fotos del pedido (definitivas incluidas) y limpia sus URLs. No guarda la venta: lo hace quien llama.
export async function borrarTodasLasFotos(venta) {
    const urls = new Set(await fotosEnBlob(venta));
    [venta.fotoCajaAbiertaUrl, venta.fotoCajaSelladaUrl].filter(Boolean).forEach((u) => urls.add(u));
    if (urls.size) await del([...urls]);
    venta.fotoCajaAbiertaUrl = null;
    venta.fotoCajaSelladaUrl = null;
    return urls.size;
}
