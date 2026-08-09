// app/api/notificaciones/lanzar/route.js
import { NextResponse } from 'next/server';
import { 
    notificarDev, 
    notificarCabezas, 
    notificarPresidente, 
    notificarTodos 
} from '@/app/handlers/notificar'; // Ajusta la ruta a donde esté tu archivo de notificador

export async function POST(req) {
    try {
        const body = await req.json();
        const { accion, payload } = body;

        // Validamos que venga la información mínima
        if (!accion || !payload || !payload.title || !payload.body) {
            return NextResponse.json(
                { success: false, error: 'Faltan parámetros requeridos (accion, title, body)' }, 
                { status: 400 }
            );
        }

        // Ejecutar el handler según la "accion" enviada desde el front
        let resultado;
        switch (accion) {
            case 'dev':
                resultado = await notificarDev(payload);
                break;
            case 'cabezas':
                resultado = await notificarCabezas(payload);
                break;
            case 'presidente':
                resultado = await notificarPresidente(payload);
                break;
            case 'todos':
                resultado = await notificarTodos(payload);
                break;
            default:
                return NextResponse.json(
                    { success: false, error: 'Acción de notificación no válida' }, 
                    { status: 400 }
                );
        }

        return NextResponse.json({ success: true, data: resultado }, { status: 200 });

    } catch (error) {
        console.error("Error en API de notificaciones:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}