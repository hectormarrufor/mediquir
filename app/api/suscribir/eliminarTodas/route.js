import db from '@/models';


export async function GET() {
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