// app/superuser/rrhh/puestos/page.jsx
'use client';

import React, { useMemo, useState } from 'react';
import { ActionIcon, Alert, Avatar, Badge, Box, Button, Group, Menu, Modal, Paper, SegmentedControl, Select, Skeleton, Stack, Text, TextInput, Title, Tooltip } from '@mantine/core';
import { useDebouncedValue, useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { IconAlertCircle, IconBriefcase, IconBuilding, IconCash, IconDotsVertical, IconEdit, IconFilterOff, IconPlus, IconRefresh, IconSearch, IconTrash, IconUserOff, IconUsers } from '@tabler/icons-react';
import { useAuth } from '@/hooks/useAuth';
import HojaGrid from '../_components/HojaGrid';
import Kpis from '../_components/Kpis';

const BLOB = process.env.NEXT_PUBLIC_BLOB_BASE_URL;
const KEY = ['rrhh', 'puestos'];
const usd = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function cargar() {
    const res = await fetch('/api/rrhh/puestos');
    const cuerpo = await res.json().catch(() => null);
    if (!res.ok) throw new Error(cuerpo?.message || 'No se pudieron cargar los puestos');
    return cuerpo;
}

const preparar = (p) => ({
    ...p,
    departamentoNombre: p.departamento?.nombre || '',
    vigentes: (p.empleados || []).filter((e) => e.estado !== 'Retirado' && e.estado !== 'Inactivo'),
    salario: p.salarioBaseSugerido === null || p.salarioBaseSugerido === undefined ? null : Number(p.salarioBaseSugerido),
});

const comparar = (a, b, k) => {
    const x = k === 'ocupantes' ? a.vigentes.length : a[k];
    const y = k === 'ocupantes' ? b.vigentes.length : b[k];
    const vacio = (v) => v === null || v === undefined || v === '';
    if (vacio(x)) return vacio(y) ? 0 : 1;
    if (vacio(y)) return -1;
    return typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'es', { sensitivity: 'base', numeric: true });
};

