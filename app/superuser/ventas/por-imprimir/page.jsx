'use client';

import React from 'react';
import { ActionIcon, Alert, Box, Button, Card, Group, Loader, Stack, Table, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { IconArrowLeft, IconPrinter } from '@tabler/icons-react';
import { useEsTelefono } from '@/app/components/ui/modalMovil';
import { formatearFechaHora } from '@/app/constants/hora';
import { useVolver } from '@/app/helpers/useVolver';

const nf = (v) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);
const monto = (d) => `${d.moneda === 'BS' ? 'Bs' : '$'} ${nf(d.total)}`;
const imprimir = (d) => window.open(d.url, '_blank');
const TIPOS = { FACTURA: 'Factura', NOTA_CREDITO: 'Nota de crédito', NOTA_DEBITO: 'Nota de débito' };

// Mis facturas que ya aprobó jolexi y todavía no se imprimen: desde aquí se mandan a imprimir (al imprimirse salen de la lista)
export default function PorImprimirPage() {
    const volver = useVolver('/superuser');
    const telefono = useEsTelefono();
    const { data, isLoading, error } = useQuery({
        queryKey: ['por-imprimir'], refetchInterval: 30000, refetchOnWindowFocus: true,
        queryFn: async () => {
            const res = await fetch('/api/ventas/por-imprimir');
            const cuerpo = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(cuerpo.error || 'No se pudo cargar');
            return cuerpo;
        },
    });
    const docs = data?.documentos || [];

    return (
        <Box p={{ base: 'sm', md: 'lg' }} maw={980} mx="auto">
            <Group gap="xs" mb="md" wrap="nowrap">
                <ActionIcon variant="subtle" color="gray" size="lg" onClick={volver} aria-label="Volver"><IconArrowLeft size={22} /></ActionIcon>
                <Box>
                    <Title order={3} c="navy.9">Documentos por imprimir</Title>
                    <Text size="sm" c="dimmed">Facturas y notas de crédito o débito sin número de control: el control se asigna al imprimir por primera vez, y al imprimirlos salen de esta lista.</Text>
                </Box>
            </Group>
            {isLoading && <Group justify="center" p="xl"><Loader /></Group>}
            {error && <Alert color="red" variant="light">{error.message}</Alert>}
            {!isLoading && !error && docs.length === 0 && <Alert color="teal" variant="light">No hay documentos por imprimir. Cuando haya uno sin número de control (o Jolexi apruebe uno de un vendedor), aparecerá aquí.</Alert>}
            {docs.length > 0 && telefono && (
                <Stack gap="xs">
                    {docs.map((d) => (
                        <Card key={d.id} withBorder radius="md" p="sm">
                            <Group justify="space-between" wrap="nowrap" align="flex-start">
                                <Box style={{ minWidth: 0 }}>
                                    <Text fw={800}>{d.numero} <Text span size="xs" c="dimmed">{TIPOS[d.tipo]}</Text></Text>
                                    <Text size="sm" lineClamp={1}>{d.cliente}</Text>
                                    <Text size="xs" c="dimmed">{formatearFechaHora(d.fecha)}</Text>
                                </Box>
                                <Text fw={800} ta="right" style={{ whiteSpace: 'nowrap' }}>{monto(d)}</Text>
                            </Group>
                            <Button fullWidth mt="xs" color={d.aprobacion === 'PENDIENTE' ? 'orange' : undefined} leftSection={<IconPrinter size={18} />} onClick={() => imprimir(d)}>{d.aprobacion === 'PENDIENTE' ? 'Por aprobar: revisar' : 'Imprimir'}</Button>
                        </Card>
                    ))}
                </Stack>
            )}
            {docs.length > 0 && !telefono && (
                <Card withBorder radius="md" p={0}>
                    <Table highlightOnHover verticalSpacing="xs">
                        <Table.Thead><Table.Tr><Table.Th>Documento</Table.Th><Table.Th>Tipo</Table.Th><Table.Th>Cliente</Table.Th><Table.Th>Fecha</Table.Th><Table.Th ta="right">Total</Table.Th><Table.Th /></Table.Tr></Table.Thead>
                        <Table.Tbody>
                            {docs.map((d) => (
                                <Table.Tr key={d.id}>
                                    <Table.Td fw={800}>{d.numero}</Table.Td>
                                    <Table.Td>{TIPOS[d.tipo]}</Table.Td>
                                    <Table.Td>{d.cliente}</Table.Td>
                                    <Table.Td>{formatearFechaHora(d.fecha)}</Table.Td>
                                    <Table.Td ta="right" fw={700}>{monto(d)}</Table.Td>
                                    <Table.Td ta="right"><Button size="compact-md" color={d.aprobacion === 'PENDIENTE' ? 'orange' : undefined} leftSection={<IconPrinter size={16} />} onClick={() => imprimir(d)}>{d.aprobacion === 'PENDIENTE' ? 'Por aprobar: revisar' : 'Imprimir'}</Button></Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                </Card>
            )}
        </Box>
    );
}
