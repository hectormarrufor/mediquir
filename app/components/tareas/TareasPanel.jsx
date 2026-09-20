'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
    ActionIcon, Alert, Avatar, Badge, Box, Button, Checkbox, Collapse, Group, Loader, Modal, MultiSelect, Paper, Progress, ScrollArea, SegmentedControl, Select, SimpleGrid,
    Stack, Text, TextInput, Textarea, ThemeIcon, Title, Tooltip, UnstyledButton,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    IconArrowLeft, IconArrowRight, IconChecklist, IconChevronDown, IconChevronUp, IconCircleCheck, IconHandStop, IconLayoutKanban, IconListCheck, IconMessageCircle, IconPlus,
    IconSearch, IconSettings, IconSparkles, IconSun, IconUsers, IconUserShare,
} from '@tabler/icons-react';
import { useAuth } from '@/hooks/useAuth';
import { ABIERTA, COLOR_PRIORIDAD, PRIORIDADES, compararUrgencia, corto, diasHasta, etiquetaVencimiento, interpretarRapida, progresoSubtareas } from '@/app/constants/tareas';
import { formatearFecha } from '@/app/constants/hora';
import TareaDrawer from './TareaDrawer';

async function pedir(url, opciones) {
    const res = await fetch(url, opciones);
    const cuerpo = await res.json().catch(() => null);
    if (!res.ok) throw new Error(cuerpo?.error || 'No se pudo completar la acción');
    return cuerpo;
}
const enviar = (metodo, cuerpo) => ({ method: metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
const iniciales = (nombre) => String(nombre || '?').split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
const aIso = (d) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null);

// ---------------------------------------------------------------------------------------------------------------------------------
// Tarjeta de una tarea
// ---------------------------------------------------------------------------------------------------------------------------------
function TarjetaTarea({ t, yo, hoy, onAbrir, onCompletar, onTomar, onMover, mostrarResponsable = true }) {
    const cerrada = !ABIERTA(t.estado);
    const puedeAvanzar = yo.esAdmin || t.creadoPorId === yo.userId || t.asignadoAId === yo.userId;
    const venc = etiquetaVencimiento(t.fechaVencimiento, t.estado, hoy);
    const prog = progresoSubtareas(t.subtareas);
    const general = !t.asignadoAId;

    return (
        <Paper withBorder radius="md" p="sm" style={{ borderLeft: `4px solid var(--mantine-color-${COLOR_PRIORIDAD[t.prioridad]}-5)`, opacity: cerrada ? 0.65 : 1, background: venc.alerta && !cerrada ? 'var(--mantine-color-red-0)' : undefined }}>
            <Group wrap="nowrap" align="flex-start" gap="sm">
                {general && ABIERTA(t.estado) ? (
                    <Tooltip label="Tomar esta tarea"><ActionIcon color="blue" variant="light" radius="xl" onClick={() => onTomar(t)} aria-label="Tomar tarea"><IconHandStop size={16} /></ActionIcon></Tooltip>
                ) : (
                    <Checkbox mt={2} radius="xl" color="teal" size="md" checked={t.estado === 'Completada'} disabled={!puedeAvanzar || t.estado === 'Cancelada'} onChange={(e) => onCompletar(t, e.currentTarget.checked)} aria-label="Completar tarea" />
                )}
                <UnstyledButton onClick={() => onAbrir(t.id)} style={{ flex: 1, minWidth: 0 }}>
                    <Text fw={700} size="sm" lineClamp={2} td={cerrada ? 'line-through' : undefined} c={t.estado === 'Cancelada' ? 'red.8' : 'navy.9'}>{t.titulo}</Text>
                    <Group gap={6} mt={4} wrap="wrap">
                        {t.prioridad !== 'Media' && <Badge size="xs" variant="light" color={COLOR_PRIORIDAD[t.prioridad]}>{t.prioridad}</Badge>}
                        {t.fechaVencimiento && <Badge size="xs" variant={venc.alerta && !cerrada ? 'filled' : 'light'} color={venc.color}>{venc.texto}</Badge>}
                        {prog.total > 0 && <Badge size="xs" variant="light" color="teal" leftSection={<IconChecklist size={10} />}>{prog.hechas}/{prog.total}</Badge>}
                        {t.comentarios > 0 && <Badge size="xs" variant="light" color="gray" leftSection={<IconMessageCircle size={10} />}>{t.comentarios}</Badge>}
                        {general && <Badge size="xs" variant="gradient" gradient={{ from: 'indigo', to: 'cyan' }}>Equipo</Badge>}
                        {t.estado === 'En Progreso' && <Badge size="xs" variant="dot" color="blue">En progreso</Badge>}
                        {t.estado === 'Cancelada' && <Badge size="xs" color="red">Cancelada</Badge>}
                    </Group>
                    {prog.total > 0 && ABIERTA(t.estado) && <Progress value={prog.pct} size={3} mt={6} color="teal" radius="xl" />}
                </UnstyledButton>
                <Stack gap={4} align="flex-end">
                    {mostrarResponsable && t.responsable && t.asignadoAId !== yo.userId && (
                        <Tooltip label={`Responsable: ${t.responsable.nombre}`}><Avatar size="sm" radius="xl" color="blue">{iniciales(t.responsable.nombre)}</Avatar></Tooltip>
                    )}
                    {onMover && (
                        <Group gap={2} wrap="nowrap">
                            {onMover.atras && <ActionIcon size="sm" variant="subtle" onClick={() => onMover.atras(t)} aria-label="Mover atrás"><IconArrowLeft size={14} /></ActionIcon>}
                            {onMover.adelante && <ActionIcon size="sm" variant="subtle" onClick={() => onMover.adelante(t)} aria-label="Mover adelante"><IconArrowRight size={14} /></ActionIcon>}
                        </Group>
                    )}
                </Stack>
            </Group>
        </Paper>
    );
}

function Grupo({ titulo, color, icono: Icono, cantidad, children, abierto = true }) {
    const [visible, setVisible] = useState(abierto);
    if (!cantidad) return null;
    return (
        <Box>
            <UnstyledButton onClick={() => setVisible((v) => !v)} w="100%" mb={6}>
                <Group gap={6}>
                    {Icono && <ThemeIcon size="sm" variant="light" color={color}><Icono size={13} /></ThemeIcon>}
                    <Text fw={800} size="xs" tt="uppercase" c={`${color}.8`} style={{ letterSpacing: 0.6 }}>{titulo}</Text>
                    <Badge size="xs" variant="light" color={color} circle>{cantidad}</Badge>
                    {visible ? <IconChevronUp size={14} color="var(--mantine-color-gray-6)" /> : <IconChevronDown size={14} color="var(--mantine-color-gray-6)" />}
                </Group>
            </UnstyledButton>
            <Collapse in={visible}><Stack gap={6}>{children}</Stack></Collapse>
        </Box>
    );
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Nueva tarea con todos los campos
// ---------------------------------------------------------------------------------------------------------------------------------
function NuevaTareaModal({ opened, onClose, yo, asignables, onCreada, textoInicial = '' }) {
    const vacio = { titulo: '', descripcion: '', prioridad: 'Media', fecha: null, asignado: 'yo', pasos: '' };
    const [f, setF] = useState(vacio);
    const [guardando, setGuardando] = useState(false);
    useEffect(() => { if (opened) setF({ ...vacio, titulo: textoInicial }); }, [opened]); // eslint-disable-line react-hooks/exhaustive-deps

    const opciones = [
        { value: 'yo', label: 'Yo' },
        { value: 'general', label: '📢 Equipo (cualquiera la toma)' },
        ...(asignables || []).filter((p) => p.id !== yo.userId).map((p) => ({ value: String(p.id), label: `${p.nombre} · ${p.puestos}` })),
    ];

    const crear = async () => {
        if (!f.titulo.trim()) { notifications.show({ color: 'red', message: 'Escribe el título de la tarea' }); return; }
        setGuardando(true);
        try {
            await pedir('/api/tareas', enviar('POST', {
                titulo: f.titulo, descripcion: f.descripcion, prioridad: f.prioridad, fechaVencimiento: aIso(f.fecha),
                asignadoAId: f.asignado === 'yo' ? yo.userId : f.asignado === 'general' ? 'general' : Number(f.asignado),
                subtareas: f.pasos.split('\n').map((s) => s.trim()).filter(Boolean),
            }));
            notifications.show({ color: 'teal', message: 'Tarea creada' });
            onCreada?.();
            onClose();
        } catch (e) {
            notifications.show({ color: 'red', title: 'No se pudo crear', message: e.message });
        } finally {
            setGuardando(false);
        }
    };

    return (
        <Modal opened={opened} onClose={onClose} title={<Text fw={800}>Nueva tarea</Text>} centered zIndex={400}>
            <Stack gap="sm">
                <TextInput label="¿Qué hay que hacer?" data-autofocus value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.currentTarget.value })} maxLength={200} />
                <Textarea label="Detalles (opcional)" autosize minRows={2} maxRows={6} maxLength={2000} value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.currentTarget.value })} />
                <SimpleGrid cols={2}>
                    <Select label="Prioridad" data={PRIORIDADES} value={f.prioridad} allowDeselect={false} onChange={(v) => setF({ ...f, prioridad: v })} />
                    <DateInput label="Vence" clearable valueFormat="DD/MM/YYYY" placeholder="Sin fecha" value={f.fecha} onChange={(d) => setF({ ...f, fecha: d })} />
                </SimpleGrid>
                {yo.puedeAsignar && <Select label="Responsable" searchable allowDeselect={false} data={opciones} value={f.asignado} onChange={(v) => setF({ ...f, asignado: v })} />}
                <Textarea label="Pasos (uno por línea, opcional)" autosize minRows={2} maxRows={8} value={f.pasos} onChange={(e) => setF({ ...f, pasos: e.currentTarget.value })} placeholder={'Llamar al proveedor\nConfirmar precio\nEnviar orden'} />
                <Group justify="flex-end"><Button variant="default" onClick={onClose}>Cancelar</Button><Button loading={guardando} onClick={crear}>Crear tarea</Button></Group>
            </Stack>
        </Modal>
    );
}

