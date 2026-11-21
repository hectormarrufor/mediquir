'use client';

import React, { useMemo, useState } from 'react';
import {
    Alert, Badge, Box, Button, Card, Center, Checkbox, Divider, Group, Loader, Modal, Paper,
    Select, SimpleGrid, Stack, Stepper, Table, Tabs, Text, Textarea, TextInput, ThemeIcon, Title, UnstyledButton,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
    IconAlertTriangle, IconArrowLeft, IconBuildingStore, IconCheck, IconCircleCheck, IconDeviceFloppy,
    IconEdit, IconFileInvoice, IconHistory, IconPackage, IconPrinter, IconTruckDelivery, IconUserCheck,
} from '@tabler/icons-react';
import { AGENCIAS_ENVIO, AGENCIAS_ENVIO_CON_OTRA } from '@/app/constants/agencias';
import { useEsTelefono } from '@/app/components/ui/modalMovil';
import { useVolver } from '@/app/helpers/useVolver';
import FirmaPad from '@/app/components/ui/FirmaPad';

const SIN_AGENCIA = '__SIN_AGENCIA__';
const fmtFechaHora = (v) => (v ? new Date(v).toLocaleString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'short', timeStyle: 'short' }) : '—');

async function pedirJson(url, opciones) {
    const res = await fetch(url, opciones);
    const cuerpo = await res.json().catch(() => null);
    if (!res.ok) throw new Error(cuerpo?.error || 'No se pudo completar la solicitud');
    return cuerpo;
}

