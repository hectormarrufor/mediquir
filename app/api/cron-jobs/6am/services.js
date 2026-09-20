import { Op } from 'sequelize';
import axios from 'axios';
import https from 'https';
import * as cheerio from 'cheerio';
import sequelize from '@/sequelize';
// Agregamos Producto, Venta y VentaDetalle a tu importación de modelos
import db, {
    Empleado, DocumentoEmpleado, BcvPrecioHistorico, 
    CuentaPorPagar, CuentaPorCobrar, Proveedor, Cliente, 
    Venta, FacturaCompra, Producto, VentaDetalle, Tarea
} from '@/models'; 
import { getCaracasDate, addDays, getYearsDiff } from "../../../helpers/dateUtils"; 
import { cancelarPedidoTienda } from '../../_lib/pagoTienda';
import { avisarCliente } from '../../_lib/avisosCliente';
import { notificarUsuario, notificarCabezas } from '@/app/handlers/notificar';
import { fechaCaracas } from '@/app/constants/hora';
import { diasHasta } from '@/app/constants/tareas';
import { borrarTodasLasFotos, DIAS_RETENCION_FOTOS, DIAS_CANCELADAS, DIAS_SIN_FIRMAR } from '../../ventas/_fotosEmpaque';

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
        const hace = (horas) => new Date(Date.now() - horas * 60 * 60 * 1000);

        // SOLO compras de la tienda (el stock se descuenta al vender): retiro sin pago online tras 24 h, y pedidos con pago
        // "por verificar" que nadie resolvió en 72 h. Antes esto cancelaba también pedidos B2B, ventas a crédito y pedidos al mayor
        // (y les sumaba stock que nunca se había descontado).
        const ventasExpiradas = await Venta.findAll({
            where: {
                tipoVenta: 'ONLINE', statusPago: 'Pendiente', statusDespacho: 'Pendiente',
                [Op.or]: [
                    { verificacionPago: null, createdAt: { [Op.lt]: hace(24) } },
                    { verificacionPago: 'POR_VERIFICAR', createdAt: { [Op.lt]: hace(72) } },
                ],
            },
            transaction, lock: transaction.LOCK.UPDATE,
        });

        let canceladas = 0;
        let vencidosPorVerificar = 0;
        for (const venta of ventasExpiradas) {
            const eraPorVerificar = venta.verificacionPago === 'POR_VERIFICAR';
            await cancelarPedidoTienda({
                venta, estado: eraPorVerificar ? 'VENCIDO' : null, transaction,
                nota: eraPorVerificar ? 'Nadie confirmó el pago en 72 horas: pedido cancelado automáticamente' : '',
            });
            canceladas++;
            if (eraPorVerificar) vencidosPorVerificar++;
        }

        // Pedidos por verificar que llevan más de 12 h esperando (para recordárselo a administración)
        const esperando = await Venta.findAll({
            where: { tipoVenta: 'ONLINE', verificacionPago: 'POR_VERIFICAR', statusDespacho: { [Op.ne]: 'Cancelado' }, createdAt: { [Op.lt]: hace(12) } },
            attributes: ['id', 'numeroDocumento'], transaction,
        });

        await transaction.commit();
        return { status: 'OK', canceladas, vencidosPorVerificar, esperando: esperando.map((v) => v.numeroDocumento) };

    } catch (error) {
        if (!transaction.finished) await transaction.rollback();
        throw error;
    }
}