export default function PuestosPage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const isMobile = useMediaQuery('(max-width: 48em)');
    const { rolUsuario } = useAuth();
    const esAdmin = rolUsuario === 'admin';
    const { data, isLoading, isFetching, error, refetch } = useQuery({ queryKey: KEY, queryFn: cargar });
    const { data: departamentos } = useQuery({ queryKey: ['rrhh', 'departamentos'], queryFn: async () => (await fetch('/api/rrhh/departamentos')).json() });

    const [busqueda, setBusqueda] = useState('');
    const [q] = useDebouncedValue(busqueda.trim().toLowerCase(), 200);
    const [departamento, setDepartamento] = useState(null);
    const [vista, setVista] = useState('todos');
    const [orden, setOrden] = useState({ sort: '', dir: '' });
    const [ocupantesDe, setOcupantesDe] = useState(null);
    const [aEliminar, setAEliminar] = useState(null);
    const [eliminando, setEliminando] = useState(false);

    const filas = useMemo(() => (data || []).map(preparar), [data]);
    const opcionesDepto = useMemo(() => (Array.isArray(departamentos) ? departamentos : []).map((d) => ({ value: String(d.id), label: d.nombre })), [departamentos]);

    const columnas = useMemo(() => [
        { key: 'nombre', label: 'Puesto', ancho: 240, tipo: 'texto', campo: 'nombre', requerido: true, sticky: true, orden: 'nombre' },
        { key: 'departamento', label: 'Departamento', ancho: 180, tipo: 'select', campo: 'departamentoId', opciones: opcionesDepto, orden: 'departamentoNombre' },
        { key: 'ocupantes', label: 'Ocupantes', ancho: 190, tipo: 'derivada', orden: 'ocupantes', ayuda: 'Empleados vigentes en este puesto' },
        { key: 'salario', label: 'Salario base sugerido', ancho: 150, tipo: 'numero', campo: 'salarioBaseSugerido', derecha: true, orden: 'salario' },
        { key: 'descripcion', label: 'Descripción', ancho: 420, tipo: 'texto', campo: 'descripcion', orden: 'descripcion' },
        { key: 'acciones', label: '', ancho: 52, tipo: 'acciones', fija: true },
    ], [opcionesDepto]);

    const kpi = useMemo(() => {
        const ids = new Set(filas.flatMap((p) => p.vigentes.map((e) => e.id)));
        const conSalario = filas.filter((p) => p.salario);
        return {
            puestos: filas.length,
            deptos: new Set(filas.map((p) => p.departamentoId)).size,
            vacios: filas.filter((p) => !p.vigentes.length).length,
            personal: ids.size,
            promedio: conSalario.length ? conSalario.reduce((s, p) => s + p.salario, 0) / conSalario.length : 0,
        };
    }, [filas]);

    const filtradas = useMemo(() => filas.filter((p) => {
        if (vista === 'vacios' && p.vigentes.length) return false;
        if (departamento && String(p.departamentoId) !== departamento) return false;
        return !q || [p.nombre, p.descripcion, p.departamentoNombre].some((x) => String(x || '').toLowerCase().includes(q));
    }), [filas, vista, departamento, q]);

    const ordenadas = useMemo(() => {
        if (!orden.sort) return filtradas;
        const l = [...filtradas].sort((a, b) => comparar(a, b, orden.sort));
        return orden.dir === 'desc' ? l.reverse() : l;
    }, [filtradas, orden]);

    const onOrden = (k) => {
        if (orden.sort !== k) setOrden({ sort: k, dir: 'asc' });
        else if (orden.dir === 'asc') setOrden({ sort: k, dir: 'desc' });
        else setOrden({ sort: '', dir: '' });
    };

    const guardar = async (fila, col, valor) => {
        const res = await fetch(`/api/rrhh/puestos/${fila.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [col.campo]: valor }) });
        const cuerpo = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(cuerpo.message || 'No se pudo guardar');
        const extra = col.campo === 'departamentoId' ? { departamentoId: Number(valor), departamento: { id: Number(valor), nombre: opcionesDepto.find((o) => o.value === String(valor))?.label } } : { [col.campo]: cuerpo[col.campo] };
        queryClient.setQueryData(KEY, (d) => (d ? d.map((p) => (p.id === fila.id ? { ...p, ...extra } : p)) : d));
        if (col.campo === 'departamentoId') queryClient.invalidateQueries({ queryKey: ['rrhh', 'departamentos'] });
    };

    const eliminar = async () => {
        setEliminando(true);
        try {
            const res = await fetch(`/api/rrhh/puestos/${aEliminar.id}`, { method: 'DELETE' });
            const cuerpo = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(cuerpo.message || 'No se pudo eliminar');
            notifications.show({ color: 'teal', message: `Puesto "${aEliminar.nombre}" eliminado` });
            setAEliminar(null);
            refetch();
        } catch (e) {
            notifications.show({ color: 'red', title: 'No se eliminó', message: e.message });
        } finally {
            setEliminando(false);
        }
    };

    const render = (p, col) => {
        if (col.key === 'departamento') return p.departamentoNombre ? <Badge size="sm" variant="outline" color="navy" tt="none">{p.departamentoNombre}</Badge> : <Badge size="sm" color="orange" variant="outline">Sin departamento</Badge>;
        if (col.key === 'ocupantes') {
            if (!p.vigentes.length) return <Badge size="sm" variant="light" color="orange">Vacante</Badge>;
            return (
                <Group gap={6} wrap="nowrap" style={{ cursor: 'pointer' }} onClick={() => setOcupantesDe(p)}>
                    <Avatar.Group spacing="xs">
                        {p.vigentes.slice(0, 4).map((e) => <Avatar key={e.id} size={24} radius="xl" src={e.imagen ? `${BLOB}/${e.imagen}` : null}>{e.nombre?.charAt(0)}</Avatar>)}
                        {p.vigentes.length > 4 && <Avatar size={24} radius="xl">+{p.vigentes.length - 4}</Avatar>}
                    </Avatar.Group>
                    <Text span size="xs" fw={700}>{p.vigentes.length}</Text>
                </Group>
            );
        }
        if (col.key === 'salario') return p.salario === null ? <span style={{ color: 'var(--mantine-color-gray-4)' }}>—</span> : `$${usd.format(p.salario)}`;
        if (col.key === 'acciones') {
            if (!esAdmin) return null;
            return (
                <Menu position="bottom-end" withinPortal shadow="md">
                    <Menu.Target><ActionIcon variant="subtle" color="gray" aria-label="Acciones"><IconDotsVertical size={16} /></ActionIcon></Menu.Target>
                    <Menu.Dropdown>
                        <Menu.Item leftSection={<IconEdit size={14} />} onClick={() => router.push(`/superuser/rrhh/puestos/${p.id}/editar`)}>Editar en formulario</Menu.Item>
                        <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => setAEliminar(p)}>Eliminar</Menu.Item>
                    </Menu.Dropdown>
                </Menu>
            );
        }
        return undefined;
    };

    const hayFiltros = Boolean(busqueda || departamento || vista !== 'todos');

    return (
        <Box px={isMobile ? 'xs' : 6} py={isMobile ? 'xs' : 'sm'} w="100%">
            <Group justify="space-between" align="flex-end" mb="sm">
                <Box>
                    <Title order={2} c="white" fz={isMobile ? 22 : 28} tt="none" pb={0}>Puestos</Title>
                    <Text size="sm" c="gray.4">Cargos de la empresa, quién los ocupa y su salario base sugerido</Text>
                </Box>
                {esAdmin && <Button variant="white" leftSection={<IconPlus size={18} />} onClick={() => router.push('/superuser/rrhh/puestos/nuevo')}>Nuevo puesto</Button>}
            </Group>

            <Kpis columnas={5} cargando={isLoading} tarjetas={[
                { key: 'p', label: 'Puestos', valor: kpi.puestos, icono: IconBriefcase, color: 'teal' },
                { key: 'd', label: 'Departamentos', valor: kpi.deptos, icono: IconBuilding, color: 'violet' },
                { key: 'e', label: 'Personal asignado', valor: kpi.personal, icono: IconUsers, color: 'blue' },
                { key: 'v', label: 'Puestos vacantes', valor: kpi.vacios, icono: IconUserOff, color: 'orange', activo: vista === 'vacios', onClick: () => setVista((v) => (v === 'vacios' ? 'todos' : 'vacios')) },
                { key: 's', label: 'Salario sugerido promedio', valor: `$${usd.format(kpi.promedio)}`, icono: IconCash, color: 'green' },
            ]} />

            <Paper withBorder radius="md" p="xs" mb="sm" bg="white">
                <Group gap="xs" wrap="wrap" align="flex-end">
                    <TextInput flex="1 1 220px" size="xs" placeholder="Buscar puesto, descripción o departamento…" leftSection={<IconSearch size={14} />} value={busqueda} onChange={(e) => setBusqueda(e.currentTarget.value)} />
                    <SegmentedControl size="xs" color="navy.9" value={vista} onChange={setVista} data={[{ value: 'todos', label: 'Todos' }, { value: 'vacios', label: 'Vacantes' }]} />
                    <Select size="xs" w={190} placeholder="Departamento" clearable searchable data={opcionesDepto} value={departamento} onChange={setDepartamento} />
                    {hayFiltros && <Button size="xs" variant="subtle" leftSection={<IconFilterOff size={14} />} onClick={() => { setBusqueda(''); setDepartamento(null); setVista('todos'); }}>Limpiar</Button>}
                    <Tooltip label="Actualizar"><ActionIcon ml="auto" variant="light" size="md" loading={isFetching} onClick={() => refetch()} aria-label="Actualizar"><IconRefresh size={16} /></ActionIcon></Tooltip>
                </Group>
            </Paper>

            {error ? <Alert color="red" icon={<IconAlertCircle size={18} />} variant="light" title="No se pudo cargar">{error.message}</Alert>
                : isLoading ? <Skeleton h={360} radius="md" />
                    : <HojaGrid filas={ordenadas} columnas={columnas} editable={esAdmin} orden={orden} onOrden={onOrden} guardar={guardar} render={render} vacio="No hay puestos con esos filtros." />}

            <Text size="xs" c="gray.4" mt="xs">{ordenadas.length} de {filas.length} puestos{esAdmin && !isMobile && ' · Enter o doble clic edita la celda (se guarda al instante) · Esc cancela · Ctrl+Z deshace'}</Text>

            <Modal opened={Boolean(ocupantesDe)} onClose={() => setOcupantesDe(null)} title={`Ocupantes: ${ocupantesDe?.nombre || ''}`} centered>
                <Stack gap="xs">
                    {ocupantesDe?.vigentes.map((e) => (
                        <Group key={e.id} gap="sm">
                            <Avatar size={30} radius="xl" src={e.imagen ? `${BLOB}/${e.imagen}` : null}>{e.nombre?.charAt(0)}</Avatar>
                            <Text component={Link} href={`/superuser/rrhh/empleados/${e.id}`} size="sm" fw={600}>{e.nombre} {e.apellido}</Text>
                            {e.estado !== 'Activo' && <Badge size="xs" variant="light" color="orange">{e.estado}</Badge>}
                        </Group>
                    ))}
                </Stack>
            </Modal>

            <Modal opened={Boolean(aEliminar)} onClose={() => setAEliminar(null)} title="Eliminar puesto" centered>
                <Text size="sm">¿Eliminar el puesto <b>{aEliminar?.nombre}</b>? Solo se puede si no tiene empleados asignados.</Text>
                <Group justify="flex-end" mt="md">
                    <Button variant="default" onClick={() => setAEliminar(null)}>Cancelar</Button>
                    <Button color="red" loading={eliminando} onClick={eliminar}>Eliminar</Button>
                </Group>
            </Modal>
        </Box>
    );
}
