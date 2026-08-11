import webpush from 'web-push';
import {
    PushSubscription, Notificacion, User, Empleado, sequelize,
    Puesto, Departamento
} from '@/models';
import { Op } from 'sequelize';

// 1. CONFIGURACIÓN VAPID
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.error('Faltan las claves VAPID en las variables de entorno.');
} else {
    webpush.setVapidDetails(
        'mailto:hectormmarrufor@gmail.com',
        VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY
    );
}

// 2. FUNCIÓN MAESTRA
export async function crearYNotificar(data) {
    const t = await sequelize.transaction();
    const resultados = { exitosos: 0, fallidos: 0 };

    const clientId = process.env.NEXT_PUBLIC_CLIENT_ID || 'mediquir';
    const basePathIcons = `/tenants/${clientId}/icons`;

    try {
        const fechaCaracas = new Date().toLocaleString('es-VE', {
            timeZone: 'America/Caracas',
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: true
        });

        const targetDeptos = Array.isArray(data.departamentos) && data.departamentos.length > 0 ? data.departamentos : null;
        const targetPuestos = Array.isArray(data.puestos) && data.puestos.length > 0 ? data.puestos : null;

        // ✅ CORRECCIÓN: Guardamos el usuarioId de destino en la BD
        const nuevaNotificacion = await Notificacion.create({
            titulo: data.title,
            mensaje: data.body,
            url: data.url,
            departamentosObjetivo: targetDeptos,
            puestosObjetivo: targetPuestos,
            usuarioId: data.usuarioId || null, 
            tipo: data.tipo || 'Info',
            fechaHoraCaracas: fechaCaracas
        }, { transaction: t });

        await t.commit();

        const usuariosMap = new Map(); 
        const formatearNombre = (u) => u.empleado ? `${u.empleado.nombre} ${u.empleado.apellido}` : `Usuario: ${u.user}`;

        if (data.usuarioId) {
            usuariosMap.set(data.usuarioId, `ID Manual: ${data.usuarioId}`);
        }

        if (data.roles && data.roles.length > 0) {
            const usuariosPorRol = await User.findAll({
                where: { rol: { [Op.in]: data.roles } },
                attributes: ['id', 'user'],
                include: [{
                    model: Empleado,
                    as: 'empleado',
                    attributes: ['nombre', 'apellido']
                }]
            });
            usuariosPorRol.forEach(u => usuariosMap.set(u.id, formatearNombre(u)));
        }

        if (targetDeptos || targetPuestos) {
            const usuariosTarget = await User.findAll({
                attributes: ['id', 'user'],
                include: [{
                    model: Empleado,
                    as: 'empleado',
                    required: true,
                    attributes: ['nombre', 'apellido'],
                    include: [{
                        model: Puesto,
                        as: 'puestos',
                        required: true,
                        attributes: [],
                        include: [{
                            model: Departamento,
                            as: 'departamento',
                            required: false,
                            attributes: []
                        }]
                    }]
                }],
                where: {
                    [Op.or]: [
                        targetPuestos ? { '$empleado.puestos.nombre$': { [Op.in]: targetPuestos } } : null,
                        targetDeptos ? { '$empleado.puestos.departamento.nombre$': { [Op.in]: targetDeptos } } : null
                    ].filter(Boolean)
                }
            });
            usuariosTarget.forEach(u => usuariosMap.set(u.id, formatearNombre(u)));
        }

        let whereSubscriptions = { activo: true };
        const tieneFiltros = usuariosMap.size > 0 || data.usuarioId;

        if (tieneFiltros) {
            if (usuariosMap.size === 0) {
                console.log('[NOTIFICADOR] Filtros aplicados pero no se encontró ningún usuario.');
                return nuevaNotificacion;
            }
            whereSubscriptions.usuarioId = { [Op.in]: Array.from(usuariosMap.keys()) };
        }

        const subscripciones = await PushSubscription.findAll({
            where: whereSubscriptions
        });

        const listaDestinatarios = subscripciones.map(s => usuariosMap.get(s.usuarioId) || `ID Desconocido (${s.usuarioId})`).join(', ');
        console.log(`[NOTIFICADOR] Enviando a: ${listaDestinatarios} (${subscripciones.length} dispositivos)`);

        const promesas = subscripciones.map(async (sub) => {
            try {
                const payloadPush = JSON.stringify({
                    title: data.title,
                    body: data.body,
                    url: data.url,
                    icon: `${basePathIcons}/icon-192x192.png`,
                    badge: `${basePathIcons}/android-launchericon-96-96.png`,
                    tag: `notif-${nuevaNotificacion.id}`,
                    data: { timestamp: fechaCaracas }
                });

                await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payloadPush);
                resultados.exitosos++;
            } catch (err) {
                resultados.fallidos++;
                if (err.statusCode === 410 || err.statusCode === 404) {
                    await sub.destroy();
                } else {
                    console.error(`Error push usuario ${sub.usuarioId}:`, err.message);
                }
            }
        });

        await Promise.all(promesas);
        return nuevaNotificacion;

    } catch (error) {
        if (t && !t.finished) await t.rollback();
        console.error("Error crítico notificando:", error);
        throw error;
    }
}

