'use client';

import React, { Suspense } from 'react';
import { Alert, Box, Button, Center, Group, Pagination, Paper, SegmentedControl, Skeleton, Stack, Table, Text, Title } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { IconAlertTriangle, IconBuildingStore } from '@tabler/icons-react';
import { BadgesPedido } from '../_components/Estados';
import { fmtFecha, fmtUsd, pedirJson } from '../_lib/formato';

const FILTROS = [
    { value: 'todos', label: 'Todos' },
    { value: 'activos', label: 'En curso' },
    { value: 'por-pagar', label: 'Por pagar' },
    { value: 'entregados', label: 'Entregados' },
    { value: 'cancelados', label: 'Cancelados' },
];

function Contenido() {
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const estado = FILTROS.some((f) => f.value === params.get('estado')) ? params.get('estado') : 'todos';
    const pagina = Math.max(1, Number(params.get('page')) || 1);

    const cambiar = (nuevo) => {
        const q = new URLSearchParams(params.toString());
        Object.entries(nuevo).forEach(([k, v]) => (v && v !== 'todos' && v !== 1 ? q.set(k, String(v)) : q.delete(k)));
        router.replace(`${pathname}${q.toString() ? `?${q}` : ''}`);
    };

    const { data, isLoading, isFetching, error } = useQuery({
        queryKey: ['b2b', 'pedidos', estado, pagina],
        queryFn: () => pedirJson(`/api/b2b/pedidos?${new URLSearchParams({ ...(estado !== 'todos' ? { estado } : {}), page: String(pagina) })}`),
        placeholderData: keepPreviousData,
    });

    return (
        <Stack gap="md">
            <Group justify="space-between" align="flex-end" wrap="wrap">
                <Title order={2} c="navy.9">Mis pedidos</Title>
                <Button color="navy.9" leftSection={<IconBuildingStore size={16} />} onClick={() => router.push('/b2b/catalogo')}>Nuevo pedido</Button>
            </Group>

            <Box style={{ overflowX: 'auto' }}>
                <SegmentedControl color="navy.9" value={estado} onChange={(v) => cambiar({ estado: v, page: 1 })} data={FILTROS} />
            </Box>

            {error && <Alert color="red" icon={<IconAlertTriangle size={18} />}>{error.message}</Alert>}

            <Paper withBorder radius="lg" p="md" style={{ boxShadow: 'var(--mm-shadow-card)', opacity: isFetching && !isLoading ? 0.7 : 1 }}>
                {isLoading ? <Stack gap="xs">{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={40} />)}</Stack>
                    : !data?.pedidos?.length ? <Center py={50}><Text c="dimmed">No hay pedidos en esta vista.</Text></Center>
                        : (
                            <Table.ScrollContainer minWidth={640}>
                                <Table verticalSpacing="sm" highlightOnHover>
                                    <Table.Thead><Table.Tr><Table.Th>Pedido</Table.Th><Table.Th>Fecha</Table.Th><Table.Th>Estado</Table.Th><Table.Th ta="right">Total</Table.Th><Table.Th ta="right">Por pagar</Table.Th></Table.Tr></Table.Thead>
                                    <Table.Tbody>
                                        {data.pedidos.map((p) => (
                                            <Table.Tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/b2b/pedidos/${p.id}`)}>
                                                <Table.Td><Text fw={700} size="sm">{p.numero}</Text><Text size="xs" c="dimmed">{p.articulos ?? ''}</Text></Table.Td>
                                                <Table.Td><Text size="sm">{fmtFecha(p.fecha)}</Text></Table.Td>
                                                <Table.Td><BadgesPedido pedido={p} /></Table.Td>
                                                <Table.Td ta="right"><Text size="sm" fw={600}>{fmtUsd(p.total)}</Text></Table.Td>
                                                <Table.Td ta="right"><Text size="sm" fw={p.cobro.saldo > 0 ? 700 : 400} c={p.cobro.clave === 'vencido' ? 'red.7' : p.cobro.saldo > 0 ? 'orange.8' : 'dimmed'}>{p.cobro.saldo > 0 ? fmtUsd(p.cobro.saldo) : '—'}</Text></Table.Td>
                                            </Table.Tr>
                                        ))}
                                    </Table.Tbody>
                                </Table>
                            </Table.ScrollContainer>
                        )}
            </Paper>

            {data?.paginas > 1 && <Center><Pagination total={data.paginas} value={pagina} onChange={(p) => cambiar({ page: p })} color="navy.9" /></Center>}
        </Stack>
    );
}

export default function B2BPedidos() {
    return <Suspense fallback={null}><Contenido /></Suspense>;
}
