'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
    ActionIcon, Badge, Box, Button, Checkbox, Divider, Drawer, Group, Loader, Progress, ScrollArea, SegmentedControl, Select, Stack, Text, TextInput, Textarea, ThemeIcon,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { IconChecklist, IconHandStop, IconHistory, IconSend, IconTrash, IconX } from '@tabler/icons-react';
import { COLOR_PRIORIDAD, PRIORIDADES, ABIERTA, etiquetaVencimiento, progresoSubtareas } from '@/app/constants/tareas';
import { formatearFechaHora } from '@/app/constants/hora';

async function pedir(url, opciones) {
    const res = await fetch(url, opciones);
    const cuerpo = await res.json().catch(() => null);
    if (!res.ok) throw new Error(cuerpo?.error || 'No se pudo completar la acción');
    return cuerpo;
}
const enviar = (metodo, cuerpo) => ({ method: metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });

// 'AAAA-MM-DD' <-> Date local (el calendario es de días, sin hora: se arma con el constructor local para no correr un día)
const aFecha = (iso) => (iso ? new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) : null);
const aIso = (d) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null);

// Detalle de una tarea: editar, estado, pasos y conversación con su bitácora
export default function TareaDrawer({ tarea, yo, hoy, asignables, opened, onClose, onCambio }) {
    const queryClient = useQueryClient();
    const [titulo, setTitulo] = useState('');
    const [descripcion, setDescripcion] = useState('');
    const [nuevoPaso, setNuevoPaso] = useState('');
    const [comentario, setComentario] = useState('');
    const [enviando, setEnviando] = useState(false);
    const finConversacion = useRef(null);

    useEffect(() => { if (tarea) { setTitulo(tarea.titulo); setDescripcion(tarea.descripcion || ''); } }, [tarea?.id, tarea?.titulo, tarea?.descripcion]);

    const { data: conversacion, isLoading: cargandoConversacion } = useQuery({
        queryKey: ['tarea-comentarios', tarea?.id],
        enabled: opened && Boolean(tarea?.id),
        queryFn: () => pedir(`/api/tareas/${tarea.id}/comentarios`),
        refetchInterval: opened ? 20000 : false,
    });
    useEffect(() => { finConversacion.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [conversacion?.length]);

    if (!tarea) return null;

    const esCreador = tarea.creadoPorId === yo.userId;
    const esResponsable = tarea.asignadoAId === yo.userId;
    const puedeGestionar = yo.esAdmin || esCreador;
    const puedeAvanzar = puedeGestionar || esResponsable;
    const abierta = ABIERTA(tarea.estado);
    const venc = etiquetaVencimiento(tarea.fechaVencimiento, tarea.estado, hoy);
    const progreso = progresoSubtareas(tarea.subtareas);

    const guardar = async (cambios, mensaje) => {
        try {
            await pedir(`/api/tareas/${tarea.id}`, enviar('PATCH', cambios));
            if (mensaje) notifications.show({ color: 'teal', message: mensaje });
            queryClient.invalidateQueries({ queryKey: ['tareas'] });
            queryClient.invalidateQueries({ queryKey: ['tarea-comentarios', tarea.id] });
            onCambio?.();
        } catch (e) {
            notifications.show({ color: 'red', title: 'No se pudo guardar', message: e.message });
        }
    };

    const marcarPaso = (id, hecha) => guardar({ subtareas: tarea.subtareas.map((s) => (s.id === id ? { ...s, hecha } : s)) });
    const quitarPaso = (id) => guardar({ subtareas: tarea.subtareas.filter((s) => s.id !== id) });
    const agregarPaso = async () => {
        const texto = nuevoPaso.trim();
        if (!texto) return;
        setNuevoPaso('');
        await guardar({ subtareas: [...tarea.subtareas, { texto, hecha: false }] });
    };

    const comentar = async () => {
        const texto = comentario.trim();
        if (!texto) return;
        setEnviando(true);
        try {
            await pedir(`/api/tareas/${tarea.id}/comentarios`, enviar('POST', { texto }));
            setComentario('');
            queryClient.invalidateQueries({ queryKey: ['tarea-comentarios', tarea.id] });
            queryClient.invalidateQueries({ queryKey: ['tareas'] });
        } catch (e) {
            notifications.show({ color: 'red', message: e.message });
        } finally {
            setEnviando(false);
        }
    };

    const eliminar = async () => {
        if (!window.confirm('¿Eliminar esta tarea para siempre? También se borra su conversación.')) return;
        try {
            await pedir(`/api/tareas/${tarea.id}`, { method: 'DELETE' });
            notifications.show({ color: 'orange', message: 'Tarea eliminada' });
            queryClient.invalidateQueries({ queryKey: ['tareas'] });
            onClose();
        } catch (e) {
            notifications.show({ color: 'red', message: e.message });
        }
    };

    const opcionesResponsable = [
        { value: 'general', label: '📢 Equipo (cualquiera la toma)' },
        ...(asignables || []).map((p) => ({ value: String(p.id), label: `${p.nombre} · ${p.puestos}` })),
    ];
    if (tarea.responsable && !opcionesResponsable.some((o) => o.value === String(tarea.responsable.id))) opcionesResponsable.push({ value: String(tarea.responsable.id), label: tarea.responsable.nombre });
    const puedeReasignar = puedeGestionar && (yo.puedeAsignar || yo.esAdmin);

    return (
        <Drawer opened={opened} onClose={onClose} position="right" size="lg" padding="md" title={<Text fw={800} c="navy.9">Tarea #{tarea.id}</Text>} zIndex={400}>
            <Stack gap="md">
                {/* Título y estado */}
                {puedeGestionar ? (
                    <TextInput value={titulo} onChange={(e) => setTitulo(e.currentTarget.value)} maxLength={200} size="md" fw={700}
                        onBlur={() => { if (titulo.trim() && titulo.trim() !== tarea.titulo) guardar({ titulo }); else setTitulo(tarea.titulo); }} />
                ) : <Text fw={800} fz="lg" c="navy.9">{tarea.titulo}</Text>}

                <Group gap="xs">
                    <Badge color={COLOR_PRIORIDAD[tarea.prioridad]} variant="light">{tarea.prioridad}</Badge>
                    <Badge color={venc.color} variant={venc.alerta ? 'filled' : 'light'}>{venc.texto}</Badge>
                    <Text size="xs" c="dimmed">Creada por {tarea.creador?.nombre || '—'} · {formatearFechaHora(tarea.createdAt)}</Text>
                </Group>

                {!tarea.asignadoAId && abierta && (
                    <Button leftSection={<IconHandStop size={16} />} onClick={() => guardar({ accion: 'TOMAR' }, 'Ahora esta tarea es tuya')}>Tomar esta tarea</Button>
                )}

                {tarea.estado === 'Cancelada' ? (
                    <Badge color="red" variant="filled" size="lg">Cancelada</Badge>
                ) : (
                    <SegmentedControl fullWidth disabled={!puedeAvanzar} value={tarea.estado} onChange={(estado) => guardar({ estado })}
                        data={[{ value: 'Pendiente', label: 'Pendiente' }, { value: 'En Progreso', label: 'En progreso' }, { value: 'Completada', label: 'Completada' }]} />
                )}

                {/* Datos */}
                <Group grow align="flex-start">
                    <Select label="Prioridad" data={PRIORIDADES} value={tarea.prioridad} disabled={!puedeGestionar} allowDeselect={false} onChange={(prioridad) => prioridad && guardar({ prioridad })} />
                    <DateInput label="Vence" clearable disabled={!puedeGestionar} valueFormat="DD/MM/YYYY" placeholder="Sin fecha" value={aFecha(tarea.fechaVencimiento)}
                        onChange={(d) => guardar({ fechaVencimiento: aIso(d) })} />
                </Group>
                {puedeReasignar ? (
                    <Select label="Responsable" searchable allowDeselect={false} data={opcionesResponsable} value={tarea.asignadoAId ? String(tarea.asignadoAId) : 'general'}
                        onChange={(v) => v && guardar({ asignadoAId: v === 'general' ? null : Number(v) })} />
                ) : (
                    <Text size="sm"><Text span c="dimmed">Responsable: </Text><b>{tarea.responsable?.nombre || 'Equipo (sin responsable)'}</b></Text>
                )}

                <Textarea label="Descripción" autosize minRows={2} maxRows={8} maxLength={2000} value={descripcion} disabled={!puedeGestionar} placeholder="Detalles, contexto, enlaces…"
                    onChange={(e) => setDescripcion(e.currentTarget.value)} onBlur={() => { if (descripcion !== (tarea.descripcion || '')) guardar({ descripcion }); }} />

                {/* Pasos */}
                <Box>
                    <Group gap="xs" mb={6}>
                        <ThemeIcon size="sm" variant="light" color="teal"><IconChecklist size={14} /></ThemeIcon>
                        <Text fw={700} size="sm">Pasos</Text>
                        {progreso.total > 0 && <Text size="xs" c="dimmed">{progreso.hechas} de {progreso.total}</Text>}
                    </Group>
                    {progreso.total > 0 && <Progress value={progreso.pct} size="sm" color="teal" mb="xs" radius="xl" />}
                    <Stack gap={4}>
                        {tarea.subtareas.map((s) => (
                            <Group key={s.id} gap="xs" wrap="nowrap">
                                <Checkbox checked={s.hecha} disabled={!puedeAvanzar} onChange={(e) => marcarPaso(s.id, e.currentTarget.checked)} color="teal" radius="xl" />
                                <Text size="sm" td={s.hecha ? 'line-through' : undefined} c={s.hecha ? 'dimmed' : undefined} style={{ flex: 1 }}>{s.texto}</Text>
                                {puedeGestionar && <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => quitarPaso(s.id)} aria-label="Quitar paso"><IconX size={14} /></ActionIcon>}
                            </Group>
                        ))}
                    </Stack>
                    {puedeGestionar && (
                        <TextInput mt="xs" size="xs" placeholder="Agregar un paso y pulsar Enter" value={nuevoPaso} onChange={(e) => setNuevoPaso(e.currentTarget.value)} maxLength={200}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarPaso(); } }} />
                    )}
                </Box>

                <Divider />

                {/* Conversación y bitácora */}
                <Box>
                    <Group gap="xs" mb={6}>
                        <ThemeIcon size="sm" variant="light" color="blue"><IconHistory size={14} /></ThemeIcon>
                        <Text fw={700} size="sm">Conversación y actividad</Text>
                    </Group>
                    <ScrollArea.Autosize mah={280} type="auto" offsetScrollbars>
                        {cargandoConversacion ? <Loader size="xs" type="dots" /> : (
                            <Stack gap={6}>
                                {(conversacion || []).map((c) => c.tipo === 'ACTIVIDAD' ? (
                                    <Text key={c.id} size="xs" c="dimmed" ta="center">{c.texto} · {formatearFechaHora(c.createdAt, { year: undefined })}</Text>
                                ) : (
                                    <Box key={c.id} p="xs" bg={c.autorId === yo.userId ? 'blue.0' : 'gray.0'} style={{ borderRadius: 10, alignSelf: c.autorId === yo.userId ? 'flex-end' : 'flex-start', maxWidth: '90%' }}>
                                        <Text size="xs" fw={700} c={c.autorId === yo.userId ? 'blue.8' : 'navy.9'}>{c.autor} <Text span size="xs" c="dimmed" fw={400}>· {formatearFechaHora(c.createdAt, { year: undefined })}</Text></Text>
                                        <Text size="sm" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.texto}</Text>
                                    </Box>
                                ))}
                                <div ref={finConversacion} />
                            </Stack>
                        )}
                    </ScrollArea.Autosize>
                    <Group gap="xs" mt="xs" wrap="nowrap" align="flex-end">
                        <Textarea style={{ flex: 1 }} autosize minRows={1} maxRows={4} placeholder="Escribe un comentario…" value={comentario} maxLength={1000}
                            onChange={(e) => setComentario(e.currentTarget.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); comentar(); } }} />
                        <ActionIcon size="lg" color="blue" loading={enviando} onClick={comentar} aria-label="Enviar comentario"><IconSend size={18} /></ActionIcon>
                    </Group>
                    <Text size="xs" c="dimmed" mt={4}>Quien creó la tarea y su responsable reciben un aviso con cada comentario.</Text>
                </Box>

                {(puedeGestionar || yo.esAdmin) && (
                    <Group justify="space-between">
                        {tarea.estado !== 'Cancelada' && abierta ? <Button variant="subtle" color="gray" size="xs" onClick={() => guardar({ estado: 'Cancelada' }, 'Tarea cancelada')}>Cancelar tarea</Button> : <span />}
                        <Button variant="subtle" color="red" size="xs" leftSection={<IconTrash size={14} />} onClick={eliminar}>Eliminar</Button>
                    </Group>
                )}
            </Stack>
        </Drawer>
    );
}
