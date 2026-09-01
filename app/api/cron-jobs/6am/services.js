import { Op } from 'sequelize';
import axios from 'axios';
import https from 'https';
import * as cheerio from 'cheerio';
import sequelize from '@/sequelize';
// Agregamos Producto, Venta y VentaDetalle a tu importación de modelos
import db, {
    Empleado, DocumentoEmpleado, BcvPrecioHistorico, 
    CuentaPorPagar, CuentaPorCobrar, Proveedor, Cliente, 
    Venta, FacturaCompra, Producto, VentaDetalle
} from '@/models'; 
import { getCaracasDate, addDays, getYearsDiff } from "../../../helpers/dateUtils"; 

const URL_BINANCE = 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';
const BINANCE_HEADERS = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
};

// ==========================================
// 1. FINANZAS (Binance + BCV)
// ==========================================
const fetchBinanceData = async (tradeType, amount = null, limit = 5) => {
    try {
        const payload = {
            "fiat": "VES", "page": 1, "rows": limit, "tradeType": tradeType,
            "asset": "USDT", "countries": [], "proMerchantAds": false,
            "shieldMerchantAds": false, "payTypes": ["PagoMovil"], "transAmount": amount
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

        const now = new Date();
        const fechaActual = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(now);
        const horaActual = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'America/Caracas', hour: '2-digit', minute: '2-digit', second: '2-digit',
        }).format(now);

        const existingPrice = await BcvPrecioHistorico.findOne({ where: { fecha: fechaActual } });

        // 🔥 CORREGIDO: Ya no retorna NextResponse, sino un objeto estándar
        if (existingPrice && !forceUpdate) {
            return { 
                type: 'FINANZAS', 
                status: 'OK', 
                msg: `Precios en BD -> BCV: ${existingPrice.monto}, EUR: ${existingPrice.montoEur}, USDT: ${existingPrice.montoUsdt}` 
            };
        }

        // SCRAPING BCV
        const agent = new https.Agent({ rejectUnauthorized: false });
        const { data: htmlBCV } = await axios.get('https://www.bcv.org.ve/', { httpsAgent: agent, timeout: 15000 });
        const $ = cheerio.load(htmlBCV);

        const parseBCV = (selector) => {
            const text = $(selector).first().text().trim();
            return parseFloat(text.replace(/\./g, '').replace(',', '.')).toFixed(2);
        };

        const precioDolarBCV = parseBCV('div#dolar .recuadrotsmc .centrado');
        const precioEuroBCV = parseBCV('div#euro .recuadrotsmc .centrado');

        if (isNaN(precioDolarBCV)) throw new Error("No se pudo parsear el Dólar BCV.");

        // BINANCE USDT
        let precioUsdtPromedio = 0;
        try {
            const refData = await fetchBinanceData('BUY', null, 1);
            if (refData.length > 0) {
                const precioUnitarioRef = parseFloat(refData[0].adv.price);
                const montoObjetivoVES = precioUnitarioRef * 50;
                const [ofertasVenta, ofertasCompra] = await Promise.all([
                    fetchBinanceData('BUY', montoObjetivoVES, 5),
                    fetchBinanceData('SELL', montoObjetivoVES, 5)
                ]);

                if (ofertasVenta.length > 0 && ofertasCompra.length > 0) {
                    const calcPromedio = (lista) => lista.reduce((acc, item) => acc + parseFloat(item.adv.price), 0) / lista.length;
                    precioUsdtPromedio = (calcPromedio(ofertasVenta) + calcPromedio(ofertasCompra)) / 2;
                }
            }
        } catch (errorBinance) {
            console.error("Error obteniendo USDT:", errorBinance.message);
        }

        const datosAGuardar = {
            monto: precioDolarBCV,
            montoEur: precioEuroBCV || 0,
            montoUsdt: parseFloat(precioUsdtPromedio.toFixed(2)) || 0,
            hora: horaActual
        };

        let resultRecord;
        if (existingPrice) {
            await existingPrice.update(datosAGuardar);
            resultRecord = existingPrice;
        } else {
            resultRecord = await BcvPrecioHistorico.create({ fecha: fechaActual, ...datosAGuardar });
        }

        return { type: 'FINANZAS', status: 'OK', msg: `Actualizado -> BCV: ${resultRecord.monto}, EUR: ${resultRecord.montoEur}, USDT: ${resultRecord.montoUsdt}` };
    } catch (e) {
        return { type: 'FINANZAS', status: 'ERROR', msg: e.message };
    }
}