export async function crearSinNotificar(data) {
    const t = await sequelize.transaction();
    try {
        const fechaCaracas = new Date().toLocaleString('es-VE', {
            timeZone: 'America/Caracas',
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: true
        });

        const targetDeptos = Array.isArray(data.departamentos) && data.departamentos.length > 0 ? data.departamentos : null;
        const targetPuestos = Array.isArray(data.puestos) && data.puestos.length > 0 ? data.puestos : null;

        // ✅ CORRECCIÓN: Guardamos el usuarioId aquí también
        const nuevaNotificacion = await Notificacion.create({
            titulo: data.title,
            mensaje: data.body,
            url: data.url,
            departamentoObjetivo: targetDeptos,
            puestoObjetivo: targetPuestos,
            usuarioId: data.usuarioId || null, 
            tipo: data.tipo || 'Info',
            fechaHoraCaracas: fechaCaracas
        }, { transaction: t });

        await t.commit();
        return nuevaNotificacion; 
    } catch (error) {
        if (t && !t.finished) await t.rollback();
        console.error("Error creando notificación sin enviar:", error);
        throw error;
    }
}

export async function notificarSinGuardarEnDB(data) {
    const clientId = process.env.NEXT_PUBLIC_CLIENT_ID || 'mediquir';
    const basePathIcons = `/tenants/${clientId}/icons`;

    try {
        const payloadPush = JSON.stringify({
            title: data.title,
            body: data.body,
            url: data.url,
            icon: `${basePathIcons}/icon-192x192.png`,
            badge: `${basePathIcons}/android-launchericon-96-96.png`,
            tag: `notif-temp-${Date.now()}`,
            data: { timestamp: new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas' }) }
        });
        
        const subscripciones = await PushSubscription.findAll({ where: { usuarioId: 1 } });
        const promesas = subscripciones.map(async (sub) => {
            try {
                await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payloadPush);
            } catch (err) {
                if (err.statusCode === 410 || err.statusCode === 404) {
                    await sub.destroy(); 
                } else {
                    console.error(`Error push usuario ${sub.usuarioId}:`, err.message);
                }
            }
        });
        await Promise.all(promesas);
        return { success: true, mensaje: "Notificación enviada sin guardar en BD." };

    } catch (error) {
        console.error("Error notificando sin guardar en DB:", error);
        throw error;
    }
}

// 4. WRAPPERS
export async function notificarAdmins(payload) {
    return crearYNotificar({ ...payload, departamentos: ['IT', 'Presidencia'] });
}

export async function notificarAdminsYUnUsuario(usuarioId, payload) {
    return crearYNotificar({ ...payload, departamentos: ['IT', "Presidencia"], usuarioId });
}

export async function notificarPresidente(payload) {
    return crearYNotificar({ ...payload, departamentos: ['Presidencia'] });
}

export async function notificarUsuario(usuarioId, payload) {
    return crearYNotificar({ ...payload, usuarioId });
}

export async function notificarTodos(payload) {
    return crearYNotificar({ ...payload });
}

export async function notificarGrupo(payload, departamentos, puestos) {
    return crearYNotificar({ ...payload, departamentos, puestos });
}

export async function notificarOperaciones(payload) {
    return crearYNotificar({ ...payload, departamentos: ['Operaciones'] });
}

export async function notificarAdministracion(payload) {
    return crearYNotificar({ ...payload, departamentos: ['Administracion'] });
}

export async function notificarCabezas(payload) {
    return crearYNotificar({ ...payload, puestos: ['Presidente', 'Desarrollador Web', 'Administradora', "Gerente Operacional"] });
}

export async function notificarDev(payload) {
    return crearYNotificar({ ...payload, puestos: ['Desarrollador Web'] });
}

export async function notificarCabezasSinPush(payload) {
    return crearSinNotificar({ ...payload, puestos: ['Presidente', 'Desarrollador Web', 'Administradora', "Gerente Operacional"] });
}

export async function notificarTodosSinPush(payload) {
    return crearSinNotificar({ ...payload });
}   

export async function pushAdminSinGuardarEnDB(payload) {
    return notificarSinGuardarEnDB({ ...payload, departamentos: ['IT'] });
}