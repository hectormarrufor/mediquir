import { User, CambioPrecio } from '@/models';
import { rolDe } from '@/app/constants/roles';

// Solo estas dos administradoras cambian precios desde el Consultor de precios (usuario de acceso, sin importar mayúsculas).
export const USUARIOS_QUE_CAMBIAN_PRECIOS = ['jolexi', 'joalex'];

export async function puedeCambiarPrecios(sesion) {
    if (!sesion || rolDe(sesion) !== 'admin') return false;
    const u = await User.findByPk(Number(sesion.id), { attributes: ['id', 'user'] }).catch(() => null);
    return USUARIOS_QUE_CAMBIAN_PRECIOS.includes(String(u?.user || '').trim().toLowerCase());
}

// El historial (y con él la reversión) necesita la tabla CambiosPrecio: sin ella no se ofrece cambiar precios (ver scripts/migraciones/cambios-precio.cjs)
let tablaLista = false;
export async function historialDisponible() {
    if (tablaLista) return true;
    try { await CambioPrecio.findOne({ attributes: ['id'] }); tablaLista = true; return true; } catch { return false; }
}
