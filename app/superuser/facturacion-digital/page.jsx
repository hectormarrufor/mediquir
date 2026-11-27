'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Accordion, ActionIcon, Alert, Badge, Box, Button, Card, Code, Divider, Group,
    Loader, Menu, Modal, NumberInput, Paper, Select, SimpleGrid, Stack, Switch, Table, Tabs,
    Text, Textarea, TextInput, Title, Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
    IconAlertTriangle, IconArrowLeft, IconBan, IconCheck, IconCode, IconExternalLink,
    IconFileCertificate, IconFileTypePdf, IconHelpCircle, IconHistory, IconMail, IconPlugConnected,
    IconPlus, IconReceiptRefund, IconRefresh, IconSend, IconTestPipe, IconTrash,
} from '@tabler/icons-react';
import { useAuth } from '@/hooks/useAuth';
import { useVolver } from '@/app/helpers/useVolver';

const nf = (v, dec = 2) =>
    new Intl.NumberFormat('es-VE', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(Number(v) || 0);

const TIPOS_DOC = [
    { value: '01', label: '01 · Factura' },
    { value: '02', label: '02 · Nota de Crédito' },
    { value: '03', label: '03 · Nota de Débito' },
];

const FORMAS_PAGO = [
    { value: '02', label: '02 · Pago Móvil' },
    { value: '08', label: '08 · Transferencia' },
    { value: '01', label: '01 · Efectivo' },
    { value: '03', label: '03 · Tarjeta de Débito' },
    { value: '04', label: '04 · Tarjeta de Crédito' },
    { value: '09', label: '09 · Otro' },
];

const ESTADOS_COLOR = {
    EMITIDO: 'teal',
    DUPLICADO: 'blue',
    ANULADO: 'gray',
    ERROR: 'red',
    PENDIENTE: 'yellow',
};

const ETIQUETA_DOC = {
    '01': 'Factura',
    '02': 'Nota de Crédito',
    '03': 'Nota de Débito',
    '04': 'Guía / NE',
};

const CORREO_PRUEBAS = 'mediquirca@gmail.com';

const ITEMS_LARGA_25 = [
    { codigo: 'MED-001', descripcion: 'GUANTES DE EXAMEN NITRILO TALLA M CAJA X 100', cantidad: 4, precioUnitario: 320, aplicaIva: true },
    { codigo: 'MED-002', descripcion: 'SOLUCION FISIOLOGICA 0.9% 500ML', cantidad: 12, precioUnitario: 95, aplicaIva: false },
    { codigo: 'MED-003', descripcion: 'JERINGA DESCARTABLE 5CC CON AGUJA 21G X 100', cantidad: 2, precioUnitario: 480, aplicaIva: false },
    { codigo: 'MED-004', descripcion: 'BATA QUIRURGICA ESTERIL DESECHABLE', cantidad: 6, precioUnitario: 210, aplicaIva: true },
    { codigo: 'MED-005', descripcion: 'GASA ESTERIL 4X4 SOBRE X 10 UNIDADES', cantidad: 10, precioUnitario: 75, aplicaIva: false },
    { codigo: 'MED-006', descripcion: 'TAPABOCA QUIRURGICO TRICAPA CAJA X 50', cantidad: 5, precioUnitario: 180, aplicaIva: true },
    { codigo: 'MED-007', descripcion: 'CATETER INTRAVENOSO 20G ROSADO', cantidad: 20, precioUnitario: 38, aplicaIva: false },
    { codigo: 'MED-008', descripcion: 'GORRO QUIRURGICO DESECHABLE CAJA X 100', cantidad: 2, precioUnitario: 240, aplicaIva: true },
    { codigo: 'MED-009', descripcion: 'EQUIPO DE MACROGOTEO EN Y ESTERIL', cantidad: 15, precioUnitario: 62, aplicaIva: false },
    { codigo: 'MED-010', descripcion: 'CUBREBOTAS DESECHABLES PAR X 50', cantidad: 3, precioUnitario: 260, aplicaIva: true },
    { codigo: 'MED-011', descripcion: 'SUTURA NYLON MONOFILAMENTO 3-0 CAJA X 12', cantidad: 1, precioUnitario: 1150, aplicaIva: false },
    { codigo: 'MED-012', descripcion: 'ALCOHOL ISOPROPILICO 70% GALON', cantidad: 2, precioUnitario: 490, aplicaIva: true },
    { codigo: 'MED-013', descripcion: 'VENDA ELASTICA 10CM X 4.5M', cantidad: 8, precioUnitario: 85, aplicaIva: false },
    { codigo: 'MED-014', descripcion: 'ADHESIVO MICROPOROSO 2.5CM CAJA X 12', cantidad: 2, precioUnitario: 410, aplicaIva: true },
    { codigo: 'MED-015', descripcion: 'SONDA FOLEY 2 VIAS 16FR SILICONADA', cantidad: 6, precioUnitario: 145, aplicaIva: false },
    { codigo: 'MED-016', descripcion: 'GEL CONDUCTOR PARA ULTRASONIDO 5L', cantidad: 1, precioUnitario: 780, aplicaIva: true },
    { codigo: 'MED-017', descripcion: 'AGUA OXIGENADA 10 VOLUMENES LITRO', cantidad: 4, precioUnitario: 120, aplicaIva: false },
    { codigo: 'MED-018', descripcion: 'CAMPO QUIRURGICO ESTERIL 75X90CM', cantidad: 5, precioUnitario: 190, aplicaIva: true },
    { codigo: 'MED-019', descripcion: 'HOJA DE BISTURI NRO 15 CAJA X 100', cantidad: 1, precioUnitario: 640, aplicaIva: false },
    { codigo: 'MED-020', descripcion: 'SABANA DESECHABLE PARA CAMILLA PAQUETE X 10', cantidad: 3, precioUnitario: 350, aplicaIva: true },
    { codigo: 'MED-021', descripcion: 'TUBO ENDOTRAQUEAL CON BALON 7.5MM', cantidad: 4, precioUnitario: 165, aplicaIva: false },
    { codigo: 'MED-022', descripcion: 'BOLSA RECOLECTORA DE ORINA 2000ML', cantidad: 10, precioUnitario: 92, aplicaIva: false },
    { codigo: 'MED-023', descripcion: 'TERMOMETRO DIGITAL FLEXIBLE', cantidad: 3, precioUnitario: 295, aplicaIva: true },
    { codigo: 'MED-024', descripcion: 'POVIDONA YODADA SOLUCION 10% LITRO', cantidad: 2, precioUnitario: 520, aplicaIva: false },
    { codigo: 'MED-025', descripcion: 'LANCETA ESTERIL PARA GLUCOMETRO CAJA X 100', cantidad: 2, precioUnitario: 270, aplicaIva: false },
];

const ESCENARIOS_PRUEBA = {
    EXENTA: {
        titulo: 'Factura 100% Exenta',
        comprador: {
            tipoIdentificacion: 'J',
            numeroIdentificacion: '312172194',
            razonSocial: 'CLINICA PRUEBA EXENTA C.A.',
            direccion: 'AV. BOLIVAR, CIUDAD OJEDA, ESTADO ZULIA',
            telefono: '04141680773',
            correo: CORREO_PRUEBAS,
        },
        items: [
            { codigo: 'EX-001', descripcion: 'SOLUCION FISIOLOGICA 0.9% 500ML (EXENTO)', cantidad: 10, precioUnitario: 120, aplicaIva: false },
            { codigo: 'EX-002', descripcion: 'JERINGA DESCARTABLE 5CC CAJA X 100 (EXENTO)', cantidad: 2, precioUnitario: 540, aplicaIva: false },
            { codigo: 'EX-003', descripcion: 'GASA ESTERIL 4X4 PAQUETE X 100 (EXENTO)', cantidad: 4, precioUnitario: 210, aplicaIva: false },
        ],
    },
    PURO_IVA: {
        titulo: 'Factura Puro IVA (16%)',
        comprador: {
            tipoIdentificacion: 'J',
            numeroIdentificacion: '312172194',
            razonSocial: 'DISTRIBUIDORA MEDICA IVA C.A.',
            direccion: 'CALLE VENEZUELA, CASCO CENTRAL, CIUDAD OJEDA',
            telefono: '04141680773',
            correo: CORREO_PRUEBAS,
        },
        items: [
            { codigo: 'IV-001', descripcion: 'BATA QUIRURGICA DESECHABLE (GRAVADO 16%)', cantidad: 5, precioUnitario: 280, aplicaIva: true },
            { codigo: 'IV-002', descripcion: 'GORRO QUIRURGICO CAJA X 100 (GRAVADO 16%)', cantidad: 3, precioUnitario: 310, aplicaIva: true },
            { codigo: 'IV-003', descripcion: 'CUBREBOTAS DESECHABLES PAR X 50 (GRAVADO 16%)', cantidad: 2, precioUnitario: 260, aplicaIva: true },
        ],
    },
    LARGA: {
        titulo: 'Factura Larga (25 renglones)',
        comprador: {
            tipoIdentificacion: 'J',
            numeroIdentificacion: '312172194',
            razonSocial: 'CENTRO MEDICO INTEGRAL ZULIA C.A.',
            direccion: 'AV. ALONSO DE OJEDA, EDIF. MEDICO, CIUDAD OJEDA',
            telefono: '04141680773',
            correo: CORREO_PRUEBAS,
        },
        items: ITEMS_LARGA_25,
    },
    MIXTA: {
        titulo: 'Ejemplo rápido (Mixta)',
        comprador: {
            tipoIdentificacion: 'J',
            numeroIdentificacion: '312172194',
            razonSocial: 'CLINICA DE PRUEBA SAN JOSE C.A.',
            direccion: 'AV. BOLIVAR, CIUDAD OJEDA, ESTADO ZULIA',
            telefono: '04141680773',
            correo: CORREO_PRUEBAS,
        },
        items: [
            { codigo: 'MED-101', descripcion: 'SUTURA NYLON 3-0 CAJA X 12 (GRAVADO)', cantidad: 2, precioUnitario: 1000, aplicaIva: true },
            { codigo: 'MED-202', descripcion: 'SOLUCION FISIOLOGICA 500ML (EXENTO)', cantidad: 3, precioUnitario: 250, aplicaIva: false },
        ],
    },
};

async function pedirJson(url, opciones) {
    const res = await fetch(url, opciones);
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
}

function parsearRifLocal(ident) {
    const limpio = String(ident || '').trim().toUpperCase().replace(/[\s.-]/g, '');
    const p = limpio.charAt(0);
    if (['V', 'E', 'J', 'G', 'P', 'C'].includes(p)) {
        return { tipo: p, numero: p === 'P' ? limpio.slice(1) : limpio.slice(1).replace(/\D/g, '') };
    }
    return { tipo: 'V', numero: limpio.replace(/\D/g, '') };
}

export default function FacturacionDigitalPage() {
    const volver = useVolver('/superuser');
    const { isAdmin, loading: authLoading } = useAuth();

    const [tab, setTab] = useState('conexion');
    const [estadoCarga, setEstadoCarga] = useState(true);
    const [config, setConfig] = useState(null);
    const [fechaHoy, setFechaHoy] = useState('');
    const [tasaHoy, setTasaHoy] = useState(null);
    const [probando, setProbando] = useState(false);
    const [conexion, setConexion] = useState(null);

    // Historial
    const [emisiones, setEmisiones] = useState([]);
    const [cargandoHistorial, setCargandoHistorial] = useState(false);

    // Plantilla desde ventas reales
    const [busquedaVenta, setBusquedaVenta] = useState('');
    const [ventasMuestra, setVentasMuestra] = useState([]);
    const [cargandoVentas, setCargandoVentas] = useState(false);

    // Formulario de emisión de prueba
    const [ventaIdOrigen, setVentaIdOrigen] = useState(null);
    const [tipoDocumento, setTipoDocumento] = useState('01');
    const [serie, setSerie] = useState('');
    const [numeroDocumento, setNumeroDocumento] = useState('');
    const [fechaEmision, setFechaEmision] = useState('');
    const [tasaCambio, setTasaCambio] = useState(0);
    const [cargandoTasa, setCargandoTasa] = useState(false);
    const [incluirEquivalenteUsd, setIncluirEquivalenteUsd] = useState(true);
    const [condicionPago, setCondicionPago] = useState('Contado');
    const [formaPago, setFormaPago] = useState('02');

    // Factura afectada (solo NC/ND)
    const [serieFacturaAfectada, setSerieFacturaAfectada] = useState('');
    const [numeroFacturaAfectada, setNumeroFacturaAfectada] = useState('');
    const [fechaFacturaAfectada, setFechaFacturaAfectada] = useState('');
    const [montoFacturaAfectada, setMontoFacturaAfectada] = useState('');
    const [comentarioFacturaAfectada, setComentarioFacturaAfectada] = useState('DEVOLUCIÓN / AJUSTE DE PRUEBA');

    // Comprador
    const [tipoIdentificacion, setTipoIdentificacion] = useState('J');
    const [numeroIdentificacion, setNumeroIdentificacion] = useState('312172194');
    const [razonSocial, setRazonSocial] = useState('CLIENTE DE PRUEBA MEDIQUIR C.A.');
    const [direccion, setDireccion] = useState('CIUDAD OJEDA, ESTADO ZULIA');
    const [telefono, setTelefono] = useState('04141680773');
    const [correo, setCorreo] = useState(CORREO_PRUEBAS);

    // Renglones
    const [items, setItems] = useState([
        { codigo: 'MED-001', descripcion: 'GUANTES DE EXAMEN NITRILO (PRUEBA)', cantidad: 2, precioUnitario: 500, aplicaIva: true },
    ]);

    const [emitiendo, setEmitiendo] = useState(false);
    const [ultimoResultado, setUltimoResultado] = useState(null);
    const [corriendoBateria, setCorriendoBateria] = useState(false);
    const [resultadoBateria, setResultadoBateria] = useState([]);

    // Modales del historial
    const [modalJson, setModalJson] = useState(null);
    const [modalCorreo, setModalCorreo] = useState(null);
    const [correosDestino, setCorreosDestino] = useState('');
    const [enviandoCorreo, setEnviandoCorreo] = useState(false);
    const [modalAnular, setModalAnular] = useState(null);
    const [motivoAnulacion, setMotivoAnulacion] = useState('Prueba de anulación en ambiente DEMO');
    const [anulando, setAnulando] = useState(false);
    const [errorAnulacion, setErrorAnulacion] = useState(null);

    const cargarHistorial = useCallback(async () => {
        setCargandoHistorial(true);
        try {
            const { ok, data } = await pedirJson('/api/facturacion-digital/emisiones');
            if (ok && Array.isArray(data)) setEmisiones(data);
        } finally {
            setCargandoHistorial(false);
        }
    }, []);

    const cargarEstadoInicial = useCallback(async () => {
        setEstadoCarga(true);
        try {
            const { ok, data } = await pedirJson('/api/facturacion-digital/estado');
            if (ok) {
                setConfig(data.config);
                setFechaHoy(data.fechaHoy || '');
                setTasaHoy(data.tasaBcvHoy ?? null);
                setFechaEmision((prev) => prev || data.fechaHoy || '');
                setFechaFacturaAfectada((prev) => prev || data.fechaHoy || '');
                if (data.tasaBcvHoy) setTasaCambio((prev) => prev || Number(data.tasaBcvHoy));
                if (data.config?.serieDefault) setSerie((prev) => prev || data.config.serieDefault);
            }
        } finally {
            setEstadoCarga(false);
        }
    }, []);

    const buscarVentasMuestra = useCallback(async (q = '') => {
        setCargandoVentas(true);
        try {
            const { ok, data } = await pedirJson(`/api/facturacion-digital/ventas-muestra?q=${encodeURIComponent(q)}`);
            if (ok && Array.isArray(data)) setVentasMuestra(data);
        } finally {
            setCargandoVentas(false);
        }
    }, []);

    useEffect(() => {
        if (!authLoading && isAdmin) {
            cargarEstadoInicial();
            cargarHistorial();
            buscarVentasMuestra('');
        }
    }, [authLoading, isAdmin, cargarEstadoInicial, cargarHistorial, buscarVentasMuestra]);

    const probarConexion = async () => {
        setProbando(true);
        try {
            const { ok, data } = await pedirJson('/api/facturacion-digital/estado?probar=1');
            if (ok) {
                setConfig(data.config);
                setConexion(data.conexion || null);
                if (data.conexion?.ok) {
                    notifications.show({ title: 'Conexión exitosa', message: 'Token JWT obtenido y catálogos consultados en TFHKA.', color: 'teal' });
                } else {
                    notifications.show({ title: 'No se pudo conectar', message: data.conexion?.error || 'Revisa credenciales en Vercel.', color: 'red' });
                }
            } else {
                notifications.show({ title: 'Error', message: data?.error || 'Error probando conexión', color: 'red' });
            }
        } finally {
            setProbando(false);
        }
    };

    const alCambiarFecha = async (nuevaFecha) => {
        setFechaEmision(nuevaFecha);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(nuevaFecha)) return;
        setCargandoTasa(true);
        try {
            const { ok, data } = await pedirJson(`/api/facturacion-digital/tasa?fecha=${nuevaFecha}`);
            if (ok && data?.tasa) {
                setTasaCambio(Number(data.tasa));
                notifications.show({
                    title: 'Tasa BCV cargada',
                    message: `Para ${nuevaFecha} la tasa BCV en Mediquir es ${nf(data.tasa, 2)} Bs/USD`,
                    color: 'blue',
                });
            }
        } finally {
            setCargandoTasa(false);
        }
    };

    const cargarDesdeVenta = (ventaId) => {
        const v = ventasMuestra.find((x) => x.id === ventaId);
        if (!v) return;
        setVentaIdOrigen(v.id);
        const fIso = String(v.fechaEmision || '').slice(0, 10) || fechaHoy;
        if (fIso) setFechaEmision(fIso);
        if (Number(v.tasaCambio) > 1) setTasaCambio(Number(v.tasaCambio));
        else if (tasaHoy) setTasaCambio(Number(tasaHoy));

        setCondicionPago(v.condicionPago === 'Credito' ? 'Credito' : 'Contado');
        const idParsed = parsearRifLocal(v.cliente?.identificacion);
        setTipoIdentificacion(idParsed.tipo);
        setNumeroIdentificacion(idParsed.numero);
        setRazonSocial(v.cliente?.nombre || '');
        setDireccion(v.cliente?.direccion || 'CIUDAD OJEDA, ESTADO ZULIA');
        setTelefono(v.cliente?.telefono || '');
        setCorreo(v.cliente?.email || '');

        if (Array.isArray(v.detalles) && v.detalles.length) {
            setItems(v.detalles.map((d) => ({
                codigo: d.codigo || '',
                descripcion: d.descripcion || 'Artículo',
                cantidad: Number(d.cantidad) || 1,
                precioUnitario: Number(d.precioUnitarioBs) || 1,
                aplicaIva: Boolean(d.aplicaIva),
            })));
        }
        notifications.show({
            title: 'Plantilla cargada',
            message: `Datos copiados de ${v.numeroDocumento}. La venta original NO se modificará.`,
            color: 'blue',
        });
    };

    const cargarEscenario = (clave) => {
        const esc = ESCENARIOS_PRUEBA[clave] || ESCENARIOS_PRUEBA.MIXTA;
        setVentaIdOrigen(null);
        setTipoDocumento('01');
        setNumeroDocumento('');
        setTipoIdentificacion(esc.comprador.tipoIdentificacion);
        setNumeroIdentificacion(esc.comprador.numeroIdentificacion);
        setRazonSocial(esc.comprador.razonSocial);
        setDireccion(esc.comprador.direccion);
        setTelefono(esc.comprador.telefono);
        setCorreo(esc.comprador.correo);
        setItems(esc.items.map((it) => ({ ...it })));
        if (fechaHoy) setFechaEmision(fechaHoy);
        if (tasaHoy) setTasaCambio(Number(tasaHoy));
        setUltimoResultado(null);
        notifications.show({
            title: `Escenario cargado: ${esc.titulo}`,
            message: `${esc.items.length} renglones · correo destino ${esc.comprador.correo}`,
            color: 'blue',
        });
    };

    const ejecutarBateriaPruebas = async () => {
        setCorriendoBateria(true);
        setResultadoBateria([]);
        const claves = ['EXENTA', 'PURO_IVA', 'LARGA'];
        const resultados = [];
        const fechaDoc = fechaEmision || fechaHoy;
        const tasaDoc = Number(tasaCambio) || Number(tasaHoy) || 0;

        try {
            for (const clave of claves) {
                const esc = ESCENARIOS_PRUEBA[clave];
                const { ok, data } = await pedirJson('/api/facturacion-digital/emitir', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        tipoDocumento: '01',
                        serie,
                        fechaEmision: fechaDoc,
                        tasaCambio: tasaDoc,
                        incluirEquivalenteUsd,
                        condicionPago: 'Contado',
                        formaPago: '02',
                        comprador: esc.comprador,
                        items: esc.items.map((it) => ({
                            codigo: it.codigo,
                            descripcion: it.descripcion,
                            cantidad: it.cantidad,
                            precioUnitario: it.precioUnitario,
                            aplicaIva: it.aplicaIva,
                            alicuota: it.aplicaIva ? 16 : 0,
                        })),
                    }),
                });
                resultados.push({
                    clave,
                    titulo: esc.titulo,
                    renglones: esc.items.length,
                    ok: Boolean(ok),
                    emisionId: data?.emision?.id || null,
                    estado: data?.emision?.estado || 'ERROR',
                    numeroDocumento: data?.emision?.numeroDocumento || null,
                    numeroControl: data?.emision?.numeroControl || null,
                    totalBs: data?.emision?.totalBs || null,
                    mensaje: data?.emision?.mensajeRespuesta || data?.error || '',
                    validaciones: data?.emision?.validaciones || [],
                });
                setResultadoBateria([...resultados]);
            }
            cargarHistorial();
            const exitos = resultados.filter((r) => r.ok).length;
            notifications.show({
                title: `Batería completada (${exitos}/${resultados.length} exitosas)`,
                message: `Documentos enviados a TFHKA (DEMO) con notificación a ${CORREO_PRUEBAS}.`,
                color: exitos === resultados.length ? 'teal' : 'orange',
            });
        } finally {
            setCorriendoBateria(false);
        }
    };

    const totalesVivos = useMemo(() => {
        let gravado = 0;
        let exento = 0;
        let iva = 0;
        for (const it of items) {
            const sub = Math.round(((Number(it.cantidad) || 0) * (Number(it.precioUnitario) || 0) + Number.EPSILON) * 100) / 100;
            if (it.aplicaIva) {
                const imp = Math.round((sub * 0.16 + Number.EPSILON) * 100) / 100;
                gravado += sub;
                iva += imp;
            } else {
                exento += sub;
            }
        }
        const totalBs = Math.round((gravado + exento + iva + Number.EPSILON) * 100) / 100;
        const tasa = Number(tasaCambio) || 0;
        const totalUsd = incluirEquivalenteUsd && tasa > 0 ? Math.round((totalBs / tasa + Number.EPSILON) * 100) / 100 : null;
        return { gravado, exento, iva, totalBs, totalUsd };
    }, [items, tasaCambio, incluirEquivalenteUsd]);

    const emitirPrueba = async () => {
        setEmitiendo(true);
        setUltimoResultado(null);
        try {
            const { ok, data } = await pedirJson('/api/facturacion-digital/emitir', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ventaId: ventaIdOrigen,
                    tipoDocumento,
                    serie,
                    numeroDocumento: numeroDocumento || undefined,
                    fechaEmision,
                    tasaCambio: Number(tasaCambio) || 0,
                    incluirEquivalenteUsd,
                    condicionPago,
                    formaPago,
                    serieFacturaAfectada,
                    numeroFacturaAfectada,
                    fechaFacturaAfectada,
                    montoFacturaAfectada,
                    comentarioFacturaAfectada,
                    comprador: {
                        tipoIdentificacion,
                        numeroIdentificacion,
                        razonSocial,
                        direccion,
                        telefono,
                        correo,
                    },
                    items: items.map((it) => ({
                        codigo: it.codigo,
                        descripcion: it.descripcion,
                        cantidad: it.cantidad,
                        precioUnitario: it.precioUnitario,
                        aplicaIva: it.aplicaIva,
                        alicuota: it.aplicaIva ? 16 : 0,
                    })),
                }),
            });

            if (data?.emision) {
                setUltimoResultado(data);
                cargarHistorial();
            }

            if (ok) {
                notifications.show({
                    title: 'Documento emitido en TFHKA (DEMO)',
                    message: `Control: ${data?.emision?.numeroControl || 'N/A'} | Doc: ${data?.emision?.numeroDocumento || 'N/A'}`,
                    color: 'teal',
                });
            } else {
                notifications.show({
                    title: 'TFHKA rechazó o falló la emisión',
                    message: data?.error || data?.respuestaTfhka?.mensaje || 'Revisa las validaciones devueltas.',
                    color: 'red',
                });
            }
        } finally {
            setEmitiendo(false);
        }
    };

    const consultarEstadoLive = async (em) => {
        const { ok, data } = await pedirJson(`/api/facturacion-digital/emisiones/${em.id}/estado`, { method: 'POST' });
        if (ok) {
            notifications.show({
                title: `Estado TFHKA · Doc ${em.numeroDocumento}`,
                message: `${data?.respuestaTfhka?.estado?.estadoDocumento || 'OK'} · Control: ${data?.respuestaTfhka?.estado?.numeroControl || em.numeroControl || '-'}`,
                color: 'teal',
            });
            cargarHistorial();
        } else {
            const vals = Array.isArray(data?.respuestaTfhka?.validaciones) ? data.respuestaTfhka.validaciones.filter(Boolean) : [];
            const msg = data?.error || data?.respuestaTfhka?.mensaje || 'Error de consulta';
            notifications.show({
                title: 'No se pudo consultar',
                message: vals.length ? `${msg} (${vals.join(' · ')})` : msg,
                color: 'red',
            });
        }
    };

    const enviarCorreo = async () => {
        if (!modalCorreo) return;
        setEnviandoCorreo(true);
        try {
            const { ok, data } = await pedirJson(`/api/facturacion-digital/emisiones/${modalCorreo.id}/correo`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ correos: correosDestino }),
            });
            if (ok) {
                notifications.show({ title: 'Correo enviado', message: `TFHKA envió el PDF a ${correosDestino}`, color: 'teal' });
                setModalCorreo(null);
            } else {
                const vals = Array.isArray(data?.respuestaTfhka?.validaciones) ? data.respuestaTfhka.validaciones.filter(Boolean) : [];
                const msg = data?.error || data?.respuestaTfhka?.mensaje || 'Error enviando correo';
                notifications.show({ title: 'No se envió', message: vals.length ? `${msg} (${vals.join(' · ')})` : msg, color: 'red' });
            }
        } finally {
            setEnviandoCorreo(false);
        }
    };

    const confirmarAnulacion = async () => {
        if (!modalAnular) return;
        setAnulando(true);
        setErrorAnulacion(null);
        try {
            const { ok, data } = await pedirJson(`/api/facturacion-digital/emisiones/${modalAnular.id}/anular`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ motivoAnulacion }),
            });
            if (ok) {
                notifications.show({ title: 'Documento anulado en TFHKA', message: `Doc ${modalAnular.numeroDocumento} marcado como ANULADO`, color: 'teal' });
                setModalAnular(null);
                setErrorAnulacion(null);
                cargarHistorial();
            } else {
                const resp = data?.respuestaTfhka || null;
                const vals = Array.isArray(resp?.validaciones) ? resp.validaciones.filter(Boolean) : [];
                const msg = data?.error || resp?.mensaje || 'Error al anular';
                setErrorAnulacion({
                    codigo: resp?.codigo ?? null,
                    mensaje: msg,
                    validaciones: vals,
                    cruda: resp || data,
                });
                notifications.show({ title: 'No se anuló en TFHKA', message: msg, color: 'red' });
            }
        } finally {
            setAnulando(false);
        }
    };

    const prepararNotaDesdeFactura = (em, modo) => {
        const doc = em?.payloadEnviado?.documentoElectronico || null;
        const comp = doc?.encabezado?.comprador || null;
        const fechaFac = String(em?.fechaEmision || '').slice(0, 10) || fechaHoy;
        const esDebito = modo === 'ND';

        setVentaIdOrigen(em.ventaId || null);
        setTipoDocumento(esDebito ? '03' : '02');
        setSerie(em.serie || '');
        setNumeroDocumento('');
        setFechaEmision(fechaHoy || fechaFac);
        if (Number(em.tasaCambio) > 0) setTasaCambio(Number(em.tasaCambio));
        else if (tasaHoy) setTasaCambio(Number(tasaHoy));

        setSerieFacturaAfectada(em.serie || '');
        setNumeroFacturaAfectada(String(em.numeroDocumento || '').replace(/\D/g, ''));
        setFechaFacturaAfectada(fechaFac);
        setMontoFacturaAfectada(String(Number(em.totalBs || 0).toFixed(2)));

        if (modo === 'NC_TOTAL') setComentarioFacturaAfectada('ANULACION TOTAL DE FACTURA');
        else if (modo === 'NC_PARCIAL') setComentarioFacturaAfectada('DEVOLUCION / AJUSTE PARCIAL');
        else setComentarioFacturaAfectada('CARGO ADICIONAL / DIFERENCIAL CAMBIARIO');

        if (comp) {
            setTipoIdentificacion(comp.tipoIdentificacion || 'J');
            setNumeroIdentificacion(comp.numeroIdentificacion || '');
            setRazonSocial(comp.razonSocial || '');
            setDireccion(comp.direccion || 'CIUDAD OJEDA, ESTADO ZULIA');
            setTelefono(Array.isArray(comp.telefono) ? (comp.telefono[0] || '') : (comp.telefono || ''));
            setCorreo(Array.isArray(comp.correo) ? (comp.correo[0] || '') : (comp.correo || ''));
        } else {
            const parsed = parsearRifLocal(em.clienteRif);
            setTipoIdentificacion(parsed.tipo);
            setNumeroIdentificacion(parsed.numero);
            setRazonSocial(em.clienteNombre || '');
        }

        if (esDebito) {
            setItems([
                { codigo: 'ND-001', descripcion: 'CARGO ADICIONAL / DIFERENCIAL CAMBIARIO', cantidad: 1, precioUnitario: 100, aplicaIva: true },
            ]);
        } else if (Array.isArray(doc?.detallesItems) && doc.detallesItems.length > 0) {
            setItems(doc.detallesItems.map((d) => ({
                codigo: d.codigoPLU || '',
                descripcion: d.descripcion || 'Artículo',
                cantidad: Number(d.cantidad) || 1,
                precioUnitario: Number(d.precioUnitario) || 0,
                aplicaIva: Number(d.tasaIVA) > 0,
            })));
        }

        setUltimoResultado(null);
        setTab('emitir');
        const etiqueta = modo === 'NC_TOTAL'
            ? 'Anulación total con Nota de Crédito (02)'
            : modo === 'NC_PARCIAL'
                ? 'Nota de Crédito parcial (02) — ajusta cantidades o renglones'
                : 'Nota de Débito (03) — indica el monto o cargo adicional';
        notifications.show({
            title: `Factura Doc ${em.numeroDocumento} cargada`,
            message: etiqueta,
            color: esDebito ? 'grape' : 'orange',
        });
    };

    const facturasEmitidasOpciones = useMemo(() => (
        emisiones
            .filter((e) => e.tipoDocumento === '01' && (e.estado === 'EMITIDO' || e.estado === 'DUPLICADO') && e.numeroDocumento)
            .map((e) => ({
                value: e.id,
                label: `Doc ${e.numeroDocumento} · Ctrl ${e.numeroControl || 'S/N'} · ${e.fechaEmision} · ${nf(e.totalBs)} Bs`,
            }))
    ), [emisiones]);

    if (authLoading || estadoCarga) {
        return <Box p="xl" ta="center"><Loader size="md" /></Box>;
    }

    if (!isAdmin) {
        return (
            <Box maw={700} mx="auto" p="md">
                <Alert color="red" title="Acceso restringido" icon={<IconAlertTriangle />}>
                    Solo los administradores pueden acceder al entorno de pruebas de Facturación Digital.
                </Alert>
            </Box>
        );
    }

    return (
        <Box maw={1380} mx="auto" p={{ base: 'xs', sm: 'md' }}>
            <Paper
                withBorder
                radius="lg"
                p={{ base: 'sm', sm: 'lg' }}
                shadow="sm"
                style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.97)',
                    borderColor: '#dce4ef',
                    color: '#0f172a',
                }}
            >
            <Stack gap="md">
                {/* Cabecera */}
                <Group justify="space-between" align="center" wrap="wrap">
                    <Group gap="sm">
                        <Button variant="light" color="gray" leftSection={<IconArrowLeft size={16} />} onClick={volver}>
                            Volver
                        </Button>
                        <Group gap="xs">
                            <IconFileCertificate size={28} color="#e8590c" />
                            <div>
                                <Title order={3} c="#0f172a">Facturación Digital SENIAT · The Factory HKA</Title>
                                <Text size="xs" c="gray.7">Módulo aislado de pruebas (Fase 1) — paralelo a Forma Libre</Text>
                            </div>
                        </Group>
                    </Group>
                    <Badge size="lg" variant="filled" color={config?.esDemo !== false ? 'orange' : 'teal'}>
                        {config?.esDemo !== false ? 'AMBIENTE DEMO · SIN VALIDEZ FISCAL' : 'PRODUCCIÓN'}
                    </Badge>
                </Group>

                {/* Banner siempre visible de ambiente */}
                {config?.esDemo !== false ? (
                    <Alert
                        color="orange"
                        variant="light"
                        icon={<IconTestPipe size={20} />}
                        title="ENTORNO DE PRUEBAS (DEMO) ACTIVADO — NO AFECTA PRODUCCIÓN NI FORMA LIBRE"
                        styles={{ message: { color: '#1e293b' } }}
                    >
                        <Text size="sm" c="#1e293b">
                            Todo lo emitido desde aquí viaja al servidor de pruebas de The Factory HKA (<b>{config?.baseUrl}</b>) y se guarda únicamente en la tabla aislada <Code>EmisionesDigitales</Code>.
                            No consume números de control de forma libre, no mueve inventario, no crea cuentas por cobrar y no entra al Libro de Ventas.
                        </Text>
                    </Alert>
                ) : (
                    <Alert color="teal" variant="light" title="Ambiente de Producción configurado">
                        <Text size="sm" c="#1e293b">Conectado a <b>{config?.baseUrl}</b>.</Text>
                    </Alert>
                )}

                {config?.alertaUrl && (
                    <Alert color="red" icon={<IconAlertTriangle />} title="Advertencia de URL">
                        {config.alertaUrl}
                    </Alert>
                )}

                {!config?.configurado && (
                    <Alert color="red" variant="light" icon={<IconAlertTriangle />} title="Faltan variables de entorno en el servidor (Vercel / .env.local)" styles={{ message: { color: '#1e293b' } }}>
                        <Stack gap={6}>
                            <Text size="sm" c="#1e293b">Configura estas variables en Vercel (Settings → Environment Variables) con las credenciales de <b>SERVICIOS WEB (API)</b> del correo de The Factory HKA y redespliega:</Text>
                            <Code block>{`TFHKA_ENV=demo\nTFHKA_BASE_URL=https://demoemisionv2.thefactoryhka.com.ve\nTFHKA_USUARIO=tu_usuario_api_tfhka\nTFHKA_CLAVE=tu_clave_api_tfhka`}</Code>
                        </Stack>
                    </Alert>
                )}

                <Tabs value={tab} onChange={setTab} variant="pills" color="orange" radius="md">
                    <Tabs.List bg="gray.1" p={6} style={{ borderRadius: 10 }}>
                        <Tabs.Tab value="conexion" leftSection={<IconPlugConnected size={16} />}>Conexión y Numeraciones</Tabs.Tab>
                        <Tabs.Tab value="emitir" leftSection={<IconSend size={16} />}>Emitir Prueba</Tabs.Tab>
                        <Tabs.Tab value="historial" leftSection={<IconHistory size={16} />}>
                            Historial de Pruebas ({emisiones.length})
                        </Tabs.Tab>
                    </Tabs.List>

                    {/* TAB 1: CONEXIÓN Y NUMERACIONES */}
                    <Tabs.Panel value="conexion" pt="md">
                        <Stack gap="md">
                            <Card withBorder radius="md" p="md">
                                <Group justify="space-between" mb="sm" wrap="wrap">
                                    <Text fw={700}>Configuración activa en el servidor</Text>
                                    <Button
                                        leftSection={<IconPlugConnected size={16} />}
                                        loading={probando}
                                        onClick={probarConexion}
                                        color="orange"
                                        disabled={!config?.configurado}
                                    >
                                        Probar conexión con TFHKA
                                    </Button>
                                </Group>
                                <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="sm">
                                    <Paper withBorder p="xs" radius="sm">
                                        <Text size="xs" c="dimmed">Ambiente</Text>
                                        <Text fw={600}>{config?.esDemo !== false ? 'DEMO (Pruebas)' : 'PRODUCCIÓN'}</Text>
                                    </Paper>
                                    <Paper withBorder p="xs" radius="sm">
                                        <Text size="xs" c="dimmed">Endpoint Base</Text>
                                        <Text fw={600} size="sm" style={{ wordBreak: 'break-all' }}>{config?.baseUrl || 'No configurado'}</Text>
                                    </Paper>
                                    <Paper withBorder p="xs" radius="sm">
                                        <Text size="xs" c="dimmed">Usuario API</Text>
                                        <Text fw={600}>{config?.usuarioEnmascarado || 'Sin configurar'}</Text>
                                    </Paper>
                                    <Paper withBorder p="xs" radius="sm">
                                        <Text size="xs" c="dimmed">Serie por defecto / Sucursal</Text>
                                        <Text fw={600}>{config?.serieDefault || '(Principal / Sin serie)'} · {config?.sucursalDefault || '0001'}</Text>
                                    </Paper>
                                    <Paper withBorder p="xs" radius="sm">
                                        <Text size="xs" c="dimmed">Fecha Caracas / Tasa BCV Mediquir hoy</Text>
                                        <Text fw={600}>{fechaHoy || '-'} · {tasaHoy ? `${nf(tasaHoy)} Bs/USD` : 'Sin tasa'}</Text>
                                    </Paper>
                                </SimpleGrid>
                            </Card>

                            {conexion && (
                                <Card withBorder radius="md" p="md">
                                    <Stack gap="md">
                                        <Group justify="space-between">
                                            <Group gap="xs">
                                                <Badge color={conexion.ok ? 'teal' : 'red'}>{conexion.ok ? 'CONEXIÓN OK' : 'FALLÓ'}</Badge>
                                                <Text fw={700}>Resultado del diagnóstico en vivo</Text>
                                            </Group>
                                            {conexion.tokenExpiracion && (
                                                <Text size="xs" c="dimmed">Token JWT expira: {conexion.tokenExpiracion}</Text>
                                            )}
                                        </Group>

                                        {conexion.error && (
                                            <Alert color="red">{conexion.error}</Alert>
                                        )}

                                        {conexion.ok && (
                                            <>
                                                <div>
                                                    <Text fw={600} size="sm" mb="xs">Último documento emitido por tipo (en tu cuenta DEMO)</Text>
                                                    <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
                                                        {['01', '02', '03'].map((t) => {
                                                            const u = conexion.ultimosDocumentos?.[t];
                                                            return (
                                                                <Paper key={t} withBorder p="xs" radius="sm">
                                                                    <Text size="xs" c="dimmed">{ETIQUETA_DOC[t]} ({t})</Text>
                                                                    <Text fw={700}>
                                                                        {u?.numeroDocumento !== undefined ? `Nº ${u.numeroDocumento}` : (u?.mensaje || 'Sin datos')}
                                                                    </Text>
                                                                    {u?.codigo && <Text size="xs" c="dimmed">Código {u.codigo}: {u.mensaje}</Text>}
                                                                </Paper>
                                                            );
                                                        })}
                                                    </SimpleGrid>
                                                </div>

                                                <div>
                                                    <Text fw={600} size="sm" mb="xs">
                                                        Numeraciones / Rangos de control asignados ({conexion.numeraciones?.length || 0})
                                                    </Text>
                                                    {conexion.numeraciones?.length ? (
                                                        <Table striped withTableBorder withColumnBorders fz="xs">
                                                            <Table.Thead>
                                                                <Table.Tr>
                                                                    <Table.Th>Título</Table.Th>
                                                                    <Table.Th>Serie</Table.Th>
                                                                    <Table.Th>Tipo Doc</Table.Th>
                                                                    <Table.Th>Prefijo</Table.Th>
                                                                    <Table.Th>Desde</Table.Th>
                                                                    <Table.Th>Hasta</Table.Th>
                                                                    <Table.Th>Correlativo</Table.Th>
                                                                    <Table.Th>Estado</Table.Th>
                                                                </Table.Tr>
                                                            </Table.Thead>
                                                            <Table.Tbody>
                                                                {conexion.numeraciones.map((n, idx) => (
                                                                    <Table.Tr key={idx}>
                                                                        <Table.Td>{n.titulo}</Table.Td>
                                                                        <Table.Td>{n.serie}</Table.Td>
                                                                        <Table.Td>{n.tipoDocumento}</Table.Td>
                                                                        <Table.Td>{n.prefijo}</Table.Td>
                                                                        <Table.Td>{n.desde}</Table.Td>
                                                                        <Table.Td>{n.hasta}</Table.Td>
                                                                        <Table.Td fw={700}>{n.correlativo}</Table.Td>
                                                                        <Table.Td>
                                                                            <Badge size="xs" color={String(n.estado).toLowerCase() === 'true' ? 'teal' : 'gray'}>
                                                                                {n.estado}
                                                                            </Badge>
                                                                        </Table.Td>
                                                                    </Table.Tr>
                                                                ))}
                                                            </Table.Tbody>
                                                        </Table>
                                                    ) : (
                                                        <Alert color="yellow" variant="light">
                                                            TFHKA no devolvió rangos ({conexion.numeracionesCodigo}: {conexion.numeracionesMensaje}).
                                                        </Alert>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </Stack>
                                </Card>
                            )}
                        </Stack>
                    </Tabs.Panel>

                    {/* TAB 2: EMITIR PRUEBA */}
                    <Tabs.Panel value="emitir" pt="md">
                        <Stack gap="md">
                            {/* Guía rápida cerrada por defecto para no frenar el llenado */}
                            <Accordion variant="contained" radius="md">
                                <Accordion.Item value="guia">
                                    <Accordion.Control icon={<IconHelpCircle size={18} color="#e8590c" />}>
                                        <Text size="sm" fw={600}>¿Cómo funciona la Facturación Digital? (Guía rápida)</Text>
                                    </Accordion.Control>
                                    <Accordion.Panel>
                                        <Stack gap={6} fz="xs" c="gray.8">
                                            <Text size="xs">• <b>Nº de Documento:</b> es el correlativo consecutivo de tus facturas o notas (1, 2, 3...). El sistema lo asigna solo automáticamente; déjalo vacío para facturar rápido.</Text>
                                            <Text size="xs">• <b>Nº de Control:</b> lo genera automáticamente la Imprenta Digital (The Factory HKA) al emitir. Es el equivalente digital al número de control de la forma libre (<Code>00-XXXXXX</Code>).</Text>
                                            <Text size="xs">• <b>Serie:</b> solo se llena si Mediquir maneja varias series o cajas separadas en TFHKA; en caso contrario se deja vacío (serie principal).</Text>
                                            <Text size="xs">• <b>Fecha y Tasa BCV:</b> por defecto usa hoy y la tasa BCV vigente en Mediquir; si cambias la fecha (hasta 45 días atrás), carga la tasa BCV de ese día.</Text>
                                            <Text size="xs">• <b>Dirección del cliente:</b> es obligatoria en TFHKA/SENIAT para emitir el documento.</Text>
                                        </Stack>
                                    </Accordion.Panel>
                                </Accordion.Item>
                            </Accordion>

                            {/* Cargar plantilla */}
                            <Card withBorder radius="md" p="md" bg="gray.0">
                                <Stack gap="sm">
                                    <Group justify="space-between" align="flex-end" wrap="wrap" gap="sm">
                                        <Group align="flex-end" wrap="wrap" style={{ flex: 1 }}>
                                            <TextInput
                                                label="Buscar venta real de Mediquir como plantilla (solo lectura)"
                                                placeholder="F-015420, RIF o cliente..."
                                                value={busquedaVenta}
                                                onChange={(e) => setBusquedaVenta(e.currentTarget.value)}
                                                style={{ minWidth: 220 }}
                                            />
                                            <Button variant="light" loading={cargandoVentas} onClick={() => buscarVentasMuestra(busquedaVenta)}>
                                                Buscar
                                            </Button>
                                            <Select
                                                label="Cargar datos de venta existente"
                                                placeholder="Elige una venta para clonar al formulario..."
                                                data={ventasMuestra.map((v) => ({
                                                    value: v.id,
                                                    label: `${v.numeroDocumento} · ${v.cliente?.nombre || 'Cliente'} (${nf(v.totalFinal)} ${v.moneda})`,
                                                }))}
                                                value={ventaIdOrigen}
                                                onChange={cargarDesdeVenta}
                                                searchable
                                                clearable
                                                style={{ minWidth: 320, flex: 1 }}
                                            />
                                        </Group>
                                    </Group>

                                    <Divider label="Escenarios rápidos de prueba (correo destino: mediquirca@gmail.com)" labelPosition="left" />
                                    <Group justify="space-between" align="center" wrap="wrap" gap="xs">
                                        <Group gap="xs" wrap="wrap">
                                            <Button size="xs" variant="outline" color="orange" onClick={() => cargarEscenario('MIXTA')}>
                                                Mixta (2 ítems)
                                            </Button>
                                            <Button size="xs" variant="light" color="teal" onClick={() => cargarEscenario('EXENTA')}>
                                                100% Exenta
                                            </Button>
                                            <Button size="xs" variant="light" color="blue" onClick={() => cargarEscenario('PURO_IVA')}>
                                                Puro IVA (16%)
                                            </Button>
                                            <Button size="xs" variant="light" color="grape" onClick={() => cargarEscenario('LARGA')}>
                                                Larga (25 renglones)
                                            </Button>
                                        </Group>
                                        <Button
                                            size="xs"
                                            color="orange"
                                            leftSection={<IconTestPipe size={15} />}
                                            loading={corriendoBateria}
                                            disabled={!config?.configurado}
                                            onClick={ejecutarBateriaPruebas}
                                        >
                                            Emitir las 3 pruebas (Exenta + IVA + Larga) → mediquirca@gmail.com
                                        </Button>
                                    </Group>

                                    {resultadoBateria.length > 0 && (
                                        <Paper withBorder p="xs" radius="sm" bg="white">
                                            <Text size="xs" fw={700} mb={6}>Resultado de la batería de pruebas</Text>
                                            <Stack gap={6}>
                                                {resultadoBateria.map((r) => (
                                                    <Group key={r.clave} justify="space-between" wrap="wrap" gap="xs">
                                                        <Group gap="xs" wrap="wrap">
                                                            <Badge size="xs" color={r.ok ? 'teal' : 'red'}>{r.estado}</Badge>
                                                            <Text size="xs" fw={700}>{r.titulo}</Text>
                                                            <Text size="xs" c="dimmed">({r.renglones} renglones)</Text>
                                                            {r.numeroDocumento && (
                                                                <Text size="xs">Doc <b>{r.numeroDocumento}</b> · Ctrl <b>{r.numeroControl || '-'}</b> · {nf(r.totalBs)} Bs</Text>
                                                            )}
                                                            {!r.ok && <Text size="xs" c="red">{r.mensaje}</Text>}
                                                        </Group>
                                                        {r.ok && r.emisionId && (
                                                            <Button
                                                                size="compact-xs"
                                                                color="red"
                                                                variant="light"
                                                                leftSection={<IconFileTypePdf size={13} />}
                                                                component="a"
                                                                href={`/api/facturacion-digital/emisiones/${r.emisionId}/archivo?tipo=pdf`}
                                                                target="_blank"
                                                            >
                                                                Abrir PDF
                                                            </Button>
                                                        )}
                                                    </Group>
                                                ))}
                                            </Stack>
                                        </Paper>
                                    )}
                                </Stack>
                            </Card>

                            {/* Datos del documento */}
                            <Card withBorder radius="md" p="md">
                                <Text fw={700} mb="sm">1. Identificación del documento y Tasa BCV</Text>
                                <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="sm">
                                    <Select
                                        label="Tipo de documento"
                                        data={TIPOS_DOC}
                                        value={tipoDocumento}
                                        onChange={(v) => setTipoDocumento(v || '01')}
                                    />
                                    <TextInput
                                        label={
                                            <Group gap={4} wrap="nowrap">
                                                <span>Serie (vacío = principal)</span>
                                                <Tooltip multiline w={280} label="Solo se llena si Mediquir usa varias series o cajas separadas en TFHKA. Normalmente se deja vacío para usar la serie principal.">
                                                    <IconHelpCircle size={14} style={{ color: '#64748b', cursor: 'help' }} />
                                                </Tooltip>
                                            </Group>
                                        }
                                        placeholder="Ej: A o vacío"
                                        value={serie}
                                        onChange={(e) => setSerie(e.currentTarget.value)}
                                    />
                                    <TextInput
                                        label={
                                            <Group gap={4} wrap="nowrap">
                                                <span>Nº Documento (automático)</span>
                                                <Tooltip multiline w={280} label="Es el número consecutivo de tu factura o nota (1, 2, 3...). Déjalo vacío y el sistema consultará el último emitido en TFHKA para asignar el siguiente automáticamente.">
                                                    <IconHelpCircle size={14} style={{ color: '#64748b', cursor: 'help' }} />
                                                </Tooltip>
                                            </Group>
                                        }
                                        description="Déjalo vacío: el sistema asigna el correlativo"
                                        placeholder="Automático"
                                        value={numeroDocumento}
                                        onChange={(e) => setNumeroDocumento(e.currentTarget.value.replace(/\D/g, ''))}
                                    />
                                    <Select
                                        label="Forma de pago (TFHKA)"
                                        data={FORMAS_PAGO}
                                        value={formaPago}
                                        onChange={(v) => setFormaPago(v || '02')}
                                    />

                                    <TextInput
                                        type="date"
                                        label="Fecha de emisión (hasta 45 días atrás)"
                                        description="Al cambiar la fecha carga la tasa BCV de ese día"
                                        value={fechaEmision}
                                        onChange={(e) => alCambiarFecha(e.currentTarget.value)}
                                    />
                                    <NumberInput
                                        label={cargandoTasa ? 'Tasa BCV (cargando...)' : 'Tasa BCV (Bs / USD)'}
                                        description="Editable para probar validación TFHKA"
                                        value={tasaCambio}
                                        onChange={(v) => setTasaCambio(Number(v) || 0)}
                                        min={0}
                                        decimalScale={4}
                                        fixedDecimalScale
                                    />
                                    <Select
                                        label="Condición de pago"
                                        data={[{ value: 'Contado', label: 'Contado (Inmediato)' }, { value: 'Credito', label: 'Crédito' }]}
                                        value={condicionPago}
                                        onChange={(v) => setCondicionPago(v || 'Contado')}
                                    />
                                </SimpleGrid>

                                <Switch
                                    mt="sm"
                                    checked={incluirEquivalenteUsd}
                                    onChange={(e) => setIncluirEquivalenteUsd(e.currentTarget.checked)}
                                    label="Enviar bloque TotalesOtraMoneda (equivalente en USD según la tasa BCV indicada)"
                                />

                                {(tipoDocumento === '02' || tipoDocumento === '03') && (
                                    <>
                                        <Divider my="md" label="Datos obligatorios de la Factura Afectada" />
                                        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="sm">
                                            {facturasEmitidasOpciones.length > 0 && (
                                                <Select
                                                    label="Autocompletar desde factura DEMO emitida"
                                                    placeholder="Seleccionar..."
                                                    data={facturasEmitidasOpciones}
                                                    clearable
                                                    onChange={(eid) => {
                                                        const fac = emisiones.find((x) => x.id === eid);
                                                        if (!fac) return;
                                                        setSerieFacturaAfectada(fac.serie || '');
                                                        setNumeroFacturaAfectada(String(fac.numeroDocumento || '').replace(/\D/g, ''));
                                                        setFechaFacturaAfectada(String(fac.fechaEmision || '').slice(0, 10) || fechaHoy);
                                                        setMontoFacturaAfectada(String(Number(fac.totalBs || 0).toFixed(2)));
                                                        const comp = fac.payloadEnviado?.documentoElectronico?.encabezado?.comprador;
                                                        if (comp) {
                                                            setTipoIdentificacion(comp.tipoIdentificacion || 'J');
                                                            setNumeroIdentificacion(comp.numeroIdentificacion || '');
                                                            setRazonSocial(comp.razonSocial || '');
                                                            setDireccion(comp.direccion || 'CIUDAD OJEDA, ESTADO ZULIA');
                                                            setTelefono(Array.isArray(comp.telefono) ? (comp.telefono[0] || '') : (comp.telefono || ''));
                                                            setCorreo(Array.isArray(comp.correo) ? (comp.correo[0] || '') : (comp.correo || ''));
                                                        }
                                                    }}
                                                />
                                            )}
                                            <TextInput
                                                label="Serie factura afectada"
                                                value={serieFacturaAfectada}
                                                onChange={(e) => setSerieFacturaAfectada(e.currentTarget.value)}
                                            />
                                            <TextInput
                                                label="Número documento/control afectado (dígitos)"
                                                value={numeroFacturaAfectada}
                                                onChange={(e) => setNumeroFacturaAfectada(e.currentTarget.value.replace(/\D/g, ''))}
                                            />
                                            <TextInput
                                                type="date"
                                                label="Fecha factura afectada"
                                                value={fechaFacturaAfectada}
                                                onChange={(e) => setFechaFacturaAfectada(e.currentTarget.value)}
                                            />
                                            <NumberInput
                                                label="Monto factura afectada (Bs)"
                                                value={Number(montoFacturaAfectada) || ''}
                                                onChange={(v) => setMontoFacturaAfectada(String(v ?? ''))}
                                                min={0}
                                                decimalScale={2}
                                            />
                                            <TextInput
                                                label="Motivo / Comentario"
                                                value={comentarioFacturaAfectada}
                                                onChange={(e) => setComentarioFacturaAfectada(e.currentTarget.value)}
                                            />
                                        </SimpleGrid>
                                    </>
                                )}
                            </Card>

                            {/* Comprador */}
                            <Card withBorder radius="md" p="md">
                                <Text fw={700} mb="sm">2. Datos del Comprador (Dirección es obligatoria en TFHKA)</Text>
                                <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="sm">
                                    <Group gap="xs" align="flex-end" wrap="nowrap">
                                        <Select
                                            label="Tipo"
                                            data={['J', 'V', 'G', 'E', 'P', 'C']}
                                            value={tipoIdentificacion}
                                            onChange={(v) => setTipoIdentificacion(v || 'J')}
                                            w={80}
                                        />
                                        <TextInput
                                            label="RIF / Cédula (sin guiones)"
                                            value={numeroIdentificacion}
                                            onChange={(e) => setNumeroIdentificacion(e.currentTarget.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase())}
                                            style={{ flex: 1 }}
                                        />
                                    </Group>
                                    <TextInput
                                        label="Razón Social / Nombre"
                                        value={razonSocial}
                                        onChange={(e) => setRazonSocial(e.currentTarget.value)}
                                    />
                                    <TextInput
                                        label="Dirección fiscal (obligatoria)"
                                        value={direccion}
                                        onChange={(e) => setDireccion(e.currentTarget.value)}
                                    />
                                    <TextInput
                                        label="Teléfono (opcional)"
                                        value={telefono}
                                        onChange={(e) => setTelefono(e.currentTarget.value)}
                                    />
                                    <TextInput
                                        label="Correo para notificación TFHKA (opcional)"
                                        placeholder="cliente@correo.com"
                                        value={correo}
                                        onChange={(e) => setCorreo(e.currentTarget.value)}
                                    />
                                </SimpleGrid>
                            </Card>

                            {/* Renglones */}
                            <Card withBorder radius="md" p="md">
                                <Group justify="space-between" mb="sm">
                                    <Text fw={700}>3. Renglones (Productos / Servicios)</Text>
                                    <Button
                                        size="xs"
                                        variant="light"
                                        leftSection={<IconPlus size={14} />}
                                        onClick={() => setItems((prev) => [...prev, { codigo: '', descripcion: '', cantidad: 1, precioUnitario: 100, aplicaIva: true }])}
                                    >
                                        Agregar renglón
                                    </Button>
                                </Group>

                                <Box style={{ overflowX: 'auto' }}>
                                    <Table withTableBorder fz="xs">
                                        <Table.Thead>
                                            <Table.Tr>
                                                <Table.Th w={110}>Código</Table.Th>
                                                <Table.Th>Descripción</Table.Th>
                                                <Table.Th w={95}>Cantidad</Table.Th>
                                                <Table.Th w={140}>Precio Unit. (Bs)</Table.Th>
                                                <Table.Th w={145}>IVA</Table.Th>
                                                <Table.Th w={130} ta="right">Subtotal (Bs)</Table.Th>
                                                <Table.Th w={46}></Table.Th>
                                            </Table.Tr>
                                        </Table.Thead>
                                        <Table.Tbody>
                                            {items.map((it, idx) => {
                                                const sub = (Number(it.cantidad) || 0) * (Number(it.precioUnitario) || 0);
                                                return (
                                                    <Table.Tr key={idx}>
                                                        <Table.Td>
                                                            <TextInput
                                                                size="xs"
                                                                value={it.codigo}
                                                                onChange={(e) => {
                                                                    const val = e.currentTarget.value;
                                                                    setItems((p) => p.map((x, i) => (i === idx ? { ...x, codigo: val } : x)));
                                                                }}
                                                            />
                                                        </Table.Td>
                                                        <Table.Td>
                                                            <TextInput
                                                                size="xs"
                                                                value={it.descripcion}
                                                                onChange={(e) => {
                                                                    const val = e.currentTarget.value;
                                                                    setItems((p) => p.map((x, i) => (i === idx ? { ...x, descripcion: val } : x)));
                                                                }}
                                                            />
                                                        </Table.Td>
                                                        <Table.Td>
                                                            <NumberInput
                                                                size="xs"
                                                                min={0.01}
                                                                decimalScale={2}
                                                                value={it.cantidad}
                                                                onChange={(val) => setItems((p) => p.map((x, i) => (i === idx ? { ...x, cantidad: Number(val) || 0 } : x)))}
                                                            />
                                                        </Table.Td>
                                                        <Table.Td>
                                                            <NumberInput
                                                                size="xs"
                                                                min={0.01}
                                                                decimalScale={4}
                                                                value={it.precioUnitario}
                                                                onChange={(val) => setItems((p) => p.map((x, i) => (i === idx ? { ...x, precioUnitario: Number(val) || 0 } : x)))}
                                                            />
                                                        </Table.Td>
                                                        <Table.Td>
                                                            <Select
                                                                size="xs"
                                                                data={[
                                                                    { value: 'G', label: 'Gravado 16% (G)' },
                                                                    { value: 'E', label: 'Exento 0% (E)' },
                                                                ]}
                                                                value={it.aplicaIva ? 'G' : 'E'}
                                                                onChange={(val) => setItems((p) => p.map((x, i) => (i === idx ? { ...x, aplicaIva: val !== 'E' } : x)))}
                                                            />
                                                        </Table.Td>
                                                        <Table.Td ta="right" fw={600}>{nf(sub)}</Table.Td>
                                                        <Table.Td>
                                                            <ActionIcon
                                                                color="red"
                                                                variant="subtle"
                                                                disabled={items.length <= 1}
                                                                onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}
                                                            >
                                                                <IconTrash size={15} />
                                                            </ActionIcon>
                                                        </Table.Td>
                                                    </Table.Tr>
                                                );
                                            })}
                                        </Table.Tbody>
                                    </Table>
                                </Box>

                                <Divider my="md" />
                                <Group justify="space-between" align="center" wrap="wrap">
                                    <Group gap="lg" wrap="wrap">
                                        <div><Text size="xs" c="dimmed">Base Gravada</Text><Text fw={600}>{nf(totalesVivos.gravado)} Bs</Text></div>
                                        <div><Text size="xs" c="dimmed">Exento</Text><Text fw={600}>{nf(totalesVivos.exento)} Bs</Text></div>
                                        <div><Text size="xs" c="dimmed">IVA 16%</Text><Text fw={600}>{nf(totalesVivos.iva)} Bs</Text></div>
                                        <div><Text size="xs" c="dimmed">Total a Pagar</Text><Text fw={800} size="lg" c="blue">{nf(totalesVivos.totalBs)} Bs</Text></div>
                                        {totalesVivos.totalUsd !== null && (
                                            <div><Text size="xs" c="dimmed">Equiv. USD (tasa {nf(tasaCambio, 4)})</Text><Text fw={700} c="teal">$ {nf(totalesVivos.totalUsd)}</Text></div>
                                        )}
                                    </Group>

                                    <Button
                                        size="md"
                                        color="orange"
                                        leftSection={<IconSend size={18} />}
                                        loading={emitiendo}
                                        disabled={!config?.configurado}
                                        onClick={emitirPrueba}
                                    >
                                        Emitir documento de prueba en TFHKA (DEMO)
                                    </Button>
                                </Group>
                            </Card>

                            {/* Resultado inmediato */}
                            {ultimoResultado?.emision && (
                                <Card withBorder radius="md" p="md" style={{ borderColor: ultimoResultado.ok ? '#12b886' : '#fa5252' }}>
                                    <Stack gap="sm">
                                        <Group justify="space-between" wrap="wrap">
                                            <Group gap="xs">
                                                <Badge size="lg" color={ESTADOS_COLOR[ultimoResultado.emision.estado] || 'gray'}>
                                                    {ultimoResultado.emision.estado}
                                                </Badge>
                                                <Text fw={700}>
                                                    Código {ultimoResultado.emision.codigoRespuesta || '-'}: {ultimoResultado.emision.mensajeRespuesta}
                                                </Text>
                                            </Group>
                                            {ultimoResultado.ok && ultimoResultado.emision.numeroDocumento && (
                                                <Group gap="xs">
                                                    <Button
                                                        size="xs"
                                                        color="red"
                                                        leftSection={<IconFileTypePdf size={15} />}
                                                        component="a"
                                                        href={`/api/facturacion-digital/emisiones/${ultimoResultado.emision.id}/archivo?tipo=pdf`}
                                                        target="_blank"
                                                    >
                                                        Abrir PDF oficial
                                                    </Button>
                                                    {ultimoResultado.emision.urlConsulta && (
                                                        <Button
                                                            size="xs"
                                                            variant="light"
                                                            rightSection={<IconExternalLink size={14} />}
                                                            component="a"
                                                            href={ultimoResultado.emision.urlConsulta}
                                                            target="_blank"
                                                        >
                                                            URL Consulta TFHKA
                                                        </Button>
                                                    )}
                                                </Group>
                                            )}
                                        </Group>

                                        <SimpleGrid cols={{ base: 1, sm: 4 }} spacing="xs">
                                            <Paper withBorder p="xs"><Text size="xs" c="dimmed">Número de Control TFHKA</Text><Text fw={800} size="lg">{ultimoResultado.emision.numeroControl || 'N/A'}</Text></Paper>
                                            <Paper withBorder p="xs"><Text size="xs" c="dimmed">Número de Documento</Text><Text fw={700}>{ultimoResultado.emision.numeroDocumento || 'N/A'}</Text></Paper>
                                            <Paper withBorder p="xs"><Text size="xs" c="dimmed">Fecha / Hora Asignación</Text><Text fw={600}>{ultimoResultado.emision.fechaAsignacion || '-'} {ultimoResultado.emision.horaAsignacion || ''}</Text></Paper>
                                            <Paper withBorder p="xs"><Text size="xs" c="dimmed">Rango Asignado</Text><Text size="xs" fw={600}>{ultimoResultado.emision.rangoAsignado || '-'}</Text></Paper>
                                        </SimpleGrid>

                                        {Array.isArray(ultimoResultado.emision.validaciones) && ultimoResultado.emision.validaciones.length > 0 && (
                                            <Alert color="red" title="Validaciones reportadas por TFHKA">
                                                <Stack gap={2}>
                                                    {ultimoResultado.emision.validaciones.map((v, i) => (
                                                        <Text key={i} size="xs">• {v}</Text>
                                                    ))}
                                                </Stack>
                                            </Alert>
                                        )}

                                        <Accordion variant="contained">
                                            <Accordion.Item value="json">
                                                <Accordion.Control icon={<IconCode size={16} />}>Inspeccionar JSON enviado y respuesta de TFHKA</Accordion.Control>
                                                <Accordion.Panel>
                                                    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
                                                        <div>
                                                            <Text size="xs" fw={700} mb={4}>Request enviado a /api/Emision</Text>
                                                            <Code block mah={320} style={{ overflow: 'auto' }}>
                                                                {JSON.stringify(ultimoResultado.emision.payloadEnviado, null, 2)}
                                                            </Code>
                                                        </div>
                                                        <div>
                                                            <Text size="xs" fw={700} mb={4}>Respuesta de TFHKA</Text>
                                                            <Code block mah={320} style={{ overflow: 'auto' }}>
                                                                {JSON.stringify(ultimoResultado.emision.respuestaCruda, null, 2)}
                                                            </Code>
                                                        </div>
                                                    </SimpleGrid>
                                                </Accordion.Panel>
                                            </Accordion.Item>
                                        </Accordion>
                                    </Stack>
                                </Card>
                            )}
                        </Stack>
                    </Tabs.Panel>

                    {/* TAB 3: HISTORIAL */}
                    <Tabs.Panel value="historial" pt="md">
                        <Card withBorder radius="md" p="md">
                            <Group justify="space-between" mb="sm">
                                <Text fw={700}>Documentos de prueba enviados a TFHKA</Text>
                                <Button size="xs" variant="light" leftSection={<IconRefresh size={14} />} loading={cargandoHistorial} onClick={cargarHistorial}>
                                    Actualizar
                                </Button>
                            </Group>

                            {emisiones.length === 0 ? (
                                <Text c="dimmed" size="sm" py="md" ta="center">Todavía no has emitido documentos de prueba.</Text>
                            ) : (
                                <Box style={{ overflowX: 'auto' }}>
                                    <Table striped highlightOnHover withTableBorder fz="xs">
                                        <Table.Thead>
                                            <Table.Tr>
                                                <Table.Th>Ambiente</Table.Th>
                                                <Table.Th>Estado</Table.Th>
                                                <Table.Th>Tipo</Table.Th>
                                                <Table.Th>Nº Doc</Table.Th>
                                                <Table.Th>Nº Control TFHKA</Table.Th>
                                                <Table.Th>Fecha</Table.Th>
                                                <Table.Th>Cliente</Table.Th>
                                                <Table.Th ta="right">Total Bs</Table.Th>
                                                <Table.Th ta="right">Equiv. USD</Table.Th>
                                                <Table.Th>Acciones</Table.Th>
                                            </Table.Tr>
                                        </Table.Thead>
                                        <Table.Tbody>
                                            {emisiones.map((em) => {
                                                const descargable = Boolean(em.numeroDocumento) && em.estado !== 'ERROR';
                                                return (
                                                    <Table.Tr key={em.id}>
                                                        <Table.Td>
                                                            <Badge size="xs" color={em.ambiente === 'prod' ? 'teal' : 'orange'}>{String(em.ambiente).toUpperCase()}</Badge>
                                                        </Table.Td>
                                                        <Table.Td>
                                                            <Badge size="xs" color={ESTADOS_COLOR[em.estado] || 'gray'}>{em.estado}</Badge>
                                                        </Table.Td>
                                                        <Table.Td>{ETIQUETA_DOC[em.tipoDocumento] || em.tipoDocumento}</Table.Td>
                                                        <Table.Td fw={600}>{em.numeroDocumento || '-'}</Table.Td>
                                                        <Table.Td fw={700}>{em.numeroControl || '-'}</Table.Td>
                                                        <Table.Td>{em.fechaEmision}</Table.Td>
                                                        <Table.Td>
                                                            <Text size="xs" fw={600} lineClamp={1}>{em.clienteNombre}</Text>
                                                            <Text size="xs" c="dimmed">{em.clienteRif}</Text>
                                                        </Table.Td>
                                                        <Table.Td ta="right" fw={600}>{nf(em.totalBs)}</Table.Td>
                                                        <Table.Td ta="right">{em.totalUsd ? `$ ${nf(em.totalUsd)}` : '-'}</Table.Td>
                                                        <Table.Td>
                                                            <Group gap={4} wrap="nowrap">
                                                                {descargable && (
                                                                    <>
                                                                        <Tooltip label="Abrir PDF oficial TFHKA">
                                                                            <ActionIcon
                                                                                color="red"
                                                                                variant="light"
                                                                                component="a"
                                                                                href={`/api/facturacion-digital/emisiones/${em.id}/archivo?tipo=pdf`}
                                                                                target="_blank"
                                                                            >
                                                                                <IconFileTypePdf size={15} />
                                                                            </ActionIcon>
                                                                        </Tooltip>
                                                                        <Tooltip label="Descargar XML">
                                                                            <ActionIcon
                                                                                color="blue"
                                                                                variant="subtle"
                                                                                component="a"
                                                                                href={`/api/facturacion-digital/emisiones/${em.id}/archivo?tipo=xml`}
                                                                                target="_blank"
                                                                            >
                                                                                <IconCode size={15} />
                                                                            </ActionIcon>
                                                                        </Tooltip>
                                                                        <Tooltip label="Enviar PDF por correo">
                                                                            <ActionIcon color="teal" variant="subtle" onClick={() => { setModalCorreo(em); setCorreosDestino(''); }}>
                                                                                <IconMail size={15} />
                                                                            </ActionIcon>
                                                                        </Tooltip>
                                                                        <Tooltip label="Consultar estado en vivo">
                                                                            <ActionIcon color="indigo" variant="subtle" onClick={() => consultarEstadoLive(em)}>
                                                                                <IconCheck size={15} />
                                                                            </ActionIcon>
                                                                        </Tooltip>
                                                                        {em.estado !== 'ANULADO' && em.tipoDocumento === '01' && (
                                                                            <Menu withinPortal position="bottom-end" shadow="md">
                                                                                <Menu.Target>
                                                                                    <Tooltip label="Anular con Nota de Crédito / Emitir Nota de Débito">
                                                                                        <ActionIcon color="orange" variant="light">
                                                                                            <IconReceiptRefund size={15} />
                                                                                        </ActionIcon>
                                                                                    </Tooltip>
                                                                                </Menu.Target>
                                                                                <Menu.Dropdown>
                                                                                    <Menu.Label>Acciones sobre Factura {em.numeroDocumento}</Menu.Label>
                                                                                    <Menu.Item
                                                                                        color="red"
                                                                                        leftSection={<IconReceiptRefund size={15} />}
                                                                                        onClick={() => prepararNotaDesdeFactura(em, 'NC_TOTAL')}
                                                                                    >
                                                                                        Anular total (Nota de Crédito 02)
                                                                                    </Menu.Item>
                                                                                    <Menu.Item
                                                                                        color="orange"
                                                                                        leftSection={<IconReceiptRefund size={15} />}
                                                                                        onClick={() => prepararNotaDesdeFactura(em, 'NC_PARCIAL')}
                                                                                    >
                                                                                        Nota de Crédito parcial (02)
                                                                                    </Menu.Item>
                                                                                    <Menu.Item
                                                                                        color="grape"
                                                                                        leftSection={<IconPlus size={15} />}
                                                                                        onClick={() => prepararNotaDesdeFactura(em, 'ND')}
                                                                                    >
                                                                                        Nota de Débito (03)
                                                                                    </Menu.Item>
                                                                                </Menu.Dropdown>
                                                                            </Menu>
                                                                        )}
                                                                        {em.estado !== 'ANULADO' && em.tipoDocumento !== '01' && (
                                                                            <Tooltip label="Anular documento en TFHKA">
                                                                                <ActionIcon color="orange" variant="subtle" onClick={() => { setModalAnular(em); setMotivoAnulacion('Prueba de anulación en ambiente DEMO'); setErrorAnulacion(null); }}>
                                                                                    <IconBan size={15} />
                                                                                </ActionIcon>
                                                                            </Tooltip>
                                                                        )}
                                                                    </>
                                                                )}
                                                                <Tooltip label="Ver JSON enviado y respuesta">
                                                                    <ActionIcon color="gray" variant="subtle" onClick={() => setModalJson(em)}>
                                                                        <IconCode size={15} />
                                                                    </ActionIcon>
                                                                </Tooltip>
                                                            </Group>
                                                        </Table.Td>
                                                    </Table.Tr>
                                                );
                                            })}
                                        </Table.Tbody>
                                    </Table>
                                </Box>
                            )}
                        </Card>
                    </Tabs.Panel>
                </Tabs>
            </Stack>
            </Paper>

            {/* Modal JSON */}
            <Modal opened={Boolean(modalJson)} onClose={() => setModalJson(null)} title={`Detalle técnico · Doc ${modalJson?.numeroDocumento || 'S/N'}`} size="xl">
                {modalJson && (
                    <Stack gap="sm">
                        {Array.isArray(modalJson.validaciones) && modalJson.validaciones.length > 0 && (
                            <Alert color="red" title="Validaciones">
                                {modalJson.validaciones.map((v, i) => <Text key={i} size="xs">• {v}</Text>)}
                            </Alert>
                        )}
                        <Text size="xs" fw={700}>JSON enviado</Text>
                        <Code block mah={260} style={{ overflow: 'auto' }}>{JSON.stringify(modalJson.payloadEnviado, null, 2)}</Code>
                        <Text size="xs" fw={700}>Respuesta TFHKA</Text>
                        <Code block mah={260} style={{ overflow: 'auto' }}>{JSON.stringify(modalJson.respuestaCruda, null, 2)}</Code>
                    </Stack>
                )}
            </Modal>

            {/* Modal Correo */}
            <Modal opened={Boolean(modalCorreo)} onClose={() => setModalCorreo(null)} title={`Enviar PDF por correo · Doc ${modalCorreo?.numeroDocumento || ''}`}>
                <Stack gap="sm">
                    <TextInput
                        label="Correos destinatarios (separados por coma)"
                        placeholder="cliente@empresa.com, admin@mediquir.com"
                        value={correosDestino}
                        onChange={(e) => setCorreosDestino(e.currentTarget.value)}
                    />
                    <Group justify="flex-end">
                        <Button variant="subtle" onClick={() => setModalCorreo(null)}>Cancelar</Button>
                        <Button color="teal" loading={enviandoCorreo} onClick={enviarCorreo}>Enviar</Button>
                    </Group>
                </Stack>
            </Modal>

            {/* Modal Anulación */}
            <Modal opened={Boolean(modalAnular)} onClose={() => { setModalAnular(null); setErrorAnulacion(null); }} title={`Anular en TFHKA · Doc ${modalAnular?.numeroDocumento || ''}`} size="lg">
                <Stack gap="sm">
                    <Alert color="orange" variant="light">
                        <Text size="xs">
                            Esta acción llama a <Code>/api/Anular</Code> en el ambiente <b>{String(modalAnular?.ambiente || 'demo').toUpperCase()}</b> de TFHKA.
                            Nota: en SENIAT/TFHKA algunas cuentas restringen la anulación directa de facturas ya emitidas (en esos casos se revierte emitiendo una <b>Nota de Crédito 02</b>).
                        </Text>
                    </Alert>
                    <Textarea
                        label="Motivo de anulación"
                        value={motivoAnulacion}
                        onChange={(e) => setMotivoAnulacion(e.currentTarget.value)}
                        minRows={2}
                    />
                    {errorAnulacion && (
                        <Alert color="red" title={`TFHKA rechazó la anulación${errorAnulacion.codigo ? ` (Código ${errorAnulacion.codigo})` : ''}`}>
                            <Stack gap={6}>
                                <Text size="xs">{errorAnulacion.mensaje}</Text>
                                {errorAnulacion.validaciones?.length > 0 && (
                                    <Stack gap={2}>
                                        {errorAnulacion.validaciones.map((v, i) => (
                                            <Text key={i} size="xs" fw={600}>• {v}</Text>
                                        ))}
                                    </Stack>
                                )}
                                {errorAnulacion.cruda && (
                                    <Code block mah={180} style={{ overflow: 'auto' }}>
                                        {JSON.stringify(errorAnulacion.cruda, null, 2)}
                                    </Code>
                                )}
                            </Stack>
                        </Alert>
                    )}
                    <Group justify="flex-end">
                        <Button variant="subtle" onClick={() => { setModalAnular(null); setErrorAnulacion(null); }}>Cancelar</Button>
                        <Button color="red" loading={anulando} onClick={confirmarAnulacion}>Confirmar anulación</Button>
                    </Group>
                </Stack>
            </Modal>
        </Box>
    );
}
