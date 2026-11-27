// app/api/_lib/tfhka.js
// Cliente HTTP y traductor de documentos para la API de Imprenta Digital de The Factory HKA (TFHKA).
// Lee credenciales y ambiente exclusivamente desde variables de entorno del servidor.
import { numeroALetras } from '@/app/utils/numeroALetras';
import { fechaCaracas, ZONA_CARACAS } from '@/app/constants/hora';

const DEMO_DEFAULT_URL = 'https://demoemisionv2.thefactoryhka.com.ve';

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const fixed2 = (n) => round2(n).toFixed(2);
const fixed4 = (n) => (Math.round((Number(n) + Number.EPSILON) * 10000) / 10000).toFixed(4);

const FORMAS_PAGO_DESCRIPCION = {
    '01': 'Efectivo',
    '02': 'Pago Movil',
    '03': 'Tarjeta de Debito',
    '04': 'Tarjeta de Credito',
    '05': 'Deposito Bancario',
    '06': 'Cheque',
    '07': 'Carta de Credito',
    '08': 'Transferencia',
    '09': 'Otro',
};

export function configTfhka() {
    const ambiente = String(process.env.TFHKA_ENV || 'demo').trim().toLowerCase() === 'prod' ? 'prod' : 'demo';
    const esDemo = ambiente !== 'prod';
    const envUrl = String(process.env.TFHKA_BASE_URL || '').trim().replace(/\/+$/, '');
    const baseUrl = envUrl || (esDemo ? DEMO_DEFAULT_URL : '');
    const usuario = String(process.env.TFHKA_USUARIO || '').trim();
    const clave = String(process.env.TFHKA_CLAVE || '').trim();
    const serieDefault = String(process.env.TFHKA_SERIE || '').trim();
    const sucursalDefault = String(process.env.TFHKA_SUCURSAL || '0001').trim().slice(0, 6) || '0001';
    const configurado = Boolean(baseUrl && usuario && clave);
    const alertaUrl = esDemo && baseUrl && !/(demo|test|sandbox)/i.test(baseUrl)
        ? 'TFHKA_ENV está en demo pero TFHKA_BASE_URL no parece ser una URL de pruebas.'
        : null;

    return {
        ambiente,
        esDemo,
        baseUrl,
        usuario,
        clave,
        serieDefault,
        sucursalDefault,
        configurado,
        alertaUrl,
    };
}

export function configPublicaTfhka() {
    const cfg = configTfhka();
    const u = cfg.usuario;
    const usuarioEnmascarado = u
        ? (u.length <= 6 ? `${u.slice(0, 2)}***` : `${u.slice(0, 4)}***${u.slice(-4)}`)
        : '';
    return {
        ambiente: cfg.ambiente,
        esDemo: cfg.esDemo,
        baseUrl: cfg.baseUrl,
        usuarioEnmascarado,
        configurado: cfg.configurado,
        alertaUrl: cfg.alertaUrl,
        serieDefault: cfg.serieDefault,
        sucursalDefault: cfg.sucursalDefault,
    };
}

function getTokenStore() {
    if (!globalThis.__tfhkaTokenCache) {
        globalThis.__tfhkaTokenCache = new Map();
    }
    return globalThis.__tfhkaTokenCache;
}

