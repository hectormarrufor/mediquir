import { NextResponse } from 'next/server';
import BcvPrecioHistorico from '@/models/BcvPrecioHistorico';
import axios from 'axios';
import { Op } from 'sequelize';

// Esta API es gratuita y fiable para tasas históricas de divisas FIAT
const HISTORICAL_API = 'https://api.frankfurter.app';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        // Si pasas ?estimate_usdt=true en la URL, inventará el precio USDT basado en un % sobre el BCV
        const estimateUsdt = searchParams.get('estimate_usdt') === 'true';

        // 1. Buscar registros que les falte el Euro o el USDT
        const registrosIncompletos = await BcvPrecioHistorico.findAll({
            where: {
                [Op.or]: [
                    { montoEur: { [Op.eq]: 0 } },
                    { montoEur: { [Op.is]: null } },
                    // Si quieres rellenar USDT aunque sea estimado:
                    { montoUsdt: { [Op.eq]: 0 } },
                    { montoUsdt: { [Op.is]: null } }
                ]
            },
            order: [['fecha', 'DESC']], // De más reciente a más antiguo
            limit: 50 // Hacemos lotes de 50 para no saturar la API externa ni tu servidor
        });

        if (registrosIncompletos.length === 0) {
            return NextResponse.json({ message: 'Todos los registros históricos ya están completos.' });
        }

        let actualizados = 0;
        const log = [];

        // 2. Iterar y reparar
        for (const registro of registrosIncompletos) {
            const fechaRegistro = registro.fecha; // Formato YYYY-MM-DD
            const montoBcvUSD = parseFloat(registro.monto);

            if (!montoBcvUSD) continue; // Si no hay monto base, saltamos

            let nuevoMontoEur = parseFloat(registro.montoEur || 0);
            let nuevoMontoUsdt = parseFloat(registro.montoUsdt || 0);
            let cambios = false;

            // --- REPARAR EURO (Datos Reales Matemáticos) ---
            if (!nuevoMontoEur) {
                try {
                    // Pedimos cuánto valía 1 Euro en Dólares esa fecha específica
                    const response = await axios.get(`${HISTORICAL_API}/${fechaRegistro}?from=EUR&to=USD`);
                    
                    if (response.data && response.data.rates && response.data.rates.USD) {
                        const tasaCrossEurUsd = response.data.rates.USD;
                        
                        // Cálculo: Si 1 USD = 40 VES, y 1 EUR = 1.10 USD
                        // Entonces 1 EUR = 40 * 1.10 = 44 VES
                        nuevoMontoEur = (montoBcvUSD * tasaCrossEurUsd).toFixed(2);
                        cambios = true;
                        log.push(`Fecha ${fechaRegistro}: EUR calculado ${nuevoMontoEur} (Tasa Cross: ${tasaCrossEurUsd})`);
                    }
                } catch (err) {
                    console.error(`Error obteniendo tasa externa para ${fechaRegistro}:`, err.message);
                    // Probablemente es fin de semana (forex cerrado), usamos la del viernes si falla (lógica simplificada: saltar)
                }
            }

            // --- REPARAR USDT (Estimación Sintética) ---
            // Solo si lo activas, porque esto NO es dato real, es una suposición.
            if (!nuevoMontoUsdt && estimateUsdt) {
                // Asumimos un spread conservador del 1.5% al 3% sobre el BCV para fechas pasadas
                const spreadPromedio = 1.8; // 2.5% arriba del BCV
                nuevoMontoUsdt = (montoBcvUSD * spreadPromedio).toFixed(2);
                cambios = true;
                log.push(`Fecha ${fechaRegistro}: USDT estimado ${nuevoMontoUsdt} (Sintético +2.5%)`);
            }

            // 3. Guardar cambios
            if (cambios) {
                registro.montoEur = nuevoMontoEur;
                registro.montoUsdt = nuevoMontoUsdt;
                await registro.save();
                actualizados++;
                
                // Pequeña pausa para ser amables con la API gratuita
                await new Promise(resolve => setTimeout(resolve, 100)); 
            }
        }

        return NextResponse.json({
            success: true,
            mensaje: `Procesados ${actualizados} registros históricos.`,
            pendientes: registrosIncompletos.length - actualizados, // Si quedan más por el límite de 50
            nota: "Si hay pendientes, vuelve a llamar a este endpoint.",
            detalles: log
        });

    } catch (error) {
        console.error("Error en Backfill:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}