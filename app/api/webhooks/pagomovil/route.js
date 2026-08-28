// Webhook para recibir notificaciones de Pago Móvil y registrar los pagos en la base de datos.
import { NextResponse } from 'next/server';
import db from '@/models/index'; // Asegúrate de la ruta correcta a tus modelos
import { notificarTodos } from '@/app/handlers/notificar';

export async function POST(request) {
    try {
        const body = await request.json();
        const { banco, mensaje, telefono_origen } = body;
        
        // Validación de seguridad (El candado de tu API)
        const secret = request.headers.get('x-webhook-secret');
        if (secret !== process.env.SMS_WEBHOOK_SECRET) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        let referenciaLarga = null;
        let montoLimpio = null;
        let emisor = 'Desconocido';

        switch (banco) {
            case 'MERCANTIL_APP':
                // NUEVO Mensaje Mercantil: "¡Has recibido un Tpago! - Tpago recibido Bs. 20000,00 del 04243031459 Ref 000058584568..."
                
                // 1. Extraer la Referencia (Busca "Ref " o "Ref: " seguido de números)
                const refMercantil = mensaje.match(/Ref\s*:?\s*(\d+)/i);
                referenciaLarga = refMercantil ? refMercantil[1] : null;

                // 2. Extraer el Monto (Busca "Bs. " seguido de números con comas/puntos)
                const montoMercantil = mensaje.match(/Bs\.\s*([\d.,]+)/i);
                montoLimpio = montoMercantil ? montoMercantil[1].replace(/\./g, '').replace(',', '.') : null;
                
                // 3. Extraer el Emisor (Busca "del " seguido del número de teléfono)
                const emisorMercantil = mensaje.match(/del\s+(\d+)/i);
                emisor = emisorMercantil ? emisorMercantil[1] : 'Desconocido';
                
                break;

            // Aquí puedes agregar luego los `case` para BDV_APP o EXTERIOR_EMAIL
            default:
                console.log('Banco no reconocido en el webhook:', banco);
        }

        if (referenciaLarga && montoLimpio) {
            // Extraemos solo los últimos 4 dígitos porque el frontend de Mediquir usa maxLength={4}
            const referencia4Digitos = referenciaLarga.slice(-4);

            // Guardamos en la BD el pago para que el checkout haga match
            await db.PagoSms.create({
                referencia: referencia4Digitos,
                monto: Number(montoLimpio),
                banco,
                telefonoEmisor: emisor,
                fechaHora: new Date(),
                procesado: false
            });
            
            console.log(`Pago registrado con éxito: ${emisor} | Ref: ${referencia4Digitos} | Monto: ${montoLimpio}`);
            
            // 🔥 Disparamos la notificación push a los administradores/vendedores 🔥
            await notificarTodos({
                title: `Pago Móvil Recibido 💸`,
                body: `${montoLimpio}Bs del ${emisor} (Ref: ${referencia4Digitos})`,
                url: "/superuser/pagos-recibidos",
                tag: `pago-movil-${referencia4Digitos}`
            });

            return NextResponse.json({ success: true, message: 'Pago registrado y listo para emparejar' });
        } else {
            console.error('No se pudo extraer la data de la notificación:', mensaje);
            return NextResponse.json({ error: 'Formato de notificación no reconocido' }, { status: 400 });
        }

    } catch (error) {
        console.error('Error en webhook de Pago Móvil:', error);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}