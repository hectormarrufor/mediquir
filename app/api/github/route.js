import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { notificarTodos } from '@/app/handlers/notificar';

export async function POST(req) {
    try {
        const signature = req.headers.get('x-hub-signature-256');
        const bodyText = await req.text();

        const hmac = crypto.createHmac('sha256', process.env.GITHUB_WEBHOOK_SECRET);
        const digest = 'sha256=' + hmac.update(bodyText).digest('hex');

        if (signature !== digest) {
            return NextResponse.json({ error: 'Firma inválida' }, { status: 401 });
        }

        const payload = JSON.parse(bodyText);

        if (payload.ref === 'refs/heads/main') {
            const headCommit = payload.head_commit;
            
            if (!headCommit) {
                return NextResponse.json({ message: 'Push sin commits' }, { status: 200 });
            }

            let commitMessage = headCommit.message;
            const shortHash = headCommit.id.substring(0, 7);
            
            // Lógica de URL con filtro de seguridad
            let targetUrl = '/superuser/notificaciones'; // Default por defecto

            const urlMatch = commitMessage.match(/URL_DESTINO:\s*(\S+)/);
            if (urlMatch) {
                const extractedUrl = urlMatch[1];
                
                // Filtro: Si empieza por /api/ o es igual a /api, redirigimos a /superuser
                if (extractedUrl.startsWith('/api') || extractedUrl === '/api') {
                    targetUrl = '/superuser/notificaciones';
                } else {
                    targetUrl = extractedUrl;
                }
                
                if (targetUrl === '/superuser') {
                    targetUrl = '/superuser/notificaciones';
                }
                
                // Limpiamos la etiqueta del mensaje final
                commitMessage = commitMessage.replace(urlMatch[0], '').trim();
            }

            const notificacionData = {
                title: `Actualización del Sistema (v${shortHash})`,
                body: commitMessage, 
                url: targetUrl, 
                tipo: 'Info'
            };

            await notificarTodos(notificacionData);

            return NextResponse.json({ success: true, message: 'Push notificado correctamente' }, { status: 200 });
        }

        return NextResponse.json({ message: 'Push ignorado' }, { status: 200 });

    } catch (error) {
        console.error('Error en Webhook:', error);
        return NextResponse.json({ error: 'Error interno' }, { status: 500 });
    }
}