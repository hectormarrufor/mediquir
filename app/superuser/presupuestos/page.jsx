'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Badge, Box, Button, Group, Loader, Paper, Table, Text, Title } from '@mantine/core';
import { IconChevronLeft, IconPlus } from '@tabler/icons-react';
import { formatearFecha } from '@/app/constants/hora';

const fetchJson = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error('No se pudo cargar'); return r.json(); };

export default function PresupuestosPage() {
    const router = useRouter();
    const { data: presupuestos, isLoading } = useQuery({ queryKey: ['presupuestos'], queryFn: () => fetchJson('/api/presupuestos') });

    return (
        <Box px="md" py="sm" maw={900} mx="auto">
            <Button variant="subtle" color="gray.3" size="compact-sm" leftSection={<IconChevronLeft size={16} />} onClick={() => router.push('/superuser')}>Panel</Button>
            <Group justify="space-between" mb="sm" wrap="wrap">
                <Title order={2} c="white">Presupuestos</Title>
                <Button component={Link} href="/superuser/presupuestos/nuevo" leftSection={<IconPlus size={16} />}>Nuevo presupuesto</Button>
            </Group>
            <Text size="sm" c="gray.4" mb="sm">Cotizaciones para clientes: no son documentos fiscales ni afectan la contabilidad o el inventario.</Text>

            <Paper withBorder radius="md" bg="white" p="xs">
                {isLoading ? <Group justify="center" py="xl"><Loader /></Group> : !presupuestos?.length ? (
                    <Text c="dimmed" ta="center" py="xl">Todavía no has hecho ningún presupuesto.</Text>
                ) : (
                    <Table.ScrollContainer minWidth={500}>
                        <Table highlightOnHover verticalSpacing="xs">
                            <Table.Thead><Table.Tr><Table.Th>N°</Table.Th><Table.Th>Cliente</Table.Th><Table.Th>Fecha</Table.Th><Table.Th>Tarifa</Table.Th><Table.Th style={{ textAlign: 'right' }}>Total $</Table.Th></Table.Tr></Table.Thead>
                            <Table.Tbody>
                                {presupuestos.map((p) => (
                                    <Table.Tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/superuser/presupuestos/${p.id}`)}>
                                        <Table.Td><Text fw={700} size="sm">{p.numero}</Text></Table.Td>
                                        <Table.Td>{p.cliente?.nombre || p.clienteNombre}</Table.Td>
                                        <Table.Td>{formatearFecha(p.createdAt)}</Table.Td>
                                        <Table.Td><Badge variant="light" tt="none">{p.tarifa === 'precio7' ? 'Detal (P7)' : 'Mayor (P6)'}</Badge></Table.Td>
                                        <Table.Td style={{ textAlign: 'right' }}>{Number(p.totalFinal).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Table.Td>
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
