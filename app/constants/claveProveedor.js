// Clave con la que se recuerda un renglón de la factura de un proveedor: su código si lo trae (lo más estable),
// si no, la descripción normalizada (sin tildes, mayúsculas ni símbolos). La usan el formulario de compras (para proponer
// el producto) y el servidor (para guardar lo que la persona confirmó al registrar la compra).
import { normalizar } from '../helpers/busquedaProductos.js';

export function claveRenglonProveedor({ codigo, descripcion }) {
    const cod = String(codigo || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (cod) return `cod:${cod}`.slice(0, 220);
    const txt = normalizar(descripcion);
    return txt ? `txt:${txt}`.slice(0, 220) : null;
}
