'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
    Table, Button, Group, Text, Paper, Title, Tabs, 
    Badge, Modal, Stack, NumberInput, TextInput, Alert,
    Card, SimpleGrid, Avatar, Divider, List,
    ActionIcon,
    Box
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { 
    IconPlus, IconTruckDelivery, IconChecklist, IconBarcode, 
    IconUserCheck, IconCalendarTime, IconClipboardCheck, IconAlertTriangle 
} from '@tabler/icons-react';
import React from 'react';
import { useAuth } from '@/hooks/useAuth';

export default function BandejaEntradasPage() {
    const router = useRouter();
    const { userId } = useAuth(); // Firma del operador logueado
    
    const [ordenesPendientes, setOrdenesPendientes] = useState([]);
    const [historialEntradas, setHistorialEntradas] = useState([]);
    const [loading, setLoading] = useState(true);

    // Estados para el modal de Recepción Detallada
    const [selectedOC, setSelectedOC] = useState(null);
    const [recepcionData, setRecepcionData] = useState({}); 
    const [procesando, setProcesando] = useState(false);
    const [fechaHoraActual, setFechaHoraActual] = useState('');

    const fetchData = async () => {
        setLoading(true);
        try {
            const resOC = await fetch('/api/compras/ordenes-compra?estado=Enviada,Recibida Parcial&includeDetails=true')
            const dataOC = await resOC.json();
            setOrdenesPendientes(Array.isArray(dataOC) ? dataOC : (dataOC.items || []));

            const resEnt = await fetch('/api/inventario/entradas');
            const dataEnt = await resEnt.json();
            setHistorialEntradas(Array.isArray(dataEnt) ? dataEnt : []);
        } catch (error) {
            console.error(error);
            notifications.show({ title: 'Error', message: 'No se pudieron cargar las órdenes en tránsito.', color: 'red' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { 
        fetchData(); 
    }, []);

    // Efecto para mantener la hora del mostrador actualizada al abrir la recepción
    useEffect(() => {
        if (selectedOC) {
            const actualizarReloj = () => {
                const ahora = new Date();
                setFechaHoraActual(ahora.toLocaleString('es-VE', { timeZone: 'America/Caracas' }));
            };
            actualizarReloj();
            const interval = setInterval(actualizarReloj, 1000);
            return () => clearInterval(interval);
        }
    }, [selectedOC]);

    const abrirModalRecepcion = (oc) => {
        setSelectedOC(oc);
        const initialData = {};
        
        oc.items?.forEach(item => {
            const cantSoll = parseFloat(item.cantidadSolicitada || 0);
            const cantYaRecibida = parseFloat(item.cantidadRecibida || 0); // Lo que llegó ayer
            const faltante = Math.max(0, cantSoll - cantYaRecibida);

            const requiereSerial = item.consumible?.tipo?.toLowerCase() === 'serializado';

            initialData[item.id] = {
                cantidadRecibida: faltante, // Por defecto, sugerimos que hoy llega todo lo que faltaba
                seriales: Array(Math.ceil(faltante)).fill(''), 
                esSerializado: requiereSerial
            };
        });
        setRecepcionData(initialData);
    };

    const handleCantidadChange = (itemId, nuevaCantidad) => {
        setRecepcionData(prev => {
            const itemData = prev[itemId];
            const cant = Math.max(0, nuevaCantidad);
            return {
                ...prev,
                [itemId]: {
                    ...itemData,
                    cantidadRecibida: cant,
                    seriales: Array(Math.ceil(cant)).fill('').map((_, i) => itemData.seriales[i] || '')
                }
            };
        });
    };

    const handleSerialChange = (itemId, index, value) => {
        setRecepcionData(prev => {
            const nuevosSeriales = [...prev[itemId].seriales];
            nuevosSeriales[index] = value.toUpperCase().trim();
            return { ...prev, [itemId]: { ...prev[itemId], seriales: nuevosSeriales } };
        });
    };

    const handleConfirmarRecepcion = async () => {
        // Validación estricta de seriales obligatorios para herramientas y serializados
        for (const [itemId, data] of Object.entries(recepcionData)) {
            if (data.esSerializado && data.cantidadRecibida > 0) {
                const serialesVacios = data.seriales.some(s => !s || s.trim() === '');
                if (serialesVacios) {
                    return notifications.show({ 
                        title: 'Validación de Seriales', 
                        message: 'Falta ingresar seriales. Toda herramienta o consumible serializado requiere su código único.', 
                        color: 'red' 
                    });
                }
            }
        }

        setProcesando(true);
        try {
            const payload = {
                ordenCompraId: selectedOC.id,
                itemsRecibidos: recepcionData,
                usuarioId: userId 
            };

            const res = await fetch(`/api/inventario/entradas/recibir-oc`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                notifications.show({ title: 'Éxito', message: 'Recepción asentada en libros de inventario.', color: 'green' });
                setSelectedOC(null);
                fetchData();
            } else {
                const errorData = await res.json();
                throw new Error(errorData.error || 'Error en el procesamiento.');
            }
        } catch (error) {
            notifications.show({ title: 'Error de Recepción', message: error.message, color: 'red' });
        } finally {
            setProcesando(false);
        }
    };

    return (
        <Paper shadow="md" p="xl" radius="md" mt={30}>
            <Group justify="space-between" mb="xl">
                <Title order={2}>Recepción de Mercancía (Entradas)</Title>
                <Button leftSection={<IconPlus size={16} />} onClick={() => router.push('/superuser/inventario/entradas/nueva')} color="gray" variant="light">
                    Entrada Manual / Inicial
                </Button>
            </Group>

            <Tabs defaultValue="pendientes" color="blue">
                <Tabs.List mb="md">
                    <Tabs.Tab value="pendientes" leftSection={<IconTruckDelivery size={16} />} rightSection={
                        ordenesPendientes.length > 0 ? <Badge size="xs" color="blue" variant="filled">{ordenesPendientes.length}</Badge> : null
                    }>
                        Mercancía en Tránsito (OC)
                    </Tabs.Tab>
                    <Tabs.Tab value="historial" leftSection={<IconChecklist size={16} />}>
                        Historial de Recepciones
                    </Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="pendientes">
                    <Table.ScrollContainer minWidth={800}>
                        <Table striped highlightOnHover>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Nro. Orden</Table.Th>
                                    <Table.Th>Proveedor</Table.Th>
                                    <Table.Th>Monto Total</Table.Th>
                                    <Table.Th>Fecha OC</Table.Th>
                                    <Table.Th ta="center">Acción</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {ordenesPendientes.map((oc) => (
                                    <Table.Tr key={oc.id}>
                                        <Table.Td fw={800} c="blue.9">
                                            {oc.numeroOrden} <br/>
                                            <Badge size="xs" color={oc.estado === 'Recibida Parcial' ? 'yellow.8' : 'blue'}>{oc.estado}</Badge>
                                        </Table.Td>
                                        <Table.Td>{oc.proveedor?.nombre}</Table.Td>
                                        <Table.Td>${parseFloat(oc.montoTotalReal || 0).toFixed(2)}</Table.Td>
                                        <Table.Td>{new Date(oc.createdAt).toLocaleDateString()}</Table.Td>
                                        <Table.Td ta="center">
                                            <Button size="xs" color="blue" leftSection={<IconTruckDelivery size={14}/>} onClick={() => abrirModalRecepcion(oc)}>
                                                Revisar y Recibir
                                            </Button>
                                        </Table.Td>
                                    </Table.Tr>
                                ))}
                                {ordenesPendientes.length === 0 && (
                                    <Table.Tr><Table.Td colSpan={5}><Text ta="center" c="dimmed" my="lg">No hay Órdenes de Compra autorizadas en camino.</Text></Table.Td></Table.Tr>
                                )}
                            </Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>
                </Tabs.Panel>

                <Tabs.Panel value="historial">
                    <Table.ScrollContainer minWidth={800}>
                        <Table striped>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Fecha/Hora Registro</Table.Th>
                                    <Table.Th>Consumible / Herramienta</Table.Th>
                                    <Table.Th>Cantidad Ingresada</Table.Th>
                                    <Table.Th>Costo Unitario</Table.Th>
                                    <Table.Th>Almacenista Receptor</Table.Th>
                                    <Table.Th>Documento Origen</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {historialEntradas.map((item) => (
                                    <Table.Tr key={item.id}>
                                        <Table.Td>{new Date(item.fecha || item.createdAt).toLocaleString()}</Table.Td>
                                        <Table.Td fw={600}>{item.consumible?.nombre}</Table.Td>
                                        <Table.Td fw={700} c="green.8">+ {parseFloat(item.cantidad).toFixed(2)} {item.consumible?.unidadMedida}</Table.Td>
                                        <Table.Td>${parseFloat(item.costoUnitario || 0).toFixed(2)}</Table.Td>
                                        <Table.Td>
                                            <Group gap="xs">
                                                <Avatar radius="xl" color="orange" size="xs"/>
                                                <Text size="sm">{item.usuario?.nombre || `User ID: #${item.usuarioId || 'S/N'}`}</Text>
                                            </Group>
                                        </Table.Td>
                                        <Table.Td><Badge color="gray" variant="light">{item.observacion || 'Ingreso Manual'}</Badge></Table.Td>
                                    </Table.Tr>
                                ))}
                                {historialEntradas.length === 0 && (
                                    <Table.Tr><Table.Td colSpan={6}><Text ta="center" c="dimmed" my="lg">No hay registros de entradas previas.</Text></Table.Td></Table.Tr>
                                )}
                            </Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>
                </Tabs.Panel>
            </Tabs>

            {/* 🔥 MODAL DE RECEPCIÓN DETALLADA Y AUDITADA 🔥 */}
            <Modal 
                opened={!!selectedOC} 
                onClose={() => setSelectedOC(null)} 
                title={<Text fw={900} size="lg" c="blue.9" tt="uppercase">Procesamiento de Carga: {selectedOC?.numeroOrden}</Text>} 
                size="100rem"
                centered
            >
                {selectedOC && (
                    <Stack gap="md">
                        {/* TARJETA DE AUDITORÍA DE TIEMPO REAL */}
                        <Card withBorder radius="md" p="sm" bg="gray.0">
                            <Text size="xs" fw={800} c="dimmed" tt="uppercase" mb="xs">Firma Digital de Recepción (Auditoría)</Text>
                            <SimpleGrid cols={{ base: 1, sm: 3 }}>
                                <Group gap="sm">
                                    <ActionIcon variant="light" color="orange" radius="xl" size="lg"><IconUserCheck size={20}/></ActionIcon>
                                    <Box>
                                        <Text size="xs" c="dimmed">Responsable Receptor</Text>
                                        <Text size="sm" fw={700}>Usuario de Sistema: #{userId || 'No detectado'}</Text>
                                    </Box>
                                </Group>
                                <Group gap="sm">
                                    <ActionIcon variant="light" color="blue" radius="xl" size="lg"><IconCalendarTime size={20}/></ActionIcon>
                                    <Box>
                                        <Text size="xs" c="dimmed">Fecha/Hora de Operación</Text>
                                        <Text size="sm" fw={700} c="blue.9">{fechaHoraActual}</Text>
                                    </Box>
                                </Group>
                                <Group gap="sm">
                                    <ActionIcon variant="light" color="teal" radius="xl" size="lg"><IconClipboardCheck size={20}/></ActionIcon>
                                    <Box>
                                        <Text size="xs" c="dimmed">Origen de Carga</Text>
                                        <Text size="sm" fw={700}>Proveedor: {selectedOC.proveedor?.nombre || 'N/A'}</Text>
                                    </Box>
                                </Group>
                            </SimpleGrid>
                        </Card>

                        <Text fw={800} size="sm" tt="uppercase" c="dark.7">Verificación de Ítems e Insumos en Factura</Text>
                        
                        <Table withTableBorder withColumnBorders striped highlightOnHover>
                            <Table.Thead bg="dark.9">
                                <Table.Tr>
                                    <Table.Th c="white">Material / Insumo</Table.Th>
                                    <Table.Th c="white" ta="center">Comprado</Table.Th>
                                    <Table.Th c="white" ta="center">Llegó Antes</Table.Th>
                                    <Table.Th c="white" ta="center">Falta</Table.Th>
                                    <Table.Th c="white" ta="center" w={160}>Entrando HOY</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {selectedOC.items?.map(item => {
                                    const dataItem = recepcionData[item.id];
                                    if (!dataItem) return null;

                                    const cantSoll = parseFloat(item.cantidadSolicitada || 0);
                                    const yaRecibida = parseFloat(item.cantidadRecibida || 0);
                                    const faltanteReal = Math.max(0, cantSoll - yaRecibida);

                                    // Si ya se entregó todo en una recepción pasada, no lo mostramos para no confundir
                                    if (faltanteReal === 0) return null;

                                    return (
                                        <React.Fragment key={item.id}>
                                            <Table.Tr>
                                                <Table.Td>
                                                    <Text fw={700} size="sm">{item.consumible?.nombre}</Text>
                                                </Table.Td>
                                                <Table.Td ta="center"><Text size="sm">{cantSoll}</Text></Table.Td>
                                                <Table.Td ta="center"><Badge color="blue" variant="light">{yaRecibida}</Badge></Table.Td>
                                                <Table.Td ta="center"><Badge color="orange" variant="filled">{faltanteReal}</Badge></Table.Td>
                                                <Table.Td>
                                                    <NumberInput 
                                                        value={dataItem.cantidadRecibida} 
                                                        onChange={(v) => handleCantidadChange(item.id, v || 0)} 
                                                        min={0} 
                                                        max={faltanteReal} // No puede recibir más de lo que falta
                                                        decimalScale={2}
                                                        allowNegative={false}
                                                    />
                                                </Table.Td>
                                            </Table.Tr>
                                            
                                            {/* SERIALES (Se muestran solo para la cantidad que entra HOY) */}
                                            {dataItem.esSerializado && dataItem.cantidadRecibida > 0 && (
                                                <Table.Tr bg="red.0" style={{ borderColor: '#ffc9c9' }}>
                                                    <Table.Td colSpan={5}>
                                                        <Box p="xs">
                                                            <Text size="xs" fw={800} c="red.9" mb="xs">
                                                                <IconBarcode size={16} style={{ marginRight: 6, verticalAlign:'middle' }}/> 
                                                                ASIGNE {dataItem.cantidadRecibida} SERIALES A LAS UNIDADES ENTRANTES:
                                                            </Text>
                                                            <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} gap="xs">
                                                                {dataItem.seriales.map((serial, idx) => (
                                                                    <TextInput
                                                                        key={`serial-${item.id}-${idx}`}
                                                                        label={`Unidad #${idx + 1}`}
                                                                        value={serial}
                                                                        onChange={(e) => handleSerialChange(item.id, idx, e.currentTarget.value)}
                                                                        required
                                                                        size="xs"
                                                                    />
                                                                ))}
                                                            </SimpleGrid>
                                                        </Box>
                                                    </Table.Td>
                                                </Table.Tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </Table.Tbody>
                        </Table>

                        {/* MENSAJE ADVERTENCIA DE CONTROL PARCIAL */}
                        {(() => {
                            const parcial = Object.values(recepcionData).some(d => d.cantidadRecibida < d.cantidadSoll);
                            return parcial ? (
                                <Alert color="orange" icon={<IconAlertTriangle size={16} />} title="Alerta Administrativa">
                                    Detectó cantidades menores a las compradas. El sistema notificará automáticamente a Administración y marcará la Orden como "Recibida Parcial".
                                </Alert>
                            ) : null;
                        })()}

                        <Divider/>

                        <Group justify="flex-end" gap="sm">
                            <Button variant="default" onClick={() => setSelectedOC(null)}>Anular Operación</Button>
                            <Button color="blue" onClick={handleConfirmarRecepcion} loading={procesando} leftSection={<IconTruckDelivery size={18}/>} size="md">
                                Asentar Entrada en Libros
                            </Button>
                        </Group>
                    </Stack>
                )}
            </Modal>
        </Paper>
    );
}