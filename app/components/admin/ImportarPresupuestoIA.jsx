'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    ActionIcon, Alert, Badge, Box, Button, Checkbox, Group, Loader,
    Modal, NumberInput, Paper, SegmentedControl, Select, SimpleGrid,
    Stack, Text, TextInput, ThemeIcon, UnstyledButton,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
    IconAlertTriangle, IconCheck, IconFileSpreadsheet, IconFileTypePdf,
    IconPhoto, IconSparkles, IconUpload, IconUserCheck, IconX,
} from '@tabler/icons-react';
import { buscarProductos, normalizar } from '@/app/helpers/busquedaProductos';
import { presentacionesDe, presentacionDe } from '@/app/constants/presentaciones';
import { aBolivares, aDolares } from '@/app/constants/facturacion';
import { CONTENIDO_SIN_RELLENO } from '@/app/components/ui/modalMovil';

const TARIFA_CORTA = {
    precio7: 'P7 Detal $',
    precio6: 'P6 Mayor $',
    precio4: 'P4 Detal Bs',
    precio5: 'P5 Mayor Bs',
    precio1: 'P1 Bs',
};

const CONF_COLOR = {
    alta: 'teal',
    media: 'orange',
    baja: 'orange',
    ninguna: 'grape',
};

const formatNum = (n) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);

let uidSeq = 0;
const nuevoUid = () => `ia-${++uidSeq}`;

