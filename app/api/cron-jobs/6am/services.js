// app/api/cron-jobs/services.js
import { Op, where } from 'sequelize';
import axios from 'axios';
import https from 'https';
import * as cheerio from 'cheerio';
import sequelize from '@/sequelize';
import db, {
    Empleado, DocumentoEmpleado, ConsumibleSerializado,
    Activo, DocumentoActivo, BcvPrecioHistorico, Flete, Vehiculo, Remolque,
    Requisicion, CuentaPorPagar, CuentaPorCobrar, Proveedor, Cliente, Venta, FacturaCompra
} from '@/models'; // Ajusta tus imports
import { getCaracasDate, addDays, isSameMonthDay, getYearsDiff } from "../../../helpers/dateUtils"; // El archivo del paso 1

// Configuración para Binance
const URL_BINANCE = 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';
const BINANCE_HEADERS = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
};

// ==========================================
// 1. FINANZAS (Binance + BCV)
// ==========================================
// ... (He simplificado tu código original para que retorne un Objeto, no un Response)
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

export async function syncExchangeRates() {
    try {
        const forceUpdate = true;

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



        return { type: 'FINANZAS', status: 'OK', msg: `BCV: ${resultRecord.monto}, EUR: ${resultRecord.montoEur}, USDT: ${resultRecord.montoUsdt}` };
    } catch (e) {
        console.error("Error Finanzas:", e);
        return { type: 'FINANZAS', status: 'ERROR', msg: e.message };
    }
}

// ==========================================
// 3. RRHH (Cumpleaños, Aniversarios, Docs)
// ==========================================
export async function checkHREvents() {
    const today = getCaracasDate();
    const notifications = [];
    // Traemos empleados activos con sus documentos
    const empleados = await Empleado.findAll({
        attributes: ['id', 'nombre', 'apellido', 'fechaNacimiento', 'fechaIngreso'],
        where: { estado: 'Activo' },
        include: [{
            model: DocumentoEmpleado,
            as: 'documentos',
            where: {
                fechaVencimiento: { [Op.lte]: addDays(today, 15) } // Docs por vencer en 15 dias o ya vencidos
            },
            required: false // LEFT JOIN: Trae empleados aunque no tengan docs vencidos (para ver cumple/aniversario)
        }]
    });

    for (const emp of empleados) {
        // A. Cumpleaños (4 días antes o el mismo día)
        const bdayThisYear = new Date(today.getFullYear(), new Date(emp.fechaNacimiento).getMonth(), new Date(emp.fechaNacimiento).getDate() + 1); // Ajuste zona horaria simple
        const daysToBday = (bdayThisYear - today) / (1000 * 60 * 60 * 24);

        if (daysToBday >= 0 && daysToBday <= 4) {
            notifications.push({
                type: 'CUMPLE',
                msg: `🎂 ${emp.nombre} ${emp.apellido} cumple ${getYearsDiff(emp.fechaNacimiento, today)} años ${daysToBday == 1 ? 'MAÑANA' : daysToBday < 1 ? 'HOY' : 'en ' + (Math.ceil(daysToBday) - 1) + ' días'}.`,
                id: emp.id
            });
        }

        // B. Aniversario (1 día antes)
        const anniThisYear = new Date(today.getFullYear(), new Date(emp.fechaIngreso).getMonth(), new Date(emp.fechaIngreso).getDate() + 1);
        const daysToAnni = (anniThisYear - today) / (1000 * 60 * 60 * 24);

        if (daysToAnni >= 0 && daysToAnni <= 1) {
            const years = getYearsDiff(emp.fechaIngreso, today); // +1 porque es el que va a cumplir
            notifications.push({
                type: 'ANIVERSARIO',
                msg: `¡¡¡🎉🎂 Mañana ${emp.nombre} ${emp.apellido} cumple ${years}  ${years === 1 ? 'año' : 'años'} en la empresa🎂!!!`,
                id: emp.id,
            });
        }

        console.log(`Empleado: ${emp.nombre} ${emp.apellido}, Días para Cumpleaños: ${parseInt(daysToBday)}`);
        

        // C. Documentos Empleado (Ya filtrados por la query)
        if (emp.documentos && emp.documentos.length > 0) {
            emp.documentos.forEach(doc => {
                notifications.push({
                    type: 'DOC_EMPLEADO',
                    msg: `⚠️ ${doc.tipo} de ${emp.nombre} ${emp.apellido} vence el ${doc.fechaVencimiento}.`,
                    id: emp.id,
                });
            });
        }
    }

    return notifications;
}

