'use client';

import React, { useEffect, useState } from 'react';
import {
    Alert, Avatar, Badge, Box, Button, Card, Center, CloseButton, Group, Pagination, Paper,
    SegmentedControl, Select, SimpleGrid, Skeleton, Stack, Table, Text, TextInput, Title,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { IconAlertTriangle, IconArrowLeft, IconLock, IconSearch } from '@tabler/icons-react';
import { aBolivares } from '@/app/constants/facturacion';
import { useTasaBcv } from '@/hooks/useTasaBcv';
import { useAuth } from '@/hooks/useAuth';
import { useEsTelefono } from '@/app/components/ui/modalMovil';
import { useVolver } from '@/app/helpers/useVolver';
import { getMainImage, PLACEHOLDER_IMG, getPresentacionLabel } from '@/app/components/landing/productUtils';

const precio = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const fmtPrecio = (v) => (v === null || v === undefined ? <Text span c="dimmed" size="sm">—</Text> : `$${precio.format(v)}`);
const bs = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// el precio en bolívares, a la tasa BCV del día (debajo del precio en dólares)
const fmtBs = (v, tasa) => (v === null || v === undefined || !(tasa > 0) ? null : `Bs ${bs.format(aBolivares(Number(v), tasa))}`);

async function pedirJson(url) {
    const res = await fetch(url);
    const cuerpo = await res.json().catch(() => null);
    if (!res.ok) throw new Error(cuerpo?.error || 'No se pudo cargar el inventario');
    return cuerpo;
}

export default function ConsultaInventario() {
    const volver = useVolver('/superuser/inventario');
    const telefono = useEsTelefono();
    const [busqueda, setBusqueda] = useState('');
    const [q] = useDebouncedValue(busqueda.trim(), 350);
    const [categoriaId, setCategoriaId] = useState(null);
    const [marcaId, setMarcaId] = useState(null);
    const [estado, setEstado] = useState('todos');
    const [pagina, setPagina] = useState(1);
    const [filtros, setFiltros] = useState({ categorias: [], marcas: [] });
    const { tasa } = useTasaBcv();
    const { esVendedor } = useAuth();
    const soloBs = esVendedor && tasa > 0; // el vendedor ve los precios solo en bolívares (los dólares son de administración y de los presupuestos)

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
        <Box maw={1400} mx="auto" px={{ base: 'xs', sm: 'md' }} py={{ base: 'xs', sm: 'md' }}>
            <Stack gap={telefono ? 'xs' : 'md'}>
                <Group justify="space-between" align="center" wrap="wrap" gap="xs">
                    <Box>
                        <Group gap="xs">
                            <Button variant="subtle" color="gray.3" size="compact-sm" leftSection={<IconArrowLeft size={16} />} onClick={volver}>Volver</Button>
                            <Title order={telefono ? 3 : 2} c="white">Consultar existencias</Title>
                        </Group>
                        <Text size="xs" c="gray.4" mt={2}>
                            Existencia y precios de venta{tasa ? ` · Tasa BCV: ${bs.format(tasa)} Bs/$` : ''}.
                        </Text>
                    </Box>
                    <Badge variant="light" color="gray" leftSection={<IconLock size={12} />} size={telefono ? 'sm' : 'lg'} tt="none">Solo lectura</Badge>
                </Group>

                <Paper withBorder radius="md" p="xs" bg="white">
                    <Stack gap="xs">
                        <TextInput
                            placeholder="Buscar por nombre o código…"
                            leftSection={<IconSearch size={16} />}
                            rightSection={busqueda ? <CloseButton size="sm" onClick={() => setBusqueda('')} aria-label="Borrar búsqueda" /> : null}
                            value={busqueda}
                            onChange={(e) => setBusqueda(e.currentTarget.value)}
                        />
                        <SimpleGrid cols={{ base: 2, sm: 2 }} spacing="xs">
                            <Select size="xs" placeholder="Categoría" clearable searchable data={filtros.categorias.map((c) => ({ value: String(c.id), label: c.nombre }))} value={categoriaId} onChange={setCategoriaId} />
                            <Select size="xs" placeholder="Marca" clearable searchable data={filtros.marcas.map((m) => ({ value: String(m.id), label: m.nombre }))} value={marcaId} onChange={setMarcaId} />
                        </SimpleGrid>
                        <SegmentedControl
                            fullWidth={telefono}
                            size="xs"
                            color="navy.9"
                            value={estado}
                            onChange={setEstado}
                            data={[
                                { value: 'todos', label: 'Todos' },
                                { value: 'disponibles', label: telefono ? 'En stock' : 'Con existencia' },
                                { value: 'bajos', label: 'Stock bajo' },
                                { value: 'agotados', label: 'Agotados' },
                            ]}
                        />
                    </Stack>
                </Paper>

                {error && <Alert color="red" icon={<IconAlertTriangle size={18} />}>{error.message}</Alert>}

                {isLoading ? (
                    <Stack gap="xs">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} h={telefono ? 88 : 44} radius="md" />)}</Stack>
                ) : !data?.productos?.length ? (
                    <Paper withBorder radius="lg" p="xl"><Center><Text c="dimmed">No hay productos con esos filtros.</Text></Center></Paper>
                ) : telefono ? (
                    <Stack gap={8} style={{ opacity: isFetching ? 0.7 : 1 }}>
                        {data.productos.map((p) => (
                            <Card key={p.id} withBorder radius="md" p="xs" bg="white">
                                <Group justify="space-between" wrap="nowrap" align="flex-start" gap="xs">
                                    <Group gap="xs" wrap="nowrap" align="flex-start" style={{ minWidth: 0, flex: 1 }}>
                                        <Avatar src={getMainImage(p)} size={42} radius="sm" bg="gray.0" style={{ flexShrink: 0 }} imageProps={{ style: { objectFit: 'contain' } }}>
                                            <img src={PLACEHOLDER_IMG} alt="" width={42} />
                                        </Avatar>
                                        <Box style={{ minWidth: 0 }}>
                                            <Text size="xs" fw={800} c="navy.9" lineClamp={2} lh={1.25}>{p.nombre}</Text>
                                            <Text fz={11} c="dimmed" lineClamp={1} mt={1}>
                                                {[p.codigo, p.marca?.nombre, getPresentacionLabel(p)].filter(Boolean).join(' · ')}
                                            </Text>
                                        </Box>
                                    </Group>
                                    {p.stock <= 0 ? (
                                        <Badge size="xs" color="red" variant="light" style={{ flexShrink: 0 }}>Agotado</Badge>
                                    ) : (
                                        <Badge size="xs" color={p.bajo ? 'orange' : 'teal'} variant="light" style={{ flexShrink: 0 }}>
                                            {p.stock}{p.bajo ? ' · bajo' : ' uds.'}
                                        </Badge>
                                    )}
                                </Group>

                                <SimpleGrid cols={2} spacing={6} mt={6}>
                                    <Box p={6} style={{ borderRadius: 6, background: 'var(--mantine-color-gray-0)' }}>
                                        <Text fz={9.5} fw={800} c="dimmed" tt="uppercase">Precio 7 (Detal)</Text>
                                        <Text size="xs" fw={800} c="navy.9">
                                            {soloBs ? (fmtBs(p.precio7, tasa) || '—') : fmtPrecio(p.precio7)}
                                        </Text>
                                        {!soloBs && fmtBs(p.precio7, tasa) && <Text fz={10.5} c="teal.8" fw={600}>{fmtBs(p.precio7, tasa)}</Text>}
                                        {p.descuento > 0 && <Text fz={10} c="red.7" fw={700}>-{p.descuento}% oferta</Text>}
                                    </Box>
                                    <Box p={6} style={{ borderRadius: 6, background: 'var(--mantine-color-gray-0)' }}>
                                        <Text fz={9.5} fw={800} c="dimmed" tt="uppercase">Precio 6 (Mayor)</Text>
                                        <Text size="xs" fw={800} c="navy.9">
                                            {soloBs ? (fmtBs(p.precio6, tasa) || '—') : fmtPrecio(p.precio6)}
                                        </Text>
                                        {!soloBs && fmtBs(p.precio6, tasa) && <Text fz={10.5} c="teal.8" fw={600}>{fmtBs(p.precio6, tasa)}</Text>}
                                    </Box>
                                </SimpleGrid>
                            </Card>
                        ))}
                    </Stack>
                ) : (
                    <Paper withBorder radius="lg" p="md" style={{ boxShadow: 'var(--mm-shadow-card)', opacity: isFetching && !isLoading ? 0.7 : 1 }}>
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
                                                <Text size="sm" fw={700}>{soloBs ? (fmtBs(p.precio7, tasa) || <Text span c="dimmed" size="sm">—</Text>) : fmtPrecio(p.precio7)}</Text>
                                                {!soloBs && fmtBs(p.precio7, tasa) && <Text size="xs" c="dimmed" fw={600}>{fmtBs(p.precio7, tasa)}</Text>}
                                                {p.descuento > 0 && <Text size="xs" c="red.7">-{p.descuento}% en oferta</Text>}
                                            </Table.Td>
                                            <Table.Td ta="right">
                                                <Text size="sm" fw={700}>{soloBs ? (fmtBs(p.precio6, tasa) || <Text span c="dimmed" size="sm">—</Text>) : fmtPrecio(p.precio6)}</Text>
                                                {!soloBs && fmtBs(p.precio6, tasa) && <Text size="xs" c="dimmed" fw={600}>{fmtBs(p.precio6, tasa)}</Text>}
                                            </Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>
                        </Table.ScrollContainer>
                    </Paper>
                )}

                {data?.paginas > 1 && <Center><Pagination total={data.paginas} value={pagina} onChange={setPagina} color="navy.9" size={telefono ? 'sm' : 'md'} siblings={telefono ? 0 : 1} /></Center>}
            </Stack>
        </Box>
    );
}
