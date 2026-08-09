import axios from 'axios';
import https from 'https';
import { NextResponse } from 'next/server';
const cheerio = require  ('cheerio'); // Importación corregida para Next.js
import BcvPrecioHistorico from '../../../models/BcvPrecioHistorico';

// Configuración para Binance
const URL_BINANCE = 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';
const BINANCE_HEADERS = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
};

// Helper para consultar Binance
const fetchBinanceData = async (tradeType, amount = null, limit = 5) => {
    try {
        const payload = {
            "fiat": "VES",
            "page": 1,
            "rows": limit,
            "tradeType": tradeType,
            "asset": "USDT",
            "countries": [],
            "proMerchantAds": false,
            "shieldMerchantAds": false,
            "payTypes": ["PagoMovil"],
            "transAmount": amount 
        };
        const { data } = await axios.post(URL_BINANCE, payload, { headers: BINANCE_HEADERS });
        return data.data || [];
    } catch (e) {
        console.warn('Fallo petición parcial a Binance:', e.message);
        return [];
    }
};

export async function GET(request) {
    try {
        // Capturar parámetros de la URL
        const { searchParams } = new URL(request.url);
        const forceUpdate = searchParams.get('force') === 'true';

        // --- ZONA HORARIA CARACAS ---
        const now = new Date();
        const fechaCaracas = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(now);

        const horaCaracas = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'America/Caracas', hour: '2-digit', minute: '2-digit', second: '2-digit',
        }).format(now);

        const fechaActual = fechaCaracas; 
        const horaActual = horaCaracas;

        // 1. Verificar si existe registro en BD
        const existingPrice = await BcvPrecioHistorico.findOne({
            where: { fecha: fechaActual },
        });

        if (existingPrice && !forceUpdate) {
            return NextResponse.json({
                message: 'Precios obtenidos de base de datos',
                precio: parseFloat(existingPrice.monto),        // USD BCV
                eur: parseFloat(existingPrice.montoEur || 0),   // EUR BCV
                usdt: parseFloat(existingPrice.montoUsdt || 0), // USDT Binance
                fecha: existingPrice.fecha,
                hora: existingPrice.hora,
                origen: 'base_de_datos'
            });
        }

        // ---------------------------------------------------------
        // 2. SCRAPING BCV (USD y EUR)
        // ---------------------------------------------------------
        const agent = new https.Agent({ rejectUnauthorized: false });
        // Pedimos la página del BCV
        const { data: htmlBCV } = await axios.get('https://www.bcv.org.ve/', { httpsAgent: agent, timeout: 15000 });
        const $ = cheerio.load(htmlBCV);

        // Helper para limpiar el texto "36,4500000" -> 36.45
        const parseBCV = (selector) => {
            const text = $(selector).first().text().trim();
            return parseFloat(text.replace(/\./g, '').replace(',', '.')).toFixed(2);
        };

        const precioDolarBCV = parseBCV('div#dolar .recuadrotsmc .centrado');
        const precioEuroBCV = parseBCV('div#euro .recuadrotsmc .centrado');

        if (isNaN(precioDolarBCV)) throw new Error("No se pudo parsear el precio del Dólar BCV.");

        // ---------------------------------------------------------
        // 3. CALCULO USDT BINANCE (Lógica Dinámica 50 USDT)
        // ---------------------------------------------------------
        let precioUsdtPromedio = 0;

        try {
            // A. Obtener referencia de 1 USDT para calcular monto base
            const refData = await fetchBinanceData('BUY', null, 1);
            
            if (refData.length > 0) {
                const precioUnitarioRef = parseFloat(refData[0].adv.price);
                
                // B. Calcular cuánto son 50 USDT hoy
                const montoObjetivoVES = precioUnitarioRef * 50;

                // C. Buscar ofertas BUY y SELL para ese monto exacto en paralelo
                const [ofertasVenta, ofertasCompra] = await Promise.all([
                    fetchBinanceData('BUY', montoObjetivoVES, 5),
                    fetchBinanceData('SELL', montoObjetivoVES, 5)
                ]);

                if (ofertasVenta.length > 0 && ofertasCompra.length > 0) {
                    const calcPromedio = (lista) => lista.reduce((acc, item) => acc + parseFloat(item.adv.price), 0) / lista.length;
                    const promVenta = calcPromedio(ofertasVenta);
                    const promCompra = calcPromedio(ofertasCompra);
                    
                    // Punto medio
                    precioUsdtPromedio = (promVenta + promCompra) / 2;
                }
            }
        } catch (errorBinance) {
            console.error("Error obteniendo USDT:", errorBinance.message);
            // No lanzamos throw para no detener el guardado del BCV
        }

        // ---------------------------------------------------------
        // 4. Guardar en Base de Datos
        // ---------------------------------------------------------
        let resultRecord;
        let operacion;

        // Datos a guardar
        const datosAGuardar = {
            monto: precioDolarBCV,              // USD
            montoEur: precioEuroBCV || 0,       // EUR (si falla, 0)
            montoUsdt: parseFloat(precioUsdtPromedio.toFixed(2)) || 0, // USDT (si falla, 0)
            hora: horaActual
        };

        if (existingPrice) {
            // Actualizar
            await existingPrice.update(datosAGuardar);
            resultRecord = existingPrice;
            operacion = 'actualizado_por_fuerza';
        } else {
            // Crear nuevo
            resultRecord = await BcvPrecioHistorico.create({
                fecha: fechaActual,
                ...datosAGuardar
            });
            operacion = 'creado_nuevo';
        }


        return NextResponse.json({
            message: 'Tasas procesadas exitosamente',
            precio: parseFloat(resultRecord.monto),       // Mantengo key 'precio' por compatibilidad con tu front
            eur: parseFloat(resultRecord.montoEur),
            usdt: parseFloat(resultRecord.montoUsdt),
            fecha: resultRecord.fecha,
            hora: resultRecord.hora,
            origen: operacion
        });

    } catch (error) {
        console.error('Error API Tasas:', error.message);
        return NextResponse.json({ message: 'Error crítico', error: error.message }, { status: 500 });
    }
}