export async function obtenerTokenTfhka({ forzar = false } = {}) {
    const cfg = configTfhka();
    if (!cfg.configurado) {
        throw new Error('Faltan variables de entorno de TFHKA (TFHKA_BASE_URL, TFHKA_USUARIO, TFHKA_CLAVE).');
    }
    const cacheKey = `${cfg.baseUrl}|${cfg.usuario}`;
    const store = getTokenStore();
    const cached = store.get(cacheKey);
    if (!forzar && cached?.token && cached.expiraMs - Date.now() > 60_000) {
        return { token: cached.token, expiracion: cached.expiracion, desdeCache: true };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
        const res = await fetch(`${cfg.baseUrl}/api/Autenticacion`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario: cfg.usuario, clave: cfg.clave }),
            signal: controller.signal,
            cache: 'no-store',
        });
        const text = await res.text();
        let data;
        try { data = text ? JSON.parse(text) : {}; } catch { data = { rawText: text }; }

        if (!res.ok || Number(data?.codigo) !== 200 || !data?.token) {
            const detalle = data?.mensaje || data?.rawText || `HTTP ${res.status}`;
            throw new Error(`Autenticación TFHKA fallida (${data?.codigo ?? res.status}): ${detalle}`);
        }

        const expiraMs = data.expiracion ? Date.parse(data.expiracion) : (Date.now() + 30 * 60_000);
        store.set(cacheKey, {
            token: data.token,
            expiracion: data.expiracion || new Date(expiraMs).toISOString(),
            expiraMs: Number.isFinite(expiraMs) ? expiraMs : (Date.now() + 30 * 60_000),
        });
        return { token: data.token, expiracion: data.expiracion || null, desdeCache: false };
    } catch (err) {
        if (err?.name === 'AbortError') {
            throw new Error('Tiempo de espera agotado al autenticar con TFHKA.');
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

export async function llamarTfhka(ruta, cuerpo, { method = 'POST', timeoutMs = 25000 } = {}) {
    const cfg = configTfhka();
    if (!cfg.configurado) {
        throw new Error('Faltan variables de entorno de TFHKA.');
    }

    const ejecutar = async (token) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const opciones = {
                method,
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                signal: controller.signal,
                cache: 'no-store',
            };
            if (method !== 'GET' && cuerpo !== undefined) {
                opciones.body = JSON.stringify(cuerpo);
            }
            const res = await fetch(`${cfg.baseUrl}${ruta}`, opciones);
            const text = await res.text();
            let data;
            try { data = text ? JSON.parse(text) : {}; } catch { data = { rawText: text }; }
            return { ok: res.ok, httpStatus: res.status, data };
        } catch (err) {
            if (err?.name === 'AbortError') {
                throw new Error(`Tiempo de espera agotado llamando a ${ruta} en TFHKA.`);
            }
            throw err;
        } finally {
            clearTimeout(timer);
        }
    };

    const { token } = await obtenerTokenTfhka();
    let respuesta = await ejecutar(token);
    if (respuesta.httpStatus === 401) {
        const cacheKey = `${cfg.baseUrl}|${cfg.usuario}`;
        getTokenStore().delete(cacheKey);
        const renovado = await obtenerTokenTfhka({ forzar: true });
        respuesta = await ejecutar(renovado.token);
    }
    return respuesta;
}

export async function probarConexionTfhka() {
    const cfg = configTfhka();
    if (!cfg.configurado) {
        return {
            ok: false,
            ambiente: cfg.ambiente,
            baseUrl: cfg.baseUrl,
            error: 'Faltan variables de entorno (TFHKA_BASE_URL, TFHKA_USUARIO, TFHKA_CLAVE).',
        };
    }

    try {
        const auth = await obtenerTokenTfhka({ forzar: true });
        const [numRes, ult01, ult02, ult03] = await Promise.allSettled([
            llamarTfhka('/api/ConsultaNumeraciones', { serie: '', tipoDocumento: '' }),
            llamarTfhka('/api/UltimoDocumento', { serie: cfg.serieDefault || '', tipoDocumento: '01' }),
            llamarTfhka('/api/UltimoDocumento', { serie: cfg.serieDefault || '', tipoDocumento: '02' }),
            llamarTfhka('/api/UltimoDocumento', { serie: cfg.serieDefault || '', tipoDocumento: '03' }),
        ]);

        const numeracionesData = numRes.status === 'fulfilled' ? numRes.value.data : { mensaje: numRes.reason?.message };
        const leerUltimo = (r) => (r.status === 'fulfilled' ? r.value.data : { mensaje: r.reason?.message });

        return {
            ok: true,
            ambiente: cfg.ambiente,
            baseUrl: cfg.baseUrl,
            tokenExpiracion: auth.expiracion,
            numeraciones: numeracionesData?.numeraciones || [],
            numeracionesMensaje: numeracionesData?.mensaje || null,
            numeracionesCodigo: numeracionesData?.codigo || null,
            ultimosDocumentos: {
                '01': leerUltimo(ult01),
                '02': leerUltimo(ult02),
                '03': leerUltimo(ult03),
            },
        };
    } catch (err) {
        return {
            ok: false,
            ambiente: cfg.ambiente,
            baseUrl: cfg.baseUrl,
            error: err.message,
        };
    }
}

