import { del } from '@vercel/blob';

// Borrado de archivos del Blob al reemplazar o eliminar un registro. Nunca lanza: un archivo huérfano
// en el Blob es preferible a que falle el guardado. Acepta el nombre guardado en la BD o la URL completa.
const urlBlob = (ref) => (/^https?:/.test(ref) ? ref : `${process.env.NEXT_PUBLIC_BLOB_BASE_URL}/${ref}`);

export async function borrarBlob(...refs) {
    const urls = [...new Set(refs.flat().filter((r) => typeof r === 'string' && r.trim()).map(urlBlob))];
    if (!urls.length) return;
    try { await del(urls); } catch (e) { console.warn('No se pudo borrar del Blob:', e.message); }
}

// Borra `anterior` solo si fue reemplazado por otro archivo distinto.
export const borrarSiReemplazado = (anterior, nuevo) => (nuevo && anterior && anterior !== nuevo ? borrarBlob(anterior) : undefined);