// ==========================================
// 4. ACTIVOS (Documentos de Vehículos/Activos)
// ==========================================
export async function checkAssetDocs() {
    const today = getCaracasDate();
    const limitDate = addDays(today, 15); // Avisar con 15 días de anticipación

    const docs = await DocumentoActivo.findAll({
        where: {
            // 🔥 CRÍTICO: Ignorar los documentos permanentes (null) 🔥
            fechaVencimiento: {
                [Op.not]: null, 
                [Op.lte]: limitDate 
            }
        },
        include: [{ 
            model: Activo, as: 'activo', attributes: ['id', 'tipoActivo', 'codigoInterno'],
            include: [
                {
                    association: 'vehiculoInstancia', attributes: ['placa'],
                    include: [{ association: "plantilla", attributes: ['modelo', 'tipoVehiculo'] }]
                },
                {
                    association: 'remolqueInstancia', attributes: ['placa'],
                    include: [{ association: "plantilla", attributes: ['modelo', 'tipoRemolque'] }]
                },
                {
                    association: 'maquinaInstancia', attributes: ['placa'],
                    include: [{ association: "plantilla", attributes: ['modelo', 'tipo'] }]
                },
                {
                    association: 'inmuebleInstancia', attributes: ['direccionEspecifica'],
                    include: [{ association: "plantilla", attributes: ['nombre'] }]
                },
                {
                    association: 'equipoInstancia', attributes: ['serialFabrica'],
                    include: [{ association: "plantilla", attributes: ['tipoEquipo', 'marca', 'modelo'] }]
                }
            ]
        }]
    });

    return docs.map(doc => {
        // Calcular días exactos para el mensaje
        const fVenc = new Date(doc.fechaVencimiento);
        // Ajuste para evitar diferencias de horas
        const diffTime = fVenc.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        let estadoTiempo = "";
        if (diffDays < 0) estadoTiempo = `❌ VENCIDO hace ${Math.abs(diffDays)} días`;
        else if (diffDays === 0) estadoTiempo = `🚨 VENCE HOY`;
        else estadoTiempo = `⏳ Vence en ${diffDays} días`;

        // Extraer un nombre amigable del activo sin que crashee si falta un dato
        let nombreActivo = doc.activo.codigoInterno || `Activo #${doc.activoId}`;
        const a = doc.activo;

        if (a.tipoActivo === "Vehiculo" && a.vehiculoInstancia) {
            nombreActivo = `${a.vehiculoInstancia.plantilla?.modelo || 'Vehículo'} (Placa: ${a.vehiculoInstancia.placa || 'S/P'})`;
        } else if (a.tipoActivo === "Remolque" && a.remolqueInstancia) {
            nombreActivo = `${a.remolqueInstancia.plantilla?.modelo || 'Remolque'} (Placa: ${a.remolqueInstancia.placa || 'S/P'})`;
        } else if (a.tipoActivo === "Maquina" && a.maquinaInstancia) {
            nombreActivo = `${a.maquinaInstancia.plantilla?.modelo || 'Máquina'} (Placa: ${a.maquinaInstancia.placa || 'S/P'})`;
        } else if (a.tipoActivo === "Inmueble" && a.inmuebleInstancia) {
            nombreActivo = `${a.inmuebleInstancia.plantilla?.nombre || 'Instalación'}`;
        }

        // 🔥 MODIFICADO: Devolvemos variables estructuradas para usarlas libremente en la notificación
        return {
            tipoDoc: doc.tipo,
            nombreActivo: nombreActivo,
            estadoTiempo: estadoTiempo,
            msg: `• ${doc.tipo} de ${nombreActivo}: ${estadoTiempo}`, // Mantenido por si lo usas en logs
            id: doc.activoId
        };
    });
}

// ==========================================
// 5. CUENTAS POR PAGAR (Alertas de vencimiento)
// ==========================================
export async function checkCxP() {
    const today = getCaracasDate();
    const limitDate = addDays(today, 3); // Avisar con 3 días de anticipación

    const cuentas = await CuentaPorPagar.findAll({
        where: {
            estado: 'Pendiente',
            fechaVencimiento: { [Op.lte]: limitDate }
        },
        include: [
            { model: Proveedor, as: 'proveedor', attributes: ['nombre'] },
            { model: FacturaCompra, as: 'facturaCompra', attributes: ['numeroDocumento'] }
        ]
    });

    return cuentas.map(c => {
        const fVenc = new Date(c.fechaVencimiento);
        const diffTime = fVenc.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        let estadoTiempo = "";
        if (diffDays < 0) estadoTiempo = `❌ VENCIDA hace ${Math.abs(diffDays)} días`;
        else if (diffDays === 0) estadoTiempo = `🚨 VENCE HOY`;
        else estadoTiempo = `⏳ Vence en ${diffDays} días`;

        return {
            id: c.id,
            proveedor: c.proveedor?.nombre || 'Desconocido',
            documento: c.facturaCompra?.numeroDocumento || 'S/N',
            monto: c.saldoPendiente,
            moneda: c.moneda,
            estadoTiempo
        };
    });
}

// ==========================================
// 6. CUENTAS POR COBRAR (Alertas de vencimiento)
// ==========================================
export async function checkCxC() {
    const today = getCaracasDate();
    const limitDate = addDays(today, 3); // Avisar con 3 días de anticipación

    const cuentas = await CuentaPorCobrar.findAll({
        where: {
            estado: 'Pendiente',
            fechaVencimiento: { [Op.lte]: limitDate }
        },
        include: [
            { model: Cliente, as: 'cliente', attributes: ['nombre'] },
            { model: Venta, as: 'venta', attributes: ['numeroDocumento'] }
        ]
    });

    return cuentas.map(c => {
        const fVenc = new Date(c.fechaVencimiento);
        const diffTime = fVenc.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        let estadoTiempo = "";
        if (diffDays < 0) estadoTiempo = `❌ VENCIDA hace ${Math.abs(diffDays)} días`;
        else if (diffDays === 0) estadoTiempo = `🚨 VENCE HOY`;
        else estadoTiempo = `⏳ Vence en ${diffDays} días`;

        return {
            id: c.id,
            cliente: c.cliente?.nombre || 'Desconocido',
            documento: c.venta?.numeroDocumento || 'S/N',
            monto: c.saldoPendiente,
            moneda: c.moneda,
            estadoTiempo
        };
    });
}