// ==========================================
// 2. RRHH (Cumpleaños, Aniversarios, Docs)
// ==========================================
export async function checkHREvents() {
    const today = getCaracasDate();
    const notifications = [];
    
    const empleados = await Empleado.findAll({
        attributes: ['id', 'nombre', 'apellido', 'fechaNacimiento', 'fechaIngreso'],
        where: { estado: 'Activo' },
        include: [{
            model: DocumentoEmpleado,
            as: 'documentos',
            where: { fechaVencimiento: { [Op.lte]: addDays(today, 15) } },
            required: false 
        }]
    });

    for (const emp of empleados) {
        const bdayThisYear = new Date(today.getFullYear(), new Date(emp.fechaNacimiento).getMonth(), new Date(emp.fechaNacimiento).getDate() + 1);
        const daysToBday = (bdayThisYear - today) / (1000 * 60 * 60 * 24);

        if (daysToBday >= 0 && daysToBday <= 4) {
            notifications.push({
                type: 'CUMPLE',
                msg: `🎂 ${emp.nombre} ${emp.apellido} cumple ${getYearsDiff(emp.fechaNacimiento, today)} años ${daysToBday == 1 ? 'MAÑANA' : daysToBday < 1 ? 'HOY' : 'en ' + (Math.ceil(daysToBday) - 1) + ' días'}.`,
                id: emp.id
            });
        }

        const anniThisYear = new Date(today.getFullYear(), new Date(emp.fechaIngreso).getMonth(), new Date(emp.fechaIngreso).getDate() + 1);
        const daysToAnni = (anniThisYear - today) / (1000 * 60 * 60 * 24);

        if (daysToAnni >= 0 && daysToAnni <= 1) {
            const years = getYearsDiff(emp.fechaIngreso, today);
            notifications.push({
                type: 'ANIVERSARIO',
                msg: `¡¡¡🎉🎂 Mañana ${emp.nombre} ${emp.apellido} cumple ${years} ${years === 1 ? 'año' : 'años'} en la empresa🎂!!!`,
                id: emp.id,
            });
        }

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
// 3. CUENTAS POR PAGAR (CxP)
// ==========================================
export async function checkCxP() {
    const today = getCaracasDate();
    const limitDate = addDays(today, 3); 

    const cuentas = await CuentaPorPagar.findAll({
        where: { estado: 'Pendiente', fechaVencimiento: { [Op.lte]: limitDate } },
        include: [
            { model: Proveedor, as: 'proveedor', attributes: ['nombre'] },
            { model: FacturaCompra, as: 'facturaCompra', attributes: ['numeroDocumento'] }
        ]
    });

    return cuentas.map(c => {
        const diffDays = Math.ceil((new Date(c.fechaVencimiento).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        let estadoTiempo = diffDays < 0 ? `❌ VENCIDA hace ${Math.abs(diffDays)} días` : (diffDays === 0 ? `🚨 VENCE HOY` : `⏳ Vence en ${diffDays} días`);

        return {
            id: c.id, proveedor: c.proveedor?.nombre || 'Desconocido',
            documento: c.facturaCompra?.numeroDocumento || 'S/N', monto: c.saldoPendiente,
            moneda: c.moneda, estadoTiempo
        };
    });
}

// ==========================================
// 4. CUENTAS POR COBRAR (CxC)
// ==========================================
export async function checkCxC() {
    const today = getCaracasDate();
    const limitDate = addDays(today, 3); 

    const cuentas = await CuentaPorCobrar.findAll({
        where: { estado: 'Pendiente', fechaVencimiento: { [Op.lte]: limitDate } },
        include: [
            { model: Cliente, as: 'cliente', attributes: ['nombre'] },
            { model: Venta, as: 'venta', attributes: ['numeroDocumento'] }
        ]
    });

    return cuentas.map(c => {
        const diffDays = Math.ceil((new Date(c.fechaVencimiento).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        let estadoTiempo = diffDays < 0 ? `❌ VENCIDA hace ${Math.abs(diffDays)} días` : (diffDays === 0 ? `🚨 VENCE HOY` : `⏳ Vence en ${diffDays} días`);

        return {
            id: c.id, cliente: c.cliente?.nombre || 'Desconocido',
            documento: c.venta?.numeroDocumento || 'S/N', monto: c.saldoPendiente,
            moneda: c.moneda, estadoTiempo
        };
    });
}

// ==========================================
// 5. LIMPIEZA DE INVENTARIO FANTASMA (Web)
// ==========================================
export async function liberarOrdenesExpiradas() {
    const transaction = await sequelize.transaction();
    try {
        const limiteTiempo = new Date();
        limiteTiempo.setHours(limiteTiempo.getHours() - 24);

        const ventasExpiradas = await Venta.findAll({
            where: {
                statusPago: 'Pendiente',
                statusDespacho: 'Pendiente',
                createdAt: { [Op.lt]: limiteTiempo }
            },
            include: [{ model: VentaDetalle, as: 'detalles' }],
            transaction
        });

        let canceladas = 0;

        for (const venta of ventasExpiradas) {
            for (const detalle of venta.detalles) {
                if (!detalle.isFicticio && detalle.productoId && detalle.afectaInventario) {
                    const producto = await Producto.findByPk(detalle.productoId, { transaction });
                    if (producto) {
                        producto.stockAlmacen += detalle.cantidad;
                        await producto.save({ transaction });
                    }
                }
            }
            venta.statusDespacho = 'Cancelado';
            venta.statusPago = 'Vencido';
            await venta.save({ transaction });
            canceladas++;
        }

        await transaction.commit();
        return { status: 'OK', canceladas };
        
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
}