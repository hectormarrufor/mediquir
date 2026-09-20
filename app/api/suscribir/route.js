import db from '@/models';
import { getSesion } from '../notificaciones/_lib';
import { rolDe } from '@/app/constants/roles';

// Suscripciones de notificaciones push. El dueño de una suscripción es SIEMPRE el usuario de la sesión: antes el navegador mandaba
// su "usuarioId" y cualquiera (incluso sin sesión, o un cliente del portal) podía suscribirse como un empleado y recibir sus avisos internos.
const json = (cuerpo, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });

// Lista de suscripciones: solo administradores, y sin las llaves de cifrado
export async function GET() {
  const sesion = await getSesion();
  if (!sesion) return json({ error: 'No autorizado' }, 401);
  if (sesion.clienteId || rolDe(sesion) !== 'admin') return json({ error: 'Solo administradores' }, 403);
  try {
    const subscripciones = await db.PushSubscription.findAll({ attributes: { exclude: ['keys', 'endpoint'] } });
    return json(subscripciones);
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    return json({ error: 'Error fetching subscriptions' }, 500);
  }
}

export async function POST(req) {
  const sesion = await getSesion();
  if (!sesion?.id) return json({ error: 'No autorizado' }, 401);
  try {
    const { suscripcion, rol, navegador, environment } = await req.json();
    if (!suscripcion || !suscripcion.endpoint) return json({ error: 'Falta la suscripción' }, 400);
    const usuarioId = Number(sesion.id);

    const pushSub = await db.PushSubscription.findOne({ where: { endpoint: suscripcion.endpoint } });
    if (pushSub) {
      // El mismo navegador pasa a ser de quien inició sesión ahora
      pushSub.usuarioId = usuarioId;
      pushSub.rol = rol || (pushSub.rol || 'usuario');
      pushSub.activo = true;
      if (suscripcion.keys) pushSub.keys = suscripcion.keys;
      if (navegador) pushSub.navegador = navegador;
      if (environment) pushSub.environment = environment;
      await pushSub.save();
    } else {
      await db.PushSubscription.create({
        endpoint: suscripcion.endpoint,
        keys: suscripcion.keys,
        usuarioId,
        rol: rol || 'usuario',
        activo: true,
        navegador: navegador || 'Desconocido',
        environment: environment || 'development',
      });
    }
    return json({ ok: true });
  } catch (error) {
    console.error('Error en POST /api/suscribir:', error);
    return json({ error: 'No se pudo guardar la suscripción' }, 500);
  }
}

// Quitar una suscripción: se identifica por su endpoint, una URL secreta que solo conoce ese navegador. No exige sesión porque al cerrar sesión
// el navegador se desuscribe justo cuando la cookie se está borrando.
export async function DELETE(req) {
  try {
    const { endpoint } = await req.json();
    if (!endpoint) return json({ error: 'Falta el endpoint' }, 400);
    await db.PushSubscription.destroy({ where: { endpoint } });
    return json({ ok: true });
  } catch (error) {
    console.error('Error deleting subscriptions:', error);
    return json({ error: 'Error deleting subscriptions' }, 500);
  }
}
