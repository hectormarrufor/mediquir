'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Badge, Box, Button, Group, Loader, Paper, Table, Text, Title } from '@mantine/core';
import { IconChevronLeft, IconPlus } from '@tabler/icons-react';

const fetchJson = async (url) => { const r = await fetch(url); const c = await r.json().catch(() => ({})); if (!r.ok) throw new Error(c.error || 'No se pudo cargar'); return c; };
const monto = (r) => `${r.moneda === 'USD' ? '$' : 'Bs'} ${Number(r.monto).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fecha = (f) => String(f).slice(0, 10).split('-').reverse().join('/');
const FORMAS = { EFECTIVO: 'Efectivo', CHEQUE: 'Cheque', TRANSFERENCIA: 'Transferencia', OTRO: 'Otro' };

export default function RecibosPage() {
    const router = useRouter();
    const { data, isLoading, error } = useQuery({ queryKey: ['recibos'], queryFn: () => fetchJson('/api/recibos') });
    return (
        <Box px={{ base: 'xs', sm: 'md' }} py="sm" maw={1000} mx="auto">
            <Button variant="subtle" color="gray.3" size="compact-sm" leftSection={<IconChevronLeft size={16} />} onClick={() => router.push('/superuser')}>Panel</Button>
            <Group justify="space-between" mb="sm" wrap="wrap">
                <Title order={2} c="white">Recibos</Title>
                <Button component={Link} href="/superuser/recibos/nuevo" leftSection={<IconPlus size={16} />}>Nuevo recibo{data?.siguiente ? ` (N.º ${data.siguiente})` : ''}</Button>
            </Group>
            <Text size="sm" c="gray.4" mb="sm">Constancia de lo que se le paga a una persona («Hemos pagado a») o de lo que se recibe («He recibido de»): monto, concepto y forma de pago. No es un documento fiscal.</Text>
            <Paper withBorder radius="md" bg="white" p="xs">
                {isLoading ? <Group justify="center" py="xl"><Loader /></Group> : error ? <Text c="red" ta="center" py="xl">{error.message}</Text> : !data?.recibos?.length ? (
                    <Text c="dimmed" ta="center" py="xl">Todavía no hay recibos.</Text>
                ) : (
                    <Table.ScrollContainer minWidth={560}>
                        <Table highlightOnHover verticalSpacing="xs">
                            <Table.Thead><Table.Tr><Table.Th>N.º</Table.Th><Table.Th>Fecha</Table.Th><Table.Th>Persona</Table.Th><Table.Th>Concepto</Table.Th><Table.Th>Pago</Table.Th><Table.Th ta="right">Monto</Table.Th></Table.Tr></Table.Thead>
                            <Table.Tbody>
                                {data.recibos.map((r) => (
                                    <Table.Tr key={r.id} style={{ cursor: 'pointer', opacity: r.anulado ? 0.5 : 1 }} onClick={() => router.push(`/superuser/recibos/${r.id}`)}>
                                        <Table.Td><Text fw={700} size="sm">{r.numero}</Text></Table.Td>
                                        <Table.Td>{fecha(r.fecha)}</Table.Td>
                                        <Table.Td><Text size="sm">{r.personaNombre}</Text><Text size="xs" c="dimmed">{r.tipo === 'PAGADO_A' ? 'Pagado a' : 'Recibido de'}</Text></Table.Td>
                                        <Table.Td><Text size="sm" lineClamp={1} maw={260}>{r.concepto || '—'}</Text></Table.Td>
                                        <Table.Td>{FORMAS[r.formaPago] || r.formaPago}</Table.Td>
                                        <Table.Td ta="right">{r.anulado ? <Badge color="red" variant="light">Anulado</Badge> : monto(r)}</Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>
                )}
            </Paper>
        </Box>
    );
}
