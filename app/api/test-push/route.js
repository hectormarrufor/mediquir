import { NextResponse } from 'next/server';
import webpush from 'web-push';
import db from '@/models'; // Asegúrate de que esta ruta a tus modelos sea la correcta
const { PushSubscription } = db;

// Configuración de VAPID (Usando los datos que vi en tus handlers)
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        'mailto:hectormmarrufor@gmail.com',
        VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY
    );
}

export async function GET(request) {
    try {
        if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
            return NextResponse.json({ error: 'Faltan las variables de entorno VAPID.' }, { status: 400 });
        }

        // Buscamos las suscripciones del usuario administrador (userId: 1)
        const subscripciones = await PushSubscription.findAll({
            where: { usuarioId: 1 }
        });

        if (subscripciones.length === 0) {
            return NextResponse.json({ 
                status: 'vacío', 
                message: 'No hay ninguna suscripción guardada para el usuario 1 en la base de datos.' 
            });
        }

        const resultados = [];

        for (const sub of subscripciones) {
            try {
                // Preparamos un mensaje de prueba simple
                const payload = JSON.stringify({
                    title: '🔔 Prueba de Diagnóstico',
                    body: 'Si ves esto, la conexión web-push funciona perfectamente.',
                    url: '/superuser',
                    icon: '/tenants/mediquir/icons/icon-192x192.png'
                });

                // Intentamos disparar la notificación
                const response = await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload);
                
                // Si funciona, lo guardamos como exitoso
                resultados.push({
                    endpoint: sub.endpoint.substring(0, 50) + '...', // Recortamos para que no sea un texto gigante
                    status: 'EXITOSO ✅',
                    statusCode: response.statusCode
                });

            } catch (err) {
                // 🔥 AQUÍ CAPTURAMOS EL ERROR EXACTO DE GOOGLE/MOZILLA 🔥
                resultados.push({
                    endpoint: sub.endpoint.substring(0, 50) + '...',
                    status: 'FALLIDO ❌',
                    statusCode: err.statusCode,
                    mensajeGeneral: err.message,
                    errorCrudoDeGoogle: err.body // Esto te dirá exactamente QUÉ está mal (ej: "Unauthorized")
                });

                // Limpieza automática si el navegador dice que ya no existe (404/410)
                if (err.statusCode === 410 || err.statusCode === 404) {
                    await sub.destroy();
                }
            }
        }

        return NextResponse.json({
            totalSuscripcionesEvaluadas: subscripciones.length,
            detalles: resultados
        });

    } catch (error) {
        console.error("Error en test-push:", error);
        return NextResponse.json({ error: 'Error interno del servidor', detalle: error.message }, { status: 500 });
    }
}