'use client';

import React, { useState, useMemo } from 'react';
import { 
    Box, Title, Paper, Table, Badge, Group, Text, 
    TextInput, Select, ScrollArea, Avatar, ActionIcon, Tooltip, 
    Grid
} from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { IconSearch, IconFilter, IconArrowUpRight, IconReceipt, IconEdit } from '@tabler/icons-react';
import dayjs from 'dayjs';

export default function SalidasInventarioPage() {
    const [search, setSearch] = useState('');
    const [filterEstado, setFilterEstado] = useState(null);

    // Fetch de las Salidas Globales
    const { data: salidas, isLoading, isError } = useQuery({
        queryKey: ['salidas-inventario'],
        queryFn: async () => {
            const res = await fetch('/api/inventario/salidas');
            if (!res.ok) throw new Error('Error al cargar salidas');
            return res.json();
        }
    });

    // Helper para las imágenes
    const getImageUrl = (path) => {
        if (!path) return null;
        if (path.startsWith('http')) return path;
        return `${process.env.NEXT_PUBLIC_BLOB_BASE_URL || ''}/${path.replace(/^\/+/, '')}`;
    };

    // Colores dinámicos para los estados
    const getEstadoColor = (estado) => {
        switch(estado) {
            case 'Entregada': return 'teal';
            case 'Pendiente': return 'yellow';
            case 'Cancelada': return 'red';
            case 'Rechazada': return 'orange';
            case 'Esperando Firma': return 'blue';
            case 'Esperando Devolucion': return 'grape';
            case 'Devuelta': return 'gray';
            default: return 'gray';
        }
    };

    // Filtros Locales
    const salidasFiltradas = useMemo(() => {
        if (!salidas) return [];
        let data = salidas;

        if (search) {
            const q = search.toLowerCase();
            data = data.filter(s => 
                s.producto?.nombre?.toLowerCase().includes(q) ||
                s.producto?.codigo?.toLowerCase().includes(q) ||
                s.venta?.numeroDocumento?.toLowerCase().includes(q) ||
                s.justificacion?.toLowerCase().includes(q)
            );
        }

        if (filterEstado) {
            data = data.filter(s => s.estado === filterEstado);
        }

        return data;
    }, [salidas, search, filterEstado]);

    if (isLoading) return <Box p="md"><Text>Cargando auditoría de salidas...</Text></Box>;
    if (isError) return <Box p="md"><Text c="red">Error al cargar la base de datos.</Text></Box>;

    return (
        <Box p="md" maw={1400} mx="auto">
            <Group justify="space-between" mb="xl">
                <Group>
                    <IconArrowUpRight size={28} color="#d32f2f" />
                    <Title order={2} c="red.9">Salidas de Inventario</Title>
                </Group>
                <Badge size="lg" color="red" variant="light">
                    Total Registros: {salidasFiltradas.length}
                </Badge>
            </Group>

            {/* PANEL DE FILTROS */}
            <Paper p="md" radius="md" withBorder bg="gray.0" mb="xl">
                <Grid align="flex-end">
                    <Grid.Col span={{ base: 12, md: 6 }}>
                        <TextInput 
                            label="Buscar Movimiento" 
                            placeholder="Buscar por producto, justificación o N° de factura..." 
                            leftSection={<IconSearch size={16} />} 
                            value={search} 
                            onChange={(e) => setSearch(e.currentTarget.value)} 
                        />
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, md: 3 }}>
                        <Select 
                            label="Filtrar por Estado" 
                            placeholder="Todos los estados" 
                            data={['Pendiente', 'Entregada', 'Cancelada', 'Rechazada', 'Esperando Firma', 'Esperando Devolucion', 'Devuelta']}
                            value={filterEstado} 
                            onChange={setFilterEstado} 
                            clearable 
                            leftSection={<IconFilter size={16} />} 
                        />
                    </Grid.Col>
                </Grid>
            </Paper>

            {/* TABLA GLOBAL DE AUDITORÍA */}
            <Paper withBorder radius="md" bg="white">
                <ScrollArea>
                    <Table striped highlightOnHover verticalSpacing="sm" style={{ minWidth: 1000 }}>
                        <Table.Thead bg="red.0">
                            <Table.Tr>
                                <Table.Th>Fecha</Table.Th>
                                <Table.Th>Producto</Table.Th>
                                <Table.Th ta="center">Cant.</Table.Th>
                                <Table.Th>Origen / Justificación</Table.Th>
                                <Table.Th>Personal Involucrado</Table.Th>
                                <Table.Th>Estado</Table.Th>
                                <Table.Th ta="center">Acción</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {salidasFiltradas.length === 0 ? (
                                <Table.Tr>
                                    <Table.Td colSpan={7} align="center" py="xl">
                                        <Text c="dimmed">No se encontraron movimientos de salida.</Text>
                                    </Table.Td>
                                </Table.Tr>
                            ) : (
                                salidasFiltradas.map((salida) => {
                                    const imgFinal = getImageUrl(salida.producto?.imagen);
                                    return (
                                        <Table.Tr key={salida.id}>
                                            <Table.Td>
                                                <Text size="sm" fw={500}>{dayjs(salida.fecha).format('DD/MM/YYYY')}</Text>
                                                <Text size="xs" c="dimmed">{dayjs(salida.createdAt).format('hh:mm A')}</Text>
                                            </Table.Td>
                                            
                                            <Table.Td>
                                                <Group gap="sm" wrap="nowrap">
                                                    <Avatar src={imgFinal} size="md" radius="sm" color="red">
                                                        {salida.producto?.nombre?.charAt(0) || '?'}
                                                    </Avatar>
                                                    <Box>
                                                        <Text fw={600} size="sm" lineClamp={2}>{salida.producto?.nombre}</Text>
                                                        <Text size="xs" c="dimmed">SKU: {salida.producto?.codigo}</Text>
                                                    </Box>
                                                </Group>
                                            </Table.Td>

                                            <Table.Td ta="center">
                                                <Text fw={900} size="lg" c="red.7">-{Number(salida.cantidad)}</Text>
                                            </Table.Td>

                                            <Table.Td>
                                                {salida.venta ? (
                                                    <Badge color="blue" variant="light" leftSection={<IconReceipt size={12} style={{ marginTop: 3 }}/>}>
                                                        Venta: {salida.venta.numeroDocumento}
                                                    </Badge>
                                                ) : (
                                                    <Badge color="gray" variant="light">Ajuste Manual / Otro</Badge>
                                                )}
                                                <Text size="xs" mt={4} c="dimmed" lineClamp={2}>{salida.justificacion}</Text>
                                            </Table.Td>

                                            <Table.Td>
                                                <Text size="xs" fw={600}>S: <Text span fw={400} c="dimmed">{salida.solicitante?.user || 'Sistema'}</Text></Text>
                                                <Text size="xs" fw={600}>D: <Text span fw={400} c="dimmed">{salida.despachador?.user || 'Pendiente'}</Text></Text>
                                            </Table.Td>

                                            <Table.Td>
                                                <Badge color={getEstadoColor(salida.estado)} variant="filled">
                                                    {salida.estado}
                                                </Badge>
                                            </Table.Td>

                                            <Table.Td ta="center">
                                                <Tooltip label="Gestionar Despacho / Ajustar Estado">
                                                    <ActionIcon variant="light" color="blue" size="md">
                                                        <IconEdit size={16} />
                                                    </ActionIcon>
                                                </Tooltip>
                                            </Table.Td>
                                        </Table.Tr>
                                    );
                                })
                            )}
                        </Table.Tbody>
                    </Table>
                </ScrollArea>
            </Paper>
        </Box>
    );
}