export default function ImportarPresupuestoIA({
    opened,
    onClose,
    productos = [],
    clientes = [],
    tarifaActual = '',
    opcionesTarifa = [],
    tarifaBloqueada = false,
    onCambiarTarifa,
    calcularPrecioInfo,
    esMonedaBs = false,
    tasaActiva = 0,
    isMobile = false,
    onAplicar,
    onSeleccionarCliente,
    clienteActualId = null,
}) {
    const inputRef = useRef(null);
    const [fase, setFase] = useState('subir'); // 'subir' | 'revisar'
    const [cargando, setCargando] = useState(false);
    const [arrastrando, setArrastrando] = useState(false);
    const [error, setError] = useState(null);
    const [meta, setMeta] = useState(null);
    const [filas, setFilas] = useState([]);
    const [filtro, setFiltro] = useState('todos'); // 'todos' | 'revisar' | 'ficticio'

    const tarifaEfectiva = tarifaActual || opcionesTarifa?.[0]?.value || 'precio7';
    const simbolo = esMonedaBs ? 'Bs' : '$';

    const prodPorId = useMemo(() => {
        const m = new Map();
        for (const p of productos || []) m.set(String(p.id), p);
        return m;
    }, [productos]);

    const opcionesProducto = useMemo(
        () => (productos || []).map((p) => {
            const stock = Number(p.stockAlmacen) || 0;
            const marca = p.marca?.nombre ? ` · ${p.marca.nombre}` : '';
            return {
                value: String(p.id),
                label: `${p.nombre}${marca} (Disp: ${stock}) [${p.codigo || 'S/C'}]`,
            };
        }),
        [productos],
    );

    const opcionPorId = useMemo(() => {
        const m = new Map();
        for (const o of opcionesProducto) m.set(o.value, o);
        return m;
    }, [opcionesProducto]);

    const filtroProductos = ({ search, limit }) => {
        if (!search || !search.trim()) return opcionesProducto.slice(0, limit);
        return buscarProductos(productos, search, { desempate: (p) => (Number(p.stockAlmacen) > 0 ? 1 : 0) })
            .slice(0, limit)
            .map((p) => opcionPorId.get(String(p.id)))
            .filter(Boolean);
    };

    const porGrupo = useMemo(() => {
        const m = new Map();
        for (const p of productos || []) {
            const gid = p.grupoEquivalenciaId || p.grupoEquivalencia?.id;
            if (!gid) continue;
            if (!m.has(gid)) m.set(gid, []);
            m.get(gid).push(p);
        }
        return m;
    }, [productos]);

    const clienteCoincidente = useMemo(() => {
        const sug = normalizar(meta?.clienteSugerido);
        if (!sug || !clientes?.length) return null;
        const palabrasSug = sug.split(' ').filter((w) => w.length >= 3);
        let mejor = null;
        let mejorPuntaje = 0;
        for (const c of clientes) {
            const nom = normalizar(c.nombre);
            if (!nom) continue;
            if (nom === sug || nom.includes(sug) || sug.includes(nom)) return c;
            if (palabrasSug.length >= 2) {
                const hits = palabrasSug.filter((w) => nom.includes(w)).length;
                if (hits >= 2 && hits > mejorPuntaje) {
                    mejorPuntaje = hits;
                    mejor = c;
                }
            }
        }
        return mejor;
    }, [meta?.clienteSugerido, clientes]);

    const resetear = () => {
        setFase('subir');
        setCargando(false);
        setArrastrando(false);
        setError(null);
        setMeta(null);
        setFilas([]);
        setFiltro('todos');
        if (inputRef.current) inputRef.current.value = '';
    };

    useEffect(() => {
        if (!opened) return;
        setError(null);
    }, [opened]);

    const actualizarFila = (uid, cambios) => {
        setFilas((prev) => prev.map((f) => (f.uid === uid ? { ...f, ...cambios } : f)));
    };

    const cambiarTarifaDesdeModal = (nueva) => {
        if (!nueva || tarifaBloqueada || nueva === tarifaActual) return;
        const nuevaEsBs = ['precio1', 'precio4', 'precio5'].includes(nueva);
        const cambiaMoneda = nuevaEsBs !== esMonedaBs;
        onCambiarTarifa?.(nueva);
        if (cambiaMoneda) {
            setFilas((prev) => prev.map((f) => {
                if (f.modo === 'catalogo') return { ...f, precioManual: '' };
                if (f.modo === 'ficticio' && Number(f.precioManual) > 0 && tasaActiva > 0) {
                    const conv = nuevaEsBs
                        ? aBolivares(Number(f.precioManual), tasaActiva)
                        : aDolares(Number(f.precioManual), tasaActiva);
                    return { ...f, precioManual: Number(conv.toFixed(3)) };
                }
                return f;
            }));
        }
    };

    const procesarArchivo = async (file) => {
        if (!file) return;
        setError(null);
        setCargando(true);
        try {
            const fd = new FormData();
            fd.append('file', file);
            const res = await fetch('/api/presupuestos/analizar-archivo', { method: 'POST', body: fd });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'No se pudo analizar el archivo.');

            if (!tarifaActual && !tarifaBloqueada) {
                onCambiarTarifa?.(opcionesTarifa?.[0]?.value || 'precio7');
            }

            const nuevasFilas = (data.items || []).map((it) => {
                const pid = it.productoId ? String(it.productoId) : null;
                const prod = pid ? prodPorId.get(pid) : null;
                const tieneProd = Boolean(prod);
                const pres = tieneProd && presentacionDe(prod, it.presentacionSugerida)
                    ? it.presentacionSugerida
                    : 'UNIDAD';

                return {
                    uid: nuevoUid(),
                    incluir: true,
                    textoOriginal: it.textoOriginal || it.descripcionLimpia || '',
                    descripcionLimpia: it.descripcionLimpia || it.textoOriginal || '',
                    marcaSolicitada: it.marcaSolicitada || null,
                    unidadSolicitada: it.unidadSolicitada || null,
                    confianza: tieneProd ? (it.confianza || 'media') : 'ninguna',
                    motivo: it.motivo || (tieneProd ? '' : 'No encontrado en inventario'),
                    alternativas: Array.isArray(it.alternativas) ? it.alternativas : [],
                    modo: tieneProd ? 'catalogo' : 'ficticio',
                    productoId: pid,
                    presentacion: pres,
                    cantidad: Math.max(1, Number(it.cantidad) || 1),
                    precioManual: !tieneProd && Number(it.precioReferencia) > 0 ? Number(it.precioReferencia) : '',
                    nombreFicticio: (it.descripcionLimpia || it.textoOriginal || 'Producto Genérico').slice(0, 140),
                    aplicaIva: true,
                };
            });

            setMeta({
                archivoNombre: data.archivoNombre || file.name,
                modelo: data.modelo,
                clienteSugerido: data.clienteSugerido || null,
                notasGenerales: data.notasGenerales || null,
                truncado: Boolean(data.truncado),
            });
            setFilas(nuevasFilas);
            setFiltro('todos');
            setFase('revisar');
        } catch (err) {
            setError(err.message || 'Ocurrió un error al analizar el archivo.');
        } finally {
            setCargando(false);
        }
    };

    const obtenerPrecioFila = (fila) => {
        if (fila.modo === 'ficticio') {
            const n = Number(fila.precioManual);
            return n > 0 ? n : 0;
        }
        const prod = fila.productoId ? prodPorId.get(String(fila.productoId)) : null;
        if (!prod) return 0;
        if (fila.precioManual !== '' && Number(fila.precioManual) > 0) return Number(fila.precioManual);
        return Number(calcularPrecioInfo?.(prod, tarifaEfectiva)?.precio) || 0;
    };

    const obtenerUnidadesFila = (fila) => {
        if (fila.modo === 'ficticio') return Math.max(1, Math.floor(Number(fila.cantidad) || 1));
        const prod = fila.productoId ? prodPorId.get(String(fila.productoId)) : null;
        const pres = prod ? (presentacionDe(prod, fila.presentacion) || presentacionDe(prod, 'UNIDAD')) : null;
        return Math.max(1, Math.floor(Number(fila.cantidad) || 1)) * (pres?.unidades || 1);
    };

    const stats = useMemo(() => {
        let incluidos = 0;
        let revisar = 0;
        let ficticios = 0;
        let sinPrecio = 0;
        let totalEst = 0;

        for (const f of filas) {
            if (f.modo === 'ficticio') ficticios++;
            const prod = f.productoId ? prodPorId.get(String(f.productoId)) : null;
            const sinStock = f.modo === 'catalogo' && prod && (Number(prod.stockAlmacen) || 0) <= 0;
            const necesitaRev = f.modo === 'ficticio' || f.confianza !== 'alta' || sinStock || !prod;
            if (necesitaRev) revisar++;
            if (!f.incluir) continue;
            incluidos++;
            const precio = obtenerPrecioFila(f);
            if (!(precio > 0) || (f.modo === 'catalogo' && !prod) || (f.modo === 'ficticio' && !String(f.nombreFicticio || '').trim())) {
                sinPrecio++;
            }
            totalEst += precio * obtenerUnidadesFila(f);
        }
        return { total: filas.length, incluidos, revisar, ficticios, sinPrecio, totalEst };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filas, prodPorId, tarifaEfectiva, tasaActiva, esMonedaBs]);

    const filasVisibles = useMemo(() => {
        if (filtro === 'ficticio') return filas.filter((f) => f.modo === 'ficticio');
        if (filtro === 'revisar') {
            return filas.filter((f) => {
                const prod = f.productoId ? prodPorId.get(String(f.productoId)) : null;
                const sinStock = f.modo === 'catalogo' && prod && (Number(prod.stockAlmacen) || 0) <= 0;
                return f.modo === 'ficticio' || f.confianza !== 'alta' || sinStock || !prod;
            });
        }
        return filas;
    }, [filas, filtro, prodPorId]);

    const opcionesTarifaCortas = useMemo(
        () => (opcionesTarifa || []).map((o) => ({ value: o.value, label: TARIFA_CORTA[o.value] || o.label })),
        [opcionesTarifa],
    );

    const confirmarImportacion = () => {
        const seleccionadas = filas.filter((f) => f.incluir);
        if (seleccionadas.length === 0) {
            return notifications.show({ color: 'orange', message: 'Selecciona al menos un renglón para agregar.' });
        }

        const errores = [];
        const payload = [];
        for (const f of seleccionadas) {
            const cant = Math.max(1, Math.floor(Number(f.cantidad) || 1));
            if (f.modo === 'ficticio') {
                const nombre = String(f.nombreFicticio || '').trim();
                const precio = Number(f.precioManual);
                if (!nombre) errores.push(`Falta el nombre en «${f.textoOriginal}»`);
                else if (!(precio > 0)) errores.push(`Falta precio para ficticio «${nombre}»`);
                else payload.push({ modo: 'ficticio', nombre, cantidad: cant, precio, aplicaIva: Boolean(f.aplicaIva) });
            } else {
                const prod = f.productoId ? prodPorId.get(String(f.productoId)) : null;
                if (!prod) {
                    errores.push(`Elige un producto o cámbialo a Ficticio en «${f.textoOriginal}»`);
                } else {
                    const precioBase = Number(calcularPrecioInfo?.(prod, tarifaEfectiva)?.precio) || 0;
                    const precio = f.precioManual !== '' && Number(f.precioManual) > 0 ? Number(f.precioManual) : precioBase;
                    if (!(precio > 0)) {
                        errores.push(`El producto «${prod.nombre}» no tiene precio en ${tarifaEfectiva}: escríbelo manualmente o usa Ficticio.`);
                    } else {
                        payload.push({
                            modo: 'catalogo',
                            producto: prod,
                            presentacion: presentacionDe(prod, f.presentacion) ? f.presentacion : 'UNIDAD',
                            cantidad: cant,
                            precioElegido: precio,
                        });
                    }
                }
            }
        }

        if (errores.length > 0) {
            setFiltro('revisar');
            return notifications.show({
                color: 'red',
                title: 'Completa los renglones pendientes',
                message: errores.slice(0, 2).join(' · ') + (errores.length > 2 ? ` (+${errores.length - 2} más)` : ''),
                autoClose: 7000,
            });
        }

        onAplicar?.(payload, meta);
        resetear();
        onClose?.();
    };

    const alternativasDeFila = (fila, prodActual) => {
        const vistos = new Set();
        if (prodActual) vistos.add(prodActual.id);
        const lista = [];
        const add = (p) => {
            if (!p || vistos.has(p.id)) return;
            vistos.add(p.id);
            lista.push(p);
        };
        for (const a of fila.alternativas || []) {
            add(prodPorId.get(String(a.id)));
        }
        const gid = prodActual?.grupoEquivalenciaId || prodActual?.grupoEquivalencia?.id;
        if (gid && porGrupo.has(gid)) {
            porGrupo.get(gid)
                .slice()
                .sort((a, b) => (Number(b.stockAlmacen) || 0) - (Number(a.stockAlmacen) || 0))
                .forEach(add);
        }
        return lista.slice(0, 5);
    };

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            size={isMobile ? undefined : '960px'}
            fullScreen={isMobile}
            centered={!isMobile}
            zIndex={2100}
            classNames={isMobile ? { content: CONTENIDO_SIN_RELLENO } : undefined}
            title={(
                <Group gap={8} wrap="nowrap">
                    <ThemeIcon size={28} radius="md" variant="light" color="indigo">
                        <IconSparkles size={17} />
                    </ThemeIcon>
                    <Box>
                        <Text fw={800} size={isMobile ? 'sm' : 'md'} c="indigo.9" lh={1.15}>
                            Importar presupuesto con Gemini
                        </Text>
                        <Text fz={11} c="dimmed" lh={1.2}>
                            Sube un PDF, Excel o foto y ajusta marcas o faltantes antes de agregar
                        </Text>
                    </Box>
                </Group>
            )}
            styles={{
                header: { padding: isMobile ? '8px 12px' : '12px 16px', borderBottom: '1px solid #e9ecef', minHeight: 50 },
                body: {
                    padding: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    ...(isMobile ? { height: 'calc(100dvh - 50px)' } : { maxHeight: '82dvh' }),
                },
            }}
        >
            <input
                ref={inputRef}
                type="file"
                accept=".pdf,.xlsx,.csv,.tsv,.txt,image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) procesarArchivo(f);
                    e.target.value = '';
                }}
            />

            {fase === 'subir' && (
                <Box p={isMobile ? 'sm' : 'lg'} style={{ flex: 1, overflowY: 'auto' }}>
                    <Stack gap="md">
                        {!tarifaBloqueada && opcionesTarifaCortas.length > 0 && (
                            <Paper withBorder p="xs" radius="md" bg="gray.0">
                                <Text size="xs" fw={700} c="dimmed" mb={6}>
                                    Tarifa inicial para calcular los precios del catálogo:
                                </Text>
                                <SegmentedControl
                                    fullWidth
                                    size="xs"
                                    color={esMonedaBs ? 'teal' : 'blue'}
                                    value={tarifaEfectiva}
                                    onChange={cambiarTarifaDesdeModal}
                                    data={opcionesTarifaCortas}
                                />
                            </Paper>
                        )}

                        <Paper
                            withBorder
                            radius="md"
                            p={isMobile ? 'lg' : 'xl'}
                            bg={arrastrando ? 'indigo.0' : 'gray.0'}
                            style={{
                                borderStyle: 'dashed',
                                borderWidth: 2,
                                borderColor: arrastrando ? 'var(--mantine-color-indigo-6)' : '#ced4da',
                                textAlign: 'center',
                            }}
                            onDragOver={(e) => { e.preventDefault(); if (!cargando) setArrastrando(true); }}
                            onDragLeave={() => setArrastrando(false)}
                            onDrop={(e) => {
                                e.preventDefault();
                                setArrastrando(false);
                                if (cargando) return;
                                const f = e.dataTransfer?.files?.[0];
                                if (f) procesarArchivo(f);
                            }}
                        >
                            {cargando ? (
                                <Stack align="center" gap="sm" py="md">
                                    <Loader size="md" color="indigo" />
                                    <Text fw={700} size="sm" c="indigo.9">
                                        Analizando con Gemini y comparando con el inventario de Mediquir…
                                    </Text>
                                    <Text size="xs" c="dimmed">
                                        Extrayendo renglones, cantidades y marcas disponibles (toma unos segundos)
                                    </Text>
                                </Stack>
                            ) : (
                                <Stack align="center" gap="sm">
                                    <Group gap="xs" justify="center">
                                        <ThemeIcon size={40} radius="xl" variant="light" color="red"><IconFileTypePdf size={22} /></ThemeIcon>
                                        <ThemeIcon size={40} radius="xl" variant="light" color="teal"><IconFileSpreadsheet size={22} /></ThemeIcon>
                                        <ThemeIcon size={40} radius="xl" variant="light" color="blue"><IconPhoto size={22} /></ThemeIcon>
                                    </Group>
                                    <Text fw={700} size={isMobile ? 'sm' : 'md'}>
                                        Sube el pedido o lista del cliente
                                    </Text>
                                    <Text size="xs" c="dimmed" maw={440}>
                                        Compatible con <b>PDF</b>, <b>Excel (.xlsx)</b>, <b>CSV</b> y fotos (JPG, PNG, WEBP). Gemini propondrá los productos de nuestro catálogo y marcará los que no estén en inventario como Ficticio (1010) para que puedas revisarlos.
                                    </Text>
                                    <Button
                                        size={isMobile ? 'md' : 'sm'}
                                        color="indigo"
                                        leftSection={<IconUpload size={18} />}
                                        onClick={() => inputRef.current?.click()}
                                        mt={4}
                                    >
                                        Seleccionar PDF, Excel o foto
                                    </Button>
                                </Stack>
                            )}
                        </Paper>

                        {error && (
                            <Alert color="red" variant="light" icon={<IconAlertTriangle size={18} />} title="No se pudo leer el archivo">
                                <Text size="xs">{error}</Text>
                            </Alert>
                        )}
                    </Stack>
                </Box>
            )}

            {fase === 'revisar' && (
                <>
                    {/* Resumen superior y filtros */}
                    <Box px={isMobile ? 8 : 14} py={8} bg="gray.0" style={{ borderBottom: '1px solid #e9ecef', flexShrink: 0 }}>
                        <Stack gap={6}>
                            <Group justify="space-between" gap="xs" wrap="wrap">
                                <Group gap={6} wrap="wrap">
                                    <Badge size="sm" variant="light" color="indigo">{meta?.archivoNombre || 'Archivo'}</Badge>
                                    <Badge size="sm" variant="light" color="blue">{stats.total} renglones</Badge>
                                    {stats.revisar > 0 && <Badge size="sm" variant="light" color="orange">{stats.revisar} por revisar</Badge>}
                                    {stats.ficticios > 0 && <Badge size="sm" variant="light" color="grape">{stats.ficticios} ficticios</Badge>}
                                </Group>
                                <Button size="compact-xs" variant="subtle" color="gray" onClick={resetear} leftSection={<IconUpload size={13} />}>
                                    Otro archivo
                                </Button>
                            </Group>

                            {meta?.truncado && (
                                <Alert color="yellow" variant="light" p={6}>
                                    <Text size="xs">El archivo superó 120 renglones; se importaron los primeros 120.</Text>
                                </Alert>
                            )}

                            {meta?.clienteSugerido && !clienteActualId && (
                                <Paper withBorder px={8} py={5} radius="sm" bg="blue.0">
                                    <Group justify="space-between" gap="xs" wrap="wrap">
                                        <Text size="xs" c="blue.9" style={{ minWidth: 0 }}>
                                            Cliente detectado: <b>{meta.clienteSugerido}</b>
                                        </Text>
                                        {clienteCoincidente && onSeleccionarCliente && (
                                            <Button
                                                size="compact-xs"
                                                variant="filled"
                                                color="blue"
                                                leftSection={<IconUserCheck size={13} />}
                                                onClick={() => {
                                                    onSeleccionarCliente(clienteCoincidente.id);
                                                    notifications.show({ color: 'teal', message: `Cliente asignado: ${clienteCoincidente.nombre}` });
                                                }}
                                            >
                                                Asignar a {clienteCoincidente.nombre}
                                            </Button>
                                        )}
                                    </Group>
                                </Paper>
                            )}

                            <Group justify="space-between" gap={6} wrap="wrap">
                                <SegmentedControl
                                    size="xs"
                                    value={filtro}
                                    onChange={setFiltro}
                                    data={[
                                        { value: 'todos', label: `Todos (${stats.total})` },
                                        { value: 'revisar', label: `Revisar (${stats.revisar})` },
                                        { value: 'ficticio', label: `Ficticios (${stats.ficticios})` },
                                    ]}
                                />
                                {!tarifaBloqueada && opcionesTarifaCortas.length > 0 && (
                                    <SegmentedControl
                                        size="xs"
                                        color={esMonedaBs ? 'teal' : 'blue'}
                                        value={tarifaEfectiva}
                                        onChange={cambiarTarifaDesdeModal}
                                        data={opcionesTarifaCortas}
                                    />
                                )}
                            </Group>
                        </Stack>
                    </Box>

                    {/* Lista editable de renglones */}
                    <Box px={isMobile ? 8 : 14} py={8} bg="#f5f7fa" style={{ flex: 1, overflowY: 'auto' }}>
                        <Stack gap={8}>
                            {filasVisibles.length === 0 && (
                                <Text size="sm" c="dimmed" ta="center" py="lg">
                                    No hay renglones en este filtro.
                                </Text>
                            )}
                            {filasVisibles.map((fila) => {
                                const prod = fila.modo === 'catalogo' && fila.productoId
                                    ? prodPorId.get(String(fila.productoId))
                                    : null;
                                const stockActual = prod ? (Number(prod.stockAlmacen) || 0) : 0;
                                const sinStock = fila.modo === 'catalogo' && Boolean(prod) && stockActual <= 0;
                                const presentaciones = prod ? presentacionesDe(prod) : [];
                                const presObj = prod ? (presentacionDe(prod, fila.presentacion) || presentaciones[0]) : null;
                                const precioUnit = obtenerPrecioFila(fila);
                                const unidades = obtenerUnidadesFila(fila);
                                const totalLinea = precioUnit * unidades;
                                const alternativas = fila.modo === 'catalogo' ? alternativasDeFila(fila, prod) : [];

                                let badgeEstado;
                                if (!fila.incluir) {
                                    badgeEstado = <Badge size="xs" color="gray" variant="light">Omitido</Badge>;
                                } else if (fila.modo === 'ficticio') {
                                    badgeEstado = (
                                        <Badge size="xs" color="grape" variant="light">
                                            {fila.confianza === 'ninguna' ? 'Sin inventario → Ficticio 1010' : 'Ficticio 1010'}
                                        </Badge>
                                    );
                                } else if (!prod) {
                                    badgeEstado = <Badge size="xs" color="red" variant="light">Elegir producto</Badge>;
                                } else if (sinStock) {
                                    badgeEstado = <Badge size="xs" color="red" variant="filled">Sin stock (0)</Badge>;
                                } else if (fila.confianza === 'alta') {
                                    badgeEstado = <Badge size="xs" color="teal" variant="light">Coincide · {stockActual} disp.</Badge>;
                                } else {
                                    badgeEstado = <Badge size="xs" color="orange" variant="light">Revisar opción · {stockActual} disp.</Badge>;
                                }

                                const bordeIzq = !fila.incluir
                                    ? '#adb5bd'
                                    : fila.modo === 'ficticio'
                                        ? '#ae3ec9'
                                        : sinStock || !prod
                                            ? '#e03131'
                                            : fila.confianza === 'alta'
                                                ? '#0ca678'
                                                : '#f08c00';

                                return (
                                    <Paper
                                        key={fila.uid}
                                        withBorder
                                        radius="sm"
                                        p={isMobile ? 8 : 10}
                                        bg={fila.incluir ? 'white' : 'gray.0'}
                                        style={{
                                            opacity: fila.incluir ? 1 : 0.65,
                                            borderLeft: `4px solid ${bordeIzq}`,
                                        }}
                                    >
                                        <Stack gap={6}>
                                            {/* Cabecera del renglón */}
                                            <Group justify="space-between" align="flex-start" gap={6} wrap="wrap">
                                                <Group gap={8} align="flex-start" wrap="nowrap" style={{ flex: '1 1 240px', minWidth: 0 }}>
                                                    <Checkbox
                                                        mt={2}
                                                        checked={fila.incluir}
                                                        onChange={(e) => actualizarFila(fila.uid, { incluir: e.currentTarget.checked })}
                                                        aria-label={`Incluir ${fila.textoOriginal}`}
                                                    />
                                                    <Box style={{ minWidth: 0 }}>
                                                        <Text size="xs" fw={700} lh={1.25} style={{ wordBreak: 'break-word' }}>
                                                            {fila.textoOriginal}
                                                        </Text>
                                                        <Group gap={4} mt={3} wrap="wrap">
                                                            {badgeEstado}
                                                            <Badge size="xs" variant="outline" color="gray">
                                                                Ped.: {fila.cantidad}{fila.unidadSolicitada ? ` ${fila.unidadSolicitada}` : ''}
                                                            </Badge>
                                                            {fila.marcaSolicitada && (
                                                                <Badge size="xs" variant="outline" color="blue">
                                                                    Marca: {fila.marcaSolicitada}
                                                                </Badge>
                                                            )}
                                                        </Group>
                                                        {fila.motivo && (
                                                            <Text fz={11} c={CONF_COLOR[fila.confianza] || 'dimmed'} mt={2} lh={1.2}>
                                                                {fila.motivo}
                                                            </Text>
                                                        )}
                                                    </Box>
                                                </Group>

                                                <SegmentedControl
                                                    size="xs"
                                                    value={fila.modo}
                                                    disabled={!fila.incluir}
                                                    color={fila.modo === 'ficticio' ? 'grape' : 'blue'}
                                                    onChange={(m) => actualizarFila(fila.uid, {
                                                        modo: m,
                                                        precioManual: '',
                                                    })}
                                                    data={[
                                                        { value: 'catalogo', label: 'Catálogo' },
                                                        { value: 'ficticio', label: 'Ficticio 1010' },
                                                    ]}
                                                />
                                            </Group>

                                            {/* Controles editables */}
                                            {fila.incluir && fila.modo === 'catalogo' && (
                                                <Stack gap={6} pl={isMobile ? 0 : 26}>
                                                    <Select
                                                        size="xs"
                                                        searchable
                                                        clearable
                                                        nothingFoundMessage="Sin coincidencias en catálogo"
                                                        placeholder="Buscar producto o marca en inventario…"
                                                        data={opcionesProducto}
                                                        filter={filtroProductos}
                                                        limit={30}
                                                        value={fila.productoId}
                                                        error={!prod ? 'Elige un producto o cambia a Ficticio 1010' : null}
                                                        onChange={(val) => {
                                                            const nuevo = val ? prodPorId.get(String(val)) : null;
                                                            const presOk = nuevo && presentacionDe(nuevo, fila.presentacion)
                                                                ? fila.presentacion
                                                                : 'UNIDAD';
                                                            actualizarFila(fila.uid, {
                                                                productoId: val || null,
                                                                presentacion: presOk,
                                                                precioManual: '',
                                                                confianza: nuevo ? 'alta' : fila.confianza,
                                                            });
                                                        }}
                                                    />

                                                    {alternativas.length > 0 && (
                                                        <Group gap={4} wrap="wrap">
                                                            <Text fz={10} c="dimmed" fw={700}>Otras marcas / opciones:</Text>
                                                            {alternativas.map((alt) => {
                                                                const st = Number(alt.stockAlmacen) || 0;
                                                                const pAlt = calcularPrecioInfo?.(alt, tarifaEfectiva)?.precio;
                                                                return (
                                                                    <UnstyledButton
                                                                        key={alt.id}
                                                                        onClick={() => {
                                                                            const presOk = presentacionDe(alt, fila.presentacion)
                                                                                ? fila.presentacion
                                                                                : 'UNIDAD';
                                                                            actualizarFila(fila.uid, {
                                                                                productoId: String(alt.id),
                                                                                presentacion: presOk,
                                                                                precioManual: '',
                                                                                confianza: 'alta',
                                                                                motivo: alt.marca?.nombre ? `Marca cambiada a ${alt.marca.nombre}` : 'Opción cambiada',
                                                                            });
                                                                        }}
                                                                        style={{
                                                                            fontSize: 11,
                                                                            padding: '2px 7px',
                                                                            borderRadius: 12,
                                                                            border: `1px solid ${st > 0 ? '#96f2d7' : '#dee2e6'}`,
                                                                            backgroundColor: st > 0 ? '#e6fcf5' : '#f8f9fa',
                                                                            color: st > 0 ? '#087f5b' : '#495057',
                                                                            lineHeight: 1.3,
                                                                        }}
                                                                    >
                                                                        <b>{alt.marca?.nombre || alt.nombre.slice(0, 22)}</b>
                                                                        {` · Disp: ${st}`}
                                                                        {pAlt > 0 ? ` · ${simbolo}${formatNum(pAlt)}` : ''}
                                                                    </UnstyledButton>
                                                                );
                                                            })}
                                                        </Group>
                                                    )}

                                                    <SimpleGrid cols={{ base: 2, sm: presentaciones.length > 1 ? 4 : 3 }} spacing={6}>
                                                        {presentaciones.length > 1 && (
                                                            <Select
                                                                size="xs"
                                                                label="Presentación"
                                                                allowDeselect={false}
                                                                value={presObj?.clave || 'UNIDAD'}
                                                                onChange={(v) => actualizarFila(fila.uid, { presentacion: v || 'UNIDAD' })}
                                                                data={presentaciones.map((p) => ({
                                                                    value: p.clave,
                                                                    label: p.unidades > 1 ? `${p.etiqueta} (${p.unidades} und)` : p.etiqueta,
                                                                }))}
                                                            />
                                                        )}
                                                        <NumberInput
                                                            size="xs"
                                                            label={presObj && presObj.unidades > 1 ? `Cant. (${presObj.plural})` : 'Cantidad'}
                                                            min={1}
                                                            allowDecimal={false}
                                                            allowNegative={false}
                                                            inputMode="numeric"
                                                            value={fila.cantidad}
                                                            onChange={(v) => actualizarFila(fila.uid, { cantidad: Math.max(1, Math.floor(Number(v) || 1)) })}
                                                        />
                                                        <NumberInput
                                                            size="xs"
                                                            label={`Precio/und (${simbolo})`}
                                                            min={0}
                                                            decimalScale={3}
                                                            allowNegative={false}
                                                            hideControls
                                                            inputMode="decimal"
                                                            prefix={simbolo === 'Bs' ? 'Bs ' : '$'}
                                                            value={fila.precioManual !== '' ? fila.precioManual : (precioUnit || '')}
                                                            styles={fila.precioManual !== '' ? { input: { borderColor: '#f08c00', backgroundColor: '#fff9db' } } : undefined}
                                                            onChange={(v) => actualizarFila(fila.uid, { precioManual: v === '' || v === null ? '' : v })}
                                                        />
                                                        <Box style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: 3 }}>
                                                            <Text fz={10} c="dimmed" lh={1.1}>
                                                                {presObj && presObj.unidades > 1 ? `${unidades} und totales` : 'Subtotal renglón'}
                                                            </Text>
                                                            <Text size="xs" fw={800} c="blue.9" lh={1.3}>
                                                                {simbolo}{formatNum(totalLinea)}
                                                            </Text>
                                                        </Box>
                                                    </SimpleGrid>
                                                </Stack>
                                            )}

                                            {fila.incluir && fila.modo === 'ficticio' && (
                                                <Stack gap={6} pl={isMobile ? 0 : 26}>
                                                    <TextInput
                                                        size="xs"
                                                        label="Nombre del renglón ficticio (código 1010)"
                                                        value={fila.nombreFicticio}
                                                        onChange={(e) => actualizarFila(fila.uid, { nombreFicticio: e.currentTarget.value })}
                                                        error={!String(fila.nombreFicticio || '').trim() ? 'Escribe un nombre' : null}
                                                    />
                                                    <Group gap={8} align="flex-end" wrap="wrap">
                                                        <NumberInput
                                                            size="xs"
                                                            w={90}
                                                            label="Cantidad"
                                                            min={1}
                                                            allowDecimal={false}
                                                            allowNegative={false}
                                                            inputMode="numeric"
                                                            value={fila.cantidad}
                                                            onChange={(v) => actualizarFila(fila.uid, { cantidad: Math.max(1, Math.floor(Number(v) || 1)) })}
                                                        />
                                                        <NumberInput
                                                            size="xs"
                                                            w={140}
                                                            label={`Precio unit. (${simbolo})`}
                                                            min={0}
                                                            decimalScale={3}
                                                            allowNegative={false}
                                                            hideControls
                                                            inputMode="decimal"
                                                            prefix={simbolo === 'Bs' ? 'Bs ' : '$'}
                                                            placeholder="Obligatorio"
                                                            value={fila.precioManual}
                                                            error={!(Number(fila.precioManual) > 0) ? 'Ingresa precio' : null}
                                                            onChange={(v) => actualizarFila(fila.uid, { precioManual: v })}
                                                        />
                                                        <Checkbox
                                                            size="xs"
                                                            mb={6}
                                                            color="grape"
                                                            label="Lleva IVA 16%"
                                                            checked={fila.aplicaIva}
                                                            onChange={(e) => actualizarFila(fila.uid, { aplicaIva: e.currentTarget.checked })}
                                                        />
                                                        {Number(fila.precioManual) > 0 && (
                                                            <Text size="xs" fw={800} c="grape.9" mb={6} ml="auto">
                                                                {simbolo}{formatNum(totalLinea)}
                                                            </Text>
                                                        )}
                                                    </Group>
                                                </Stack>
                                            )}
                                        </Stack>
                                    </Paper>
                                );
                            })}
                        </Stack>
                    </Box>

                    {/* Pie fijo */}
                    <Box
                        px={isMobile ? 10 : 14}
                        py={8}
                        bg="white"
                        style={{
                            borderTop: '1px solid #dee2e6',
                            paddingBottom: isMobile ? 'calc(8px + env(safe-area-inset-bottom, 0px))' : 10,
                            flexShrink: 0,
                        }}
                    >
                        <Group justify="space-between" align="center" gap="xs" wrap="wrap">
                            <Box>
                                <Text size="xs" c="dimmed" lh={1.2}>
                                    {stats.incluidos} {stats.incluidos === 1 ? 'renglón seleccionado' : 'renglones seleccionados'}
                                    {stats.sinPrecio > 0 && (
                                        <Text span c="red.7" fw={700}> · {stats.sinPrecio} sin producto/precio</Text>
                                    )}
                                </Text>
                                <Text size="sm" fw={900} c="blue.9" lh={1.2}>
                                    Subtotal est.: {simbolo}{formatNum(stats.totalEst)} <Text span fz={11} fw={500} c="dimmed">(+ IVA según cada ítem)</Text>
                                </Text>
                            </Box>
                            <Group gap="xs" wrap="nowrap">
                                <Button size={isMobile ? 'xs' : 'sm'} variant="default" onClick={onClose} leftSection={<IconX size={15} />}>
                                    Cancelar
                                </Button>
                                <Button
                                    size={isMobile ? 'xs' : 'sm'}
                                    color="teal"
                                    leftSection={<IconCheck size={16} />}
                                    disabled={stats.incluidos === 0}
                                    onClick={confirmarImportacion}
                                >
                                    Agregar {stats.incluidos} al presupuesto
                                </Button>
                            </Group>
                        </Group>
                    </Box>
                </>
            )}
        </Modal>
    );
}
