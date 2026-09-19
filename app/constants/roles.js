// Rol de un usuario a partir de su sesión (payload del JWT o respuesta de /api/users/session).
// Lo usan el middleware, las rutas de API y las pantallas, para que todos decidan igual.
//
//  · cliente  : usuario del portal B2B
//  · admin    : isAdmin, o puesto "Administrador"          -> puede todo
//  · vendedor : puesto "Vendedor" (sin ser admin)           -> solo lo suyo, sin costos ni finanzas
//  · personal : cualquier otro empleado                     -> comportamiento actual (sin cambios)
export const PUESTO_ADMIN = 'administrador';
export const PUESTO_VENDEDOR = 'vendedor';

const nombresDePuestos = (puestos) =>
    (Array.isArray(puestos) ? puestos : []).map((p) => String(p?.nombre ?? p ?? '').trim().toLowerCase());

export function rolDe(sesion) {
    if (!sesion) return null;
    if (sesion.clienteId) return 'cliente';
    const puestos = nombresDePuestos(sesion.puestos);
    if (sesion.isAdmin || puestos.includes(PUESTO_ADMIN)) return 'admin';
    if (puestos.includes(PUESTO_VENDEDOR)) return 'vendedor';
    return 'personal';
}

export const esVendedor = (sesion) => rolDe(sesion) === 'vendedor';
