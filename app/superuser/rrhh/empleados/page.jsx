// app/superuser/rrhh/empleados/page.jsx
'use client';

import React, { useMemo, useState } from 'react';
import {
    ActionIcon, Alert, Avatar, Badge, Box, Button, Checkbox, Group, Menu, Modal, Paper, SegmentedControl, Select, Skeleton, Stack, Text, TextInput, Title, Tooltip,
} from '@mantine/core';
import { useDebouncedValue, useLocalStorage, useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
    IconAlertCircle, IconBrandWhatsapp, IconCake, IconColumns, IconDownload, IconFilterOff, IconPlus, IconRefresh, IconSearch,
    IconShirt, IconUserCheck, IconUserOff, IconUsers, IconUserExclamation,
} from '@tabler/icons-react';
import { useAuth } from '@/hooks/useAuth';
import { normalizarWhatsApp } from '@/app/constants/contacto';
import { fechaCaracas, formatearFecha } from '@/app/constants/hora';
import HojaGrid from '../_components/HojaGrid';
import Kpis from '../_components/Kpis';
import AccionesEmpleado from './_components/AccionesEmpleado';
import EmpleadoCard from './_components/EmpleadoCard';
import CrearUsuarioModal from './CrearUsuarioModal';
import EditUsuarioModal from './EditUsuarioModal';
import { AUSENTES, COLOR_ESTADO, COLUMNAS, ESTADOS, ETIQUETA_ESTADO, OPCIONALES, VISIBLES_POR_DEFECTO, aCsv, comparar, prepararEmpleado } from './_lib/columnas';

const BLOB = process.env.NEXT_PUBLIC_BLOB_BASE_URL;
const KEY = ['rrhh', 'empleados'];

async function cargarEmpleados() {
    const res = await fetch('/api/rrhh/empleados');
    const cuerpo = await res.json().catch(() => null);
    if (!res.ok) throw new Error(cuerpo?.message || 'No se pudieron cargar los empleados');
    return cuerpo;
}

// Indicadores que además funcionan como filtro rápido
const RAPIDOS = {
    ausentes: (e) => AUSENTES.includes(e.estado),
    'sin-usuario': (e) => !e.usuario && !e.inactivo,
    'sin-tallas': (e) => e.sinTallas && !e.inactivo,
    cumple: (e) => e.cumpleEsteMes,
};

