import axios from 'axios';
import { Op } from 'sequelize';
import { NextResponse } from 'next/server';
import BcvPrecioHistorico from '../../../models/BcvPrecioHistorico';
import { requerirStaff } from '../inventario/_lib';
import { leerBcv } from '../_lib/bcvScrape';

// Forzar la actualización (scraping del BCV y de Binance + escritura en la base) solo lo puede pedir el cron de Vercel o el personal.
// Antes cualquier visitante anónimo podía hacerlo con ?force=true.
async function puedeForzar(request) {
    const auth = request.headers.get('authorization');
    if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
    const { error } = await requerirStaff();
    return !error;
}

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
        const forceUpdate = searchParams.get('force') === 'true' && (await puedeForzar(request));

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

        // 1. La tasa que rige HOY: la más reciente con fecha valor <= hoy (la de mañana puede estar ya guardada y no se usa todavía)
        const vigenteHoy = () => BcvPrecioHistorico.findOne({ where: { fecha: { [Op.lte]: fechaActual } }, order: [['fecha', 'DESC'], ['id', 'DESC']] });
        const existingPrice = await vigenteHoy();
        const respuestaBD = (fila, origen) => NextResponse.json({
            message: 'Precios obtenidos de base de datos',
            precio: parseFloat(fila.monto),        // USD BCV
            eur: parseFloat(fila.montoEur || 0),   // EUR BCV
            usdt: parseFloat(fila.montoUsdt || 0), // USDT Binance
            fecha: fila.fecha,
            hora: fila.hora,
            origen,
        });

        if (existingPrice && existingPrice.fecha === fechaActual && !forceUpdate) return respuestaBD(existingPrice, 'base_de_datos');

        // ---------------------------------------------------------
        // 2. SCRAPING BCV (USD y EUR) con su fecha valor
        // ---------------------------------------------------------
        let bcv;
        try {
            bcv = await leerBcv();
        } catch (e) {
            // Si el BCV no responde pero ya hay una tasa vigente, se sigue con ella en vez de dejar la tienda sin tasa
            if (existingPrice) return respuestaBD(existingPrice, 'base_de_datos_sin_actualizar');
            throw e;
        }
        const precioDolarBCV = bcv.usd;
        const precioEuroBCV = bcv.eur;

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
        let operacion;

        // Datos a guardar
        const datosAGuardar = {
            monto: precioDolarBCV,              // USD
            montoEur: precioEuroBCV || 0,       // EUR (si falla, 0)
            montoUsdt: parseFloat(precioUsdtPromedio.toFixed(2)) || 0, // USDT (si falla, 0)
            hora: horaActual
        };

        // Se guarda con la FECHA VALOR del BCV (no con la fecha en que se leyó): la tasa publicada hoy para mañana queda en mañana
        const mismaFecha = await BcvPrecioHistorico.findOne({ where: { fecha: bcv.fechaValor }, order: [['id', 'DESC']] });
        if (mismaFecha) {
            await mismaFecha.update(datosAGuardar);
            operacion = 'actualizado_por_fuerza';
        } else {
            await BcvPrecioHistorico.create({ fecha: bcv.fechaValor, ...datosAGuardar });
            operacion = 'creado_nuevo';
        }
        // Al navegador se le responde la tasa que rige hoy
        const resultRecord = (await vigenteHoy()) || { monto: precioDolarBCV, montoEur: datosAGuardar.montoEur, montoUsdt: datosAGuardar.montoUsdt, fecha: bcv.fechaValor, hora: horaActual };


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