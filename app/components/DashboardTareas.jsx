'use client';

import React, { useState, useEffect } from 'react';
import {
    Paper, Title, Text, Group, Button, Badge, ScrollArea,
    ActionIcon, Modal, TextInput, Select, Textarea, Stack,
    ThemeIcon, Checkbox, Menu, Loader, Tooltip, MultiSelect,
    Table
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import {
    IconPlus, IconCheck, IconClock, IconUser, IconDotsVertical, IconListCheck, IconUsers, IconHandStop,
    IconRefresh, IconSettings
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useAuth } from '@/hooks/useAuth';
import { formatDateLong, formatDateShort } from '../helpers/dateUtils';

export default function DashboardTareas({ glassStyle }) {
    const { user, nombre, rol, departamentos, userId, isAdmin } = useAuth();

    const containerStyle = glassStyle || {
        backgroundColor: 'rgba(255, 255, 255, 0.7)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.5)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
    };

    const [tareas, setTareas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [empleados, setEmpleados] = useState([]);

    // Estados para la configuración de permisos (Engranaje)
    const [configModalOpen, setConfigModalOpen] = useState(false);
    const [permisosDinamicos, setPermisosDinamicos] = useState({ departamentos: [], puestos: [] });
    const [departamentosList, setDepartamentosList] = useState([]);
    const [puestosList, setPuestosList] = useState([]);
    const [isSavingConfig, setIsSavingConfig] = useState(false);

    const [form, setForm] = useState({
        titulo: '',
        descripcion: '',
        prioridad: 'Media',
        asignadoAId: '',
        fechaVencimiento: new Date()
    });

    const esPresidencia =
        userId === 1 ||
        rol?.toLowerCase().includes('presidente') ||
        rol?.toLowerCase().includes('admin') ||
        isAdmin ||
        departamentos?.some(dep => dep.toLowerCase().includes('presidencia'));

    const tienePermisoAsignar = () => {
        const depsPermitidos = permisosDinamicos.departamentos || [];
        const puestosPermitidos = permisosDinamicos.puestos || [];

        const matchDep = depsPermitidos.some(dep => departamentos?.some(d => d.toLowerCase().includes(dep.toLowerCase())));
        const matchPuesto = puestosPermitidos.some(puesto => rol?.toLowerCase().includes(puesto.toLowerCase()));

        return matchDep || matchPuesto;
    };

    const puedeAsignar = esPresidencia || tienePermisoAsignar();

    const fetchTareas = async () => {
        if (!user?.id) return;
        setLoading(true);
        try {
            const queryParams = new URLSearchParams({
                userId: user.id,
                esPresidencia: esPresidencia
            });

            const res = await fetch(`/api/tareas?${queryParams.toString()}`);
            const data = await res.json();
            if (Array.isArray(data)) setTareas(data);
        } catch (error) {
            console.error('Error fetching tareas:', error);
        }
        finally { setLoading(false); }
    };

    const fetchPermisosYListas = async () => {
        try {
            const [resPermisos, resDepartamentos, resPuestos] = await Promise.all([
                fetch('/api/superuser/permissions'),
                fetch('/api/rrhh/departamentos'),
                fetch('/api/rrhh/puestos')
            ]);

            if (resPermisos.ok) {
                const dataPermisos = await resPermisos.json();
                setPermisosDinamicos(dataPermisos['config:asignar-tareas'] || { departamentos: [], puestos: [] });
            }

            if (resDepartamentos.ok) {
                const dataDeps = await resDepartamentos.json();
                setDepartamentosList(dataDeps.map(d => d.nombre));
            }

            if (resPuestos.ok) {
                const dataPuestos = await resPuestos.json();
                setPuestosList(dataPuestos.map(p => p.nombre));
            }
        } catch (error) {
            console.error("Error al cargar configuraciones", error);
        }
    };

    const fetchEmpleados = async () => {
        if (puedeAsignar && empleados.length === 0) {
            try {
                const res = await fetch('/api/rrhh/empleados?where=estado:Activo');
                const data = await res.json();
                let lista = Array.isArray(data) ? data : data.data || [];

                if (!esPresidencia) {
                    lista = lista.filter(e => e.departamentoId === user.departamentoId);
                }

                const listaConUsuario = lista.filter(e => e.usuario);

                const opciones = listaConUsuario.map(e => ({
                    value: String(e.usuario?.id),
                    label: `${e.nombre} ${e.apellido} - ${e.puestos.map(p => p.nombre).join(', ') || 'General'}`
                }));

                opciones.unshift({ value: 'general', label: '📢 GENERAL (Visible para el equipo)' });

                setEmpleados(opciones);
            } catch (err) { console.error(err); }
        }
    };

    useEffect(() => {
        if (user) {
            fetchTareas();
            fetchPermisosYListas();
        } else {
            setLoading(false);
        }
    }, [user]);

    const guardarConfiguracion = async () => {
        setIsSavingConfig(true);
        try {
            const payload = {
                'config:asignar-tareas': permisosDinamicos
            };

            const res = await fetch('/api/superuser/permissions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                notifications.show({ title: 'Éxito', message: 'Permisos de asignación actualizados', color: 'teal' });
                setConfigModalOpen(false);
            } else { throw new Error(); }
        } catch (error) {
            notifications.show({ title: 'Error', message: 'No se guardaron los permisos', color: 'red' });
        } finally {
            setIsSavingConfig(false);
        }
    };

    const handleCrearTarea = async () => {
        if (!form.titulo || !form.asignadoAId) {
            notifications.show({ message: 'Título y Asignación requeridos', color: 'red' });
            return;
        }
        try {
            const res = await fetch('/api/tareas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...form, creadoPorId: user.id })
            });
            if (res.ok) {
                notifications.show({ message: 'Tarea creada', color: 'green' });
                setModalOpen(false);
                fetchTareas();
                setForm({ titulo: '', descripcion: '', prioridad: 'Media', asignadoAId: '', fechaVencimiento: new Date() });
            }
        } catch (error) { notifications.show({ message: 'Error al crear', color: 'red' }); }
    };

    const cambiarEstado = async (id, nuevoEstado) => {
        try {
            const res = await fetch(`/api/tareas/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nombre: nombre, estado: nuevoEstado })
            });
            if (res.ok) fetchTareas();
        } catch (error) { console.error(error); }
    };

    const eliminarTarea = async (id) => {
        if (!window.confirm("¿Estás seguro de borrarla definitivamente de la base de datos?")) return;
        try {
            const res = await fetch(`/api/tareas/${id}?nombre=${encodeURIComponent(nombre)}`, { method: 'DELETE' });
            if (res.ok) {
                notifications.show({ message: 'Tarea eliminada', color: 'red' });
                fetchTareas();
            }
        } catch (error) { console.error(error); }
    };

    const asumirTarea = async (id) => {
        try {
            const res = await fetch(`/api/tareas/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ asignadoAId: user.id, estado: 'En Progreso' })
            });
            if (res.ok) {
                notifications.show({ message: 'Tarea asignada a ti', color: 'blue' });
                fetchTareas();
            }
        } catch (error) { console.error(error); }
    };

    const getPriorityColor = (p) => {
        switch (p) { case 'Urgente': return 'red'; case 'Alta': return 'orange'; case 'Media': return 'blue'; default: return 'gray'; }
    };

    const tareasOrdenadas = [...tareas].sort((a, b) => {
        const getScore = (estado) => {
            if (estado === 'Cancelada') return 2;
            if (estado === 'Completada') return 1;
            return 0;
        };
        return getScore(a.estado) - getScore(b.estado);
    });

    return (
        <Paper p="lg" radius="lg" style={{ ...containerStyle, transition: 'all 0.3s ease' }}>

            <Modal opened={configModalOpen} onClose={() => setConfigModalOpen(false)} title={<Text fw={700}>Configurar Asignación de Tareas</Text>} centered>
                <Stack>
                    <Text size="sm" c="dimmed">
                        Selecciona quiénes pueden asignar tareas a otros miembros de su departamento (Presidencia siempre puede asignar a cualquiera).
                    </Text>
                    <MultiSelect
                        label="Departamentos permitidos"
                        data={departamentosList}
                        value={permisosDinamicos.departamentos || []}
                        onChange={(val) => setPermisosDinamicos({ ...permisosDinamicos, departamentos: val })}
                        placeholder="Ej. Operaciones, Mantenimiento..."
                        searchable clearable
                    />
                    <MultiSelect
                        label="Puestos permitidos"
                        data={puestosList}
                        value={permisosDinamicos.puestos || []}
                        onChange={(val) => setPermisosDinamicos({ ...permisosDinamicos, puestos: val })}
                        placeholder="Ej. Gerente, Supervisor..."
                        searchable clearable
                    />
                    <Button loading={isSavingConfig} onClick={guardarConfiguracion} fullWidth color="blue" mt="md">
                        Guardar Permisos
                    </Button>
                </Stack>
            </Modal>

            <Group justify="space-between" mb="md">
                <Group gap="sm">
                    <ThemeIcon variant="gradient" gradient={{ from: 'blue', to: 'cyan' }} size="lg" radius="md">
                        <IconListCheck size={20} />
                    </ThemeIcon>
                    <Group gap="xs" align="center">
                        <div>
                            <Title order={4} style={{ lineHeight: 1 }}>{puedeAsignar ? 'Asignar Tareas' : 'Mis Tareas'}</Title>
                            <Text size="xs" c="dimmed">Gestión de actividades</Text>
                        </div>
                        {userId === 1 && (
                            <ActionIcon variant="subtle" color="blue" size="sm" onClick={() => { fetchPermisosYListas(); setConfigModalOpen(true); }}>
                                <IconSettings size={18} />
                            </ActionIcon>
                        )}
                    </Group>
                    {tareas.filter(t => t.estado !== 'Completada' && t.estado !== 'Cancelada').length > 0 && (
                        <Badge circle size="sm" color="red" ml={-5} style={{ boxShadow: '0 2px 5px rgba(0,0,0,0.2)' }}>
                            {tareas.filter(t => t.estado !== 'Completada' && t.estado !== 'Cancelada').length}
                        </Badge>
                    )}
                </Group>

                <Button
                    leftSection={<IconPlus size={16} />}
                    size="xs"
                    radius="xl"
                    variant="filled"
                    color="blue"
                    onClick={() => {
                        setModalOpen(true);
                        if (puedeAsignar) {
                            fetchEmpleados();
                            setForm({ ...form, asignadoAId: '' });
                        } else {
                            setForm({ ...form, asignadoAId: String(user.id) });
                        }
                    }}
                    style={{ boxShadow: '0 4px 10px rgba(34, 139, 230, 0.3)' }}
                >
                    {puedeAsignar ? 'Asignar Tarea' : 'Nueva Tarea'}
                </Button>
            </Group>

            <ScrollArea.Autosize mah={450}>
                {loading ? (
                    <Stack align="center" mt="xl" mb="xl"><Loader size="md" type="dots" /></Stack>
                ) : tareas.length === 0 ? (
                    <Stack align="center" mt="xl" mb="xl" gap="xs">
                        <ThemeIcon color="gray" variant="light" size="xl" radius="xl"><IconCheck /></ThemeIcon>
                        <Text c="dimmed" size="sm">¡Todo al día! No hay tareas pendientes.</Text>
                    </Stack>
                ) : (
                    <Table.ScrollContainer minWidth={600}>
                        <Table verticalSpacing="sm" highlightOnHover striped>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th w={50}>Estado</Table.Th>
                                    <Table.Th>Tarea</Table.Th>
                                    <Table.Th>Prioridad</Table.Th>
                                    <Table.Th>Vencimiento</Table.Th>
                                    {/* CAMBIO VITAL: Ahora los jefes también ven a quién le delegaron */}
                                    {puedeAsignar && <Table.Th>Asignado A</Table.Th>}
                                    <Table.Th w={80}>Acciones</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {tareasOrdenadas.map(tarea => {
                                    const esGeneral = !tarea.asignadoAId;
                                    const esCancelada = tarea.estado === 'Cancelada';
                                    const esCompletada = tarea.estado === 'Completada';

                                    // Validamos si el usuario actual fue el que creó esta tarea en específico
                                    const esCreador = tarea.creadoPorId === user?.id;
                                    const puedeAdministrarTarea = esPresidencia || esCreador;

                                    return (
                                        <Table.Tr
                                            key={tarea.id}
                                            style={{
                                                opacity: (esCancelada || esCompletada) ? 0.6 : 1,
                                                backgroundColor: esCancelada ? 'rgba(255, 200, 200, 0.1)' : 'inherit'
                                            }}
                                        >
                                            <Table.Td>
                                                {esGeneral && !esCompletada && !esCancelada ? (
                                                    <Tooltip label="Tomar esta tarea">
                                                        <ActionIcon color="blue" variant="light" radius="xl" size="sm" onClick={() => asumirTarea(tarea.id)}>
                                                            <IconHandStop size={14} />
                                                        </ActionIcon>
                                                    </Tooltip>
                                                ) : (
                                                    <Checkbox
                                                        checked={esCompletada}
                                                        disabled={esCancelada}
                                                        onChange={() => cambiarEstado(tarea.id, esCompletada ? 'Pendiente' : 'Completada')}
                                                        color="green"
                                                        radius="xl"
                                                        style={{ cursor: esCancelada ? 'not-allowed' : 'pointer' }}
                                                    />
                                                )}
                                            </Table.Td>

                                            <Table.Td>
                                                <Group gap="xs" mb={4}>
                                                    {esGeneral && <Badge size="xs" variant="gradient" gradient={{ from: 'indigo', to: 'cyan' }}>GENERAL</Badge>}
                                                    {esCancelada && <Badge size="xs" color="red" variant="filled">CANCELADA</Badge>}
                                                    <Text
                                                        fw={600}
                                                        size="sm"
                                                        td={(esCompletada || esCancelada) ? 'line-through' : 'none'}
                                                        c={esCancelada ? 'red.8' : 'dark.8'}
                                                    >
                                                        {tarea.titulo}
                                                    </Text>
                                                </Group>

                                                {/* 🔥 Renderizado directo y completo de la descripción 🔥 */}
                                                {tarea.descripcion && (
                                                    <Text
                                                        size="xs"
                                                        c="dimmed"
                                                        style={{
                                                            whiteSpace: 'pre-wrap', // Respeta los "Enter" (saltos de línea) del usuario
                                                            wordBreak: 'break-word' // Evita que una palabra superlarga rompa la tabla
                                                        }}
                                                    >
                                                        {tarea.descripcion}
                                                    </Text>
                                                )}
                                            </Table.Td>

                                            <Table.Td>
                                                <Badge size="xs" color={getPriorityColor(tarea.prioridad)} variant="light">
                                                    {tarea.prioridad}
                                                </Badge>
                                            </Table.Td>

                                            <Table.Td>
                                                {tarea.fechaVencimiento ? (
                                                    <Text size="sm" c={new Date(tarea.fechaVencimiento) < new Date() && !esCompletada ? 'red' : 'dark'}>
                                                        {formatDateShort(tarea.fechaVencimiento)}
                                                    </Text>
                                                ) : (
                                                    <Text size="sm" c="dimmed">-</Text>
                                                )}
                                            </Table.Td>

                                            {/* CAMBIO VITAL: Ahora evaluado por 'puedeAsignar' */}
                                            {puedeAsignar && (
                                                <Table.Td>
                                                    {esGeneral ? (
                                                        <Text size="sm" c="dimmed" fs="italic">Equipo General</Text>
                                                    ) : (
                                                        <Group gap="xs">
                                                            <IconUser size={14} style={{ color: '#868e96' }} />
                                                            <Text size="sm" fw={500}>{tarea.responsable?.empleado?.nombre || 'Desconocido'}</Text>
                                                        </Group>
                                                    )}
                                                </Table.Td>
                                            )}

                                            <Table.Td>
                                                <Menu shadow="md" width={150} position="bottom-end">
                                                    <Menu.Target>
                                                        <ActionIcon variant="subtle" color="gray" size="sm">
                                                            <IconDotsVertical size={16} />
                                                        </ActionIcon>
                                                    </Menu.Target>
                                                    <Menu.Dropdown>
                                                        <Menu.Label>Acciones</Menu.Label>

                                                        {esGeneral && <Menu.Item leftSection={<IconUser size={14} />} onClick={() => asumirTarea(tarea.id)}>Asumir Tarea</Menu.Item>}

                                                        {!esCancelada && (
                                                            <>
                                                                <Menu.Item leftSection={<IconClock size={14} />} onClick={() => cambiarEstado(tarea.id, 'Pendiente')}>Pendiente</Menu.Item>
                                                                <Menu.Item leftSection={<IconListCheck size={14} />} onClick={() => cambiarEstado(tarea.id, 'En Progreso')}>En Progreso</Menu.Item>
                                                                <Menu.Item leftSection={<IconCheck size={14} />} onClick={() => cambiarEstado(tarea.id, 'Completada')}>Completada</Menu.Item>
                                                            </>
                                                        )}

                                                        {/* CAMBIO VITAL: Permite eliminar/cancelar si es presidente o si es el CREADOR de la tarea */}
                                                        {puedeAdministrarTarea && (
                                                            <>
                                                                <Menu.Divider />
                                                                {esCancelada ? (
                                                                    <>
                                                                        <Menu.Item color="blue" leftSection={<IconRefresh size={14} />} onClick={() => cambiarEstado(tarea.id, 'Pendiente')}>
                                                                            Revivir Tarea
                                                                        </Menu.Item>
                                                                        <Menu.Item color="red" leftSection={<IconHandStop size={14} />} onClick={() => eliminarTarea(tarea.id)}>
                                                                            Eliminar Definitivamente
                                                                        </Menu.Item>
                                                                    </>
                                                                ) : (
                                                                    <Menu.Item color="orange" onClick={() => cambiarEstado(tarea.id, 'Cancelada')}>
                                                                        Cancelar Tarea
                                                                    </Menu.Item>
                                                                )}
                                                            </>
                                                        )}
                                                    </Menu.Dropdown>
                                                </Menu>
                                            </Table.Td>
                                        </Table.Tr>
                                    );
                                })}
                            </Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>
                )}
            </ScrollArea.Autosize>

            <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title={puedeAsignar ? "Asignar Nueva Tarea" : "Crear Nueva Tarea"} centered radius="lg">
                <Stack>
                    <TextInput
                        label="Título"
                        placeholder="Ej. Limpieza de patio"
                        required
                        value={form.titulo}
                        onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                    />
                    <Textarea
                        label="Descripción"
                        value={form.descripcion}
                        onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                    />
                    <Group grow>
                        <Select
                            label="Prioridad"
                            data={['Baja', 'Media', 'Alta', 'Urgente']}
                            value={form.prioridad}
                            onChange={(val) => setForm({ ...form, prioridad: val })}
                            allowDeselect={false}
                        />
                        <DateInput
                            label="Vencimiento"
                            value={form.fechaVencimiento}
                            onChange={(val) => setForm({ ...form, fechaVencimiento: val })}
                        />
                    </Group>

                    {puedeAsignar && (
                        <Select
                            label="Asignar a"
                            placeholder="Seleccionar..."
                            searchable
                            data={empleados}
                            value={form.asignadoAId}
                            onChange={(val) => setForm({ ...form, asignadoAId: val })}
                            required
                            description="Selecciona 'GENERAL' para que todos en tu departamento puedan verla."
                        />
                    )}

                    <Button fullWidth onClick={handleCrearTarea} mt="md" radius="md">Crear Tarea</Button>
                </Stack>
            </Modal>
        </Paper>
    );
}