export default function EmpleadosPage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const isMobile = useMediaQuery('(max-width: 48em)');
    const { rolUsuario } = useAuth();
    const esAdmin = rolUsuario === 'admin';
    const { data, isLoading, isFetching, error, refetch } = useQuery({ queryKey: KEY, queryFn: cargarEmpleados });

    const [busqueda, setBusqueda] = useState('');
    const [q] = useDebouncedValue(busqueda.trim().toLowerCase(), 200);
    const [vista, setVista] = useState('vigentes'); // vigentes | todos | retirados
    const [estado, setEstado] = useState(null);
    const [departamento, setDepartamento] = useState(null);
    const [puesto, setPuesto] = useState(null);
    const [rapido, setRapido] = useState(null);
    const [orden, setOrden] = useState({ sort: '', dir: '' });
    const [visibles, setVisibles] = useLocalStorage({ key: 'rrhh.emp.columnas.v1', defaultValue: VISIBLES_POR_DEFECTO });
    const [aEliminar, setAEliminar] = useState(null);
    const [eliminando, setEliminando] = useState(false);
    const [usuarioDe, setUsuarioDe] = useState(null); // { empleado, modo }

    const filas = useMemo(() => (data || []).map(prepararEmpleado), [data]);
    const departamentos = useMemo(() => [...new Set(filas.flatMap((f) => f.departamentos))].sort(), [filas]);
    const puestos = useMemo(() => [...new Set(filas.flatMap((f) => (f.puestos || []).map((p) => p.nombre)))].sort(), [filas]);

    const kpi = useMemo(() => {
        const vigentes = filas.filter((f) => !f.inactivo);
        return {
            total: vigentes.length,
            activos: filas.filter((f) => f.estado === 'Activo').length,
            ausentes: filas.filter(RAPIDOS.ausentes).length,
            sinUsuario: filas.filter(RAPIDOS['sin-usuario']).length,
            sinTallas: filas.filter(RAPIDOS['sin-tallas']).length,
            cumple: filas.filter(RAPIDOS.cumple).length,
            hoy: filas.filter((f) => f.cumpleHoy).map((f) => f.nombre),
        };
    }, [filas]);

    const filtradas = useMemo(() => filas.filter((f) => {
        if (vista === 'vigentes' && f.inactivo) return false;
        if (vista === 'retirados' && !f.inactivo) return false;
        if (estado && f.estado !== estado) return false;
        if (departamento && !f.departamentos.includes(departamento)) return false;
        if (puesto && !(f.puestos || []).some((p) => p.nombre === puesto)) return false;
        if (rapido && !RAPIDOS[rapido](f)) return false;
        if (!q) return true;
        return [f.nombreCompleto, f.cedula, f.telefono, f.puestosTxt, f.departamento, f.usuarioTxt, f.direccion].some((x) => String(x || '').toLowerCase().includes(q));
    }), [filas, vista, estado, departamento, puesto, rapido, q]);

    const ordenadas = useMemo(() => {
        if (!orden.sort) return filtradas;
        const lista = [...filtradas].sort((a, b) => comparar(a, b, orden.sort));
        return orden.dir === 'desc' ? lista.reverse() : lista;
    }, [filtradas, orden]);

    const columnas = useMemo(() => COLUMNAS.filter((c) => c.fija || c.sticky || visibles.includes(c.key)), [visibles]);
    const hayFiltros = Boolean(busqueda || estado || departamento || puesto || rapido || vista !== 'vigentes');
    const limpiar = () => { setBusqueda(''); setEstado(null); setDepartamento(null); setPuesto(null); setRapido(null); setVista('vigentes'); };
    const alternarRapido = (k) => setRapido((r) => (r === k ? null : k));

    const onOrden = (clave) => {
        if (orden.sort !== clave) setOrden({ sort: clave, dir: 'asc' });
        else if (orden.dir === 'asc') setOrden({ sort: clave, dir: 'desc' });
        else setOrden({ sort: '', dir: '' });
    };

    // Guarda UNA celda con PATCH y refleja el cambio en la lista sin recargarla
    const guardar = async (fila, col, valor) => {
        const res = await fetch(`/api/rrhh/empleados/${fila.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [col.campo]: valor }) });
        const cuerpo = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(cuerpo.message || 'No se pudo guardar');
        queryClient.setQueryData(KEY, (d) => (d ? d.map((e) => (e.id === fila.id ? { ...e, [col.campo]: valor } : e)) : d));
    };

    const eliminar = async () => {
        setEliminando(true);
        try {
            const res = await fetch(`/api/rrhh/empleados/${aEliminar.id}`, { method: 'DELETE' });
            const cuerpo = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(cuerpo.message || 'No se pudo eliminar');
            notifications.show({ color: 'teal', message: `${aEliminar.nombreCompleto} eliminado` });
            setAEliminar(null);
            refetch();
        } catch (e) {
            notifications.show({ color: 'red', title: 'No se eliminó', message: e.message });
        } finally {
            setEliminando(false);
        }
    };

    const exportar = () => {
        const blob = new Blob([aCsv(ordenadas)], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `empleados-${fechaCaracas()}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    };

    const ficha = (e) => router.push(`/superuser/rrhh/empleados/${e.id}`);
    const acciones = (e) => (
        <AccionesEmpleado
            empleado={e} esAdmin={esAdmin} onFicha={ficha} onEditar={(x) => router.push(`/superuser/rrhh/empleados/${x.id}/editar`)}
            onUsuario={(x) => setUsuarioDe({ empleado: x, modo: x.usuario ? 'editar' : 'crear' })} onEliminar={setAEliminar}
        />
    );

    const render = (f, col) => {
        switch (col.key) {
            case 'imagen': return <Avatar src={f.imagen ? `${BLOB}/${f.imagen}` : null} size={30} radius="xl" color="navy">{(f.nombre || '?').charAt(0)}</Avatar>;
            case 'nombreCompleto': return (
                <Group gap={6} wrap="nowrap">
                    <Text span fw={700} size="sm" truncate style={{ cursor: 'pointer' }} onClick={() => ficha(f)}>{f.nombreCompleto}</Text>
                    {f.cumpleHoy && <Tooltip label="¡Cumple años hoy!"><IconCake size={14} color="var(--mantine-color-pink-6)" /></Tooltip>}
                </Group>
            );
            case 'estado': return <Badge size="sm" variant="light" color={COLOR_ESTADO[f.estado] || 'gray'}>{ETIQUETA_ESTADO[f.estado] || f.estado}</Badge>;
            case 'departamento': return f.departamentos.length ? f.departamentos.map((d) => <Badge key={d} size="xs" variant="outline" color="navy" mr={4} tt="none">{d}</Badge>) : <span style={{ color: 'var(--mantine-color-gray-4)' }}>—</span>;
            case 'puestos': return f.puestos?.length ? f.puestos.map((p) => <Badge key={p.id} size="xs" variant="light" color="blue" mr={4} tt="none">{p.nombre}</Badge>) : <Badge size="xs" variant="outline" color="orange">Sin cargo</Badge>;
            case 'telefono': return f.telefono ? (
                <Group gap={4} wrap="nowrap" justify="space-between"><span>{f.telefono}</span>
                    {normalizarWhatsApp(f.telefono) && <ActionIcon component="a" href={`https://wa.me/${normalizarWhatsApp(f.telefono)}`} target="_blank" size="xs" variant="subtle" color="teal" aria-label="WhatsApp" onMouseDown={(e) => e.stopPropagation()}><IconBrandWhatsapp size={14} /></ActionIcon>}
                </Group>
            ) : '';
            case 'edad': return f.edad ?? '';
            case 'fechaNacimiento': case 'fechaIngreso': return formatearFecha(f[col.campo]);
            case 'usuario': return f.usuario ? <Badge color="teal" variant="light" size="sm" tt="none">{f.usuario.user}</Badge> : <Badge color="gray" variant="outline" size="sm">Sin acceso</Badge>;
            case 'acciones': return acciones(f);
            default: return undefined;
        }
    };

    return (
        <Box px={isMobile ? 'xs' : 6} py={isMobile ? 'xs' : 'sm'} w="100%">
            <Group justify="space-between" align="flex-end" mb="sm">
                <Box>
                    <Title order={2} c="white" fz={isMobile ? 22 : 28} tt="none" pb={0}>Empleados</Title>
                    <Text size="sm" c="gray.4">Personal, cargos, contacto, dotación y acceso al sistema</Text>
                </Box>
                <Button variant="white" leftSection={<IconPlus size={18} />} onClick={() => router.push('/superuser/rrhh/empleados/nuevo')}>Registrar empleado</Button>
            </Group>

            <Kpis cargando={isLoading} tarjetas={[
                { key: 'total', label: 'Personal vigente', valor: kpi.total, icono: IconUsers, color: 'blue', detalle: `${kpi.activos} activos` },
                { key: 'ausentes', label: 'Ausentes', valor: kpi.ausentes, icono: IconUserExclamation, color: 'orange', detalle: 'Vacaciones, permiso, reposo', activo: rapido === 'ausentes', onClick: () => alternarRapido('ausentes') },
                { key: 'usuario', label: 'Con usuario', valor: kpi.total - kpi.sinUsuario, icono: IconUserCheck, color: 'teal' },
                { key: 'sin-usuario', label: 'Sin usuario', valor: kpi.sinUsuario, icono: IconUserOff, color: 'gray', activo: rapido === 'sin-usuario', onClick: () => alternarRapido('sin-usuario') },
                { key: 'sin-tallas', label: 'Sin tallas completas', valor: kpi.sinTallas, icono: IconShirt, color: 'grape', detalle: 'Falta camisa, pantalón o calzado', activo: rapido === 'sin-tallas', onClick: () => alternarRapido('sin-tallas') },
                { key: 'cumple', label: 'Cumpleaños del mes', valor: kpi.cumple, icono: IconCake, color: 'pink', detalle: kpi.hoy.length ? `Hoy: ${kpi.hoy.join(', ')}` : undefined, activo: rapido === 'cumple', onClick: () => alternarRapido('cumple') },
            ]} />

            <Paper withBorder radius="md" p="xs" mb="sm" bg="white">
                <Group gap="xs" wrap="wrap" align="flex-end">
                    <TextInput flex="1 1 220px" size="xs" placeholder="Buscar por nombre, cédula, teléfono, cargo, usuario…" leftSection={<IconSearch size={14} />} value={busqueda} onChange={(e) => setBusqueda(e.currentTarget.value)} />
                    <SegmentedControl size="xs" color="navy.9" value={vista} onChange={setVista} data={[{ value: 'vigentes', label: 'Vigentes' }, { value: 'todos', label: 'Todos' }, { value: 'retirados', label: 'Retirados' }]} />
                    <Select size="xs" w={140} placeholder="Estado" clearable data={ESTADOS.map((v) => ({ value: v, label: ETIQUETA_ESTADO[v] || v }))} value={estado} onChange={setEstado} />
                    <Select size="xs" w={160} placeholder="Departamento" clearable searchable data={departamentos} value={departamento} onChange={setDepartamento} />
                    <Select size="xs" w={170} placeholder="Cargo" clearable searchable data={puestos} value={puesto} onChange={setPuesto} />
                    {hayFiltros && <Button size="xs" variant="subtle" leftSection={<IconFilterOff size={14} />} onClick={limpiar}>Limpiar</Button>}
                    <Group gap={4} ml="auto">
                        <Menu shadow="md" closeOnItemClick={false} position="bottom-end">
                            <Menu.Target><Button size="xs" variant="light" leftSection={<IconColumns size={14} />}>Columnas</Button></Menu.Target>
                            <Menu.Dropdown>
                                {OPCIONALES.map((c) => (
                                    <Box key={c.key} px="sm" py={4}><Checkbox size="xs" label={c.label} checked={visibles.includes(c.key)} onChange={(e) => setVisibles((v) => (e.currentTarget.checked ? [...v, c.key] : v.filter((k) => k !== c.key)))} /></Box>
                                ))}
                                <Menu.Divider />
                                <Menu.Item onClick={() => setVisibles(VISIBLES_POR_DEFECTO)}>Restablecer</Menu.Item>
                            </Menu.Dropdown>
                        </Menu>
                        <Tooltip label="Descargar lo filtrado en CSV"><ActionIcon variant="light" size="md" onClick={exportar} aria-label="Exportar CSV"><IconDownload size={16} /></ActionIcon></Tooltip>
                        <Tooltip label="Actualizar"><ActionIcon variant="light" size="md" loading={isFetching} onClick={() => refetch()} aria-label="Actualizar"><IconRefresh size={16} /></ActionIcon></Tooltip>
                    </Group>
                </Group>
            </Paper>

            {error ? (
                <Alert color="red" icon={<IconAlertCircle size={18} />} title="No se pudo cargar la lista" variant="light">{error.message}</Alert>
            ) : isLoading ? <Skeleton h={420} radius="md" /> : isMobile ? (
                <Stack gap="xs">
                    {ordenadas.length === 0 && <Text c="gray.4" ta="center" py="xl">No hay empleados con esos filtros.</Text>}
                    {ordenadas.map((e) => <EmpleadoCard key={e.id} e={e} onAbrir={() => ficha(e)} acciones={acciones(e)} />)}
                </Stack>
            ) : (
                <HojaGrid filas={ordenadas} columnas={columnas} editable={esAdmin} orden={orden} onOrden={onOrden} guardar={guardar} render={render} onAbrir={ficha} vacio="No hay empleados con esos filtros." />
            )}

            <Text size="xs" c="gray.4" mt="xs">
                {ordenadas.length} de {filas.length} empleados
                {esAdmin && !isMobile && ' · Enter o doble clic edita la celda (se guarda al instante) · Tab / flechas para moverte · Esc cancela · Ctrl+Z deshace · doble clic en el nombre abre la ficha'}
            </Text>

            <Modal opened={Boolean(aEliminar)} onClose={() => setAEliminar(null)} title="Eliminar empleado" centered>
                <Text size="sm">¿Eliminar a <b>{aEliminar?.nombreCompleto}</b>? No se puede deshacer. Si ya trabajó aquí, es mejor cambiar su estado a <b>Retirado</b> para conservar su historial.</Text>
                <Group justify="flex-end" mt="md">
                    <Button variant="default" onClick={() => setAEliminar(null)}>Cancelar</Button>
                    <Button color="red" loading={eliminando} onClick={eliminar}>Eliminar</Button>
                </Group>
            </Modal>

            <CrearUsuarioModal empleado={usuarioDe?.empleado} opened={usuarioDe?.modo === 'crear'} onClose={() => setUsuarioDe(null)} onUserCreated={() => { setUsuarioDe(null); refetch(); }} />
            <EditUsuarioModal usuario={usuarioDe?.empleado?.usuario} opened={usuarioDe?.modo === 'editar'} onClose={() => setUsuarioDe(null)} onUpdated={() => { setUsuarioDe(null); refetch(); }} />
        </Box>
    );
}
