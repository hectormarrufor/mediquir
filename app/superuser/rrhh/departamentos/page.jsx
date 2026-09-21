// app/superuser/rrhh/departamentos/page.jsx
'use client';

import React, { useMemo, useState } from 'react';
import { ActionIcon, Alert, Avatar, Badge, Box, Button, Card, Group, Menu, Modal, SimpleGrid, Skeleton, Stack, Text, TextInput, Textarea, ThemeIcon, Title, Tooltip } from '@mantine/core';
import { useDebouncedValue, useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { IconAlertCircle, IconBriefcase, IconBuilding, IconDotsVertical, IconEdit, IconPlus, IconRefresh, IconSearch, IconTrash, IconUserExclamation, IconUsers } from '@tabler/icons-react';
import { useAuth } from '@/hooks/useAuth';
import Kpis from '../_components/Kpis';

const BLOB = process.env.NEXT_PUBLIC_BLOB_BASE_URL;
const vigente = (e) => e.estado !== 'Retirado' && e.estado !== 'Inactivo';

const pedir = async (url) => {
    const res = await fetch(url);
    const cuerpo = await res.json().catch(() => null);
    if (!res.ok) throw new Error(cuerpo?.message || 'No se pudo cargar');
    return cuerpo;
};

// Personal único (sin repetir a quien tiene varios cargos en el mismo departamento)
function personalDe(depto) {
    const mapa = new Map();
    depto.puestos.forEach((p) => p.empleados.filter(vigente).forEach((e) => mapa.set(e.id, e)));
    return [...mapa.values()];
}

function TarjetaDepartamento({ d, esAdmin, onEditar, onEliminar }) {
    const equipo = d.equipo;
    const vacantes = d.puestos.filter((p) => !p.empleados.some(vigente)).length;
    return (
        <Card withBorder radius="md" p="md" bg="white" style={{ display: 'flex', flexDirection: 'column' }}>
            <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                    <ThemeIcon size={40} radius="md" variant="light" color="violet"><IconBuilding size={22} /></ThemeIcon>
                    <Box style={{ minWidth: 0 }}>
                        <Text fw={800} lh={1.2} truncate>{d.nombre}</Text>
                        <Text size="xs" c="dimmed" lineClamp={2}>{d.descripcion || 'Sin descripción'}</Text>
                    </Box>
                </Group>
                {esAdmin && (
                    <Menu position="bottom-end" withinPortal shadow="md">
                        <Menu.Target><ActionIcon variant="subtle" color="gray" aria-label="Acciones"><IconDotsVertical size={16} /></ActionIcon></Menu.Target>
                        <Menu.Dropdown>
                            <Menu.Item leftSection={<IconEdit size={14} />} onClick={() => onEditar(d)}>Editar</Menu.Item>
                            <Menu.Item component={Link} href="/superuser/rrhh/puestos/nuevo" leftSection={<IconPlus size={14} />}>Agregar puesto</Menu.Item>
                            <Menu.Divider />
                            <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => onEliminar(d)}>Eliminar</Menu.Item>
                        </Menu.Dropdown>
                    </Menu>
                )}
            </Group>

            <Group gap="xs" mt="sm">
                <Badge variant="light" color="teal" leftSection={<IconBriefcase size={12} />}>{d.puestos.length} {d.puestos.length === 1 ? 'puesto' : 'puestos'}</Badge>
                <Badge variant="light" color="blue" leftSection={<IconUsers size={12} />}>{equipo.length} {equipo.length === 1 ? 'persona' : 'personas'}</Badge>
                {vacantes > 0 && <Badge variant="light" color="orange">{vacantes} {vacantes === 1 ? 'vacante' : 'vacantes'}</Badge>}
            </Group>

            {equipo.length > 0 && (
                <Avatar.Group spacing="sm" mt="sm">
                    {equipo.slice(0, 7).map((e) => (
                        <Tooltip key={e.id} label={`${e.nombre} ${e.apellido}`}>
                            <Avatar component={Link} href={`/superuser/rrhh/empleados/${e.id}`} size={30} radius="xl" src={e.imagen ? `${BLOB}/${e.imagen}` : null}>{e.nombre?.charAt(0)}</Avatar>
                        </Tooltip>
                    ))}
                    {equipo.length > 7 && <Avatar size={30} radius="xl">+{equipo.length - 7}</Avatar>}
                </Avatar.Group>
            )}

            <Stack gap={4} mt="sm" style={{ maxHeight: 220, overflow: 'auto' }}>
                {d.puestos.length === 0 && <Text size="xs" c="dimmed">Aún no tiene puestos.</Text>}
                {d.puestos.map((p) => {
                    const n = p.empleados.filter(vigente).length;
                    return (
                        <Group key={p.id} justify="space-between" wrap="nowrap" py={3} style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
                            <Text size="sm" truncate>{p.nombre}</Text>
                            {n ? <Badge size="sm" variant="light" color="blue">{n}</Badge> : <Badge size="sm" variant="outline" color="orange">Vacante</Badge>}
                        </Group>
                    );
                })}
            </Stack>
        </Card>
    );
}