// ==========================================
// 6. LIMPIEZA DE FOTOS DE EMPAQUE (Vercel Blob)
// ==========================================
// · Vencidas: pedidos despachados hace más de DIAS_RETENCION_FOTOS (ventana de reclamos). Queda la nota "fotos vencidas".
// · Abandonadas: pedidos cancelados (tras DIAS_CANCELADAS) o empaques nunca firmados (tras DIAS_SIN_FIRMAR).
// Por corrida se procesan pocas ventas para no pasar del tiempo máximo de la función; el resto sigue al día siguiente.
export async function limpiarFotosEmpaque() {
    const LOTE = 25;
    const hace = (dias) => new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
    const conFotos = { [Op.or]: [{ fotoCajaAbiertaUrl: { [Op.ne]: null } }, { fotoCajaSelladaUrl: { [Op.ne]: null } }] };

    const vencidas = await Venta.findAll({
        where: { statusDespacho: 'Completado', fotosVencidasAt: null, fechaHoraRetiro: { [Op.lt]: hace(DIAS_RETENCION_FOTOS) }, ...conFotos },
        limit: LOTE,
    });
    const abandonadas = await Venta.findAll({
        where: {
            [Op.and]: [conFotos, {
                [Op.or]: [
                    { statusDespacho: 'Cancelado', updatedAt: { [Op.lt]: hace(DIAS_CANCELADAS) } },
                    { statusDespacho: { [Op.notIn]: ['Completado', 'Cancelado'] }, empacadoAt: null, empaqueIniciadoAt: { [Op.lt]: hace(DIAS_SIN_FIRMAR) } },
                ],
            }],
        },
        limit: LOTE,
    });

    let borradasVencidas = 0;
    let borradasAbandonadas = 0;
    let errores = 0;
    for (const [lista, esVencida] of [[vencidas, true], [abandonadas, false]]) {
        for (const venta of lista) {
            try {
                const n = await borrarTodasLasFotos(venta);
                if (esVencida) { venta.fotosVencidasAt = new Date(); borradasVencidas += n; } else { borradasAbandonadas += n; }
                await venta.save({ fields: ['fotoCajaAbiertaUrl', 'fotoCajaSelladaUrl', 'fotosVencidasAt'] });
            } catch (e) {
                // Si el Blob falla no se limpia la URL: queda para reintentar mañana
                errores++;
                console.error(`No se pudieron borrar las fotos del pedido ${venta.numeroDocumento}:`, e.message);
            }
        }
    }
    return { status: 'OK', borradasVencidas, borradasAbandonadas, errores };
}

// ==========================================
// 7. TAREAS DEL PERSONAL: recordatorio diario de lo que vence hoy o ya venció
// ==========================================
// Un solo aviso por persona y por día (Tarea.recordadaEl evita repetirlo). A administración le llega un resumen de lo vencido.
export async function recordarTareas() {
    const hoy = fechaCaracas();
    const tareas = await Tarea.findAll({
        where: {
            estado: { [Op.in]: ['Pendiente', 'En Progreso'] },
            asignadoAId: { [Op.ne]: null },
            fechaVencimiento: { [Op.lte]: hoy },
            [Op.or]: [{ recordadaEl: null }, { recordadaEl: { [Op.lt]: hoy } }],
        },
        order: [['fechaVencimiento', 'ASC']],
    });
    if (!tareas.length) return { personas: 0, tareas: 0, vencidas: 0 };

    const porPersona = new Map();
    for (const t of tareas) {
        if (!porPersona.has(t.asignadoAId)) porPersona.set(t.asignadoAId, []);
        porPersona.get(t.asignadoAId).push(t);
    }
    for (const [usuarioId, lista] of porPersona) {
        const vencidas = lista.filter((t) => String(t.fechaVencimiento).slice(0, 10) < hoy);
        const deHoy = lista.length - vencidas.length;
        const partes = [];
        if (vencidas.length) partes.push(`${vencidas.length} vencida${vencidas.length === 1 ? '' : 's'}`);
        if (deHoy) partes.push(`${deHoy} para hoy`);
        try {
            await notificarUsuario(usuarioId, {
                title: vencidas.length ? 'Tienes tareas vencidas ⏰' : 'Tareas para hoy 📋',
                body: `${partes.join(' y ')}: ${lista.slice(0, 3).map((t) => `"${t.titulo}"`).join(', ')}${lista.length > 3 ? ` y ${lista.length - 3} más` : ''}.`,
                url: '/superuser', tipo: vencidas.length ? 'Alerta' : 'Info',
            });
        } catch (e) {
            console.error('No se pudo recordar tareas al usuario', usuarioId, e.message);
        }
    }
    await Tarea.update({ recordadaEl: hoy }, { where: { id: { [Op.in]: tareas.map((t) => t.id) } } });

    const todasVencidas = tareas.filter((t) => String(t.fechaVencimiento).slice(0, 10) < hoy);
    if (todasVencidas.length) {
        try {
            await notificarCabezas({
                title: `⏰ ${todasVencidas.length} tarea${todasVencidas.length === 1 ? '' : 's'} vencida${todasVencidas.length === 1 ? '' : 's'} en el equipo`,
                body: todasVencidas.slice(0, 4).map((t) => `"${t.titulo}"`).join(', ') + (todasVencidas.length > 4 ? ` y ${todasVencidas.length - 4} más` : ''),
                url: '/superuser', tipo: 'Alerta', tag: `tareas-vencidas-${hoy}`,
            });
        } catch (e) {
            console.error('No se pudo avisar de las tareas vencidas:', e.message);
        }
    }
    return { personas: porPersona.size, tareas: tareas.length, vencidas: todasVencidas.length };
}

