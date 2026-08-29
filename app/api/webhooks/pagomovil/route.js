// Webhook seguro multiteléfono para registrar pagos en Mediquir.
import { NextResponse } from 'next/server';
import db from '@/models/index'; 
import { notificarTodos } from '@/app/handlers/notificar';
import { Op } from 'sequelize';

// Helpers de conversión de fecha bancaria (Permanecen idénticos)
function parsearFechaMercantil(fechaStr, horaStr) {
    const [dia, mes, ano] = fechaStr.split('/').map(Number);
    let [horaMin, periodo] = horaStr.split(' ');
    let [hora, min] = horaMin.split(':').map(Number);
    if (periodo?.toUpperCase() === 'PM' && hora < 12) hora += 12;
    if (periodo?.toUpperCase() === 'AM' && hora === 12) hora = 0;
    return new Date(ano, mes - 1, dia, hora, min, 0);
}

function parsearFechaBDV(fechaStr, horaStr) {
    const [dia, mes, anoCorto] = fechaStr.split('-').map(Number);
    const [hora, min] = horaStr.split(':').map(Number);
    const anoCompleto = 2000 + anoCorto;
    return new Date(anoCompleto, mes - 1, dia, hora, min, 0);
}

export async function POST(request) {
    try {
        const body = await request.json();
        const { packageName, title, text } = body;

        // 1. 🔒 CAPTURA Y VALIDACIÓN DINÁMICA DEL BEARER TOKEN (Cero Hardcoding)
        const authHeader = request.headers.get('authorization'); 
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'No autorizado - Falta encabezado' }, { status: 401 });
        }

        const tokenRecibido = authHeader.slice(7); // El token que envió el teléfono
        let dispositivoOrigen = null;

        try {
            // Leemos el JSON único desde la variable del .env
            const tokensAutorizados = JSON.parse(process.env.SMS_WEBHOOK_TOKENS || '{}');
            
            // Si el token recibido existe en el objeto del .env, extraemos el nombre directamente
            if (tokensAutorizados[tokenRecibido]) {
                dispositivoOrigen = tokensAutorizados[tokenRecibido]; // Guardará 'Héctor - S26 Ultra', 'Jolexi', etc.
            }
        } catch (jsonError) {
            console.error('[Seguridad] Error crítico al parsear SMS_WEBHOOK_TOKENS desde el .env');
        }

        // Si el token no existe en el .env, la API frena y rechaza inmediatamente
        if (!dispositivoOrigen) {
            console.warn(`[Seguridad] Intento de acceso rechazado para el token: "${tokenRecibido}"`);
            return NextResponse.json({ error: 'No autorizado - Token inválido' }, { status: 401 });
        }

        const mensajeCompleto = `${title} - ${text}`;
        
        let bancoIdentificado = null;
        let referenciaLarga = null;
        let montoLimpio = null;
        let emisor = 'Desconocido';
        let fechaHoraFinal = null;

        // 2. 🎯 SWITCH PARA DETERMINAR EL BANCO Y EXTRAER VARIABLES
        switch (true) {
            
            // --- CASO 1: MERCANTIL ---
            case mensajeCompleto.toLowerCase().includes('tpago recibido'):
                bancoIdentificado = 'MERCANTIL';

                const refMercantil = mensajeCompleto.match(/Ref\s+(\d+)/i);
                referenciaLarga = refMercantil ? refMercantil[1] : null;

                const montoMercantil = mensajeCompleto.match(/Bs\.\s*([\d.,]+)/i);
                if (montoMercantil) {
                    montoLimpio = montoMercantil[1].replace(/\./g, '').replace(',', '.');
                }
                
                const emisorMercantil = mensajeCompleto.match(/del\s+(\d+)/i);
                emisor = emisorMercantil ? emisorMercantil[1] : 'Desconocido';

                const fechaHoraMatch = mensajeCompleto.match(/(\d{2}\/\d{2}\/\d{4}),\s*(\d{2}:\d{2}\s*[APM]{2})/i);
                if (fechaHoraMatch) {
                    fechaHoraFinal = parsearFechaMercantil(fechaHoraMatch[1], fechaHoraMatch[2]);
                }
                break;

            // --- CASO 2: BANCO DE VENEZUELA (BDV) ---
            case mensajeCompleto.toLowerCase().includes('pagomovilbdv'):
                bancoIdentificado = 'VENEZUELA';

                const refBDV = mensajeCompleto.match(/Ref\s*:\s*(\d+)/i);
                referenciaLarga = refBDV ? refBDV[1] : null;

                const montoBDV = mensajeCompleto.match(/Bs\.\s*([\d.,]+)/i);
                if (montoBDV) {
                    montoLimpio = montoBDV[1].replace(/\./g, '').replace(',', '.');
                }

                const emisorBDV = mensajeCompleto.match(/del\s+([\d-]+)/i);
                emisor = emisorBDV ? emisorBDV[1].replace(/-/g, '') : 'Desconocido';

                const fechaBDV = mensajeCompleto.match(/fecha\s*:\s*([\d-]+)/i);
                const horaBDV = mensajeCompleto.match(/hora\s*:\s*([\d:]+)/i);
                if (fechaBDV && horaBDV) {
                    fechaHoraFinal = parsearFechaBDV(fechaBDV[1], horaBDV[1]);
                }
                break;

            default:
                return NextResponse.json({ success: true, message: 'Notificación ignorada de forma segura' });
        }

        // 3. 🛡️ CONTROL DE DUPLICADOS E INSERCIÓN en la Base de Datos
        if (referenciaLarga && montoLimpio && fechaHoraFinal) {
            const referencia4Digitos = referenciaLarga.slice(-4);
            
            // Formateamos el string del banco inyectando dinámicamente el nombre extraído del .env
            const bancoConDispositivo = `${bancoIdentificado} (${dispositivoOrigen})`;

            // Ventana de 24 horas para evitar ráfagas o duplicados entre teléfonos
            const unDiaAtras = new Date(fechaHoraFinal.getTime() - 24 * 60 * 60 * 1000);
            
            const pagoExistente = await db.PagoSms.findOne({
                where: {
                    referencia: referencia4Digitos,
                    monto: Number(montoLimpio),
                    banco: {
                        [Op.like]: `${bancoIdentificado}%`
                    },
                    fechaHora: {
                        [Op.gte]: unDiaAtras
                    }
                }
            });

            if (pagoExistente) {
                console.log(`[Mediquir - Duplicado] Bloqueado. Banco: ${bancoConDispositivo} | Ref: ${referencia4Digitos}`);
                return NextResponse.json({ success: true, message: 'Pago ya registrado previamente' });
            }

            // 4. GUARDADO FINAL EN SEQUELIZE
            await db.PagoSms.create({
                banco: bancoConDispositivo, // Guardará exactamente: "MERCANTIL (Héctor - S26 Ultra)"
                referencia: referencia4Digitos,
                monto: Number(montoLimpio),
                telefonoEmisor: emisor,
                fechaHora: fechaHoraFinal, 
                procesado: false
            });
            
            console.log(`[Mediquir] ¡PAGO REGISTRADO! ${bancoConDispositivo} | Ref: ${referencia4Digitos} | Monto: ${montoLimpio} Bs.`);
            
            // 5. NOTIFICACIÓN PUSH
            await notificarTodos({
                title: `Pago Móvil Recibido (${bancoIdentificado}) 💸`,
                body: `${montoLimpio} Bs. en teléfono de ${dispositivoOrigen} (Ref: ${referencia4Digitos})`,
                url: "/superuser/pagos-recibidos",
                tag: `pago-${bancoIdentificado.toLowerCase()}-${referencia4Digitos}`
            });

            return NextResponse.json({ success: true, message: `Pago registrado con éxito por ${dispositivoOrigen}` });
        } else {
            console.error(`[Mediquir] Error al extraer data en ${bancoIdentificado || 'Desconocido'}. Mensaje:`, mensajeCompleto);
            return NextResponse.json({ error: 'Estructura de variables ilegible' }, { status: 400 });
        }

    } catch (error) {
        console.error('Error crítico en el webhook dinámico:', error);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}