export default function DepartamentosPage() {
    const isMobile = useMediaQuery('(max-width: 48em)');
    const { rolUsuario } = useAuth();
    const esAdmin = rolUsuario === 'admin';
    const { data, isLoading, isFetching, error, refetch } = useQuery({ queryKey: ['rrhh', 'departamentos'], queryFn: () => pedir('/api/rrhh/departamentos') });
    const { data: empleados } = useQuery({ queryKey: ['rrhh', 'empleados'], queryFn: () => pedir('/api/rrhh/empleados') });

    const [busqueda, setBusqueda] = useState('');
    const [q] = useDebouncedValue(busqueda.trim().toLowerCase(), 200);
    const [edicion, setEdicion] = useState(null); // { id?, nombre, descripcion }
    const [guardando, setGuardando] = useState(false);
    const [aEliminar, setAEliminar] = useState(null);

    const deptos = useMemo(() => (data || []).map((d) => ({ ...d, equipo: personalDe(d) })), [data]);
    const filtrados = useMemo(() => deptos.filter((d) => !q || [d.nombre, d.descripcion, ...d.puestos.map((p) => p.nombre)].some((x) => String(x || '').toLowerCase().includes(q))), [deptos, q]);

    const kpi = useMemo(() => ({
        deptos: deptos.length,
        puestos: deptos.reduce((s, d) => s + d.puestos.length, 0),
        personal: new Set(deptos.flatMap((d) => d.equipo.map((e) => e.id))).size,
        vacantes: deptos.reduce((s, d) => s + d.puestos.filter((p) => !p.empleados.some(vigente)).length, 0),
        sinCargo: Array.isArray(empleados) ? empleados.filter((e) => vigente(e) && !(e.puestos || []).length).length : null,
    }), [deptos, empleados]);

    const guardar = async () => {
        if (!edicion.nombre?.trim()) return notifications.show({ color: 'orange', message: 'Escribe el nombre del departamento' });
        setGuardando(true);
        try {
            const res = await fetch(edicion.id ? `/api/rrhh/departamentos/${edicion.id}` : '/api/rrhh/departamentos', {
                method: edicion.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nombre: edicion.nombre, descripcion: edicion.descripcion }),
            });
            const cuerpo = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(cuerpo.message || 'No se pudo guardar');
            notifications.show({ color: 'teal', message: edicion.id ? 'Departamento actualizado' : 'Departamento creado' });
            setEdicion(null);
            refetch();
        } catch (e) {
            notifications.show({ color: 'red', title: 'No se guardó', message: e.message });
        } finally {
            setGuardando(false);
        }
    };

    const eliminar = async () => {
        setGuardando(true);
        try {
            const res = await fetch(`/api/rrhh/departamentos/${aEliminar.id}`, { method: 'DELETE' });
            const cuerpo = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(cuerpo.message || 'No se pudo eliminar');
            notifications.show({ color: 'teal', message: `"${aEliminar.nombre}" eliminado` });
            setAEliminar(null);
            refetch();
        } catch (e) {
            notifications.show({ color: 'red', title: 'No se eliminó', message: e.message });
        } finally {
            setGuardando(false);
        }
    };

    return (
        <Box px={isMobile ? 'xs' : 6} py={isMobile ? 'xs' : 'sm'} w="100%">
            <Group justify="space-between" align="flex-end" mb="sm">
                <Box>
                    <Title order={2} c="white" fz={isMobile ? 22 : 28} tt="none" pb={0}>Departamentos</Title>
                    <Text size="sm" c="gray.4">Áreas de la empresa, sus puestos y el equipo que las integra</Text>
                </Box>
                {esAdmin && <Button variant="white" leftSection={<IconPlus size={18} />} onClick={() => setEdicion({ nombre: '', descripcion: '' })}>Nuevo departamento</Button>}
            </Group>

            <Kpis columnas={5} cargando={isLoading} tarjetas={[
                { key: 'd', label: 'Departamentos', valor: kpi.deptos, icono: IconBuilding, color: 'violet' },
                { key: 'p', label: 'Puestos', valor: kpi.puestos, icono: IconBriefcase, color: 'teal' },
                { key: 'e', label: 'Personal asignado', valor: kpi.personal, icono: IconUsers, color: 'blue' },
                { key: 'v', label: 'Puestos vacantes', valor: kpi.vacantes, icono: IconUserExclamation, color: 'orange' },
                { key: 's', label: 'Empleados sin cargo', valor: kpi.sinCargo ?? '…', icono: IconUsers, color: 'red', detalle: 'No pertenecen a ningún departamento' },
            ]} />

            <Group gap="xs" mb="sm">
                <TextInput flex={1} maw={420} size="xs" placeholder="Buscar departamento o puesto…" leftSection={<IconSearch size={14} />} value={busqueda} onChange={(e) => setBusqueda(e.currentTarget.value)} />
                <Tooltip label="Actualizar"><ActionIcon variant="white" size="md" loading={isFetching} onClick={() => refetch()} aria-label="Actualizar"><IconRefresh size={16} /></ActionIcon></Tooltip>
            </Group>

            {error ? <Alert color="red" icon={<IconAlertCircle size={18} />} variant="light" title="No se pudo cargar">{error.message}</Alert>
                : isLoading ? <SimpleGrid cols={{ base: 1, sm: 2, xl: 3 }}>{[0, 1, 2].map((i) => <Skeleton key={i} h={260} radius="md" />)}</SimpleGrid>
                    : filtrados.length === 0 ? <Text c="gray.4" ta="center" py="xl">No hay departamentos con esa búsqueda.</Text>
                        : (
                            <SimpleGrid cols={{ base: 1, sm: 2, xl: 3 }} spacing="sm">
                                {filtrados.map((d) => <TarjetaDepartamento key={d.id} d={d} esAdmin={esAdmin} onEditar={(x) => setEdicion({ id: x.id, nombre: x.nombre, descripcion: x.descripcion || '' })} onEliminar={setAEliminar} />)}
                            </SimpleGrid>
                        )}

            <Modal opened={Boolean(edicion)} onClose={() => setEdicion(null)} title={edicion?.id ? 'Editar departamento' : 'Nuevo departamento'} centered>
                <Stack>
                    <TextInput label="Nombre" data-autofocus value={edicion?.nombre || ''} onChange={(e) => setEdicion({ ...edicion, nombre: e.currentTarget.value })} />
                    <Textarea label="Descripción" autosize minRows={3} value={edicion?.descripcion || ''} onChange={(e) => setEdicion({ ...edicion, descripcion: e.currentTarget.value })} />
                    <Group justify="flex-end">
                        <Button variant="default" onClick={() => setEdicion(null)}>Cancelar</Button>
                        <Button loading={guardando} onClick={guardar}>Guardar</Button>
                    </Group>
                </Stack>
            </Modal>

            <Modal opened={Boolean(aEliminar)} onClose={() => setAEliminar(null)} title="Eliminar departamento" centered>
                <Text size="sm">¿Eliminar <b>{aEliminar?.nombre}</b>? Solo se puede si no tiene puestos asignados.</Text>
                <Group justify="flex-end" mt="md">
                    <Button variant="default" onClick={() => setAEliminar(null)}>Cancelar</Button>
                    <Button color="red" loading={guardando} onClick={eliminar}>Eliminar</Button>
                </Group>
            </Modal>
        </Box>
    );
}
