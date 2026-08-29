// Webhook para recibir notificaciones de Pago Móvil y registrar los pagos en la base de datos.
import { NextResponse } from 'next/server';
import db from '@/models/index'; 
import { notificarTodos } from '@/app/handlers/notificar';

export async function POST(request) {
    try {
        const body = await request.json();
        const { packageName, title, text, time } = body;

        // 1. 🔒 VALIDACIÓN DE SEGURIDAD (Bearer Token)
        const authHeader = request.headers.get('authorization'); 
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'No autorizado - Falta encabezado' }, { status: 401 });
        }

        const tokenRecibido = authHeader.slice(7);

        if (tokenRecibido !== process.env.SMS_WEBHOOK_SECRET) {
            return NextResponse.json({ error: 'No autorizado - Token inválido' }, { status: 401 });
        }

        // Unificamos el título y el texto para buscar en todo el contenido de la notificación
        const mensajeCompleto = `${title} - ${text}`;

        // ====================================================================
        // 🎯 FILTRO ULTRA ESTRICTO: Buscar "Tpago recibido" en lugar de solo "tpago"
        // ====================================================================
        const contieneTpagoRecibido = mensajeCompleto.toLowerCase().includes('tpago recibido');

        if (!contieneTpagoRecibido) {
            // Si la notificación no dice "Tpago recibido", la ignoramos silenciosamente con un 200 OK
            return NextResponse.json({ success: true, message: 'Notificación ignorada (No contiene "Tpago recibido")' });
        }
        // ====================================================================

        let referenciaLarga = null;
        let montoLimpio = null;
        let emisor = 'Desconocido';
        let fechaHoraNotificacion = time ? new Date(time) : new Date();

        // 2. PARSEO DE DATOS CON REGEX MEJORADOS
        // Formato real: "¡Has recibido un Tpago! - Tpago recibido Bs. 20000,00 del 04243031459 Ref 000058584568..."
        
        // Extraer la Referencia: busca "Ref" seguido de espacios y captura todos los dígitos numéricos posteriores
        const refMercantil = mensajeCompleto.match(/Ref\s+(\d+)/i);
        referenciaLarga = refMercantil ? refMercantil[1] : null;

        // Extraer el Monto: busca "Bs." seguido de un espacio y captura los números, puntos y comas
        const montoMercantil = mensajeCompleto.match(/Bs\.\s*([\d.,]+)/i);
        if (montoMercantil) {
            // Transforma "20.000,00" o "20000,00" en "20000.00" ideal para el tipo DECIMAL de Sequelize
            montoLimpio = montoMercantil[1].replace(/\./g, '').replace(',', '.');
        }
        
        // Extraer el Teléfono Emisor: busca la palabra "del" seguida de espacios y captura el número de teléfono
        const emisorMercantil = mensajeCompleto.match(/del\s+(\d+)/i);
        emisor = emisorMercantil ? emisorMercantil[1] : 'Desconocido';

        // 3. GUARDADO EN LA BASE DE DATOS (MERCANTIL)
        if (referenciaLarga && montoLimpio) {
            // Extraemos solo los últimos 4 dígitos porque el frontend usa maxLength={4}
            const referencia4Digitos = referenciaLarga.slice(-4);

            await db.PagoSms.create({
                banco: 'MERCANTIL',
                referencia: referencia4Digitos,
                monto: Number(montoLimpio),
                telefonoEmisor: emisor,
                fechaHora: fechaHoraNotificacion,
                procesado: false
            });
            
            console.log(`[Mediquir] Pago registrado con éxito: ${emisor} | Ref: ${referencia4Digitos} | Monto: ${montoLimpio} Bs.`);
            
            // 4. DISPARAR NOTIFICACIÓN PUSH A LOS ADMINISTRADORES
            await notificarTodos({
                title: `Pago Móvil Recibido 💸`,
                body: `${montoLimpio} Bs. del ${emisor} (Ref: ${referencia4Digitos})`,
                url: "/superuser/pagos-recibidos",
                tag: `pago-mobil-${referencia4Digitos}`
            });

            return NextResponse.json({ success: true, message: 'Pago verificado, registrado y listo para emparejar' });
        } else {
            console.error('Error al extraer variables. Mensaje original:', mensajeCompleto);
            return NextResponse.json({ error: 'Estructura de Tpago no pudo ser procesada' }, { status: 400 });
        }

    } catch (error) {
        console.error('Error crítico en el webhook de Pago Móvil:', error);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}
