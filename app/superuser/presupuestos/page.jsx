'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Badge, Box, Button, Group, Loader, Paper, Stack, Table, Text, Title, UnstyledButton } from '@mantine/core';
import { IconChevronLeft, IconPlus } from '@tabler/icons-react';
import { formatearFecha } from '@/app/constants/hora';
import { ETIQUETA_TARIFA } from '@/app/api/presupuestos/_lib';
import { useEsTelefono } from '@/app/components/ui/modalMovil';

const fetchJson = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error('No se pudo cargar'); return r.json(); };
// Total en la moneda del presupuesto: P7/P6 en $, P4/P5 en Bs
const total = (p) => `${p.moneda === 'BS' ? 'Bs' : '$'} ${Number(p.totalFinal).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const sinCliente = <Text span size="sm" c="dimmed" fs="italic">Sin cliente</Text>;

export default function PresupuestosPage() {
    const router = useRouter();
    const telefono = useEsTelefono();
    const { data: presupuestos, isLoading } = useQuery({ queryKey: ['presupuestos'], queryFn: () => fetchJson('/api/presupuestos') });
    const abrir = (p) => router.push(`/superuser/presupuestos/${p.id}`);

    return (
        <Box px={{ base: 'xs', sm: 'md' }} py="sm" maw={900} mx="auto">
            <Button variant="subtle" color="gray.3" size="compact-sm" leftSection={<IconChevronLeft size={16} />} onClick={() => router.push('/superuser')}>Panel</Button>
            <Group justify="space-between" mb="sm" wrap="wrap">
                <Title order={telefono ? 3 : 2} c="white">Presupuestos</Title>
                <Button component={Link} href="/superuser/presupuestos/nuevo" leftSection={<IconPlus size={16} />} fullWidth={telefono}>Nuevo presupuesto</Button>
            </Group>
            <Text size="sm" c="gray.4" mb="sm">Cotizaciones con IVA incluido, con o sin cliente: no son documentos fiscales ni afectan la contabilidad o el inventario. También puedes sacar uno desde la pantalla de venta (botón «Presupuesto»).</Text>

            <Paper withBorder radius="md" bg="white" p="xs">
                {isLoading ? <Group justify="center" py="xl"><Loader /></Group> : !presupuestos?.length ? (
                    <Text c="dimmed" ta="center" py="xl">Todavía no has hecho ningún presupuesto.</Text>
                ) : telefono ? (
                    // En el teléfono, una tarjeta por presupuesto (la tabla se desplazaba de lado)
                    <Stack gap={6}>
                        {presupuestos.map((p) => (
                            <UnstyledButton key={p.id} onClick={() => abrir(p)} p={10} style={{ border: '1px solid #e9ecef', borderRadius: 8 }}>
                                <Group justify="space-between" wrap="nowrap" gap="xs" align="flex-start">
                                    <Box style={{ minWidth: 0 }}>
                                        <Text fw={700} size="sm">{p.numero}</Text>
                                        <Text size="sm" lineClamp={1}>{p.cliente?.nombre || p.clienteNombre || sinCliente}</Text>
                                        <Group gap={6} mt={2}>
                                            <Text size="xs" c="dimmed">{formatearFecha(p.createdAt)}</Text>
                                            <Badge variant="light" size="xs" tt="none">{ETIQUETA_TARIFA[p.tarifa] || p.tarifa}</Badge>
                                        </Group>
                                    </Box>
                                    <Text fw={800} size="sm" style={{ whiteSpace: 'nowrap' }}>{total(p)}</Text>
                                </Group>
                            </UnstyledButton>
                        ))}
                    </Stack>
                ) : (
                    <Table.ScrollContainer minWidth={500}>
                        <Table highlightOnHover verticalSpacing="xs">
                            <Table.Thead><Table.Tr><Table.Th>N°</Table.Th><Table.Th>Cliente</Table.Th><Table.Th>Fecha</Table.Th><Table.Th>Tarifa</Table.Th><Table.Th style={{ textAlign: 'right' }}>Total</Table.Th></Table.Tr></Table.Thead>
                            <Table.Tbody>
                                {presupuestos.map((p) => (
                                    <Table.Tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => abrir(p)}>
                                        <Table.Td><Text fw={700} size="sm">{p.numero}</Text></Table.Td>
                                        <Table.Td>{p.cliente?.nombre || p.clienteNombre || sinCliente}</Table.Td>
                                        <Table.Td>{formatearFecha(p.createdAt)}</Table.Td>
                                        <Table.Td><Badge variant="light" tt="none">{ETIQUETA_TARIFA[p.tarifa] || p.tarifa}</Badge></Table.Td>
                                        <Table.Td style={{ textAlign: 'right' }}>{total(p)}</Table.Td>
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