export default function DespachosPendientesPage() {
    const router = useRouter();
    const volver = useVolver('/superuser');
    const queryClient = useQueryClient();
    const telefono = useEsTelefono();

    const [tab, setTab] = useState('agencia');
    const [agenciaElegida, setAgenciaElegida] = useState(null);
    const [seleccionados, setSeleccionados] = useState([]);

    // Modal para que Jolexi / Joalex cambien la agencia de envío de un pedido
    const [editandoAgencia, setEditandoAgencia] = useState(null); // pedido
    const [nuevaAgenciaSel, setNuevaAgenciaSel] = useState('');
    const [nuevaAgenciaOtra, setNuevaAgenciaOtra] = useState('');
    const [nuevoTipoEntrega, setNuevoTipoEntrega] = useState('delivery');
    const [guardandoAgencia, setGuardandoAgencia] = useState(false);

    // Despacho rápido de retiro por cliente en tienda (pickup)
    const [despachandoPickupId, setDespachandoPickupId] = useState(null);

    // Wizard de entrega en lote a la agencia
    const [wizardAbierto, setWizardAbierto] = useState(false);
    const [pasoWizard, setPasoWizard] = useState(0); // 0 = facturas en mano, 1 = chofer + firma, 2 = acta generada
    const [facturasMarcadas, setFacturasMarcadas] = useState({});
    const [confirmaTodasFacturas, setConfirmaTodasFacturas] = useState(false);
    const [choferId, setChoferId] = useState(null);
    const [chofer, setChofer] = useState({ choferNombre: '', choferCedula: '', choferEmpresa: '', observacion: '' });
    const [firma, setFirma] = useState(null);
    const [erroresWizard, setErroresWizard] = useState({});
    const [guardandoChofer, setGuardandoChofer] = useState(false);
    const [enviandoDespacho, setEnviandoDespacho] = useState(false);
    const [actaCreada, setActaCreada] = useState(null);

    const { data, isLoading, error } = useQuery({
        queryKey: ['ventas', 'despachos-pendientes'],
        queryFn: () => pedirJson('/api/ventas/despachos'),
        refetchInterval: 45000,
        refetchOnWindowFocus: true,
    });

    const { data: dataChoferes } = useQuery({
        queryKey: ['choferes-frecuentes'],
        queryFn: async () => {
            const r = await fetch('/api/ventas/choferes');
            const c = await r.json().catch(() => null);
            return r.ok ? c : { choferes: [] };
        },
    });
    const listaChoferes = dataChoferes?.choferes || [];

    const puedeCambiarAgencia = Boolean(data?.puedeCambiarAgencia);
    const pendientesDelivery = data?.pendientesDelivery || [];
    const pendientesPickup = data?.pendientesPickup || [];
    const actas = data?.actas || [];

    // Agrupar pedidos delivery por agencia (siempre mostrando las 4 principales + cualquier otra que tenga paquetes + sin agencia)
    const gruposAgencias = useMemo(() => {
        const mapa = new Map();
        for (const ag of AGENCIAS_ENVIO) mapa.set(ag, []);
        for (const p of pendientesDelivery) {
            const clave = p.agencia?.trim() ? p.agencia.trim() : SIN_AGENCIA;
            if (!mapa.has(clave)) mapa.set(clave, []);
            mapa.get(clave).push(p);
        }
        const lista = [];
        for (const [clave, pedidos] of mapa.entries()) {
            if (clave === SIN_AGENCIA && pedidos.length === 0) continue;
            lista.push({
                clave,
                etiqueta: clave === SIN_AGENCIA ? 'Sin agencia asignada' : clave,
                esSinAgencia: clave === SIN_AGENCIA,
                pedidos,
            });
        }
        return lista;
    }, [pendientesDelivery]);

    const grupoActivo = useMemo(
        () => gruposAgencias.find((g) => g.clave === agenciaElegida) || null,
        [gruposAgencias, agenciaElegida]
    );

    const elegirAgencia = (clave) => {
        setAgenciaElegida(clave);
        const g = gruposAgencias.find((x) => x.clave === clave);
        setSeleccionados((g?.pedidos || []).map((p) => p.id));
    };

    const pedidosSeleccionados = useMemo(() => {
        if (!grupoActivo) return [];
        const setIds = new Set(seleccionados);
        return grupoActivo.pedidos.filter((p) => setIds.has(p.id));
    }, [grupoActivo, seleccionados]);

    const togglePedido = (id) => {
        setSeleccionados((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    };

    const abrirCambioAgencia = (pedido) => {
        setEditandoAgencia(pedido);
        const actual = pedido.agencia?.trim() || '';
        setNuevoTipoEntrega(pedido.tipoEntrega === 'pickup' ? 'delivery' : (pedido.tipoEntrega || 'delivery'));
        if (!actual) {
            setNuevaAgenciaSel('');
            setNuevaAgenciaOtra('');
        } else if (AGENCIAS_ENVIO.includes(actual)) {
            setNuevaAgenciaSel(actual);
            setNuevaAgenciaOtra('');
        } else {
            setNuevaAgenciaSel('Otra agencia / chofer');
            setNuevaAgenciaOtra(actual);
        }
    };

    const guardarCambioAgencia = async () => {
        if (!editandoAgencia) return;
        const agFinal = nuevoTipoEntrega === 'pickup'
            ? ''
            : (nuevaAgenciaSel === 'Otra agencia / chofer' ? nuevaAgenciaOtra.trim() : nuevaAgenciaSel);
        if (nuevoTipoEntrega !== 'pickup' && !agFinal) {
            return notifications.show({ color: 'red', title: 'Falta la agencia', message: 'Selecciona la nueva agencia de envíos.' });
        }
        setGuardandoAgencia(true);
        try {
            await pedirJson('/api/ventas/despachos', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ventaId: editandoAgencia.id, agencia: agFinal, tipoEntrega: nuevoTipoEntrega }),
            });
            notifications.show({
                color: 'teal',
                title: 'Agencia actualizada',
                message: nuevoTipoEntrega === 'pickup'
                    ? `${editandoAgencia.numero} pasó a retiro por cliente en tienda.`
                    : `${editandoAgencia.numero} ahora saldrá con ${agFinal}.`,
            });
            setEditandoAgencia(null);
            await queryClient.invalidateQueries({ queryKey: ['ventas', 'despachos-pendientes'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['vendedor'] });
        } catch (e) {
            notifications.show({ color: 'red', title: 'No se pudo cambiar la agencia', message: e.message });
        } finally {
            setGuardandoAgencia(false);
        }
    };

    const despacharPickup = async (pedido) => {
        setDespachandoPickupId(pedido.id);
        try {
            await pedirJson(`/api/ventas/${pedido.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accion: 'DESPACHAR', quienRetira: 'Retirado por el cliente en tienda', costoFlete: 0 }),
            });
            notifications.show({ color: 'teal', title: 'Despachado', message: `El pedido ${pedido.numero} quedó marcado como retirado por el cliente.` });
            await queryClient.invalidateQueries({ queryKey: ['ventas', 'despachos-pendientes'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['vendedor'] });
        } catch (e) {
            notifications.show({ color: 'red', title: 'No se pudo despachar', message: e.message });
        } finally {
            setDespachandoPickupId(null);
        }
    };

    const abrirWizard = () => {
        if (!pedidosSeleccionados.length) {
            return notifications.show({ color: 'orange', title: 'Selecciona pedidos', message: 'Marca al menos un pedido para entregar a esta agencia.' });
        }
        const agenciaNombre = grupoActivo?.esSinAgencia ? '' : (grupoActivo?.etiqueta || '');
        setPasoWizard(0);
        setFacturasMarcadas({});
        setConfirmaTodasFacturas(false);
        setChoferId(null);
        setChofer({ choferNombre: '', choferCedula: '', choferEmpresa: agenciaNombre, observacion: '' });
        setFirma(null);
        setErroresWizard({});
        setActaCreada(null);
        setWizardAbierto(true);
    };

    const todasFacturasIndivOk = pedidosSeleccionados.length > 0 && pedidosSeleccionados.every((p) => Boolean(facturasMarcadas[p.id]));
    const paso1Listo = todasFacturasIndivOk && confirmaTodasFacturas;

    const marcarTodasFacturas = () => {
        const next = {};
        pedidosSeleccionados.forEach((p) => { next[p.id] = true; });
        setFacturasMarcadas(next);
        setConfirmaTodasFacturas(true);
    };

    // Choferes ordenados priorizando los de la agencia seleccionada
    const choferesOrdenados = useMemo(() => {
        const ag = (grupoActivo?.etiqueta || '').toLowerCase();
        return [...listaChoferes].sort((a, b) => {
            const aMatch = ag && String(a.empresa || '').toLowerCase().includes(ag) ? 1 : 0;
            const bMatch = ag && String(b.empresa || '').toLowerCase().includes(ag) ? 1 : 0;
            if (bMatch !== aMatch) return bMatch - aMatch;
            return (b.entregas || 0) - (a.entregas || 0);
        });
    }, [listaChoferes, grupoActivo?.etiqueta]);

    const seleccionarChofer = (idStr) => {
        setChoferId(idStr);
        if (!idStr) return;
        const ch = listaChoferes.find((c) => String(c.id) === String(idStr));
        if (ch) {
            setChofer((p) => ({
                ...p,
                choferNombre: ch.nombre || '',
                choferCedula: ch.cedula || '',
                choferEmpresa: ch.empresa || p.choferEmpresa || '',
            }));
            setErroresWizard((e) => ({ ...e, choferNombre: null, choferCedula: null, choferEmpresa: null }));
        }
    };

    const guardarChoferActual = async () => {
        if (chofer.choferNombre.trim().length < 3 || chofer.choferCedula.trim().length < 5 || chofer.choferEmpresa.trim().length < 2) {
            return notifications.show({ color: 'orange', title: 'Faltan datos', message: 'Completa nombre, cédula y agencia del chofer antes de guardarlo.' });
        }
        setGuardandoChofer(true);
        try {
            const res = await pedirJson('/api/ventas/choferes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nombre: chofer.choferNombre, cedula: chofer.choferCedula, empresa: chofer.choferEmpresa }),
            });
            await queryClient.invalidateQueries({ queryKey: ['choferes-frecuentes'] });
            if (res?.chofer?.id) setChoferId(String(res.chofer.id));
            notifications.show({ color: 'teal', title: 'Chofer guardado', message: `${chofer.choferNombre} quedó en el directorio de choferes habituales.` });
        } catch (e) {
            notifications.show({ color: 'red', title: 'Error', message: e.message });
        } finally {
            setGuardandoChofer(false);
        }
    };

    const confirmarEntregaAgencia = async () => {
        const err = {};
        if (chofer.choferNombre.trim().length < 3) err.choferNombre = 'Escribe el nombre completo del chofer';
        if (chofer.choferCedula.trim().length < 5) err.choferCedula = 'Escribe la cédula del chofer';
        if (chofer.choferEmpresa.trim().length < 2) err.choferEmpresa = 'Indica la agencia de envíos';
        if (!firma) err.firma = 'Falta la firma del chofer';
        setErroresWizard(err);
        if (Object.keys(err).length) return;

        setEnviandoDespacho(true);
        try {
            const resp = await pedirJson('/api/ventas/despachos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    agencia: grupoActivo?.esSinAgencia ? chofer.choferEmpresa.trim() : grupoActivo?.etiqueta,
                    ventaIds: pedidosSeleccionados.map((p) => p.id),
                    facturasConfirmadas: true,
                    choferNombre: chofer.choferNombre,
                    choferCedula: chofer.choferCedula,
                    choferEmpresa: chofer.choferEmpresa,
                    observacion: chofer.observacion,
                    firma,
                }),
            });
            setActaCreada(resp.acta);
            setPasoWizard(2);
            notifications.show({
                color: 'teal',
                title: `Despacho completado (${resp.acta.numero})`,
                message: `Se entregaron ${pedidosSeleccionados.length} pedido(s) a ${chofer.choferNombre}. Ya puedes imprimir o descargar el Acta PDF.`,
            });
            await queryClient.invalidateQueries({ queryKey: ['ventas', 'despachos-pendientes'] });
            queryClient.invalidateQueries({ queryKey: ['choferes-frecuentes'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['vendedor'] });
            queryClient.invalidateQueries({ queryKey: ['ventas'] });
        } catch (e) {
            notifications.show({ color: 'red', title: 'No se pudo completar la entrega', message: e.message });
        } finally {
            setEnviandoDespacho(false);
        }
    };

    return (
        <Box maw={1200} mx="auto" px={{ base: 'xs', sm: 'md' }} py={{ base: 'xs', sm: 'md' }}>
            <Stack gap="md">
                <Group justify="space-between" align="center" wrap="wrap" gap="xs">
                    <Group gap="xs">
                        <Button variant="subtle" color="gray.3" size={telefono ? 'compact-sm' : 'sm'} leftSection={<IconArrowLeft size={16} />} onClick={volver}>Panel</Button>
                        <Box>
                            <Title order={telefono ? 3 : 2} c="white">Envíos pendientes de despacho</Title>
                            <Text size="xs" c="gray.4">Selecciona la agencia que está en el sitio para entregarle todos sus paquetes y generar el Acta firmada en PDF.</Text>
                        </Box>
                    </Group>
                    <Group gap={6}>
                        <Badge size="lg" variant="filled" color={pendientesDelivery.length ? 'grape' : 'teal'}>
                            {pendientesDelivery.length} por agencia
                        </Badge>
                        {pendientesPickup.length > 0 && (
                            <Badge size="lg" variant="filled" color="blue">
                                {pendientesPickup.length} retiro cliente
                            </Badge>
                        )}
                    </Group>
                </Group>

                {error && <Alert color="red" icon={<IconAlertTriangle size={18} />}>{error.message}</Alert>}

                <Tabs value={tab} onChange={(v) => v && setTab(v)} variant="pills" radius="md">
                    <Paper withBorder p={6} radius="md" bg="white" mb="sm">
                        <Tabs.List grow={telefono}>
                            <Tabs.Tab value="agencia" leftSection={<IconTruckDelivery size={16} />} rightSection={<Badge size="xs" circle color="grape">{pendientesDelivery.length}</Badge>}>
                                Despachar a Agencia
                            </Tabs.Tab>
                            <Tabs.Tab value="pickup" leftSection={<IconBuildingStore size={16} />} rightSection={pendientesPickup.length ? <Badge size="xs" circle color="teal">{pendientesPickup.length}</Badge> : null}>
                                Retiro en tienda
                            </Tabs.Tab>
                            <Tabs.Tab value="actas" leftSection={<IconHistory size={16} />} rightSection={actas.length ? <Badge size="xs" variant="light" color="gray">{actas.length}</Badge> : null}>
                                Actas PDF
                            </Tabs.Tab>
                        </Tabs.List>
                    </Paper>

                    {/* TAB 1: DESPACHAR A AGENCIA */}
                    <Tabs.Panel value="agencia">
                        {isLoading ? (
                            <Center py="xl"><Loader color="white" /></Center>
                        ) : !grupoActivo ? (
                            <Stack gap="sm">
                                <Paper withBorder radius="lg" p={{ base: 'sm', sm: 'md' }} bg="white">
                                    <Group gap="xs" mb="xs">
                                        <ThemeIcon size={36} radius="md" variant="light" color="grape"><IconTruckDelivery size={20} /></ThemeIcon>
                                        <Box>
                                            <Text fw={900} size={telefono ? 'sm' : 'md'} c="navy.9">¿Qué agencia de envíos está en el sitio por retirar?</Text>
                                            <Text size="xs" c="dimmed">Toca la agencia para ver todos los paquetes empacados que le corresponden y entregarlos juntos.</Text>
                                        </Box>
                                    </Group>

                                    <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="sm" mt="sm">
                                        {gruposAgencias.map((g) => {
                                            const n = g.pedidos.length;
                                            return (
                                                <UnstyledButton key={g.clave} onClick={() => elegirAgencia(g.clave)}>
                                                    <Card
                                                        withBorder
                                                        radius="md"
                                                        p="md"
                                                        style={{
                                                            borderWidth: n > 0 ? 2 : 1,
                                                            borderColor: g.esSinAgencia
                                                                ? 'var(--mantine-color-orange-6)'
                                                                : (n > 0 ? 'var(--mantine-color-grape-6)' : 'var(--mantine-color-gray-3)'),
                                                            background: g.esSinAgencia
                                                                ? 'var(--mantine-color-orange-0)'
                                                                : (n > 0 ? 'var(--mantine-color-grape-0)' : 'white'),
                                                            transition: 'transform 120ms ease',
                                                        }}
                                                    >
                                                        <Group justify="space-between" align="center" wrap="nowrap">
                                                            <Box style={{ minWidth: 0 }}>
                                                                <Text fw={800} size="md" c="navy.9" lineClamp={1}>{g.etiqueta}</Text>
                                                                <Text size="xs" c="dimmed" mt={2}>
                                                                    {n === 0
                                                                        ? 'Sin paquetes pendientes'
                                                                        : (n === 1 ? '1 pedido empacado esperando retiro' : `${n} pedidos empacados esperando retiro`)}
                                                                </Text>
                                                            </Box>
                                                            <Badge
                                                                size="xl"
                                                                radius="xl"
                                                                variant="filled"
                                                                color={g.esSinAgencia ? 'orange' : (n > 0 ? 'grape' : 'gray')}
                                                                style={{ flexShrink: 0 }}
                                                            >
                                                                {n}
                                                            </Badge>
                                                        </Group>
                                                    </Card>
                                                </UnstyledButton>
                                            );
                                        })}
                                    </SimpleGrid>
                                </Paper>
                            </Stack>
                        ) : (
                            <Stack gap="sm">
                                <Paper withBorder radius="lg" p={{ base: 'sm', sm: 'md' }} bg="white">
                                    <Group justify="space-between" align="center" wrap="wrap" gap="xs" mb="sm">
                                        <Group gap="xs">
                                            <Button variant="default" size="xs" leftSection={<IconArrowLeft size={14} />} onClick={() => setAgenciaElegida(null)}>
                                                Otras agencias
                                            </Button>
                                            <Title order={4} c="navy.9">{grupoActivo.etiqueta}</Title>
                                            <Badge size="md" color={grupoActivo.esSinAgencia ? 'orange' : 'grape'} variant="filled">
                                                {grupoActivo.pedidos.length} pendiente(s)
                                            </Badge>
                                        </Group>
                                        {grupoActivo.pedidos.length > 0 && (
                                            <Group gap="xs">
                                                <Button
                                                    size="xs"
                                                    variant="subtle"
                                                    onClick={() => setSeleccionados(seleccionados.length === grupoActivo.pedidos.length ? [] : grupoActivo.pedidos.map((p) => p.id))}
                                                >
                                                    {seleccionados.length === grupoActivo.pedidos.length ? 'Desmarcar todos' : 'Seleccionar todos'}
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    color="grape"
                                                    leftSection={<IconTruckDelivery size={18} />}
                                                    disabled={pedidosSeleccionados.length === 0}
                                                    onClick={abrirWizard}
                                                >
                                                    Entregar {pedidosSeleccionados.length} pedido(s)
                                                </Button>
                                            </Group>
                                        )}
                                    </Group>

                                    {grupoActivo.esSinAgencia && (
                                        <Alert color="orange" variant="light" mb="sm" icon={<IconAlertTriangle size={18} />}>
                                            Estos pedidos fueron empacados sin agencia de envíos seleccionada. {puedeCambiarAgencia ? 'Puedes asignarles su agencia aquí con «Cambiar agencia» o entregarlos directamente eligiendo la agencia en el asistente.' : 'Jolexi o Joalex pueden asignarles su agencia, o puedes entregarlos indicando la agencia al chofer.'}
                                        </Alert>
                                    )}

                                    {grupoActivo.pedidos.length === 0 ? (
                                        <Center py="xl">
                                            <Stack align="center" gap="xs">
                                                <IconCircleCheck size={36} color="var(--mantine-color-teal-6)" />
                                                <Text c="dimmed" size="sm">No hay pedidos pendientes de despacho para <b>{grupoActivo.etiqueta}</b>.</Text>
                                            </Stack>
                                        </Center>
                                    ) : (
                                        <Stack gap="xs">
                                            {grupoActivo.pedidos.map((p) => {
                                                const marcado = seleccionados.includes(p.id);
                                                return (
                                                    <Paper
                                                        key={p.id}
                                                        withBorder
                                                        radius="md"
                                                        p="sm"
                                                        style={{
                                                            borderColor: marcado ? 'var(--mantine-color-grape-5)' : undefined,
                                                            background: marcado ? 'var(--mantine-color-grape-0)' : 'white',
                                                        }}
                                                    >
                                                        <Group justify="space-between" align="center" gap="sm" wrap="wrap">
                                                            <Group gap="sm" align="flex-start" wrap="nowrap" style={{ flex: '1 1 240px', minWidth: 0 }}>
                                                                <Checkbox
                                                                    mt={2}
                                                                    color="grape"
                                                                    size="md"
                                                                    checked={marcado}
                                                                    onChange={() => togglePedido(p.id)}
                                                                    aria-label={`Seleccionar ${p.numero}`}
                                                                />
                                                                <Box style={{ minWidth: 0 }}>
                                                                    <Group gap={6} wrap="wrap">
                                                                        <Text fw={800} size="sm" c="navy.9">{p.numero}</Text>
                                                                        <Badge size="xs" variant="light" color={p.tipoDocumento === 'FACTURA' ? 'red' : 'blue'}>
                                                                            {p.tipoDocumento === 'FACTURA' ? 'Factura' : 'Nota de entrega'}
                                                                        </Badge>
                                                                        <Badge size="xs" variant="outline" color="grape">
                                                                            {p.renglones} prod. · {p.articulos} uds.
                                                                        </Badge>
                                                                    </Group>
                                                                    <Text size="sm" fw={600} c="dark.7" mt={2}>{p.cliente}</Text>
                                                                    <Text size="xs" c="dimmed">
                                                                        Empacado: {fmtFechaHora(p.empacadoAt)}{p.empacador ? ` · por ${p.empacador}` : ''}
                                                                    </Text>
                                                                </Box>
                                                            </Group>
                                                            <Group gap={6} wrap="wrap">
                                                                <Button size="xs" variant="default" onClick={() => router.push(`/superuser/ventas/${p.id}`)}>
                                                                    Ver pedido
                                                                </Button>
                                                                {puedeCambiarAgencia && (
                                                                    <Button size="xs" variant="light" color="orange" leftSection={<IconEdit size={14} />} onClick={() => abrirCambioAgencia(p)}>
                                                                        Cambiar agencia
                                                                    </Button>
                                                                )}
                                                            </Group>
                                                        </Group>
                                                    </Paper>
                                                );
                                            })}
                                        </Stack>
                                    )}

                                    {grupoActivo.pedidos.length > 0 && (
                                        <Group justify="flex-end" mt="md">
                                            <Button
                                                fullWidth={telefono}
                                                size="md"
                                                color="grape"
                                                leftSection={<IconTruckDelivery size={18} />}
                                                disabled={pedidosSeleccionados.length === 0}
                                                onClick={abrirWizard}
                                            >
                                                Entregar {pedidosSeleccionados.length} pedido(s) a {grupoActivo.esSinAgencia ? 'la agencia' : grupoActivo.etiqueta}
                                            </Button>
                                        </Group>
                                    )}
                                </Paper>
                            </Stack>
                        )}
                    </Tabs.Panel>

                    {/* TAB 2: RETIRO EN TIENDA POR EL CLIENTE */}
                    <Tabs.Panel value="pickup">
                        <Paper withBorder radius="lg" p={{ base: 'sm', sm: 'md' }} bg="white">
                            <Title order={5} c="navy.9" mb="sm">Pedidos empacados para retiro por el cliente en tienda</Title>
                            {pendientesPickup.length === 0 ? (
                                <Center py="lg">
                                    <Group gap="xs"><IconCircleCheck color="var(--mantine-color-teal-6)" /><Text size="sm" c="dimmed">No hay pedidos esperando retiro por el cliente.</Text></Group>
                                </Center>
                            ) : (
                                <Stack gap="xs">
                                    {pendientesPickup.map((p) => (
                                        <Paper key={p.id} withBorder radius="md" p="sm" bg="gray.0">
                                            <Group justify="space-between" align="center" gap="sm" wrap="wrap">
                                                <Box style={{ minWidth: 0, flex: '1 1 220px' }}>
                                                    <Group gap={6} wrap="wrap">
                                                        <Text fw={800} size="sm" c="navy.9">{p.numero}</Text>
                                                        <Badge size="xs" variant="light" color="teal">Retiro en tienda</Badge>
                                                        <Badge size="xs" variant="outline" color="gray">{p.renglones} prod. · {p.articulos} uds.</Badge>
                                                    </Group>
                                                    <Text size="sm" fw={600} mt={2}>{p.cliente}</Text>
                                                    <Text size="xs" c="dimmed">Empacado: {fmtFechaHora(p.empacadoAt)}</Text>
                                                </Box>
                                                <Group gap={6} wrap="wrap">
                                                    {puedeCambiarAgencia && (
                                                        <Button size="xs" variant="light" color="orange" leftSection={<IconEdit size={14} />} onClick={() => abrirCambioAgencia(p)}>
                                                            Pasar a agencia
                                                        </Button>
                                                    )}
                                                    <Button
                                                        size="sm"
                                                        color="teal.7"
                                                        loading={despachandoPickupId === p.id}
                                                        leftSection={<IconCheck size={16} />}
                                                        onClick={() => despacharPickup(p)}
                                                    >
                                                        Marcar como despachado
                                                    </Button>
                                                </Group>
                                            </Group>
                                        </Paper>
                                    ))}
                                </Stack>
                            )}
                        </Paper>
                    </Tabs.Panel>

                    {/* TAB 3: HISTORIAL DE ACTAS PDF */}
                    <Tabs.Panel value="actas">
                        <Paper withBorder radius="lg" p={{ base: 'sm', sm: 'md' }} bg="white">
                            <Title order={5} c="navy.9" mb="sm">Historial de Actas de Despacho firmadas (PDF)</Title>
                            {actas.length === 0 ? (
                                <Center py="lg"><Text size="sm" c="dimmed">Aún no se ha generado ninguna acta de despacho a agencia.</Text></Center>
                            ) : telefono ? (
                                <Stack gap="xs">
                                    {actas.map((a) => {
                                        const listaVentas = Array.isArray(a.ventas) ? a.ventas : [];
                                        return (
                                            <Card key={a.id} withBorder radius="md" p="sm">
                                                <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs">
                                                    <Box style={{ minWidth: 0 }}>
                                                        <Group gap={6} wrap="wrap">
                                                            <Text fw={900} size="sm" c="navy.9">{a.numero}</Text>
                                                            <Badge size="xs" color="grape" variant="filled">{a.agencia}</Badge>
                                                            <Badge size="xs" color="teal" variant="light">{listaVentas.length} pedido(s)</Badge>
                                                        </Group>
                                                        <Text size="xs" fw={600} mt={4}>Chofer: {a.choferNombre} ({a.choferCedula})</Text>
                                                        <Text fz={11} c="dimmed">{fmtFechaHora(a.createdAt)} · Entregó: {a.entregadoPorNombre || '—'}</Text>
                                                        <Text fz={11} c="blue.8" mt={2} lineClamp={2}>{listaVentas.map((v) => v.numeroDocumento).join(', ')}</Text>
                                                    </Box>
                                                    <Button
                                                        size="xs"
                                                        color="navy.9"
                                                        leftSection={<IconPrinter size={14} />}
                                                        onClick={() => window.open(`/superuser/ventas/despachos/${a.id}/imprimir`, '_blank')}
                                                        style={{ flexShrink: 0 }}
                                                    >
                                                        PDF
                                                    </Button>
                                                </Group>
                                            </Card>
                                        );
                                    })}
                                </Stack>
                            ) : (
                                <Table.ScrollContainer minWidth={720}>
                                    <Table verticalSpacing="xs" highlightOnHover>
                                        <Table.Thead>
                                            <Table.Tr>
                                                <Table.Th>Acta</Table.Th>
                                                <Table.Th>Fecha y hora</Table.Th>
                                                <Table.Th>Agencia</Table.Th>
                                                <Table.Th>Chofer que retiró</Table.Th>
                                                <Table.Th>Pedidos retirados</Table.Th>
                                                <Table.Th>Entregado por</Table.Th>
                                                <Table.Th ta="right">Soporte PDF</Table.Th>
                                            </Table.Tr>
                                        </Table.Thead>
                                        <Table.Tbody>
                                            {actas.map((a) => {
                                                const listaVentas = Array.isArray(a.ventas) ? a.ventas : [];
                                                return (
                                                    <Table.Tr key={a.id}>
                                                        <Table.Td fw={800}>{a.numero}</Table.Td>
                                                        <Table.Td><Text size="xs">{fmtFechaHora(a.createdAt)}</Text></Table.Td>
                                                        <Table.Td><Badge size="sm" color="grape" variant="light">{a.agencia}</Badge></Table.Td>
                                                        <Table.Td>
                                                            <Text size="sm" fw={600}>{a.choferNombre}</Text>
                                                            <Text size="xs" c="dimmed">C.I. {a.choferCedula}</Text>
                                                        </Table.Td>
                                                        <Table.Td>
                                                            <Badge size="xs" color="teal" variant="light" mb={2}>{listaVentas.length} paquete(s)</Badge>
                                                            <Text size="xs" c="dimmed" lineClamp={2} maw={260}>{listaVentas.map((v) => v.numeroDocumento).join(', ')}</Text>
                                                        </Table.Td>
                                                        <Table.Td><Text size="xs">{a.entregadoPorNombre || '—'}</Text></Table.Td>
                                                        <Table.Td ta="right">
                                                            <Button size="xs" color="navy.9" leftSection={<IconPrinter size={14} />} onClick={() => window.open(`/superuser/ventas/despachos/${a.id}/imprimir`, '_blank')}>
                                                                Ver / PDF
                                                            </Button>
                                                        </Table.Td>
                                                    </Table.Tr>
                                                );
                                            })}
                                        </Table.Tbody>
                                    </Table>
                                </Table.ScrollContainer>
                            )}
                        </Paper>
                    </Tabs.Panel>
                </Tabs>
            </Stack>

            {/* MODAL PARA CAMBIAR AGENCIA DE ENVÍO (SOLO JOLEXI / JOALEX / ADMIN PRINCIPAL) */}
            <Modal
                opened={Boolean(editandoAgencia)}
                onClose={() => setEditandoAgencia(null)}
                centered
                title={<Text fw={800}>Cambiar agencia de envío · {editandoAgencia?.numero}</Text>}
            >
                <Stack gap="sm">
                    <Text size="xs" c="dimmed">
                        Cliente: <b>{editandoAgencia?.cliente}</b>
                    </Text>
                    <Select
                        label="Tipo de retiro"
                        allowDeselect={false}
                        data={[
                            { value: 'delivery', label: 'Despacho por agencia de envíos / chofer' },
                            { value: 'pickup', label: 'El cliente lo retira en tienda' },
                        ]}
                        value={nuevoTipoEntrega}
                        onChange={(v) => v && setNuevoTipoEntrega(v)}
                    />
                    {nuevoTipoEntrega !== 'pickup' && (
                        <>
                            <Select
                                label="Nueva agencia de envíos"
                                placeholder="Selecciona la agencia…"
                                withAsterisk
                                allowDeselect={false}
                                data={AGENCIAS_ENVIO_CON_OTRA}
                                value={nuevaAgenciaSel || null}
                                onChange={(v) => setNuevaAgenciaSel(v || '')}
                            />
                            {nuevaAgenciaSel === 'Otra agencia / chofer' && (
                                <TextInput
                                    label="Nombre de la agencia o transporte"
                                    placeholder="Ej: MRW, Tealca, transporte propio…"
                                    withAsterisk
                                    value={nuevaAgenciaOtra}
                                    onChange={(e) => setNuevaAgenciaOtra(e.currentTarget.value)}
                                />
                            )}
                        </>
                    )}
                    <Group justify="flex-end" mt="xs">
                        <Button variant="default" onClick={() => setEditandoAgencia(null)}>Cancelar</Button>
                        <Button color="orange" loading={guardandoAgencia} onClick={guardarCambioAgencia}>Guardar cambio</Button>
                    </Group>
                </Stack>
            </Modal>

            {/* WIZARD DE ENTREGA DE LOTE A LA AGENCIA */}
            <Modal
                opened={wizardAbierto}
                onClose={() => { if (!enviandoDespacho) setWizardAbierto(false); }}
                fullScreen={telefono}
                size="lg"
                centered
                closeOnClickOutside={false}
                title={
                    <Group gap="xs">
                        <IconTruckDelivery size={20} color="var(--mantine-color-grape-7)" />
                        <Text fw={800}>
                            Entrega a {grupoActivo?.esSinAgencia ? 'agencia de envíos' : grupoActivo?.etiqueta} ({pedidosSeleccionados.length} pedido{pedidosSeleccionados.length === 1 ? '' : 's'})
                        </Text>
                    </Group>
                }
            >
                <Stack gap="md">
                    <Stepper active={pasoWizard} color="grape" size="sm">
                        <Stepper.Step label="Facturas en mano" description="Verifica los documentos" />
                        <Stepper.Step label="Chofer y firma" description="Datos y conformidad" />
                        <Stepper.Completed>
                            <Stack align="center" gap="md" py="md">
                                <ThemeIcon size={64} radius="xl" color="teal" variant="light">
                                    <IconCircleCheck size={40} />
                                </ThemeIcon>
                                <Box ta="center">
                                    <Title order={3} c="navy.9">¡Despacho entregado y firmado!</Title>
                                    <Text size="sm" c="dimmed" mt={4}>
                                        Acta <b>{actaCreada?.numero}</b> · Agencia <b>{actaCreada?.agencia}</b> · Chofer <b>{actaCreada?.choferNombre}</b>
                                    </Text>
                                </Box>
                                <Group justify="center" gap="sm" w="100%">
                                    <Button
                                        size="md"
                                        color="navy.9"
                                        leftSection={<IconPrinter size={18} />}
                                        onClick={() => window.open(`/superuser/ventas/despachos/${actaCreada?.id}/imprimir`, '_blank')}
                                    >
                                        Imprimir / Descargar PDF ({actaCreada?.numero})
                                    </Button>
                                    <Button
                                        size="md"
                                        variant="default"
                                        onClick={() => { setWizardAbierto(false); setAgenciaElegida(null); }}
                                    >
                                        Volver a despachos
                                    </Button>
                                </Group>
                            </Stack>
                        </Stepper.Completed>
                    </Stepper>

                    {/* PASO 1: VERIFICAR FACTURAS DE TODOS LOS PEDIDOS */}
                    {pasoWizard === 0 && (
                        <Stack gap="sm">
                            <Alert color="orange" variant="light" icon={<IconFileInvoice size={20} />} title="Verifica las facturas impresas antes de entregar">
                                Marca cada pedido para confirmar que tienes en la mano su factura o nota impresa lista para entregársela al chofer.
                            </Alert>

                            <Group justify="space-between" align="center">
                                <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                                    Pedidos incluidos en este despacho ({pedidosSeleccionados.length})
                                </Text>
                                <Button size="compact-xs" variant="light" color="teal" onClick={marcarTodasFacturas}>
                                    Confirmar todas
                                </Button>
                            </Group>

                            <Stack gap={6}>
                                {pedidosSeleccionados.map((p) => (
                                    <Paper
                                        key={p.id}
                                        withBorder
                                        radius="md"
                                        p="xs"
                                        style={{
                                            borderColor: facturasMarcadas[p.id] ? 'var(--mantine-color-teal-5)' : undefined,
                                            background: facturasMarcadas[p.id] ? 'var(--mantine-color-teal-0)' : 'white',
                                        }}
                                    >
                                        <Checkbox
                                            color="teal"
                                            size="md"
                                            checked={Boolean(facturasMarcadas[p.id])}
                                            onChange={(e) => setFacturasMarcadas((prev) => ({ ...prev, [p.id]: e.currentTarget.checked }))}
                                            label={
                                                <Box>
                                                    <Group gap={6}>
                                                        <Text fw={800} size="sm" c="navy.9">{p.numero}</Text>
                                                        <Badge size="xs" variant="light" color={p.tipoDocumento === 'FACTURA' ? 'red' : 'blue'}>
                                                            {p.tipoDocumento === 'FACTURA' ? 'Factura' : 'Nota de entrega'}
                                                        </Badge>
                                                        <Text size="xs" c="dimmed">{p.articulos} uds.</Text>
                                                    </Group>
                                                    <Text size="xs" c="dark.7">{p.cliente}</Text>
                                                </Box>
                                            }
                                        />
                                    </Paper>
                                ))}
                            </Stack>

                            <Divider />

                            <Checkbox
                                color="grape"
                                size="md"
                                checked={confirmaTodasFacturas}
                                onChange={(e) => setConfirmaTodasFacturas(e.currentTarget.checked)}
                                label={
                                    <Text size="sm" fw={700}>
                                        ¿Tienes a la mano las facturas/notas de TODOS estos {pedidosSeleccionados.length} pedido(s) para entregarlas al chofer junto con los paquetes?
                                    </Text>
                                }
                            />

                            <Group justify="flex-end" mt="xs">
                                <Button variant="default" onClick={() => setWizardAbierto(false)}>Cancelar</Button>
                                <Button color="grape" size="md" disabled={!paso1Listo} onClick={() => setPasoWizard(1)}>
                                    Siguiente: Datos del chofer y firma →
                                </Button>
                            </Group>
                        </Stack>
                    )}

                    {/* PASO 2: DATOS DEL CHOFER + FIRMA */}
                    {pasoWizard === 1 && (
                        <Stack gap="sm">
                            <Paper withBorder radius="md" p="xs" bg="gray.0">
                                <Group justify="space-between" mb={4} wrap="wrap" gap={4}>
                                    <Group gap={6}>
                                        <IconUserCheck size={16} color="var(--mantine-color-grape-7)" />
                                        <Text size="xs" fw={800} c="navy.9">Choferes habituales de Mediquir</Text>
                                    </Group>
                                    <Badge size="xs" variant="light" color="grape">{choferesOrdenados.length} registrado(s)</Badge>
                                </Group>
                                <Select
                                    placeholder={choferesOrdenados.length ? 'Seleccionar chofer habitual (o escribir nuevo abajo)…' : 'Aún no hay choferes guardados'}
                                    searchable
                                    clearable
                                    value={choferId}
                                    onChange={seleccionarChofer}
                                    data={choferesOrdenados.map((c) => ({
                                        value: String(c.id),
                                        label: `${c.nombre} · C.I. ${c.cedula} · ${c.empresa}`,
                                    }))}
                                    nothingFoundMessage="No está registrado: llena los datos abajo y quedará guardado"
                                />
                            </Paper>

                            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
                                <TextInput
                                    label="Nombre completo del chofer"
                                    withAsterisk
                                    placeholder="Nombre y apellido"
                                    value={chofer.choferNombre}
                                    onChange={(e) => setChofer((p) => ({ ...p, choferNombre: e.currentTarget.value }))}
                                    error={erroresWizard.choferNombre}
                                    maxLength={120}
                                />
                                <TextInput
                                    label="Cédula del chofer"
                                    withAsterisk
                                    placeholder="V-12345678"
                                    value={chofer.choferCedula}
                                    onChange={(e) => setChofer((p) => ({ ...p, choferCedula: e.currentTarget.value }))}
                                    error={erroresWizard.choferCedula}
                                    maxLength={30}
                                />
                            </SimpleGrid>

                            <Group align="flex-end" gap="xs" wrap="wrap">
                                <Box style={{ flex: '1 1 220px' }}>
                                    <TextInput
                                        label="Agencia de envíos / transporte"
                                        withAsterisk
                                        value={chofer.choferEmpresa}
                                        onChange={(e) => setChofer((p) => ({ ...p, choferEmpresa: e.currentTarget.value }))}
                                        error={erroresWizard.choferEmpresa}
                                        maxLength={120}
                                    />
                                </Box>
                                <Button variant="light" color="grape" size="sm" loading={guardandoChofer} leftSection={<IconDeviceFloppy size={16} />} onClick={guardarChoferActual}>
                                    Guardar chofer
                                </Button>
                            </Group>

                            <Textarea
                                label="Observación (opcional)"
                                placeholder="Ej: Placa del vehículo, cantidad total de cajas selladas…"
                                autosize
                                minRows={1}
                                maxRows={3}
                                value={chofer.observacion}
                                onChange={(e) => setChofer((p) => ({ ...p, observacion: e.currentTarget.value }))}
                            />

                            <Text size="sm" fw={700}>Firma del chofer recibiendo los {pedidosSeleccionados.length} paquete(s) y sus facturas *</Text>
                            <FirmaPad onChange={setFirma} error={erroresWizard.firma} />

                            <Group justify="space-between" mt="xs" wrap="wrap">
                                <Button variant="default" disabled={enviandoDespacho} onClick={() => setPasoWizard(0)}>← Volver a facturas</Button>
                                <Button
                                    color="grape"
                                    size="md"
                                    loading={enviandoDespacho}
                                    leftSection={<IconPackage size={18} />}
                                    onClick={confirmarEntregaAgencia}
                                >
                                    Confirmar entrega y generar PDF
                                </Button>
                            </Group>
                        </Stack>
                    )}
                </Stack>
            </Modal>
        </Box>
    );
}
