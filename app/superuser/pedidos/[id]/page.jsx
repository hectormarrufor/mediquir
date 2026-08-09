'use client';

import React, { useState, useEffect, use } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { 
    Box, Button, Group, Title, Text, Paper, Grid, Badge, 
    Table, NumberInput, ActionIcon, Loader, Center, Stack, 
    Divider, Avatar, TextInput, Tabs, Modal, Select, Textarea 
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useRouter } from 'next/navigation';
import { 
    IconArrowLeft, IconTruckDelivery, IconUser, 
    IconReceipt2, IconCheck, IconAlertTriangle, IconCash, IconPlus 
} from '@tabler/icons-react';
import dayjs from 'dayjs';

const STATUS_COLORS = {
    'Pendiente': 'yellow',
    'Parcial': 'blue',
    'Completado': 'green',
    'Cancelado': 'red'
};

const PAGO_COLORS = {
    'Pendiente': 'yellow',
    'Pagado': 'green',
    'Vencido': 'red'
};

export default function PedidoDashboard({ params }) {
    const router = useRouter();
    const queryClient = useQueryClient();
    
    const resolvedParams = use(params);
    const { id } = resolvedParams;

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSubmittingAbono, setIsSubmittingAbono] = useState(false);
    
    // Estados para el formulario de despacho
    const [despachos, setDespachos] = useState({});
    const [quienRetiraEdit, setQuienRetiraEdit] = useState('');
    const [fechaRetiroEdit, setFechaRetiroEdit] = useState('');

    // Modal de Abonos
    const [abonoModalOpened, { open: openAbonoModal, close: closeAbonoModal }] = useDisclosure(false);

    // 1. Fetch del Pedido
    const { data: pedido, isLoading, isError } = useQuery({
        queryKey: ['pedido', id],
        queryFn: async () => {
            const res = await fetch(`/api/pedidos/${id}`);
            if (!res.ok) throw new Error('Error al cargar el pedido');
            return res.json();
        }
    });

    // 2. Fetch de los Abonos del Pedido
    const { data: abonos = [], isLoading: loadingAbonos } = useQuery({
        queryKey: ['abonos', id],
        queryFn: async () => {
            const res = await fetch(`/api/pedidos/${id}/abonos`);
            if (!res.ok) throw new Error('Error al cargar abonos');
            return res.json();
        }
    });

    // Sincronizar datos editables
    useEffect(() => {
        if (pedido) {
            setQuienRetiraEdit(pedido.quienRetira || '');
            if (pedido.fechaHoraRetiro) {
                setFechaRetiroEdit(dayjs(pedido.fechaHoraRetiro).format('YYYY-MM-DDTHH:mm'));
            }
        }
    }, [pedido]);

    // Cálculos Financieros
    const totalAbonado = abonos.reduce((sum, abono) => sum + Number(abono.montoUsd), 0);
    const totalPedido = pedido ? Number(pedido.total) : 0;
    const deudaRestante = Math.max(0, totalPedido - totalAbonado); // Evita números negativos por decimales

    // Formulario de Nuevo Abono
    const formAbono = useForm({
        initialValues: {
            fechaPago: dayjs().format('YYYY-MM-DD'), // Por defecto hoy
            montoUsd: deudaRestante || 0,
            metodoPago: 'Transferencia',
            referencia: '',
            notas: ''
        },
        validate: {
            fechaPago: (val) => (!val ? 'La fecha es obligatoria' : null),
            montoUsd: (val) => (val <= 0 || val > deudaRestante + 0.01 ? 'Monto inválido (no puede superar la deuda)' : null),
            metodoPago: (val) => (!val ? 'Seleccione un método de pago' : null),
        }
    });

    // Actualizar el monto sugerido cuando cambia la deuda
    useEffect(() => {
        if (abonoModalOpened) {
            formAbono.setFieldValue('montoUsd', deudaRestante);
        }
    }, [abonoModalOpened, deudaRestante]);

    if (isLoading) return <Center h="70vh"><Loader size="xl" /></Center>;
    if (isError || !pedido) return <Center h="70vh"><Text c="red">Error cargando el Dashboard del Pedido.</Text></Center>;

    const isCompletado = pedido.statusDespacho === 'Completado' || pedido.statusDespacho === 'Cancelado';

    // --- MANEJADORES ---
    const handleDespachoChange = (renglonId, value) => {
        setDespachos(prev => ({
            ...prev,
            [renglonId]: value === '' ? 0 : Number(value)
        }));
    };

    const handleProcesarDespacho = async () => {
        const tieneCantidades = Object.values(despachos).some(val => val > 0);
        if (!tieneCantidades) {
            notifications.show({ title: 'Aviso', message: 'No has ingresado cantidades a despachar.', color: 'yellow' });
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await fetch(`/api/pedidos/${id}/despachar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ despachos, quienRetira: quienRetiraEdit, fechaHoraRetiro: fechaRetiroEdit })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al procesar el despacho');

            notifications.show({ title: 'Éxito', message: 'Despacho registrado correctamente', color: 'green' });
            setDespachos({});
            queryClient.invalidateQueries({ queryKey: ['pedido', id] });
            queryClient.invalidateQueries({ queryKey: ['productos'] });
        } catch (error) {
            notifications.show({ title: 'Error', message: error.message, color: 'red' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleRegistrarAbono = async (values) => {
        setIsSubmittingAbono(true);
        try {
            const res = await fetch(`/api/pedidos/${id}/abonos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(values)
            });
            const data = await res.json();
            
            if (!res.ok) throw new Error(data.error || 'Error al registrar el abono');

            notifications.show({ 
                title: 'Abono Registrado', 
                message: `Equivalente calculado: Bs. ${Number(data.montoVes).toFixed(2)}`, 
                color: 'green' 
            });
            
            queryClient.invalidateQueries({ queryKey: ['abonos', id] });
            queryClient.invalidateQueries({ queryKey: ['pedido', id] }); // Para actualizar el statusPago en la cabecera
            closeAbonoModal();
            formAbono.reset();
        } catch (error) {
            notifications.show({ title: 'Error de Facturación', message: error.message, color: 'red', autoClose: 6000 });
        } finally {
            setIsSubmittingAbono(false);
        }
    };

    return (
        <Box p="md" maw={1200} mx="auto">
            {/* HEADER DEL DASHBOARD */}
            <Group justify="space-between" mb="xl" align="flex-start">
                <Box>
                    <Group mb="xs">
                        <ActionIcon variant="subtle" color="gray" onClick={() => router.push('/superuser/pedidos')} size="lg">
                            <IconArrowLeft size={24} />
                        </ActionIcon>
                        <Title order={2} c="blue.9">Pedido #{String(pedido.id).padStart(5, '0')}</Title>
                        <Badge size="xl" color={STATUS_COLORS[pedido.statusDespacho]} variant="filled">
                            {pedido.statusDespacho}
                        </Badge>
                        <Badge size="xl" color={PAGO_COLORS[pedido.statusPago]} variant="outline">
                            Pago {pedido.statusPago}
                        </Badge>
                    </Group>
                    <Text c="dimmed" ml={44}>
                        Registrado el: {dayjs(pedido.createdAt).format('DD MMM YYYY, hh:mm A')} 
                        {pedido.condicionPago === 'Credito' && ` | Vence: ${dayjs(pedido.fechaVencimiento).format('DD MMM YYYY')}`}
                    </Text>
                </Box>
                
                <Stack align="flex-end" gap={4}>
                    <Badge color={pedido.condicionPago === 'Credito' ? 'violet' : 'gray'} size="lg" variant="light">
                        Condición: {pedido.condicionPago}
                    </Badge>
                    {pedido.esFacturado && (
                        <Badge color="blue" size="sm" variant="dot">Requiere Factura Fiscal</Badge>
                    )}
                </Stack>
            </Group>

            {/* TARJETAS DE RESUMEN */}
            <Grid mb="xl" gutter="md">
                <Grid.Col span={{ base: 12, md: 4 }}>
                    <Paper withBorder p="md" radius="md" bg="gray.0" h="100%">
                        <Group mb="sm">
                            <IconUser color="gray" size={24}/>
                            <Title order={5} c="gray.7">Datos del Cliente</Title>
                        </Group>
                        <Text fw={700} size="lg">{pedido.cliente?.nombre || pedido.cliente?.razonSocial}</Text>
                        <Text size="sm" c="dimmed">RIF/CI: {pedido.cliente?.identificacion}</Text>
                        <Text size="sm" c="dimmed" mt="xs" lineClamp={2}>{pedido.cliente?.direccion}</Text>
                    </Paper>
                </Grid.Col>

                <Grid.Col span={{ base: 12, md: 4 }}>
                    <Paper withBorder p="md" radius="md" bg="blue.0" h="100%">
                        <Group mb="sm">
                            <IconTruckDelivery color="#1864AB" size={24}/>
                            <Title order={5} c="blue.9">Logística de Entrega</Title>
                        </Group>
                        <Stack gap="xs">
                            <TextInput 
                                size="xs" label="Quién Retira:" 
                                value={quienRetiraEdit} onChange={(e) => setQuienRetiraEdit(e.currentTarget.value)}
                                disabled={isCompletado}
                            />
                            <TextInput 
                                size="xs" type="datetime-local" label="Fecha/Hora Agendada:" 
                                value={fechaRetiroEdit} onChange={(e) => setFechaRetiroEdit(e.currentTarget.value)}
                                disabled={isCompletado}
                            />
                        </Stack>
                    </Paper>
                </Grid.Col>

                <Grid.Col span={{ base: 12, md: 4 }}>
                    <Paper withBorder p="md" radius="md" bg={deudaRestante > 0 ? 'red.0' : 'green.0'} h="100%">
                        <Group mb="sm">
                            <IconReceipt2 color={deudaRestante > 0 ? 'red' : 'green'} size={24}/>
                            <Title order={5} c={deudaRestante > 0 ? 'red.9' : 'green.9'}>Resumen Financiero</Title>
                        </Group>
                        <Group justify="space-between" mt="sm">
                            <Text size="sm">Total del Pedido:</Text>
                            <Text size="sm" fw={700}>${totalPedido.toFixed(2)}</Text>
                        </Group>
                        <Group justify="space-between">
                            <Text size="sm">Total Abonado:</Text>
                            <Text size="sm" fw={700} c="green.9">${totalAbonado.toFixed(2)}</Text>
                        </Group>
                        <Divider my="xs" color={deudaRestante > 0 ? 'red.3' : 'green.3'}/>
                        <Group justify="space-between">
                            <Text size="lg" fw={800} c={deudaRestante > 0 ? 'red.9' : 'gray'}>RESTA:</Text>
                            <Text size="xl" fw={900} c={deudaRestante > 0 ? 'red.9' : 'gray'}>${deudaRestante.toFixed(2)}</Text>
                        </Group>
                    </Paper>
                </Grid.Col>
            </Grid>

            {/* PESTAÑAS (TABS) */}
            <Tabs defaultValue="despachos" variant="outline" radius="md">
                <Tabs.List bg="white">
                    <Tabs.Tab value="despachos" leftSection={<IconTruckDelivery size={16} />}>Despacho e Inventario</Tabs.Tab>
                    <Tabs.Tab value="abonos" leftSection={<IconCash size={16} />}>Pagos y Abonos</Tabs.Tab>
                </Tabs.List>

                {/* TAB 1: DESPACHO */}
                <Tabs.Panel value="despachos" pt="md">
                    <Paper withBorder p="xl" radius="md" shadow="sm">
                        <Title order={4} mb="lg" c="gray.8">Renglones del Pedido</Title>
                        <Box style={{ overflowX: 'auto' }}>
                            <Table striped highlightOnHover verticalSpacing="sm" minWidth={900}>
                                <Table.Thead bg="gray.1">
                                    <Table.Tr>
                                        <Table.Th>Producto</Table.Th>
                                        <Table.Th ta="center">Solicitado</Table.Th>
                                        <Table.Th ta="center">Entregado</Table.Th>
                                        <Table.Th ta="center">Pendiente</Table.Th>
                                        <Table.Th ta="center">Stock Almacén</Table.Th>
                                        {!isCompletado && (
                                            <Table.Th ta="center" w={150} bg="blue.1">Despachar Hoy</Table.Th>
                                        )}
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {pedido.renglones.map((renglon) => {
                                        const pendiente = renglon.cantidadSolicitada - renglon.cantidadDespachada;
                                        const stockActual = Number(renglon.producto.stockAlmacen);
                                        const isSinStock = stockActual < pendiente && pendiente > 0;
                                        const filaCompletada = pendiente === 0;

                                        return (
                                            <Table.Tr key={renglon.id} bg={filaCompletada ? 'green.0' : undefined}>
                                                <Table.Td>
                                                    <Group gap="sm" wrap="nowrap">
                                                        <Avatar 
                                                            src={renglon.producto.imagen ? `${process.env.NEXT_PUBLIC_BLOB_BASE_URL}/${renglon.producto.imagen}` : null} 
                                                            radius="sm" size="md" color="blue"
                                                        >
                                                            {renglon.producto.nombre.charAt(0)}
                                                        </Avatar>
                                                        <Box>
                                                            <Text size="sm" fw={600} lineClamp={2}>{renglon.producto.nombre}</Text>
                                                            <Text size="xs" c="dimmed">Precio Congelado: ${Number(renglon.precioFijo).toFixed(2)}</Text>
                                                        </Box>
                                                    </Group>
                                                </Table.Td>
                                                <Table.Td ta="center"><Badge color="gray" variant="light" size="lg">{renglon.cantidadSolicitada}</Badge></Table.Td>
                                                <Table.Td ta="center"><Badge color="blue" variant="filled" size="lg">{renglon.cantidadDespachada}</Badge></Table.Td>
                                                <Table.Td ta="center"><Text fw={800} size="lg" c={filaCompletada ? 'green' : 'orange.7'}>{pendiente}</Text></Table.Td>
                                                <Table.Td ta="center">
                                                    <Group gap="xs" justify="center" wrap="nowrap">
                                                        <Text fw={600} c={isSinStock ? 'red' : 'green'}>{stockActual}</Text>
                                                        {isSinStock && <IconAlertTriangle size={16} color="red" title="Stock insuficiente" />}
                                                    </Group>
                                                </Table.Td>
                                                {!isCompletado && (
                                                    <Table.Td bg="blue.0" ta="center">
                                                        <NumberInput
                                                            disabled={filaCompletada || stockActual === 0}
                                                            value={despachos[renglon.id] !== undefined ? despachos[renglon.id] : ''}
                                                            onChange={(val) => handleDespachoChange(renglon.id, val)}
                                                            min={0} max={Math.min(pendiente, stockActual)} placeholder="0"
                                                            styles={{ input: { textAlign: 'center', fontWeight: 'bold' } }}
                                                        />
                                                    </Table.Td>
                                                )}
                                            </Table.Tr>
                                        );
                                    })}
                                </Table.Tbody>
                            </Table>
                        </Box>
                        {!isCompletado && (
                            <Group justify="flex-end" mt="xl">
                                <Button color="blue.9" leftSection={<IconCheck size={18} />} onClick={handleProcesarDespacho} loading={isSubmitting}>
                                    Confirmar Despacho
                                </Button>
                            </Group>
                        )}
                    </Paper>
                </Tabs.Panel>

                {/* TAB 2: PAGOS Y ABONOS */}
                <Tabs.Panel value="abonos" pt="md">
                    <Paper withBorder p="xl" radius="md" shadow="sm">
                        <Group justify="space-between" mb="lg">
                            <Title order={4} c="gray.8">Historial de Recibos de Pago</Title>
                            <Button 
                                color="green.7" leftSection={<IconPlus size={16}/>} 
                                onClick={openAbonoModal} disabled={deudaRestante <= 0 || pedido.statusDespacho === 'Cancelado'}
                            >
                                Registrar Abono
                            </Button>
                        </Group>

                        {loadingAbonos ? (
                            <Center py="xl"><Loader color="green" /></Center>
                        ) : (
                            <Table striped highlightOnHover verticalSpacing="sm">
                                <Table.Thead bg="gray.1">
                                    <Table.Tr>
                                        <Table.Th>Fecha</Table.Th>
                                        <Table.Th>Método y Referencia</Table.Th>
                                        <Table.Th>Tasa BCV del Día</Table.Th>
                                        <Table.Th>Equivalente en Bs</Table.Th>
                                        <Table.Th ta="right">Monto Abonado ($)</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {abonos.length === 0 ? (
                                        <Table.Tr>
                                            <Table.Td colSpan={5} ta="center" py="xl"><Text c="dimmed">No hay abonos registrados para este pedido.</Text></Table.Td>
                                        </Table.Tr>
                                    ) : (
                                        abonos.map((abono) => (
                                            <Table.Tr key={abono.id}>
                                                <Table.Td>{dayjs(abono.fechaPago).format('DD/MM/YYYY')}</Table.Td>
                                                <Table.Td>
                                                    <Text fw={600} size="sm">{abono.metodoPago}</Text>
                                                    <Text size="xs" c="dimmed">Ref: {abono.referencia || 'N/A'}</Text>
                                                </Table.Td>
                                                <Table.Td>Bs. {Number(abono.tasaBcvAplicada).toFixed(2)}</Table.Td>
                                                <Table.Td fw={500}>Bs. {Number(abono.montoVes).toFixed(2)}</Table.Td>
                                                <Table.Td ta="right" fw={800} c="green.8">+ ${Number(abono.montoUsd).toFixed(2)}</Table.Td>
                                            </Table.Tr>
                                        ))
                                    )}
                                </Table.Tbody>
                            </Table>
                        )}
                    </Paper>
                </Tabs.Panel>
            </Tabs>

            {/* MODAL PARA REGISTRAR NUEVO ABONO */}
            <Modal opened={abonoModalOpened} onClose={closeAbonoModal} title={<Title order={4} c="green.9">Registrar Nuevo Pago</Title>} centered>
                <form onSubmit={formAbono.onSubmit(handleRegistrarAbono)}>
                    <Stack gap="md">
                        <TextInput 
                            type="date" label="Fecha del Abono (Fija la Tasa BCV)" withAsterisk 
                            {...formAbono.getInputProps('fechaPago')} 
                        />
                        <NumberInput 
                            label="Monto Abonado (En Dólares)" withAsterisk prefix="$ " decimalScale={2}
                            max={deudaRestante} 
                            description={`Deuda actual: $${deudaRestante.toFixed(2)}`}
                            {...formAbono.getInputProps('montoUsd')} 
                        />
                        <Select 
                            label="Método de Pago" withAsterisk 
                            data={['Transferencia', 'Pago Móvil', 'Zelle', 'Efectivo USD', 'Punto de Venta']} 
                            {...formAbono.getInputProps('metodoPago')} 
                        />
                        <TextInput 
                            label="Número de Referencia" placeholder="Ej. 12345678" 
                            {...formAbono.getInputProps('referencia')} 
                        />
                        <Textarea 
                            label="Notas Adicionales" placeholder="Opcional..." 
                            {...formAbono.getInputProps('notas')} 
                        />
                        <Button type="submit" color="green.7" fullWidth loading={isSubmittingAbono} mt="md">
                            Procesar Abono
                        </Button>
                    </Stack>
                </form>
            </Modal>
        </Box>
    );
}