// Quién puede asignar tareas (solo el usuario 1 lo configura, como antes)
function ConfigAsignacion({ opened, onClose }) {
    const [permisos, setPermisos] = useState({ departamentos: [], puestos: [] });
    const [departamentos, setDepartamentos] = useState([]);
    const [puestos, setPuestos] = useState([]);
    const [guardando, setGuardando] = useState(false);
    useEffect(() => {
        if (!opened) return;
        (async () => {
            try {
                const [p, d, pu] = await Promise.all([fetch('/api/superuser/permissions'), fetch('/api/rrhh/departamentos'), fetch('/api/rrhh/puestos')]);
                if (p.ok) setPermisos((await p.json())['config:asignar-tareas'] || { departamentos: [], puestos: [] });
                if (d.ok) setDepartamentos((await d.json()).map((x) => x.nombre));
                if (pu.ok) setPuestos((await pu.json()).map((x) => x.nombre));
            } catch (e) { console.error(e); }
        })();
    }, [opened]);
    const guardar = async () => {
        setGuardando(true);
        try {
            await pedir('/api/superuser/permissions', enviar('POST', { 'config:asignar-tareas': permisos }));
            notifications.show({ color: 'teal', message: 'Permisos de asignación actualizados' });
            onClose();
        } catch (e) { notifications.show({ color: 'red', message: e.message }); } finally { setGuardando(false); }
    };
    return (
        <Modal opened={opened} onClose={onClose} title={<Text fw={800}>Quién puede asignar tareas</Text>} centered zIndex={400}>
            <Stack>
                <Text size="sm" c="dimmed">Elige qué departamentos y puestos pueden asignar tareas a su propio departamento. Presidencia y administración siempre pueden asignar a cualquiera.</Text>
                <MultiSelect label="Departamentos" data={departamentos} value={permisos.departamentos || []} onChange={(v) => setPermisos({ ...permisos, departamentos: v })} searchable clearable />
                <MultiSelect label="Puestos" data={puestos} value={permisos.puestos || []} onChange={(v) => setPermisos({ ...permisos, puestos: v })} searchable clearable />
                <Button loading={guardando} onClick={guardar}>Guardar</Button>
            </Stack>
        </Modal>
    );
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Panel principal
// ---------------------------------------------------------------------------------------------------------------------------------
export default function TareasPanel() {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const [vista, setVista] = useState('dia');
    const [alcance, setAlcance] = useState('mias');
    const [busqueda, setBusqueda] = useState('');
    const [rapida, setRapida] = useState('');
    const [abiertaId, setAbiertaId] = useState(null);
    const [modalNueva, setModalNueva] = useState(false);
    const [modalConfig, setModalConfig] = useState(false);
    const [verCompletadas, setVerCompletadas] = useState(false);

    const { data, isLoading, error } = useQuery({
        queryKey: ['tareas'], enabled: Boolean(user?.id),
        queryFn: () => pedir('/api/tareas'), refetchInterval: 60000, refetchOnWindowFocus: true,
    });
    const yo = data?.yo;
    const hoy = data?.hoy;
    const { data: asignables } = useQuery({ queryKey: ['tareas', 'asignables'], enabled: Boolean(yo?.puedeAsignar), queryFn: () => pedir('/api/tareas/asignables'), staleTime: 300000 });

    // Un aviso apunta a /superuser?tarea=ID: se abre esa tarea
    useEffect(() => {
        const id = Number(new URLSearchParams(window.location.search).get('tarea'));
        if (id > 0) setAbiertaId(id);
    }, []);

    const tareas = useMemo(() => data?.tareas || [], [data]);
    const filtro = busqueda.trim().toLowerCase();
    const coincide = (t) => !filtro || t.titulo.toLowerCase().includes(filtro) || (t.descripcion || '').toLowerCase().includes(filtro);

    const mias = useMemo(() => (yo ? tareas.filter((t) => t.asignadoAId === yo.userId) : []), [tareas, yo]);
    const delegadas = useMemo(() => (yo ? tareas.filter((t) => t.creadoPorId === yo.userId && t.asignadoAId && t.asignadoAId !== yo.userId) : []), [tareas, yo]);
    const equipo = useMemo(() => tareas.filter((t) => !t.asignadoAId && ABIERTA(t.estado)), [tareas]);
    const abiertasMias = mias.filter((t) => ABIERTA(t.estado));

    const resumen = useMemo(() => {
        if (!hoy) return { vencidas: 0, hoy: 0, progreso: 0 };
        const conFecha = abiertasMias.filter((t) => t.fechaVencimiento).map((t) => diasHasta(t.fechaVencimiento.slice(0, 10), hoy));
        return { vencidas: conFecha.filter((d) => d < 0).length, hoy: conFecha.filter((d) => d === 0).length, progreso: abiertasMias.filter((t) => t.estado === 'En Progreso').length };
    }, [abiertasMias, hoy]);

    const refrescar = () => queryClient.invalidateQueries({ queryKey: ['tareas'] });

    // Cambios con actualización inmediata en pantalla (si el servidor rechaza, se vuelve a cargar)
    const cambiar = async (id, cuerpo, mensaje) => {
        queryClient.setQueryData(['tareas'], (previo) => previo && ({ ...previo, tareas: previo.tareas.map((t) => (t.id === id ? { ...t, ...(cuerpo.estado ? { estado: cuerpo.estado } : {}) } : t)) }));
        try {
            await pedir(`/api/tareas/${id}`, enviar('PATCH', cuerpo));
            if (mensaje) notifications.show({ color: 'teal', message: mensaje });
        } catch (e) {
            notifications.show({ color: 'red', title: 'No se pudo cambiar', message: e.message });
        } finally {
            refrescar();
        }
    };
    const completar = (t, hecha) => cambiar(t.id, { estado: hecha ? 'Completada' : 'Pendiente' });
    const tomar = (t) => cambiar(t.id, { accion: 'TOMAR' }, 'Ahora esta tarea es tuya');

    // Añadir rápido: "Llamar al proveedor mañana !alta @luis"
    const interpretada = useMemo(() => (rapida.trim() && hoy ? interpretarRapida(rapida, { hoy, personas: yo?.puedeAsignar ? (asignables || []) : [] }) : null), [rapida, hoy, yo, asignables]);
    const crearRapida = async () => {
        if (!interpretada?.titulo) return;
        try {
            await pedir('/api/tareas', enviar('POST', {
                titulo: interpretada.titulo, prioridad: interpretada.prioridad || 'Media', fechaVencimiento: interpretada.fecha,
                asignadoAId: interpretada.asignadoAId ?? yo.userId,
            }));
            setRapida('');
            notifications.show({ color: 'teal', message: interpretada.asignadoNombre ? `Tarea creada para ${interpretada.asignadoNombre}` : 'Tarea creada' });
            refrescar();
        } catch (e) {
            notifications.show({ color: 'red', title: 'No se pudo crear', message: e.message });
        }
    };

    const abierta = tareas.find((t) => t.id === abiertaId) || null;
    // Tarea de un aviso que ya no está en la lista (cerrada hace tiempo): se pide sola
    const { data: tareaSuelta } = useQuery({ queryKey: ['tarea', abiertaId], enabled: Boolean(abiertaId && !abierta && yo), queryFn: () => pedir(`/api/tareas/${abiertaId}`), retry: false });
    const tareaDrawer = abierta || tareaSuelta || null;

    if (!user?.id) return null;

    const tarjeta = (t, extra = {}) => <TarjetaTarea key={t.id} t={t} yo={yo} hoy={hoy} onAbrir={setAbiertaId} onCompletar={completar} onTomar={tomar} {...extra} />;

    // ---- Vista "Mi día" ----
    const vistaDia = () => {
        const ordenadas = abiertasMias.filter(coincide).sort((a, b) => compararUrgencia(a, b, hoy));
        const dias = (t) => (t.fechaVencimiento ? diasHasta(t.fechaVencimiento.slice(0, 10), hoy) : null);
        const vencidas = ordenadas.filter((t) => dias(t) !== null && dias(t) < 0);
        const deHoy = ordenadas.filter((t) => dias(t) === 0);
        const semana = ordenadas.filter((t) => dias(t) !== null && dias(t) >= 1 && dias(t) <= 7);
        const despues = ordenadas.filter((t) => dias(t) !== null && dias(t) > 7);
        const sinFecha = ordenadas.filter((t) => dias(t) === null);
        const completadas = mias.filter((t) => t.estado === 'Completada' && coincide(t)).sort((a, b) => String(b.completadaAt).localeCompare(String(a.completadaAt))).slice(0, 8);
        return (
            <Stack gap="md">
                {ordenadas.length === 0 && (
                    <Stack align="center" gap={4} py="lg">
                        <ThemeIcon size={48} radius="xl" variant="light" color="teal"><IconSparkles size={26} /></ThemeIcon>
                        <Text fw={700} c="navy.9">{filtro ? 'Nada coincide con tu búsqueda' : '¡Todo al día!'}</Text>
                        <Text size="sm" c="dimmed">{filtro ? 'Prueba con otra palabra.' : 'No tienes tareas pendientes. Escribe una arriba para añadirla.'}</Text>
                    </Stack>
                )}
                <Grupo titulo="Vencidas" color="red" icono={IconCircleCheck} cantidad={vencidas.length}>{vencidas.map((t) => tarjeta(t))}</Grupo>
                <Grupo titulo="Para hoy" color="orange" icono={IconSun} cantidad={deHoy.length}>{deHoy.map((t) => tarjeta(t))}</Grupo>
                <Grupo titulo="Esta semana" color="blue" cantidad={semana.length}>{semana.map((t) => tarjeta(t))}</Grupo>
                <Grupo titulo="Más adelante" color="gray" cantidad={despues.length} abierto={false}>{despues.map((t) => tarjeta(t))}</Grupo>
                <Grupo titulo="Sin fecha" color="gray" cantidad={sinFecha.length}>{sinFecha.map((t) => tarjeta(t))}</Grupo>
                {completadas.length > 0 && (
                    <Box>
                        <Button variant="subtle" size="compact-xs" color="gray" onClick={() => setVerCompletadas((v) => !v)} rightSection={verCompletadas ? <IconChevronUp size={12} /> : <IconChevronDown size={12} />}>Completadas recientemente ({completadas.length})</Button>
                        <Collapse in={verCompletadas}><Stack gap={6} mt={6}>{completadas.map((t) => tarjeta(t))}</Stack></Collapse>
                    </Box>
                )}
            </Stack>
        );
    };

    // ---- Vista "Tablero" ----
    const vistaTablero = () => {
        const base = (alcance === 'todas' ? tareas : tareas.filter((t) => t.asignadoAId === yo.userId || t.creadoPorId === yo.userId || !t.asignadoAId)).filter(coincide);
        const hace7 = Date.now() - 7 * 86400000;
        const cols = [
            { estado: 'Pendiente', titulo: 'Pendientes', color: 'gray', lista: base.filter((t) => t.estado === 'Pendiente').sort((a, b) => compararUrgencia(a, b, hoy)) },
            { estado: 'En Progreso', titulo: 'En progreso', color: 'blue', lista: base.filter((t) => t.estado === 'En Progreso').sort((a, b) => compararUrgencia(a, b, hoy)) },
            { estado: 'Completada', titulo: 'Completadas (7 días)', color: 'teal', lista: base.filter((t) => t.estado === 'Completada' && new Date(t.completadaAt || t.updatedAt).getTime() >= hace7) },
        ];
        const orden = ['Pendiente', 'En Progreso', 'Completada'];
        const mover = (t, delta) => cambiar(t.id, { estado: orden[orden.indexOf(t.estado) + delta] });
        const puedeMover = (t) => (yo.esAdmin || t.creadoPorId === yo.userId || t.asignadoAId === yo.userId) && t.asignadoAId;
        return (
            <Stack gap="sm">
                {(yo.esAdmin || yo.puedeAsignar) && <SegmentedControl size="xs" value={alcance} onChange={setAlcance} data={[{ value: 'mias', label: 'Las mías y del equipo' }, { value: 'todas', label: 'Todas' }]} />}
                <SimpleGrid cols={{ base: 1, md: 3 }} spacing="sm">
                    {cols.map((c) => (
                        <Paper key={c.estado} radius="md" p="xs" bg="gray.0" withBorder>
                            <Group justify="space-between" mb={8} px={4}><Text fw={800} size="xs" tt="uppercase" c={`${c.color}.8`}>{c.titulo}</Text><Badge size="sm" circle variant="light" color={c.color}>{c.lista.length}</Badge></Group>
                            <ScrollArea.Autosize mah={460} type="auto" offsetScrollbars>
                                <Stack gap={6}>
                                    {c.lista.map((t) => tarjeta(t, { onMover: puedeMover(t) ? { atras: c.estado !== 'Pendiente' ? (x) => mover(x, -1) : null, adelante: c.estado !== 'Completada' ? (x) => mover(x, 1) : null } : null }))}
                                    {c.lista.length === 0 && <Text size="xs" c="dimmed" ta="center" py="md">Nada por aquí</Text>}
                                </Stack>
                            </ScrollArea.Autosize>
                        </Paper>
                    ))}
                </SimpleGrid>
            </Stack>
        );
    };

    // ---- Vista "Delegadas" (lo que le pedí a otros) ----
    const vistaDelegadas = () => {
        const lista = delegadas.filter(coincide);
        const porPersona = new Map();
        lista.forEach((t) => { const k = t.responsable?.nombre || '—'; if (!porPersona.has(k)) porPersona.set(k, []); porPersona.get(k).push(t); });
        if (!lista.length) return <Text c="dimmed" ta="center" py="lg" size="sm">{filtro ? 'Nada coincide con tu búsqueda.' : 'No le has encargado tareas a nadie todavía.'}</Text>;
        return (
            <Stack gap="md">
                {[...porPersona.entries()].map(([nombre, ts]) => {
                    const cerradas = ts.filter((t) => !ABIERTA(t.estado)).length;
                    return (
                        <Box key={nombre}>
                            <Group gap="xs" mb={6}><Avatar size="sm" radius="xl" color="blue">{iniciales(nombre)}</Avatar><Text fw={800} size="sm" c="navy.9">{nombre}</Text><Text size="xs" c="dimmed">{cerradas} de {ts.length} listas</Text></Group>
                            <Progress value={(cerradas / ts.length) * 100} size={4} color="teal" mb={8} radius="xl" />
                            <Stack gap={6}>{ts.sort((a, b) => compararUrgencia(a, b, hoy)).map((t) => tarjeta(t, { mostrarResponsable: false }))}</Stack>
                        </Box>
                    );
                })}
            </Stack>
        );
    };

    // ---- Vista "Equipo" (tareas sin responsable) ----
    const vistaEquipo = () => {
        const lista = equipo.filter(coincide).sort((a, b) => compararUrgencia(a, b, hoy));
        if (!lista.length) return <Text c="dimmed" ta="center" py="lg" size="sm">No hay tareas generales sin tomar. </Text>;
        return <Stack gap={6}><Alert variant="light" color="indigo" icon={<IconHandStop size={16} />} p="xs"><Text size="xs">Estas tareas son de todos: pulsa la manito para tomar una y hacerla tuya.</Text></Alert>{lista.map((t) => tarjeta(t))}</Stack>;
    };

    const vistas = [
        { value: 'dia', label: <Group gap={4} wrap="nowrap"><IconSun size={14} /> Mi día</Group> },
        { value: 'tablero', label: <Group gap={4} wrap="nowrap"><IconLayoutKanban size={14} /> Tablero</Group> },
        { value: 'delegadas', label: <Group gap={4} wrap="nowrap"><IconUserShare size={14} /> Delegadas{delegadas.filter((t) => ABIERTA(t.estado)).length ? ` (${delegadas.filter((t) => ABIERTA(t.estado)).length})` : ''}</Group> },
        { value: 'equipo', label: <Group gap={4} wrap="nowrap"><IconUsers size={14} /> Equipo{equipo.length ? ` (${equipo.length})` : ''}</Group> },
    ];

    return (
        <Box p={{ base: 'sm', sm: 'lg' }}>
            <Group justify="space-between" mb="sm" wrap="wrap" gap="sm">
                <Group gap="sm">
                    <ThemeIcon variant="gradient" gradient={{ from: 'blue', to: 'cyan' }} size="lg" radius="md"><IconListCheck size={20} /></ThemeIcon>
                    <Box>
                        <Title order={4} c="navy.9" lh={1.1}>Tareas</Title>
                        <Text size="xs" c="dimmed">{hoy ? formatearFecha(hoy) : ''}{yo?.puedeAsignar ? ' · puedes asignar a tu equipo' : ''}</Text>
                    </Box>
                    {yo?.userId === 1 && <ActionIcon variant="subtle" color="blue" onClick={() => setModalConfig(true)} aria-label="Quién puede asignar tareas"><IconSettings size={18} /></ActionIcon>}
                </Group>
                <Group gap="xs">
                    {resumen.vencidas > 0 && <Badge color="red" variant="filled" size="lg" onClick={() => setVista('dia')} style={{ cursor: 'pointer' }}>{resumen.vencidas} vencida{resumen.vencidas === 1 ? '' : 's'}</Badge>}
                    {resumen.hoy > 0 && <Badge color="orange" variant="light" size="lg" onClick={() => setVista('dia')} style={{ cursor: 'pointer' }}>{resumen.hoy} para hoy</Badge>}
                    {resumen.progreso > 0 && <Badge color="blue" variant="light" size="lg">{resumen.progreso} en progreso</Badge>}
                    <Button leftSection={<IconPlus size={16} />} radius="xl" size="xs" onClick={() => setModalNueva(true)}>Nueva tarea</Button>
                </Group>
            </Group>

            {/* Añadir rápido */}
            <Paper withBorder radius="md" p="xs" mb="sm" bg="blue.0" style={{ borderColor: 'var(--mantine-color-blue-2)' }}>
                <TextInput
                    variant="unstyled" size="sm" leftSection={<IconSparkles size={16} color="var(--mantine-color-blue-6)" />} value={rapida} maxLength={220}
                    placeholder={yo?.puedeAsignar ? 'Escribe una tarea… ej: Llamar al proveedor mañana !alta @luis' : 'Escribe una tarea… ej: Ordenar el depósito el viernes !alta'}
                    onChange={(e) => setRapida(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); crearRapida(); } }}
                    rightSection={rapida.trim() ? <ActionIcon size="sm" variant="filled" radius="xl" onClick={crearRapida} aria-label="Crear tarea"><IconPlus size={14} /></ActionIcon> : null}
                />
                {interpretada?.titulo && (
                    <Group gap={6} px={6} pb={2}>
                        <Text size="xs" c="dimmed">Se creará:</Text>
                        <Badge size="sm" variant="white" color="navy" tt="none">{interpretada.titulo}</Badge>
                        {interpretada.prioridad && <Badge size="sm" color={COLOR_PRIORIDAD[interpretada.prioridad]}>{interpretada.prioridad}</Badge>}
                        {interpretada.fecha && <Badge size="sm" color="blue" variant="light">Vence {corto(interpretada.fecha)}</Badge>}
                        {interpretada.asignadoNombre && <Badge size="sm" color="grape" variant="light">Para {interpretada.asignadoNombre}</Badge>}
                        <Text size="xs" c="dimmed">· Enter para crear</Text>
                    </Group>
                )}
            </Paper>

            <Group justify="space-between" mb="sm" wrap="wrap" gap="xs">
                <SegmentedControl size="xs" value={vista} onChange={setVista} data={vistas} />
                <TextInput size="xs" placeholder="Buscar…" leftSection={<IconSearch size={14} />} value={busqueda} onChange={(e) => setBusqueda(e.currentTarget.value)} w={{ base: '100%', sm: 200 }} />
            </Group>

            {isLoading ? <Stack align="center" py="xl"><Loader size="sm" type="dots" /></Stack>
                : error ? <Alert color="red" variant="light">{error.message}</Alert>
                    : !yo ? null
                        : vista === 'dia' ? vistaDia()
                            : vista === 'tablero' ? vistaTablero()
                                : vista === 'delegadas' ? vistaDelegadas()
                                    : vistaEquipo()}

            <NuevaTareaModal opened={modalNueva} onClose={() => setModalNueva(false)} yo={yo || {}} asignables={asignables} onCreada={refrescar} />
            <ConfigAsignacion opened={modalConfig} onClose={() => setModalConfig(false)} />
            {yo && (
                <TareaDrawer tarea={tareaDrawer} yo={yo} hoy={hoy} asignables={asignables} opened={Boolean(abiertaId && tareaDrawer)}
                    onClose={() => { setAbiertaId(null); if (typeof window !== 'undefined' && window.location.search.includes('tarea=')) window.history.replaceState(null, '', window.location.pathname); }} onCambio={refrescar} />
            )}
        </Box>
    );
}
