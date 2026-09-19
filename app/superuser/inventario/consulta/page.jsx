'use client';

import React, { useEffect, useState } from 'react';
import { Alert, Avatar, Badge, Box, Center, Group, Pagination, Paper, SegmentedControl, Select, Skeleton, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { IconAlertTriangle, IconLock, IconSearch } from '@tabler/icons-react';
import { getMainImage, PLACEHOLDER_IMG, getPresentacionLabel } from '@/app/components/landing/productUtils';

const precio = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const fmtPrecio = (v) => (v === null || v === undefined ? <Text span c="dimmed" size="sm">—</Text> : `$${precio.format(v)}`);

async function pedirJson(url) {
    const res = await fetch(url);
    const cuerpo = await res.json().catch(() => null);
    if (!res.ok) throw new Error(cuerpo?.error || 'No se pudo cargar el inventario');
    return cuerpo;
}

export default function ConsultaInventario() {
    const [busqueda, setBusqueda] = useState('');
    const [q] = useDebouncedValue(busqueda.trim(), 350);
    const [categoriaId, setCategoriaId] = useState(null);
    const [marcaId, setMarcaId] = useState(null);
    const [estado, setEstado] = useState('todos');
    const [pagina, setPagina] = useState(1);
    const [filtros, setFiltros] = useState({ categorias: [], marcas: [] });

    useEffect(() => { setPagina(1); }, [q, categoriaId, marcaId, estado]);

    const params = new URLSearchParams({ page: String(pagina) });
    if (q) params.set('q', q);
    if (categoriaId) params.set('categoriaId', categoriaId);
    if (marcaId) params.set('marcaId', marcaId);
    if (estado !== 'todos') params.set('estado', estado);

    const { data, isLoading, isFetching, error } = useQuery({
        queryKey: ['vendedor', 'inventario', q, categoriaId, marcaId, estado, pagina],
        queryFn: () => pedirJson(`/api/vendedor/inventario?${params}`),
        placeholderData: keepPreviousData,
    });
    useEffect(() => { if (data?.filtros) setFiltros(data.filtros); }, [data?.filtros]);

    return (
        <Box maw={1400} mx="auto" px="md" py="md">
            <Stack gap="md">
                <Group justify="space-between" align="flex-end" wrap="wrap">
                    <Box>
                        <Title order={2} c="white">Inventario</Title>
                        <Text size="sm" c="gray.4">Consulta de existencia y precios de venta.</Text>
                    </Box>
                    <Badge variant="light" color="gray" leftSection={<IconLock size={12} />} size="lg" tt="none">Solo lectura</Badge>
                </Group>

                <Group gap="sm" align="flex-end" wrap="wrap">
                    <TextInput flex="1 1 260px" placeholder="Buscar por nombre o código…" leftSection={<IconSearch size={16} />} value={busqueda} onChange={(e) => setBusqueda(e.currentTarget.value)} />
                    <Select placeholder="Categoría" clearable searchable data={filtros.categorias.map((c) => ({ value: String(c.id), label: c.nombre }))} value={categoriaId} onChange={setCategoriaId} w={{ base: '100%', sm: 200 }} />
                    <Select placeholder="Marca" clearable searchable data={filtros.marcas.map((m) => ({ value: String(m.id), label: m.nombre }))} value={marcaId} onChange={setMarcaId} w={{ base: '100%', sm: 200 }} />
                </Group>
                <Box style={{ overflowX: 'auto' }}>
                    <SegmentedControl color="navy.9" value={estado} onChange={setEstado}
                        data={[{ value: 'todos', label: 'Todos' }, { value: 'disponibles', label: 'Con existencia' }, { value: 'bajos', label: 'Stock bajo' }, { value: 'agotados', label: 'Agotados' }]} />
                </Box>

                {error && <Alert color="red" icon={<IconAlertTriangle size={18} />}>{error.message}</Alert>}

                <Paper withBorder radius="lg" p="md" style={{ boxShadow: 'var(--mm-shadow-card)', opacity: isFetching && !isLoading ? 0.7 : 1 }}>
                    {isLoading ? <Stack gap="xs">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} h={44} />)}</Stack>
                        : !data?.productos?.length ? <Center py={50}><Text c="dimmed">No hay productos con esos filtros.</Text></Center>
                            : (
                                <Table.ScrollContainer minWidth={720}>
                                    <Table verticalSpacing="xs" highlightOnHover>
                                        <Table.Thead>
                                            <Table.Tr><Table.Th>Producto</Table.Th><Table.Th>Marca</Table.Th><Table.Th ta="right">Existencia</Table.Th><Table.Th ta="right">Precio 7 (Detal)</Table.Th><Table.Th ta="right">Precio 6 (Mayor)</Table.Th></Table.Tr>
                                        </Table.Thead>
                                        <Table.Tbody>
                                            {data.productos.map((p) => (
                                                <Table.Tr key={p.id}>
                                                    <Table.Td>
                                                        <Group gap="sm" wrap="nowrap">
                                                            <Avatar src={getMainImage(p)} size={40} radius="sm" bg="gray.0" imageProps={{ style: { objectFit: 'contain' } }}><img src={PLACEHOLDER_IMG} alt="" width={40} /></Avatar>
                                                            <Box style={{ minWidth: 0 }}>
                                                                <Text size="sm" fw={600} lineClamp={2}>{p.nombre}</Text>
                                                                <Text size="xs" c="dimmed">{[p.codigo, getPresentacionLabel(p)].filter(Boolean).join(' · ')}</Text>
                                                            </Box>
                                                        </Group>
                                                    </Table.Td>
                                                    <Table.Td><Text size="sm">{p.marca?.nombre || '—'}</Text></Table.Td>
                                                    <Table.Td ta="right">
                                                        {p.stock <= 0 ? <Badge color="red" variant="light">Agotado</Badge>
                                                            : <Badge color={p.bajo ? 'orange' : 'teal'} variant="light">{p.stock}{p.bajo ? ' · bajo' : ''}</Badge>}
                                                    </Table.Td>
                                                    <Table.Td ta="right">
                                                        <Text size="sm" fw={700}>{fmtPrecio(p.precio7)}</Text>
                                                        {p.descuento > 0 && <Text size="xs" c="red.7">-{p.descuento}% en oferta</Text>}
                                                    </Table.Td>
                                                    <Table.Td ta="right"><Text size="sm" fw={700}>{fmtPrecio(p.precio6)}</Text></Table.Td>
                                                </Table.Tr>
                                            ))}
                                        </Table.Tbody>
                                    </Table>
                                </Table.ScrollContainer>
                            )}
                </Paper>

                {data?.paginas > 1 && <Center><Pagination total={data.paginas} value={pagina} onChange={setPagina} color="navy.9" /></Center>}
            </Stack>
        </Box>
    );
}