export const emitirDocumentoTfhka = (payload) => llamarTfhka('/api/Emision', payload);

export const ultimoDocumentoTfhka = ({ serie = '', tipoDocumento }) =>
    llamarTfhka('/api/UltimoDocumento', {
        serie: serie ?? '',
        tipoDocumento: String(tipoDocumento || '01'),
    });

export const descargarArchivoTfhka = ({ serie = '', tipoDocumento, numeroDocumento, tipoArchivo = 'pdf' }) =>
    llamarTfhka('/api/DescargaArchivo', {
        serie: serie ?? '',
        tipoDocumento,
        numeroDocumento: String(numeroDocumento),
        tipoArchivo,
    });

export const enviarCorreoTfhka = ({ serie = '', tipoDocumento, numeroDocumento, correos }) =>
    llamarTfhka('/api/Correo/Enviar', {
        serie: serie ?? '',
        tipoDocumento,
        numeroDocumento: String(numeroDocumento),
        correos,
    });

export const anularDocumentoTfhka = ({ serie = '', tipoDocumento, numeroDocumento, motivoAnulacion, fechaAnulacion, horaAnulacion }) => {
    const body = {
        serie: serie ?? '',
        tipoDocumento,
        numeroDocumento: String(numeroDocumento),
        motivoAnulacion: String(motivoAnulacion || '').trim().slice(0, 255),
    };
    if (fechaAnulacion) body.fechaAnulacion = fechaAnulacion;
    if (horaAnulacion) body.horaAnulacion = horaAnulacion;
    return llamarTfhka('/api/Anular', body);
};

export const estadoDocumentoTfhka = ({ serie = '', tipoDocumento, numeroDocumento, transaccionId }) =>
    llamarTfhka('/api/EstadoDocumento', {
        serie: serie ?? '',
        tipoDocumento,
        numeroDocumento: numeroDocumento ? String(numeroDocumento) : null,
        transaccionId: transaccionId || null,
    });

// --- HELPERS DE FORMATO Y CONSTRUCCIÓN DE DOCUMENTOS ---

export function parsearIdentificacionFiscal(raw) {
    const limpio = String(raw || '').trim().toUpperCase().replace(/[\s.-]/g, '');
    if (!limpio) {
        return { tipoIdentificacion: 'V', numeroIdentificacion: '' };
    }
    const primero = limpio.charAt(0);
    const tiposValidos = ['V', 'E', 'J', 'G', 'P', 'C'];
    if (tiposValidos.includes(primero)) {
        const resto = limpio.slice(1);
        const numero = primero === 'P' ? resto.replace(/[^A-Z0-9]/g, '') : resto.replace(/\D/g, '');
        return { tipoIdentificacion: primero, numeroIdentificacion: numero.slice(0, 20) };
    }
    return { tipoIdentificacion: 'V', numeroIdentificacion: limpio.replace(/\D/g, '').slice(0, 20) };
}

export function formatearFechaTfhka(isoDate) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || '').trim());
    if (!m) {
        const hoy = fechaCaracas();
        const [, a, me, d] = /^(\d{4})-(\d{2})-(\d{2})$/.exec(hoy);
        return `${d}/${me}/${a}`;
    }
    return `${m[3]}/${m[2]}/${m[1]}`;
}

const FORMATO_HORA_CARACAS = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_CARACAS,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
});

