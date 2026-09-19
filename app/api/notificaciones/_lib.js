import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { User, Empleado, Puesto, Departamento, sequelize } from '@/models';

// Valida la cookie de sesión y devuelve el payload del JWT, o null si no hay sesión válida.
export async function getSesion() {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    if (!token) return null;
    try {
        const secret = new TextEncoder().encode(process.env.JWT_SECRET);
        const { payload } = await jwtVerify(token, secret);
        return payload;
    } catch {
        return null;
    }
}

// Devuelve el fragmento SQL (alias "Notificacion") con las notificaciones que ese usuario puede ver:
// globales, dirigidas a él, o a alguno de sus departamentos / puestos.
// Todo valor va escapado con sequelize.escape: antes se interpolaban nombres de puestos y
// departamentos directamente en el SQL, lo que rompía (o permitía inyección) con una comilla.
export async function getVisibilidadSql(usuarioId) {
    const uid = Number(usuarioId);
    if (!Number.isInteger(uid)) throw new Error('Usuario inválido');

    const usuario = await User.findByPk(uid, {
        attributes: ['id', 'clienteId'],
        include: [{
            model: Empleado,
            as: 'empleado',
            attributes: ['id'],
            include: [{
                model: Puesto,
                as: 'puestos',
                attributes: ['nombre'],
                include: [{ model: Departamento, as: 'departamento', attributes: ['nombre'] }],
            }],
        }],
    });
    if (!usuario) return null;

    // Un cliente del portal (o cualquier usuario sin ficha de empleado) SOLO ve lo dirigido a él. Las notificaciones globales y las de
    // departamentos o puestos son internas del personal (pedidos, cobros, novedades...): nunca deben llegarle.
    if (usuario.clienteId || !usuario.empleado) return `("Notificacion"."usuarioId" = ${uid})`;

    const puestos = [...new Set(usuario.empleado?.puestos?.map((p) => p.nombre) || [])];
    const deptos = [...new Set(usuario.empleado?.puestos?.map((p) => p.departamento?.nombre).filter(Boolean) || [])];
    const array = (lista) => `ARRAY[${lista.map((v) => sequelize.escape(v)).join(',')}]::text[]`;

    const condiciones = [
        // Globales
        '("Notificacion"."departamentosObjetivo" IS NULL AND "Notificacion"."puestosObjetivo" IS NULL AND "Notificacion"."usuarioId" IS NULL)',
        // Dirigidas directamente al usuario
        `("Notificacion"."usuarioId" = ${uid})`,
    ];
    if (deptos.length) condiciones.push(`("Notificacion"."departamentosObjetivo"::jsonb ?| ${array(deptos)})`);
    if (puestos.length) condiciones.push(`("Notificacion"."puestosObjetivo"::jsonb ?| ${array(puestos)})`);

    return `(${condiciones.join(' OR ')})`;
}

// Subconsulta: ¿este usuario ya leyó la notificación? (usa el alias "Notificacion")
export const leidaSql = (usuarioId) =>
    `EXISTS (SELECT 1 FROM "NotificacionesLeidas" l WHERE l."notificacionId" = "Notificacion"."id" AND l."usuarioId" = ${Number(usuarioId)})`;
