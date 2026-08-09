'use client';

import React, { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
    Box, Paper, Title, Text, Avatar, Group, Badge, Grid, 
    Tabs, Table, Stack, Center, Loader, ActionIcon, Card 
} from '@mantine/core';
import { useRouter } from 'next/navigation';
import { IconArrowLeft, IconEdit, IconReceipt2, IconAlertCircle, IconMapPin, IconPhone, IconMail } from '@tabler/icons-react';
import dayjs from 'dayjs';

export default function ClienteDashboard({ params }) {
    const router = useRouter();
    const resolvedParams = use(params);
    const { id } = resolvedParams;

    const { data: cliente, isLoading, isError } = useQuery({
        queryKey: ['cliente', id],
        queryFn: async () => {
            const res = await fetch(`/api/clientes/${id}`);
            if (!res.ok) throw new Error('Error al cargar');
            return res.json();
        }
    });

    if (isLoading) return <Center h="70vh"><Loader size="xl" /></Center>;
    if (isError || !cliente) return <Center h="70vh"><Text c="red">Error cargando el perfil del cliente.</Text></Center>;

    // Cálculos Financieros
    const pedidos = cliente.pedidos || [];
    const ultimoPedido = pedidos[0]; // Como vienen ordenados DESC, el índice 0 es el último

    const totalGastado = pedidos
        .filter(p => p.statusDespacho !== 'Cancelado')
        .reduce((sum, p) => sum + Number(p.total), 0);

    const deudaPendiente = pedidos
        .filter(p => p.statusPago !== 'Pagado' && p.statusDespacho !== 'Cancelado' && p.condicionPago === 'Credito')
        .reduce((sum, p) => sum + Number(p.total), 0);

    return (
        <Box p="md" maw={1200} mx="auto">
            {/* ENCABEZADO TIPO FACEBOOK */}
            <Paper radius="md" withBorder shadow="sm" mb="xl" style={{ overflow: 'hidden' }}>
                {/* Portada (Cover) */}
                <Box h={{ base: 120, md: 200 }} bg="blue.9" pos="relative">
                    <ActionIcon 
                        pos="absolute" top={15} left={15} 
                        variant="white" color="dark" size="lg" radius="xl"
                        onClick={() => router.back()}
                    >
                        <IconArrowLeft size={20} />
                    </ActionIcon>
                    
                    {/* Avatar superpuesto (Estilo Facebook) */}
                    <Avatar 
                        src={cliente.imagen ? `${process.env.NEXT_PUBLIC_BLOB_BASE_URL}/${cliente.imagen}` : null}
                        size={140}
                        radius={140}
                        color="blue"
                        style={{ 
                            position: 'absolute', 
                            bottom: -70, 
                            left: 40, 
                            border: '5px solid white',
                            backgroundColor: 'white',
                            boxShadow: '0 4px 10px rgba(0,0,0,0.1)'
                        }}
                    >
                        {!cliente.imagen && (cliente.nombre ? cliente.nombre.charAt(0) : cliente.identificacion.charAt(0))}
                    </Avatar>
                </Box>

                {/* Info debajo de la portada */}
                <Box pt={80} pb="md" px={40}>
                    <Group justify="space-between" align="flex-start">
                        <Box>
                            <Title order={2} c="gray.9">{cliente.nombre || 'Sin Razón Social'}</Title>
                            <Group gap="xs" mt={4}>
                                <Text c="dimmed" fw={500}>{cliente.identificacion}</Text>
                                {cliente.esContribuyenteEspecial && (
                                    <Badge color="violet" variant="light">Contribuyente Especial ({cliente.retencionIvaPorDefecto}%)</Badge>
                                )}
                            </Group>
                        </Box>
                        <ActionIcon 
                            variant="light" color="blue" size="xl" radius="md" title="Editar Cliente"
                            onClick={() => router.push(`/superuser/clientes/${cliente.id}/editar`)}
                        >
                            <IconEdit size={24} />
                        </ActionIcon>
                    </Group>
                </Box>
            </Paper>

            {/* PESTAÑAS (TABS) */}
            <Tabs defaultValue="resumen" variant="outline" radius="md">
                <Tabs.List bg="white">
                    <Tabs.Tab value="resumen" leftSection={<IconReceipt2 size={16} />}>Resumen Financiero</Tabs.Tab>
                    <Tabs.Tab value="historial" leftSection={<IconAlertCircle size={16} />}>Historial de Pedidos</Tabs.Tab>
                </Tabs.List>

                {/* TAB 1: RESUMEN */}
                <Tabs.Panel value="resumen" pt="xl">
                    <Grid gutter="md">
                        {/* Tarjetas Financieras */}
                        <Grid.Col span={{ base: 12, md: 8 }}>
                            <Grid gutter="md">
                                <Grid.Col span={{ base: 12, sm: 6 }}>
                                    <Card withBorder radius="md" p="xl" bg="gray.0">
                                        <Text size="sm" tt="uppercase" fw={700} c="dimmed">Total Histórico Comprado</Text>
                                        <Text size="h1" fw={900} c="blue.9">${totalGastado.toFixed(2)}</Text>
                                    </Card>
                                </Grid.Col>
                                <Grid.Col span={{ base: 12, sm: 6 }}>
                                    <Card withBorder radius="md" p="xl" bg={deudaPendiente > 0 ? 'red.0' : 'green.0'}>
                                        <Text size="sm" tt="uppercase" fw={700} c={deudaPendiente > 0 ? 'red.9' : 'green.9'}>
                                            Deuda Pendiente (Créditos)
                                        </Text>
                                        <Text size="h1" fw={900} c={deudaPendiente > 0 ? 'red.9' : 'green.9'}>
                                            ${deudaPendiente.toFixed(2)}
                                        </Text>
                                    </Card>
                                </Grid.Col>
                                <Grid.Col span={12}>
                                    <Card withBorder radius="md" p="xl" bg="white">
                                        <Title order={5} mb="sm" c="gray.7">Último Pedido Realizado</Title>
                                        {ultimoPedido ? (
                                            <Group justify="space-between">
                                                <Box>
                                                    <Text fw={700}>Pedido #{String(ultimoPedido.id).padStart(5, '0')}</Text>
                                                    <Text size="sm" c="dimmed">{dayjs(ultimoPedido.createdAt).format('DD MMM YYYY')}</Text>
                                                </Box>
                                                <Badge color="blue">{ultimoPedido.statusDespacho}</Badge>
                                                <Text fw={800} size="lg">${Number(ultimoPedido.total).toFixed(2)}</Text>
                                                <ActionIcon variant="light" onClick={() => router.push(`/superuser/pedidos/${ultimoPedido.id}`)}>
                                                    <IconArrowLeft size={16} style={{ transform: 'rotate(180deg)' }} />
                                                </ActionIcon>
                                            </Group>
                                        ) : (
                                            <Text c="dimmed">Este cliente aún no ha realizado pedidos.</Text>
                                        )}
                                    </Card>
                                </Grid.Col>
                            </Grid>
                        </Grid.Col>

                        {/* Tarjeta de Contacto */}
                        <Grid.Col span={{ base: 12, md: 4 }}>
                            <Card withBorder radius="md" p="xl" bg="white" h="100%">
                                <Title order={5} mb="lg" c="gray.7">Información de Contacto</Title>
                                <Stack gap="md">
                                    <Group wrap="nowrap">
                                        <IconMapPin size={20} color="gray" />
                                        <Text size="sm">{cliente.direccion || 'Sin dirección registrada'}</Text>
                                    </Group>
                                    <Group wrap="nowrap">
                                        <IconPhone size={20} color="gray" />
                                        <Text size="sm">{cliente.telefono || 'N/A'}</Text>
                                    </Group>
                                    <Group wrap="nowrap">
                                        <IconMail size={20} color="gray" />
                                        <Text size="sm">{cliente.email || 'N/A'}</Text>
                                    </Group>
                                </Stack>
                            </Card>
                        </Grid.Col>
                    </Grid>
                </Tabs.Panel>

                {/* TAB 2: HISTORIAL DE PEDIDOS */}
                <Tabs.Panel value="historial" pt="xl">
                    <Paper withBorder radius="md" style={{ overflowX: 'auto' }}>
                        <Table striped highlightOnHover minWidth={800} bg="white">
                            <Table.Thead bg="gray.0">
                                <Table.Tr>
                                    <Table.Th>Nro Pedido</Table.Th>
                                    <Table.Th>Fecha</Table.Th>
                                    <Table.Th>Condición</Table.Th>
                                    <Table.Th>Status Pago</Table.Th>
                                    <Table.Th>Despacho</Table.Th>
                                    <Table.Th>Total</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {pedidos.length === 0 ? (
                                    <Table.Tr>
                                        <Table.Td colSpan={6} ta="center" py="xl">
                                            <Text c="dimmed">No hay pedidos registrados.</Text>
                                        </Table.Td>
                                    </Table.Tr>
                                ) : (
                                    pedidos.map((p) => {
                                        // Validar si tiene 15 días de vencido
                                        const vencido = p.condicionPago === 'Credito' && p.statusPago !== 'Pagado' && dayjs().isAfter(dayjs(p.fechaVencimiento));
                                        
                                        return (
                                            <Table.Tr 
                                                key={p.id} 
                                                style={{ cursor: 'pointer' }}
                                                onClick={() => router.push(`/superuser/pedidos/${p.id}`)}
                                            >
                                                <Table.Td fw={700}>#{String(p.id).padStart(5, '0')}</Table.Td>
                                                <Table.Td>{dayjs(p.createdAt).format('DD/MM/YYYY')}</Table.Td>
                                                <Table.Td>
                                                    <Badge color={p.condicionPago === 'Credito' ? 'violet' : 'gray'} variant="light">
                                                        {p.condicionPago}
                                                    </Badge>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Badge color={p.statusPago === 'Pagado' ? 'green' : vencido ? 'red' : 'yellow'} variant="filled">
                                                        {vencido ? 'Vencido' : p.statusPago}
                                                    </Badge>
                                                </Table.Td>
                                                <Table.Td>{p.statusDespacho}</Table.Td>
                                                <Table.Td fw={700}>${Number(p.total).toFixed(2)}</Table.Td>
                                            </Table.Tr>
                                        );
                                    })
                                )}
                            </Table.Tbody>
                        </Table>
                    </Paper>
                </Tabs.Panel>
            </Tabs>
        </Box>
    );
}