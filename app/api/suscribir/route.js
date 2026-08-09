// app/api/suscribir/route.js
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
  const body = await req.json();
  const { suscripcion, usuarioId, rol, navegador, environment } = body;
  await db.PushSubscription.upsert({
    endpoint: suscripcion.endpoint,
    keys: suscripcion.keys,
    usuarioId: parseInt(usuarioId),
    rol,
    activo: true,
    navegador,
    environment
  });
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}
export async function DELETE(req) {
  try {

    const body = await req.json();
    const { endpoint } = body;
    await db.PushSubscription.destroy({ where: { endpoint } });

    // Opcional: eliminar físicamente todas las entradas 
    // await db.PushSubscription.destroy({
    //   where: {
    //     endpoint: {
    //       [Op.like]: '%fcm.googleapis.com%'
    //     }
    //   }
    // });


    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }
  catch (error) {
    console.error('Error deleting subscriptions:', error);
    return new Response(JSON.stringify({ error: 'Error deleting subscriptions' }), { status: 500 });
  }
}