// ==========================================
// 8. CLIENTES DEL PORTAL: recordatorio de facturas por vencer y vencidas
// ==========================================
// Solo a clientes con usuario. Por vencer: a los 3 días y el mismo día. Vencidas: a 1, 7, 15 y 30 días (sin repetir a diario).
export async function avisarClientesCobro() {
    const hoy = fechaCaracas();
    const cuentas = await CuentaPorCobrar.findAll({
        where: { estado: { [Op.ne]: 'Pagado' }, saldoPendiente: { [Op.gt]: 0 } },
        include: [{ model: Venta, as: 'venta', attributes: ['id', 'clienteId', 'numeroDocumento', 'tipoVenta', 'statusDespacho'] }],
    });
    let avisados = 0;
    for (const c of cuentas) {
        const venta = c.venta;
        if (!venta || venta.tipoVenta !== 'MAYOR' || venta.statusDespacho === 'Cancelado' || !c.fechaVencimiento) continue;
        const dias = diasHasta(String(c.fechaVencimiento).slice(0, 10), hoy);
        const saldo = c.moneda === 'BS' ? Number(c.saldoPendiente) / (Number(c.tasaCambio) || 1) : Number(c.saldoPendiente);
        const ref = { id: venta.id, clienteId: venta.clienteId, numeroDocumento: venta.numeroDocumento };
        if (dias === 3 || dias === 0) await avisarCliente(ref, 'POR_VENCER', { dias, saldo });
        else if ([-1, -7, -15, -30].includes(dias)) await avisarCliente(ref, 'VENCIDA', { dias: -dias, saldo });
        else continue;
        avisados++;
    }
    return { avisados };
}

// ==========================================
// 9. OPERACIÓN: stock bajo y pedidos sin asignar (resumen diario para las cabezas)
// ==========================================
export async function avisarOperacion() {
    const hoy = fechaCaracas();
    const [bajos] = await sequelize.query(
        `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE p."stockAlmacen" <= 0)::int AS agotados,
                (SELECT string_agg(x."nombre", ', ') FROM (SELECT p2."nombre" FROM "Productos" p2 WHERE p2."stockMinimo" > 0 AND p2."stockAlmacen" <= p2."stockMinimo" AND p2."grupoEquivalenciaId" IS NULL ORDER BY (p2."stockAlmacen" / NULLIF(p2."stockMinimo", 0)) ASC LIMIT 3) x) AS "primeros"
         FROM "Productos" p WHERE p."stockMinimo" > 0 AND p."stockAlmacen" <= p."stockMinimo" AND p."grupoEquivalenciaId" IS NULL`,
        { type: sequelize.QueryTypes.SELECT }
    );
    const [pedidos] = await sequelize.query(
        `SELECT COUNT(*)::int AS "sinAsignar" FROM "Ventas" v
         WHERE v."statusDespacho" = 'Pendiente' AND v."tipoVenta" <> 'DETAL' AND v."empacadorId" IS NULL AND COALESCE(v."revisionStock", '') <> 'PENDIENTE' AND COALESCE(v."verificacionPago", '') <> 'POR_VERIFICAR'`,
        { type: sequelize.QueryTypes.SELECT }
    );
    if (bajos.total > 0) {
        await notificarCabezas({
            title: `📉 ${bajos.total} producto${bajos.total === 1 ? '' : 's'} bajo el stock mínimo`,
            body: `${bajos.agotados ? `${bajos.agotados} agotado${bajos.agotados === 1 ? '' : 's'}. ` : ''}Los más críticos: ${bajos.primeros}.`,
            url: '/superuser/inventario/productos', tipo: 'Alerta', tag: `stock-bajo-${hoy}`,
        });
    }
    if (pedidos.sinAsignar > 0) {
        await notificarCabezas({
            title: `📦 ${pedidos.sinAsignar} pedido${pedidos.sinAsignar === 1 ? '' : 's'} sin empacador asignado`,
            body: 'Asigna quién empaca y quién etiqueta para que salgan hoy.',
            url: '/superuser/ventas', tipo: 'Info', tag: `sin-asignar-${hoy}`,
        });
    }
    return { stockBajo: bajos.total, sinAsignar: pedidos.sinAsignar };
}
