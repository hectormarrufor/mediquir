// Rol de un usuario a partir de su sesión (payload del JWT o respuesta de /api/users/session).
// Lo usan el middleware, las rutas de API y las pantallas, para que todos decidan igual.
//
//  · cliente  : usuario del portal B2B
//  · admin    : isAdmin, o puesto "Administrador"          -> puede todo
//  · vendedor : cualquier empleado que NO sea admin         -> solo lo suyo, sin costos, finanzas ni totales de ventas
//
// Los totales de ventas y las finanzas son SOLO de los administradores. Antes solo se restringía al puesto "Vendedor" y cualquier otro
// empleado (un empacador, un contador nuevo...) recibía acceso completo ("personal"). Ahora todo empleado que no es admin queda con las
// restricciones del vendedor: para darle más acceso hay que hacerlo administrador a propósito.
export const PUESTO_ADMIN = 'administrador';
export const PUESTO_VENDEDOR = 'vendedor';

const nombresDePuestos = (puestos) =>
    (Array.isArray(puestos) ? puestos : []).map((p) => String(p?.nombre ?? p ?? '').trim().toLowerCase());

export function rolDe(sesion) {
    if (!sesion) return null;
    if (sesion.clienteId) return 'cliente';
    const puestos = nombresDePuestos(sesion.puestos);
    if (sesion.isAdmin || puestos.includes(PUESTO_ADMIN)) return 'admin';
    return 'vendedor'; // cualquier otro empleado (puesto "Vendedor" u otro): acceso restringido
}

export const esVendedor = (sesion) => rolDe(sesion) === 'vendedor';