// Garantiza el patrón oficial de TFHKA: ^((0[1-9]|1[012]):[0-5][0-9]:[0-5][0-9]\s([ap][m]))$
export function horaTfhkaCaracas(date = new Date()) {
    const parts = Object.fromEntries(FORMATO_HORA_CARACAS.formatToParts(new Date(date)).map((p) => [p.type, p.value]));
    const h23 = Number(parts.hour) || 0;
    const ampm = h23 >= 12 ? 'pm' : 'am';
    const h12 = h23 % 12 === 0 ? 12 : h23 % 12;
    return `${String(h12).padStart(2, '0')}:${parts.minute}:${parts.second} ${ampm}`;
}

export function montoEnLetrasTfhka(monto, monedaLabel = 'bolivares') {
    const base = numeroALetras(Math.max(0, round2(monto)))
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
    const texto = base.replace(/\bcon (\d{2}\/100)$/, `${monedaLabel} con $1`);
    return texto.slice(0, 255);
}

const codigoImpuestoPorAlicuota = (alicuota) => {
    const n = Number(alicuota) || 0;
    if (n === 0) return 'E';
    if (n === 8) return 'R';
    if (n === 31) return 'A';
    return 'G';
};

export function construirDocumentoTfhka(input) {
    const cfg = configTfhka();
    const tipoDocumento = String(input?.tipoDocumento || '01').trim();
    if (!['01', '02', '03', '04'].includes(tipoDocumento)) {
        throw new Error('Tipo de documento inválido (use 01 Factura, 02 Nota de Crédito, 03 Nota de Débito o 04 Guía).');
    }

    const fechaEmisionIso = /^\d{4}-\d{2}-\d{2}$/.test(String(input?.fechaEmision || ''))
        ? String(input.fechaEmision)
        : fechaCaracas();
    const fechaEmision = formatearFechaTfhka(fechaEmisionIso);
    const fechaVencimiento = input?.fechaVencimiento
        ? formatearFechaTfhka(input.fechaVencimiento)
        : fechaEmision;
    const horaEmision = horaTfhkaCaracas();

    const modoNumeracion = input?.modoNumeracion === 'TFHKA_AUTO' ? 'TFHKA_AUTO' : 'MANUAL';
    let numeroDocumento = null;
    let transaccionId = null;

    if (modoNumeracion === 'MANUAL') {
        const limpio = String(input?.numeroDocumento || '').replace(/\D/g, '');
        if (!limpio || Number(limpio) <= 0 || limpio.length > 19) {
            throw new Error('No se pudo determinar un NumeroDocumento numérico válido (1 a 19 dígitos, mayor que 0).');
        }
        numeroDocumento = limpio;
    } else {
        const rawTx = String(input?.transaccionId || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 50);
        transaccionId = rawTx || `DEMO${Date.now()}${Math.floor(Math.random() * 900 + 100)}`.slice(0, 50);
    }

    const serie = String(input?.serie ?? cfg.serieDefault ?? '').trim().slice(0, 20);
    const sucursal = String(input?.sucursal ?? cfg.sucursalDefault ?? '0001').trim().slice(0, 6) || '0001';

    // Datos de factura afectada obligatorios en Notas de Crédito (02) y Débito (03)
    const esNota = tipoDocumento === '02' || tipoDocumento === '03';
    let serieFacturaAfectada = null;
    let numeroFacturaAfectada = null;
    let fechaFacturaAfectada = null;
    let montoFacturaAfectada = null;
    let comentarioFacturaAfectada = null;

    if (esNota) {
        serieFacturaAfectada = String(input?.serieFacturaAfectada ?? '').trim().slice(0, 20);
        const numAfec = String(input?.numeroFacturaAfectada || '').replace(/\D/g, '');
        if (!numAfec || numAfec.length > 19) {
            throw new Error('Las Notas de Crédito/Débito requieren el número de la factura afectada (solo dígitos).');
        }
        numeroFacturaAfectada = numAfec;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input?.fechaFacturaAfectada || ''))) {
            throw new Error('Las Notas de Crédito/Débito requieren la fecha de la factura afectada.');
        }
        fechaFacturaAfectada = formatearFechaTfhka(input.fechaFacturaAfectada);
        const montoAfec = Number(input?.montoFacturaAfectada);
        if (!(montoAfec > 0)) {
            throw new Error('Las Notas de Crédito/Débito requieren el monto de la factura afectada mayor a 0.');
        }
        montoFacturaAfectada = fixed2(montoAfec);
        comentarioFacturaAfectada = String(input?.comentarioFacturaAfectada || 'AJUSTE DOCUMENTO').trim().slice(0, 255) || 'AJUSTE DOCUMENTO';
    }

    // Comprador
    const comp = input?.comprador || {};
    const parsedId = comp.tipoIdentificacion && comp.numeroIdentificacion
        ? {
            tipoIdentificacion: String(comp.tipoIdentificacion).trim().toUpperCase(),
            numeroIdentificacion: String(comp.numeroIdentificacion).trim().toUpperCase().replace(/[^A-Z0-9]/g, ''),
        }
        : parsearIdentificacionFiscal(comp.identificacion || comp.rif);

    if (!parsedId.numeroIdentificacion) {
        throw new Error('El RIF o cédula del comprador es obligatorio.');
    }
    const razonSocial = String(comp.razonSocial || comp.nombre || '').trim().slice(0, 255);
    if (!razonSocial) {
        throw new Error('La razón social o nombre del comprador es obligatorio.');
    }
    const direccion = String(comp.direccion || '').trim().slice(0, 255);
    if (!direccion) {
        throw new Error('La dirección del comprador es obligatoria en TFHKA.');
    }
    const telefonos = (Array.isArray(comp.telefono) ? comp.telefono : [comp.telefono])
        .map((t) => String(t || '').trim())
        .filter(Boolean);
    const correos = (Array.isArray(comp.correo) ? comp.correo : [comp.correo])
        .map((c) => String(c || '').trim())
        .filter((c) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c));

    // Renglones
    const rawItems = Array.isArray(input?.items) ? input.items : [];
    if (!rawItems.length) {
        throw new Error('Debe incluir al menos un renglón en el documento.');
    }
    if (rawItems.length > 300) {
        throw new Error('TFHKA admite máximo 300 renglones por documento.');
    }

    let montoGravadoBs = 0;
    let montoExentoBs = 0;
    let totalIvaBs = 0;
    const gruposImp = new Map(); // codigo -> { codigo, alicuota, baseBs, ivaBs }

    const detallesItems = rawItems.map((it, idx) => {
        const descripcion = String(it?.descripcion || '').trim().slice(0, 1000);
        if (!descripcion) throw new Error(`El renglón #${idx + 1} necesita una descripción.`);
        const cantidad = Number(it?.cantidad);
        const precioUnitario = Number(it?.precioUnitario);
        if (!(cantidad > 0)) throw new Error(`El renglón #${idx + 1} debe tener cantidad mayor a 0.`);
        if (!(precioUnitario > 0)) throw new Error(`El renglón #${idx + 1} debe tener precio unitario mayor a 0.`);

        const alicuota = it?.aplicaIva === false ? 0 : Number(it?.alicuota ?? 16);
        const codigoImpuesto = codigoImpuestoPorAlicuota(alicuota);
        const precioItem = round2(cantidad * precioUnitario);
        const valorIVA = round2(precioItem * (alicuota / 100));
        const valorTotalItem = round2(precioItem + valorIVA);

        if (alicuota > 0) montoGravadoBs = round2(montoGravadoBs + precioItem);
        else montoExentoBs = round2(montoExentoBs + precioItem);
        totalIvaBs = round2(totalIvaBs + valorIVA);

        const prev = gruposImp.get(codigoImpuesto) || { codigo: codigoImpuesto, alicuota, baseBs: 0, ivaBs: 0 };
        prev.baseBs = round2(prev.baseBs + precioItem);
        prev.ivaBs = round2(prev.ivaBs + valorIVA);
        gruposImp.set(codigoImpuesto, prev);

        const cantidadStr = Number.isInteger(cantidad) ? String(cantidad) : cantidad.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
        return {
            numeroLinea: String(idx + 1),
            codigoCIIU: null,
            codigoPLU: it?.codigo ? String(it.codigo).trim().slice(0, 20) : null,
            indicadorBienoServicio: String(it?.indicadorBienoServicio || '1') === '2' ? '2' : '1',
            descripcion,
            cantidad: cantidadStr,
            unidadMedida: String(it?.unidadMedida || 'ZZ').trim().slice(0, 3) || 'ZZ',
            precioUnitario: fixed4(precioUnitario),
            precioUnitarioDescuento: null,
            montoBonificacion: null,
            descripcionBonificacion: null,
            descuentoMonto: '0.00',
            recargoMonto: '0.00',
            precioItem: fixed2(precioItem),
            precioAntesDescuento: fixed2(precioItem),
            codigoImpuesto,
            tasaIVA: String(alicuota),
            valorIVA: fixed2(valorIVA),
            valorTotalItem: fixed2(valorTotalItem),
            infoAdicionalItem: [],
            listaItemOTI: null,
        };
    });

    const subtotalBs = round2(montoGravadoBs + montoExentoBs);
    const totalConIvaBs = round2(subtotalBs + totalIvaBs);
    const totalAPagarBs = totalConIvaBs;

    const impuestosSubtotal = Array.from(gruposImp.values()).map((g) => ({
        codigoTotalImp: g.codigo,
        alicuotaImp: fixed2(g.alicuota),
        baseImponibleImp: fixed2(g.baseBs),
        valorTotalImp: fixed2(g.ivaBs),
    }));

    const formaCodigo = FORMAS_PAGO_DESCRIPCION[String(input?.formaPago || '02')] ? String(input.formaPago) : '02';
    const formaDescripcion = String(input?.formaPagoDescripcion || FORMAS_PAGO_DESCRIPCION[formaCodigo] || 'Pago Movil').slice(0, 100);
    const tipoDePago = String(input?.condicionPago || '').toLowerCase() === 'credito' ? 'Credito' : 'Inmediato';

    const tasa = Number(input?.tasaCambio);
    const incluirOtraMoneda = input?.incluirEquivalenteUsd !== false && tasa > 0;
    let totalesOtraMoneda = null;
    let totalUsd = null;

    if (incluirOtraMoneda) {
        let gravadoUsd = 0;
        let exentoUsd = 0;
        let ivaUsdTotal = 0;
        const impuestosUsd = Array.from(gruposImp.values()).map((g) => {
            const baseUsd = round2(g.baseBs / tasa);
            const ivaUsd = round2(g.ivaBs / tasa);
            if (g.alicuota > 0) gravadoUsd = round2(gravadoUsd + baseUsd);
            else exentoUsd = round2(exentoUsd + baseUsd);
            ivaUsdTotal = round2(ivaUsdTotal + ivaUsd);
            return {
                codigoTotalImp: g.codigo,
                alicuotaImp: fixed2(g.alicuota),
                baseImponibleImp: fixed2(baseUsd),
                valorTotalImp: fixed2(ivaUsd),
            };
        });
        const subtotalUsd = round2(gravadoUsd + exentoUsd);
        const totalConIvaUsd = round2(subtotalUsd + ivaUsdTotal);
        totalUsd = totalConIvaUsd;

        totalesOtraMoneda = {
            moneda: 'USD',
            tipoCambio: fixed4(tasa),
            montoGravadoTotal: fixed2(gravadoUsd),
            montoPercibidoTotal: '0.00',
            montoExentoTotal: fixed2(exentoUsd),
            subtotal: fixed2(subtotalUsd),
            totalAPagar: fixed2(totalConIvaUsd),
            totalIVA: fixed2(ivaUsdTotal),
            montoTotalConIVA: fixed2(totalConIvaUsd),
            montoEnLetras: montoEnLetrasTfhka(totalConIvaUsd, 'dolares'),
            subtotalAntesDescuento: fixed2(subtotalUsd),
            totalDescuento: null,
            totalRecargos: null,
            listaRecargo: null,
            listaDescBonificacion: null,
            impuestosSubtotal: impuestosUsd,
            otrosImpuestosSubtotal: null,
            montoTotalOTI: null,
            montoTotalIVAyOTI: null,
        };
    }

    const payload = {
        documentoElectronico: {
            encabezado: {
                identificacionDocumento: {
                    tipoDocumento,
                    numeroDocumento,
                    tipoProveedor: null,
                    tipoTransaccion: '01',
                    numeroPlanillaImportacion: null,
                    numeroExpedienteImportacion: null,
                    serieFacturaAfectada,
                    numeroFacturaAfectada,
                    fechaFacturaAfectada,
                    montoFacturaAfectada,
                    comentarioFacturaAfectada,
                    regimenEspTributacion: null,
                    fechaEmision,
                    fechaVencimiento,
                    horaEmision,
                    anulado: false,
                    tipoDePago,
                    serie,
                    sucursal,
                    tipoDeVenta: 'Interna',
                    moneda: 'BSD',
                    transaccionId,
                    urlPdf: null,
                },
                facturaGuia: null,
                vendedor: null,
                comprador: {
                    tipoIdentificacion: parsedId.tipoIdentificacion,
                    numeroIdentificacion: parsedId.numeroIdentificacion,
                    razonSocial,
                    direccion,
                    ubigeo: null,
                    pais: 'VE',
                    notificar: correos.length ? 'Si' : null,
                    telefono: telefonos.length ? telefonos : null,
                    correo: correos.length ? correos : null,
                    otrosEnvios: null,
                },
                sujetoRetenido: null,
                tercero: null,
                totales: {
                    nroItems: String(detallesItems.length),
                    montoGravadoTotal: fixed2(montoGravadoBs),
                    montoExentoTotal: fixed2(montoExentoBs),
                    montoPercibidoTotal: '0.00',
                    subtotalAntesDescuento: fixed2(subtotalBs),
                    totalDescuento: null,
                    totalRecargos: null,
                    subtotal: fixed2(subtotalBs),
                    totalIVA: fixed2(totalIvaBs),
                    montoTotalConIVA: fixed2(totalConIvaBs),
                    totalAPagar: fixed2(totalAPagarBs),
                    montoEnLetras: montoEnLetrasTfhka(totalAPagarBs, 'bolivares'),
                    listaRecargo: null,
                    listaDescBonificacion: null,
                    impuestosSubtotal,
                    otrosImpuestosSubtotal: null,
                    formasPago: [
                        {
                            descripcion: formaDescripcion,
                            fecha: fechaEmision,
                            forma: formaCodigo,
                            monto: fixed2(totalAPagarBs),
                            moneda: 'BSD',
                            tipoCambio: '0.0000',
                        },
                    ],
                    totalIGTF: null,
                    totalIGTF_VES: null,
                    montoTotalOTI: null,
                    montoTotalIVAyOTI: null,
                },
                totalesRetencion: null,
                totalesOtraMoneda,
                orden: null,
                otrosTercero: null,
            },
            detallesItems,
            detallesRetencion: null,
            viajes: null,
            infoAdicional: [],
            guiaDespacho: null,
            transporte: null,
            esLote: null,
            esMinimo: null,
        },
    };

    return {
        payload,
        resumen: {
            tipoDocumento,
            serie,
            numeroDocumento,
            transaccionId,
            fechaEmisionIso,
            tasaCambio: tasa > 0 ? tasa : null,
            clienteRif: `${parsedId.tipoIdentificacion}-${parsedId.numeroIdentificacion}`,
            clienteNombre: razonSocial,
            montoGravadoBs,
            montoExentoBs,
            totalIvaBs,
            totalBs: totalAPagarBs,
            totalUsd,
        },
    };
}
