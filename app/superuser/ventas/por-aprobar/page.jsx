'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ActionIcon, Alert, Badge, Box, Button, Card, Group, Loader, Stack, Table, Text, Title, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { IconArrowLeft, IconCheck, IconExternalLink, IconPrinter } from '@tabler/icons-react';
import { useEsTelefono } from '@/app/components/ui/modalMovil';
import { formatearFechaHora } from '@/app/constants/hora';

const nf = (v) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);
const TIPOS = { FACTURA: ['Factura', 'blue'], NOTA_CREDITO: ['Nota de crédito', 'red'], NOTA_DEBITO: ['Nota de débito', 'grape'] };
const esNota = (d) => d.tipo !== 'FACTURA';
const urlImprimir = (d) => (esNota(d) ? `/superuser/notas/${d.id}/imprimir` : `/superuser/ventas/imprimir/${d.id}`);

// Facturas y notas de crédito/débito que asentaron los vendedores: se listan por número de control; se abren para corregirlas y se aprueban para imprimirlas
export default function PorAprobarPage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const telefono = useEsTelefono();
    const [aprobando, setAprobando] = useState(null);

    const { data, isLoading, error } = useQuery({
        queryKey: ['por-aprobar'], refetchInterval: 30000,
        queryFn: async () => {
            const res = await fetch('/api/ventas/por-aprobar');
            const cuerpo = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(cuerpo.error || 'No se pudo cargar');
            return cuerpo;
        },
    });

    const abrir = (d) => router.push(`/superuser/ventas/${d.ventaId || d.id}`);

    const aprobar = async (d) => {
        setAprobando(d.id);
        try {
            const res = await fetch('/api/ventas/por-aprobar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo: esNota(d) ? 'NOTA' : 'VENTA', id: d.id }) });
            const cuerpo = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(cuerpo.error || 'No se pudo aprobar');
            const idAviso = `aprobada-${d.id}`;
            notifications.show({
                id: idAviso, color: 'green', autoClose: 20000, withCloseButton: true, title: `${TIPOS[d.tipo][0]} aprobada`,
                message: (
                    <Group gap="sm" mt={4}>
                        <Text size="sm">{d.numero}</Text>
                        <Button size="xs" color="blue.8" leftSection={<IconPrinter size={14} />} onClick={() => { window.open(urlImprimir(d), '_blank'); notifications.hide(idAviso); }}>Imprimir ahora</Button>
                    </Group>
                ),
            });
            queryClient.invalidateQueries({ queryKey: ['por-aprobar'] });
            queryClient.invalidateQueries({ queryKey: ['por-aprobar-conteo'] });
        } catch (e) {
            notifications.show({ title: 'Error', message: e.message, color: 'red' });
        } finally {
            setAprobando(null);
        }
    };

    const documentos = data?.documentos || [];

    return (
        <Box maw={1200} mx="auto" px={{ base: 'xs', sm: 'md' }} py="md">
            <Stack gap="md">
                <Box>
                    <Button variant="subtle" color="gray.4" size="compact-sm" leftSection={<IconArrowLeft size={16} />} onClick={() => router.push('/superuser/ventas')} mb={4}>Ventas</Button>
                    <Title order={telefono ? 3 : 2} c="white">Facturas por aprobar</Title>
                    <Text size="sm" c="gray.4">Lo que asentaron los vendedores, en orden de número de control. Ábrelo para corregirlo y apruébalo para poder imprimirlo.</Text>
                </Box>

                {data?.sinMigrar && <Alert color="yellow" title="Falta preparar la base de datos">Hay que correr la migración aprobacion-documentos para que las facturas de los vendedores pasen por aprobación.</Alert>}
                {error && <Alert color="red">{error.message}</Alert>}

                {isLoading ? <Group justify="center" p="xl"><Loader /></Group> : !error && documentos.length === 0 ? (
                    <Card withBorder radius="lg" p="xl"><Text ta="center" c="dimmed">No hay documentos por aprobar.</Text></Card>
                ) : !error && telefono ? (
                    <Stack gap="xs">
                        {documentos.map((d) => (
                            <Card key={`${d.tipo}-${d.id}`} withBorder radius="lg" p="sm" onClick={() => abrir(d)} style={{ cursor: 'pointer' }}>
                                <Group justify="space-between" wrap="nowrap" align="flex-start">
                                    <Box style={{ minWidth: 0 }}>
                                        <Group gap={6}>
                                            <Badge size="xs" variant="light" color={TIPOS[d.tipo][1]}>{TIPOS[d.tipo][0]}</Badge>
                                            <Text fw={700} size="sm">{d.numero}</Text>
                                        </Group>
                                        <Text size="xs" c="dimmed">Control {d.numeroControl || 'sin asignar'} · {d.vendedor || 'Vendedor'}</Text>
                                        <Text size="sm" lineClamp={1}>{d.cliente}</Text>
                                        <Text size="sm" fw={700}>{d.moneda === 'BS' ? 'Bs' : '$'}{nf(d.total)}</Text>
                                    </Box>
                                    <Button size="xs" color="green" leftSection={<IconCheck size={14} />} loading={aprobando === d.id} onClick={(e) => { e.stopPropagation(); aprobar(d); }}>Aprobar</Button>
                                </Group>
                            </Card>
                        ))}
                    </Stack>
                ) : !error && (
                    <Card withBorder radius="lg" p={0}>
                        <Table highlightOnHover verticalSpacing="sm">
                            <Table.Thead>
                                <Table.Tr><Table.Th>N° de control</Table.Th><Table.Th>Documento</Table.Th><Table.Th>Cliente</Table.Th><Table.Th>Vendedor</Table.Th><Table.Th>Fecha</Table.Th><Table.Th ta="right">Total</Table.Th><Table.Th /></Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {documentos.map((d) => (
                                    <Table.Tr key={`${d.tipo}-${d.id}`} onClick={() => abrir(d)} style={{ cursor: 'pointer' }}>
                                        <Table.Td fw={600}>{d.numeroControl || <Text span c="dimmed" size="sm">sin asignar</Text>}</Table.Td>
                                        <Table.Td><Group gap={6} wrap="nowrap"><Badge size="xs" variant="light" color={TIPOS[d.tipo][1]}>{TIPOS[d.tipo][0]}</Badge><Text size="sm" fw={600}>{d.numero}</Text></Group></Table.Td>
                                        <Table.Td>{d.cliente}</Table.Td>
                                        <Table.Td>{d.vendedor || '—'}</Table.Td>
                                        <Table.Td>{formatearFechaHora(d.fecha)}</Table.Td>
                                        <Table.Td ta="right" fw={700}>{d.moneda === 'BS' ? 'Bs' : '$'}{nf(d.total)}</Table.Td>
                                        <Table.Td onClick={(e) => e.stopPropagation()}>
                                            <Group gap={6} justify="flex-end" wrap="nowrap">
                                                <Tooltip label="Abrir para revisar o corregir"><ActionIcon variant="subtle" color="gray" onClick={() => abrir(d)}><IconExternalLink size={16} /></ActionIcon></Tooltip>
                                                <Button size="xs" color="green" leftSection={<IconCheck size={14} />} loading={aprobando === d.id} onClick={() => aprobar(d)}>Aprobar</Button>
                                            </Group>
                                        </Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Card>
                )}
            </Stack>
        </Box>
    );
}
