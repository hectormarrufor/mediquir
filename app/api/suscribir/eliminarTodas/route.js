import db from '@/models';
import { getSesion } from '../../notificaciones/_lib';
import { rolDe } from '@/app/constants/roles';


export async function GET() {
  const sesion = await getSesion();
  if (!sesion || sesion.clienteId || rolDe(sesion) !== 'admin') return new Response(JSON.stringify({ error: 'Solo administradores' }), { status: 403 });
  try {

      await db.PushSubscription.destroy({
        where: {
          activo: false
        }
      });
  
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    catch (error) {
      console.error('Error deleting subscriptions:', error);
      return new Response(JSON.stringify({ error: 'Error deleting subscriptions' }), { status: 500 });
    }
}