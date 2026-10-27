import { NextResponse } from 'next/server';
import { generarConFallback } from '@/app/helpers/geminiConFallback.mjs';
import db from '@/models';
import crypto from 'crypto';

export async function POST(request) {
    try {
        // 1. Recibimos 'permitirGeneracion' desde el frontend
        const { observaciones, fecha, permitirGeneracion } = await request.json();

        if (!fecha) return NextResponse.json({ error: "Fecha requerida" }, { status: 400 });
        if (!observaciones || observaciones.length === 0) return NextResponse.json({ resumen: "Sin actividad." });

        const fechaKey = new Date(fecha).toISOString().split('T')[0];

        // ---------------------------------------------------------
        // 2. GENERAR HUELLA DIGITAL (HASH) DE LOS DATOS ENTRANTES
        // ---------------------------------------------------------
        const stringData = JSON.stringify(observaciones.sort());
        const incomingHash = crypto.createHash('md5').update(stringData).digest('hex');

        // ---------------------------------------------------------
        // 3. ESTRATEGIA DE CACHÉ Y RECUPERACIÓN DE BD
        // ---------------------------------------------------------
        
        // Buscamos si ya existe algo guardado en PostgreSQL
        let registroDB = await db.ResumenDiario.findOne({ where: { fecha: fechaKey } });

        // ESCENARIO A: HIT DE CACHÉ (Ahorro Total)
        // Existe en BD y los datos son idénticos a los de hoy -> Devolvemos lo guardado.
        if (registroDB && registroDB.hashContenido === incomingHash) {
            console.log(`[AI-CACHE] Hit válido para ${fechaKey}`);
            return NextResponse.json({ resumen: registroDB.contenido, source: 'cache' });
        }

        // ---------------------------------------------------------
        // 4. CLÁUSULA DE GUARDIA (Ahorro Inteligente)
        // ---------------------------------------------------------
        // Si llegamos aquí, significa que:
        // a) No existe registro en la BD.
        // b) O existe, pero los datos cambiaron (el hash es diferente).
        
        // Aquí preguntamos: ¿Tenemos permiso para gastar tokens en esta fecha?
        if (!permitirGeneracion) {
            console.log(`[AI-SKIP] Fecha antigua (${fechaKey}) sin permiso de regeneración.`);
            
            // Retornamos null o un indicador. 
            // El frontend interpretará esto como "Histórico sin resumen".
            return NextResponse.json({ 
                resumen: null, 
                source: 'skipped' 
            });
        }

        // ---------------------------------------------------------
        // 5. LLAMADA A GEMINI (Solo si pasó el filtro anterior)
        // ---------------------------------------------------------
        console.log(`[AI-LIVE] Generando nuevo resumen para ${fechaKey}...`);

        const prompt = `
        Actúa como Supervisor de Operaciones de transporte pesado.
        Resume estas actividades diarias de personal en planta en una frase corta, profesional y en pasado (máximo 15 palabras).
        Actividades:
        ${observaciones.join("\n")}
        `;

        // Si se agota la cuota gratuita de un modelo se prueba con el siguiente (mismo mecanismo que la lectura de facturas)
        const { texto } = await generarConFallback(prompt);
        const textoIA = texto.replace(/\*/g, '').trim();

        // ---------------------------------------------------------
        // 6. GUARDAR O ACTUALIZAR (UPSERT)
        // ---------------------------------------------------------
        if (registroDB) {
            // Si existía (pero era obsoleto), lo actualizamos
            registroDB.contenido = textoIA;
            registroDB.hashContenido = incomingHash;
            await registroDB.save();
        } else {
            // Si no existía, lo creamos
            await db.ResumenDiario.create({
                fecha: fechaKey,
                contenido: textoIA,
                hashContenido: incomingHash
            });
        }

        return NextResponse.json({ resumen: textoIA, source: 'api-updated' });

    } catch (error) {
        console.error("Error Gemini/DB:", error);
        if (error.message?.includes('429') || error.status === 429) {
             return NextResponse.json({ resumen: "Cuota IA excedida." }, { status: 429 });
        }
        return NextResponse.json({ resumen: "Operaciones en planta." }, { status: 500 });
    }
}