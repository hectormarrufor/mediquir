'use client';

import React, { useState, useMemo } from 'react';
import {
    Box, Title, Paper, Table, Badge, Group, Text,
    TextInput, Select, ScrollArea, Avatar, ActionIcon, Tooltip,
    Grid, Stack, Card, Button,
} from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { IconSearch, IconFilter, IconArrowUpRight, IconReceipt, IconExternalLink, IconArrowLeft } from '@tabler/icons-react';

import { fechaCaracas, formatearFecha, formatearFechaHora } from '@/app/constants/hora';
import { useEsTelefono } from '@/app/components/ui/modalMovil';
import { useVolver } from '@/app/helpers/useVolver';

export default function SalidasInventarioPage() {
    const router = useRouter();
    const volver = useVolver('/superuser/inventario');
    const telefono = useEsTelefono();
    const [search, setSearch] = useState('');
    const [filterEstado, setFilterEstado] = useState(null);
    // Por defecto el mes en curso: se piden al servidor solo las salidas del rango (antes se descargaban todas)
    const [desde, setDesde] = useState(`${fechaCaracas().slice(0, 8)}01`);
    const [hasta, setHasta] = useState(fechaCaracas());

    const { data: salidas, isLoading, isError } = useQuery({
        queryKey: ['salidas-inventario', desde, hasta],
        placeholderData: keepPreviousData,
        queryFn: async () => {
            const res = await fetch(`/api/inventario/salidas?desde=${desde}&hasta=${hasta}`);
            if (!res.ok) throw new Error('Error al cargar salidas');
            return res.json();
        },
    });

    const getImageUrl = (path) => {
        if (!path) return null;
        if (path.startsWith('http')) return path;
        return `${process.env.NEXT_PUBLIC_IMG_BASE || ''}/${path.replace(/^\/+/, '')}`;
    };

    const getEstadoColor = (estado) => {
        switch (estado) {
            case 'Entregada': return 'teal';
            case 'Pendiente': return 'yellow';
            case 'Empacada': return 'blue';
            case 'Cancelada': return 'red';
            case 'Rechazada': return 'orange';
            case 'Esperando Firma': return 'blue';
            case 'Esperando Devolucion': return 'grape';
            case 'Devuelta': return 'gray';
            default: return 'gray';
        }
    };

    const salidasFiltradas = useMemo(() => {
        if (!salidas) return [];
        let data = salidas;

        if (search) {
            const q = search.toLowerCase();
            data = data.filter((s) =>
                s.producto?.nombre?.toLowerCase().includes(q) ||
                s.producto?.codigo?.toLowerCase().includes(q) ||
                s.venta?.numeroDocumento?.toLowerCase().includes(q) ||
                s.justificacion?.toLowerCase().includes(q)
            );
        }

        if (filterEstado) {
            data = data.filter((s) => s.estado === filterEstado);
        }

        return data;
    }, [salidas, search, filterEstado]);

    if (isLoading) return <Box p="md"><Text c="white">Cargando auditoría de salidas...</Text></Box>;
    if (isError) return <Box p="md"><Text c="red">Error al cargar la base de datos.</Text></Box>;

    return (
        <Box px={{ base: 'xs', sm: 'md' }} py={{ base: 'xs', sm: 'md' }} maw={1400} mx="auto">
            <Group justify="space-between" mb={telefono ? 'sm' : 'lg'} wrap="wrap" gap="xs">
                <Group gap="xs">
                    <Button variant="subtle" color="gray.3" size="compact-sm" leftSection={<IconArrowLeft size={16} />} onClick={volver}>Inventario</Button>
                    <IconArrowUpRight size={telefono ? 22 : 28} color="#ff8787" />
                    <Title order={telefono ? 3 : 2} c="white">Salidas de inventario</Title>
                </Group>
                <Badge size={telefono ? 'md' : 'lg'} color="red" variant="light">
                    Total: {salidasFiltradas.length}
                </Badge>
            </Group>

            {/* PANEL DE FILTROS */}
            <Paper p={telefono ? 'xs' : 'md'} radius="md" withBorder bg="gray.0" mb={telefono ? 'sm' : 'lg'}>
                <Grid align="flex-end" gutter="xs">
                    <Grid.Col span={{ base: 12, md: 4 }}>
                        <TextInput
                            size={telefono ? 'xs' : 'sm'}
                            label="Buscar movimiento"
                            placeholder="Producto, justificación o N° de documento…"
                            leftSection={<IconSearch size={16} />}
                            value={search}
                            onChange={(e) => setSearch(e.currentTarget.value)}
                        />
                    </Grid.Col>
                    <Grid.Col span={{ base: 6, md: 2 }}>
                        <TextInput size={telefono ? 'xs' : 'sm'} type="date" label="Desde" value={desde} max={hasta} onChange={(e) => e.currentTarget.value && setDesde(e.currentTarget.value)} />
                    </Grid.Col>
                    <Grid.Col span={{ base: 6, md: 2 }}>
                        <TextInput size={telefono ? 'xs' : 'sm'} type="date" label="Hasta" value={hasta} min={desde} onChange={(e) => e.currentTarget.value && setHasta(e.currentTarget.value)} />
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, md: 4 }}>
                        <Select
                            size={telefono ? 'xs' : 'sm'}
                            label="Filtrar por estado"
                            placeholder="Todos los estados"
                            data={['Pendiente', 'Empacada', 'Entregada', 'Cancelada', 'Rechazada', 'Esperando Devolucion', 'Devuelta']}
                            value={filterEstado}
                            onChange={setFilterEstado}
                            clearable
                            leftSection={<IconFilter size={16} />}
                        />
                    </Grid.Col>
                </Grid>
            </Paper>

            {telefono ? (
                <Stack gap={8}>
                    {salidasFiltradas.length === 0 ? (
                        <Paper withBorder radius="md" p="lg" bg="white" ta="center">
                            <Text c="dimmed" size="sm">No se encontraron movimientos de salida.</Text>
                        </Paper>
                    ) : (
                        salidasFiltradas.map((salida) => {
                            const imgFinal = getImageUrl(salida.producto?.imagen);
                            return (
                                <Card
                                    key={salida.id}
                                    withBorder
                                    radius="md"
                                    p="xs"
                                    bg="white"
                                    onClick={salida.venta ? () => router.push(`/superuser/ventas/${salida.venta.id}`) : undefined}
                                    style={{ cursor: salida.venta ? 'pointer' : 'default' }}
                                >
                                    <Group justify="space-between" wrap="nowrap" align="flex-start" gap="xs">
                                        <Group gap="xs" wrap="nowrap" align="flex-start" style={{ minWidth: 0, flex: 1 }}>
                                            <Avatar src={imgFinal} size={38} radius="sm" color="red" style={{ flexShrink: 0 }}>
                                                {salida.producto?.nombre?.charAt(0) || '?'}
                                            </Avatar>
                                            <Box style={{ minWidth: 0 }}>
                                                <Text fw={700} size="xs" c="navy.9" lineClamp={2} lh={1.25}>{salida.producto?.nombre}</Text>
                                                <Text fz={11} c="dimmed">SKU: {salida.producto?.codigo} · {formatearFecha(salida.fecha)}</Text>
                                            </Box>
                                        </Group>
                                        <Box ta="right" style={{ flexShrink: 0 }}>
                                            <Text fw={900} size="md" c="red.7" lh={1.1}>-{Number(salida.cantidad)}</Text>
                                            <Badge size="xs" color={getEstadoColor(salida.estado)} variant="filled" mt={2}>
                                                {salida.estado}
                                            </Badge>
                                        </Box>
                                    </Group>

                                    <Group justify="space-between" mt={6} pt={6} gap="xs" wrap="wrap" style={{ borderTop: '1px solid #f1f3f5' }}>
                                        {salida.venta ? (
                                            <Badge size="xs" color="blue" variant="light" leftSection={<IconReceipt size={11} />}>
                                                Venta: {salida.venta.numeroDocumento}
                                            </Badge>
                                        ) : (
                                            <Badge size="xs" color="gray" variant="light">Ajuste Manual</Badge>
                                        )}
                                        <Text fz={11} c="dimmed">
                                            S: {salida.solicitante?.user || 'Sistema'} · D: {salida.despachador?.user || 'Pendiente'}
                                        </Text>
                                    </Group>
                                </Card>
                            );
                        })
                    )}
                </Stack>
            ) : (
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
                                                    <Text size="sm" fw={500}>{formatearFecha(salida.fecha)}</Text>
                                                    <Text size="xs" c="dimmed">{formatearFechaHora(salida.createdAt, { day: undefined, month: undefined, year: undefined })}</Text>
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
                                                        <Badge color="blue" variant="light" leftSection={<IconReceipt size={12} style={{ marginTop: 3 }} />}>
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
                                                    {salida.venta ? (
                                                        <Tooltip label="Ver el pedido (empaque y despacho)">
                                                            <ActionIcon variant="light" color="blue" size="md" aria-label="Ver pedido" onClick={() => router.push(`/superuser/ventas/${salida.venta.id}`)}>
                                                                <IconExternalLink size={16} />
                                                            </ActionIcon>
                                                        </Tooltip>
                                                    ) : '—'}
                                                </Table.Td>
                                            </Table.Tr>
                                        );
                                    })
                                )}
                            </Table.Tbody>
                        </Table>
                    </ScrollArea>
                </Paper>
            )}
        </Box>
    );
}
