'use client';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { 
    Table, Button, Group, Text, Paper, Title, Tabs, 
    Badge, ActionIcon, Modal, Stack, Select, Alert, Avatar, Box,
    Accordion, ScrollArea
} from '@mantine/core';
import { 
    IconPlus, IconBox, IconChecklist, IconCheck, 
    IconAlertCircle, IconUser, IconClock, IconTool, IconShieldLock
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useAuth } from '@/hooks/useAuth'; // 🔥 IMPORTAMOS TU HOOK DE AUTH
import ODTSelectableGrid from '../../odt/ODTSelectableGrid';


const blobBaseUrl = process.env.NEXT_PUBLIC_BLOB_BASE_URL || '';

export default function BandejaSalidasPage() {
    const router = useRouter();
    const { userId } = useAuth(); // 🔥 EXTRAEMOS EL USUARIO LOGUEADO
    const [salidas, setSalidas] = useState([]);
    const [loading, setLoading] = useState(true);
    
    const [empleadosGrid, setEmpleadosGrid] = useState([]);
    const [receptorElegido, setReceptorElegido] = useState('');

    const [selectedSalida, setSelectedSalida] = useState(null);
    const [serialesDisponibles, setSerialesDisponibles] = useState([]);
    const [serialElegido, setSerialElegido] = useState('');
    const [procesando, setProcesando] = useState(false);

    const fetchSalidas = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/inventario/salidas');
            const data = await res.json();
            
            if (!Array.isArray(data)) {
                if (data.message || data.error) throw new Error(data.message || data.error);
                throw new Error("El servidor no devolvió una lista válida.");
            }
            
            setSalidas(data);
        } catch (error) {
            console.error("Error cargando salidas:", error);
            notifications.show({ title: 'Error del Servidor', message: error.message, color: 'red' });
            setSalidas([]); 
        } finally {
            setLoading(false);
        }
    };

    const fetchUsuarios = async () => {
        try {
            const res = await fetch('/api/rrhh/empleados');
            const data = await res.json();
            const empleados = data.data ? data.data : (Array.isArray(data) ? data : []);
            
            const empleadosFormateados = empleados
                .filter(emp => emp.usuario && emp.usuario.id) 
                .map(emp => ({
                    id: emp.usuario.id.toString(), 
                    nombre: `${emp.nombre} ${emp.apellido}`,
                    imagen: emp.fotoPerfil || emp.imagen, 
                    puestos: emp.puestos || [],
                    raw: { ...emp, estado: emp.estado || 'Activo' } 
                }));
                
            setEmpleadosGrid(empleadosFormateados);
        } catch (error) {
            console.error("Error cargando usuarios:", error);
        }
    };

    useEffect(() => { 
        fetchSalidas(); 
        fetchUsuarios();
    }, []);

    const pendientes = salidas.filter(s => s.estado === 'Pendiente' || s.estado === 'Aprobada');
    const esperandoFirma = salidas.filter(s => s.estado === 'Esperando Firma');
    const esperandoDevolucion = salidas.filter(s => s.estado === 'Esperando Devolucion');
    const historial = salidas.filter(s => !['Pendiente', 'Aprobada', 'Esperando Firma', 'Esperando Devolucion'].includes(s.estado));

    const custodiaPorEmpleado = useMemo(() => {
        const entregadas = salidas.filter(s => s.estado === 'Entregada' && s.solicitadoPorId);
        
        const agrupado = entregadas.reduce((acc, salida) => {
            const empId = salida.solicitadoPorId;
            if (!acc[empId]) {
                acc[empId] = {
                    empleadoInfo: salida.solicitante,
                    items: []
                };
            }
            acc[empId].items.push(salida);
            return acc;
        }, {});

        return Object.values(agrupado);
    }, [salidas]);

    const abrirModalEntrega = async (salida) => {
        setSelectedSalida(salida);
        setSerialElegido('');
        setReceptorElegido(salida.solicitadoPorId ? salida.solicitadoPorId.toString() : '');
        
        if (salida.consumible?.tipo === 'serializado') {
            setProcesando(true);
            try {
                const res = await fetch(`/api/inventario/consumibles/${salida.consumibleId}/seriales-disponibles`);
                const data = await res.json();
                setSerialesDisponibles(data.map(s => ({ value: s.id.toString(), label: `Serial: ${s.serial}` })));
            } catch (error) {
                notifications.show({ title: 'Error', message: 'No se pudieron cargar los seriales.', color: 'red' });
            } finally {
                setProcesando(false);
            }
        }
    };

    const handleConfirmarEntrega = async () => {
        if (selectedSalida.consumible?.tipo === 'serializado' && !serialElegido) {
            return notifications.show({ message: 'Debe seleccionar el serial exacto que está entregando.', color: 'orange' });
        }

        if (!receptorElegido) {
            return notifications.show({ message: 'Debe seleccionar al empleado que recibe físicamente el material.', color: 'orange' });
        }

        setProcesando(true);
        try {
            const res = await fetch(`/api/inventario/salidas/${selectedSalida.id}/entregar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    serialAsignadoId: serialElegido || null,
                    receptorId: receptorElegido 
                })
            });

            if (res.ok) {
                notifications.show({ title: 'Despachado', message: 'Material entregado. Esperando firma.', color: 'teal' });
                setSelectedSalida(null);
                fetchSalidas();
            } else {
                const data = await res.json();
                throw new Error(data.error);
            }
        } catch (error) {
            notifications.show({ title: 'Error', message: error.message, color: 'red' });
        } finally {
            setProcesando(false);
        }
    };

    const handleConfirmarDevolucion = async (id, accion) => {
        let motivoRechazo = '';
        
        if (accion === 'Rechazar') {
            motivoRechazo = window.prompt("Indique el motivo por el cual rechaza recibir el equipo (Ej: Vino roto, faltan piezas):");
            if (!motivoRechazo) {
                return notifications.show({ message: 'Debe indicar un motivo para rechazar.', color: 'orange' });
            }
        }

        setProcesando(true);
        try {
            const res = await fetch(`/api/inventario/salidas/${id}/confirmar-devolucion`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accion, motivoRechazo })
            });

            if (res.ok) {
                const data = await res.json();
                notifications.show({ title: 'Proceso Exitoso', message: data.message, color: 'teal' });
                fetchSalidas(); 
            } else {
                const err = await res.json();
                throw new Error(err.error || 'Error procesando la devolución');
            }
        } catch (error) {
            notifications.show({ title: 'Error', message: error.message, color: 'red' });
        } finally {
            setProcesando(false);
        }
    };

    // 🔥 NUEVA FUNCIÓN PARA EL BOTÓN DE DIOS 🔥
    const handleForzarDevolucion = async (id) => {
        if (!confirm('⚠️ ATENCIÓN: ¿Deseas forzar la devolución de este material al almacén? Esto liberará al empleado de su responsabilidad inmediatamente.')) return;
        
        setProcesando(true);
        try {
            const res = await fetch(`/api/inventario/salidas/${id}/forzar-devolucion`, { method: 'POST' });
            if (res.ok) {
                notifications.show({ title: 'Devolución Forzada', message: 'El ítem regresó al almacén y el empleado fue notificado.', color: 'teal' });
                fetchSalidas();
            } else {
                const data = await res.json();
                throw new Error(data.error);
            }
        } catch (error) {
            notifications.show({ title: 'Error', message: error.message, color: 'red' });
        } finally {
            setProcesando(false);
        }
    };

    const renderInfoEmpleado = (personaRelacionada) => {
        if (!personaRelacionada || !personaRelacionada.empleado) {
            return (
                <Group gap="xs">
                    <Avatar color="gray" radius="xl"><IconUser size={16} /></Avatar>
                    <Box>
                        <Text fw={600} size="sm">Usuario Sistema</Text>
                        <Text size="xs" c="dimmed">No asignado / Directo</Text>
                    </Box>
                </Group>
            );
        }

        const emp = personaRelacionada.empleado;
        const nombreCompleto = `${emp.nombre} ${emp.apellido}`;
        const iniciales = `${emp.nombre.charAt(0)}${emp.apellido.charAt(0)}`.toUpperCase();
        const urlFoto = emp.fotoPerfil ? `${blobBaseUrl}/${emp.fotoPerfil}` : null;

        return (
            <Group gap="xs" wrap="nowrap">
                <Avatar src={urlFoto} color="blue" radius="xl">{iniciales}</Avatar>
                <Box>
                    <Text fw={700} size="sm" c="dark.9">{nombreCompleto}</Text>
                    <Text size="xs" c="dimmed" lh={1}>@{personaRelacionada.user}</Text>
                </Box>
            </Group>
        );
    };

    return (
        <Paper shadow="md" p="xl" radius="md" mt={30}>
            <Group justify="space-between" mb="xl">
                <Title order={2}>Gestión de Despachos (Salidas)</Title>
                <Button leftSection={<IconPlus size={16} />} onClick={() => router.push('/superuser/inventario/salidas/nueva')} color="gray" variant="light">
                    Salida Manual (Legacy)
                </Button>
            </Group>

            <Tabs defaultValue="pendientes" color="blue">
                <Tabs.List mb="md">
                    <Tabs.Tab value="pendientes" leftSection={<IconAlertCircle size={16} />} rightSection={
                        pendientes.length > 0 ? <Badge size="xs" color="red" variant="filled">{pendientes.length}</Badge> : null
                    }>
                        Por Entregar
                    </Tabs.Tab>

                    <Tabs.Tab value="esperando" leftSection={<IconClock size={16} />} rightSection={
                        esperandoFirma.length > 0 ? <Badge size="xs" color="orange" variant="filled" className="animate-pulse">{esperandoFirma.length}</Badge> : null
                    }>
                        Esperando Firma
                    </Tabs.Tab>

                    <Tabs.Tab value="devoluciones" leftSection={<IconBox size={16} />} rightSection={
                        esperandoDevolucion.length > 0 ? <Badge size="xs" color="violet" variant="filled" className="animate-pulse">{esperandoDevolucion.length}</Badge> : null
                    }>
                        Recibir Devolución
                    </Tabs.Tab>

                    <Tabs.Tab value="custodia" leftSection={<IconTool size={16} />}>
                        En Custodia (Pañol)
                    </Tabs.Tab>

                    <Tabs.Tab value="historial" leftSection={<IconChecklist size={16} />}>
                        Historial General
                    </Tabs.Tab>
                </Tabs.List>

                {/* --- PESTAÑAS EXISTENTES --- */}
                <Tabs.Panel value="pendientes">
                    <Table.ScrollContainer minWidth={800}>
                        <Table striped highlightOnHover verticalSpacing="sm">
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Empleado Solicitante</Table.Th>
                                    <Table.Th>Material / Herramienta</Table.Th>
                                    <Table.Th>Cantidad</Table.Th>
                                    <Table.Th>Destino</Table.Th>
                                    <Table.Th ta="center">Acción</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {pendientes.map((item) => (
                                    <Table.Tr key={item.id}>
                                        <Table.Td>
                                            {renderInfoEmpleado(item.solicitante)}
                                            <Text size="xs" c="dimmed" mt={4}>Generado: {new Date(item.createdAt).toLocaleString()}</Text>
                                        </Table.Td>
                                        <Table.Td fw={700} c="blue.9">{item.consumible?.nombre}</Table.Td>
                                        <Table.Td fw={900} c="red.7">{parseFloat(item.cantidad)} {item.consumible?.unidadMedida}</Table.Td>
                                        <Table.Td>{item.destinoUbicacion || item.activo?.codigoActivo || 'Consumo General'}</Table.Td>
                                        <Table.Td ta="center">
                                            <Button size="xs" color="teal" leftSection={<IconBox size={14}/>} onClick={() => abrirModalEntrega(item)}>
                                                Despachar
                                            </Button>
                                        </Table.Td>
                                    </Table.Tr>
                                ))}
                                {pendientes.length === 0 && (
                                    <Table.Tr><Table.Td colSpan={5}><Text ta="center" c="dimmed" my="lg">No hay personal esperando materiales.</Text></Table.Td></Table.Tr>
                                )}
                            </Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>
                </Tabs.Panel>

                <Tabs.Panel value="esperando">
                    <Table.ScrollContainer minWidth={800}>
                        <Table striped verticalSpacing="sm">
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Empleado con Custodia</Table.Th>
                                    <Table.Th>Material Secuestrado</Table.Th>
                                    <Table.Th>Despachado El</Table.Th>
                                    <Table.Th>Estado</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {esperandoFirma.map((item) => (
                                    <Table.Tr key={item.id} bg="orange.0">
                                        <Table.Td>{renderInfoEmpleado(item.solicitante)}</Table.Td>
                                        <Table.Td fw={700}>{item.consumible?.nombre}</Table.Td>
                                        <Table.Td>{new Date(item.updatedAt).toLocaleString()}</Table.Td>
                                        <Table.Td><Badge color="orange" variant="filled">Falta Firma</Badge></Table.Td>
                                    </Table.Tr>
                                ))}
                                {esperandoFirma.length === 0 && (
                                    <Table.Tr><Table.Td colSpan={4}><Text ta="center" c="dimmed" my="lg">Todos los empleados han firmado sus materiales.</Text></Table.Td></Table.Tr>
                                )}
                            </Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>
                </Tabs.Panel>

                <Tabs.Panel value="devoluciones">
                    <Table.ScrollContainer minWidth={800}>
                        <Table striped verticalSpacing="sm">
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Empleado que Devuelve</Table.Th>
                                    <Table.Th>Material</Table.Th>
                                    <Table.Th>Cantidad</Table.Th>
                                    <Table.Th ta="center">Acción en Mostrador</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {esperandoDevolucion.map((item) => (
                                    <Table.Tr key={item.id}>
                                        <Table.Td>{renderInfoEmpleado(item.solicitante)}</Table.Td>
                                        <Table.Td fw={700}>{item.consumible?.nombre}</Table.Td>
                                        <Table.Td fw={900}>{parseFloat(item.cantidad)} {item.consumible?.unidadMedida}</Table.Td>
                                        <Table.Td ta="center">
                                            <Group justify="center">
                                                <Button size="xs" color="red" variant="subtle" onClick={() => handleConfirmarDevolucion(item.id, 'Rechazar')} loading={procesando}>
                                                    Rechazar Defecto
                                                </Button>
                                                <Button size="xs" color="violet" onClick={() => handleConfirmarDevolucion(item.id, 'Aceptar')} loading={procesando}>
                                                    Aceptar e Ingresar a Stock
                                                </Button>
                                            </Group>
                                        </Table.Td>
                                    </Table.Tr>
                                ))}
                                {esperandoDevolucion.length === 0 && (
                                    <Table.Tr><Table.Td colSpan={4} ta="center" c="dimmed" my="lg">No hay devoluciones en ventanilla.</Table.Td></Table.Tr>
                                )}
                            </Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>
                </Tabs.Panel>

                {/* 🔥 PESTAÑA DE PAÑOL ACTUALIZADA CON EL BOTÓN DE DIOS 🔥 */}
                <Tabs.Panel value="custodia">
                    {custodiaPorEmpleado.length === 0 ? (
                        <Text ta="center" c="dimmed" my="xl">Ningún empleado tiene herramientas o materiales en custodia activa.</Text>
                    ) : (
                        <Accordion variant="separated" radius="md" mt="md">
                            {custodiaPorEmpleado.map((grupo, index) => (
                                <Accordion.Item key={index} value={`emp-${index}`}>
                                    <Accordion.Control>
                                        <Group justify="space-between" pr="md">
                                            {renderInfoEmpleado(grupo.empleadoInfo)}
                                            <Badge color="blue" size="lg" variant="light">
                                                {grupo.items.length} {grupo.items.length === 1 ? 'Ítem' : 'Ítems'}
                                            </Badge>
                                        </Group>
                                    </Accordion.Control>
                                    <Accordion.Panel>
                                        <ScrollArea>
                                            <Table striped withTableBorder>
                                                <Table.Thead bg="gray.1">
                                                    <Table.Tr>
                                                        <Table.Th>Repuesto / Herramienta</Table.Th>
                                                        <Table.Th>Cantidad</Table.Th>
                                                        <Table.Th>Fecha de Entrega y Firma</Table.Th>
                                                        <Table.Th>Justificación</Table.Th>
                                                        {/* Se añade columna solo si el usuario es super admin */}
                                                        {userId === 1 && <Table.Th ta="center">Admin Override</Table.Th>}
                                                    </Table.Tr>
                                                </Table.Thead>
                                                <Table.Tbody>
                                                    {grupo.items.map((item) => (
                                                        <Table.Tr key={item.id}>
                                                            <Table.Td fw={700} c="dark.9">{item.consumible?.nombre}</Table.Td>
                                                            <Table.Td fw={900}>{parseFloat(item.cantidad)} {item.consumible?.unidadMedida}</Table.Td>
                                                            <Table.Td>{new Date(item.updatedAt).toLocaleDateString('es-VE')} - {new Date(item.updatedAt).toLocaleTimeString('es-VE', {hour: '2-digit', minute:'2-digit'})}</Table.Td>
                                                            <Table.Td><Text size="xs" c="dimmed" lineClamp={2}>{item.justificacion || 'No indicada'}</Text></Table.Td>
                                                            {/* El botón de Override exclusivo para ID 1 */}
                                                            {userId === 1 && (
                                                                <Table.Td ta="center">
                                                                    <Button size="xs" color="red" variant="light" leftSection={<IconShieldLock size={14} />} onClick={() => handleForzarDevolucion(item.id)} loading={procesando}>
                                                                        Forzar
                                                                    </Button>
                                                                </Table.Td>
                                                            )}
                                                        </Table.Tr>
                                                    ))}
                                                </Table.Tbody>
                                            </Table>
                                        </ScrollArea>
                                    </Accordion.Panel>
                                </Accordion.Item>
                            ))}
                        </Accordion>
                    )}
                </Tabs.Panel>

                <Tabs.Panel value="historial">
                    <Table.ScrollContainer minWidth={1000}>
                        <Table striped verticalSpacing="sm">
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Fecha Acción</Table.Th>
                                    <Table.Th>Custodio (Recibe)</Table.Th>
                                    <Table.Th>Despachador (Entrega)</Table.Th>
                                    <Table.Th>Consumible</Table.Th>
                                    <Table.Th>Cantidad</Table.Th>
                                    <Table.Th>Estado</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {historial.map((item) => (
                                    <Table.Tr key={item.id}>
                                        <Table.Td>{new Date(item.updatedAt || item.fecha).toLocaleString()}</Table.Td>
                                        <Table.Td>{renderInfoEmpleado(item.solicitante)}</Table.Td>
                                        <Table.Td>{renderInfoEmpleado(item.despachador)}</Table.Td>
                                        <Table.Td>{item.consumible?.nombre}</Table.Td>
                                        <Table.Td fw={700}>- {parseFloat(item.cantidad).toFixed(2)} {item.consumible?.unidadMedida}</Table.Td>
                                        <Table.Td>
                                            <Badge color={
                                                item.estado === 'Devuelta' ? 'cyan' : 
                                                item.estado === 'Rechazada' ? 'red' : 'gray'
                                            }>
                                                {item.estado}
                                            </Badge>
                                        </Table.Td>
                                    </Table.Tr>
                                ))}
                                {historial.length === 0 && (
                                    <Table.Tr><Table.Td colSpan={6}><Text ta="center" c="dimmed" my="lg">No hay historial inactivo.</Text></Table.Td></Table.Tr>
                                )}
                            </Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>
                </Tabs.Panel>
            </Tabs>

            {/* MODAL DE DESPACHO FÍSICO */}
            <Modal opened={!!selectedSalida} onClose={() => setSelectedSalida(null)} title={<Text fw={900} size="lg">Confirmar Entrega de Material</Text>} centered size="xl">
                {selectedSalida && (
                    <Stack>
                        <Alert color="blue" variant="light" p="md">
                            <Text mb="sm">Verifique los detalles del material a despachar:</Text>
                            <Box mb="xs">
                                <Text size="sm"><b>Material:</b> {selectedSalida.consumible?.nombre}</Text>
                                <Text size="sm"><b>Cantidad:</b> {parseFloat(selectedSalida.cantidad)} {selectedSalida.consumible?.unidadMedida}</Text>
                            </Box>
                        </Alert>

                        <ODTSelectableGrid 
                            label="Destinatario Final del Material" 
                            data={empleadosGrid} 
                            value={receptorElegido} 
                            onChange={setReceptorElegido} 
                            multiple={false}
                        />

                        {selectedSalida.consumible?.tipo === 'serializado' && (
                            <Select 
                                mt="md"
                                label="¿Qué serial específico estás entregando?"
                                description="Escanea o selecciona el código de barras de la herramienta/repuesto."
                                placeholder="Buscar serial..."
                                data={serialesDisponibles}
                                value={serialElegido}
                                onChange={setSerialElegido}
                                searchable
                                required
                            />
                        )}

                        <Group justify="flex-end" mt="md">
                            <Button variant="default" onClick={() => setSelectedSalida(null)}>Cancelar</Button>
                            <Button color="teal" onClick={handleConfirmarEntrega} loading={procesando} leftSection={<IconCheck size={16}/>}>
                                Confirmar Entrega
                            </Button>
                        </Group>
                    </Stack>
                )}
            </Modal>
        </Paper>
    );
}