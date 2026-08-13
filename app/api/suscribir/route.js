import db from '@/models';
import { Op } from 'sequelize';

export async function GET(req) {
  try {
    const subscripciones = await db.PushSubscription.findAll();
    return new Response(JSON.stringify(subscripciones), { status: 200 });
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    return new Response(JSON.stringify({ error: 'Error fetching subscriptions' }), { status: 500 });
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { suscripcion, usuarioId, rol, navegador, environment } = body;

    if (!suscripcion || !suscripcion.endpoint || !usuarioId) {
      return new Response(JSON.stringify({ error: 'Faltan datos obligatorios (endpoint o usuarioId)' }), { status: 400 });
    }

    // Buscamos si ya existe este endpoint exacto en el navegador
    let pushSub = await db.PushSubscription.findOne({ where: { endpoint: suscripcion.endpoint } });

    if (pushSub) {
      // Si ya existe, actualizamos el usuario al que pertenece ahora mismo (ej: cambiamos del usuario 6 al usuario 1)
      pushSub.usuarioId = parseInt(usuarioId);
      pushSub.rol = rol || (pushSub.rol || 'usuario');
      pushSub.activo = true;
      if (navegador) pushSub.navegador = navegador;
      if (environment) pushSub.environment = environment;
      await pushSub.save();
    } else {
      // Si no existe, lo creamos de cero
      await db.PushSubscription.create({
        endpoint: suscripcion.endpoint,
        keys: suscripcion.keys,
        usuarioId: parseInt(usuarioId),
        rol: rol || 'usuario',
        activo: true,
        navegador: navegador || 'Desconocido',
        environment: environment || 'development'
      });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (error) {
    console.error('Error en POST /api/suscribir:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const body = await req.json();
    const { endpoint } = body;
    await db.PushSubscription.destroy({ where: { endpoint } });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (error) {
    console.error('Error deleting subscriptions:', error);
    return new Response(JSON.stringify({ error: 'Error deleting subscriptions' }), { status: 500 });
  }
}