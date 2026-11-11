'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Badge, Box, Button, Card, Group, Loader, Paper, SimpleGrid, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { IconArrowLeft, IconPrinter } from '@tabler/icons-react';
import { fechaCaracas } from '@/app/constants/hora';

const nf = (v) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);
const fechaLarga = (f) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : '');
const DOC = { FACTURA: 'Factura', NOTA_ENTREGA: 'N. entrega', VENTA_RAPIDA: 'V. rápida' };
const COLOR_ESTADO = { Pag: 'teal', Abo: 'orange', Pen: 'gray' };
const esDolares = (metodo) => /\(\$\)|zelle/i.test(metodo);

async function pedir(url) {
    const res = await fetch(url);
    const cuerpo = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(cuerpo.error || 'No se pudo cargar');
    return cuerpo;
}

function Cifra({ titulo, valor, color }) {
    return (
        <Card withBorder radius="lg" p="sm">
            <Text size="xs" c="dimmed" fw={700} tt="uppercase">{titulo}</Text>
            <Text fz={22} fw={800} c={color || 'navy.9'} style={{ whiteSpace: 'nowrap' }}>{valor}</Text>
        </Card>
    );
}

export default function CierreCajaPage() {
    const router = useRouter();
    const [fecha, setFecha] = useState(fechaCaracas());
    const { data, isLoading, error } = useQuery({
        queryKey: ['ventas-cierre', fecha],
        queryFn: () => pedir(`/api/ventas/cierre?fecha=${fecha}`),
        enabled: /^\d{4}-\d{2}-\d{2}$/.test(fecha),
    });
    const t = data?.totales;

    return (
        <Box p={{ base: 'sm', sm: 'lg' }} maw={1200} mx="auto">
            <Group justify="space-between" mb="md" wrap="wrap">
                <Group gap="sm">
                    <Button variant="subtle" color="gray" leftSection={<IconArrowLeft size={18} />} onClick={() => router.push('/superuser/ventas')}>Ventas</Button>
                    <Title order={2} c="navy.9">Cierre de caja</Title>
                </Group>
                <Group gap="sm" align="flex-end">
                    <TextInput type="date" label="Día" value={fecha} max={fechaCaracas()} onChange={(e) => e.currentTarget.value && setFecha(e.currentTarget.value)} />
                    <Button variant="light" leftSection={<IconPrinter size={18} />} onClick={() => window.print()}>Imprimir</Button>
                </Group>
            </Group>

            {error && <Alert color="red" mb="md">{error.message}</Alert>}
            {isLoading && <Group justify="center" py="xl"><Loader /></Group>}

            {data && (
                <Stack gap="lg">
                    <SimpleGrid cols={{ base: 2, md: 4 }}>
                        <Cifra titulo="Vendido (Bs)" valor={nf(t.facturas)} />
                        <Cifra titulo="A crédito (Bs)" valor={nf(t.credito)} />
                        <Cifra titulo="Devoluciones (Bs)" valor={nf(t.devoluciones)} color="red.7" />
                        <Cifra titulo="Cobrado hoy (Bs)" valor={nf(data.totalCobradoBs)} color="teal.7" />
                    </SimpleGrid>

                    <Paper withBorder radius="lg" p="md">
                        <Title order={4} c="navy.9">Recibo de caja · {fechaLarga(data.fecha)}</Title>
                        <Text size="sm" c="dimmed" mb="sm">Lo cobrado ese día por cada método de pago (ventas de contado y abonos de cobranza).</Text>
                        {data.cobros.length === 0 ? <Text c="gray.5">No hubo cobros este día.</Text> : (
                            <Table>
                                <Table.Thead><Table.Tr><Table.Th>Método de pago</Table.Th><Table.Th ta="right">Cobros</Table.Th><Table.Th ta="right">Monto</Table.Th></Table.Tr></Table.Thead>
                                <Table.Tbody>
                                    {data.cobros.map((c) => (
                                        <Table.Tr key={c.metodo}>
                                            <Table.Td fw={600}>{c.metodo}</Table.Td>
                                            <Table.Td ta="right">{c.cobros}</Table.Td>
                                            <Table.Td ta="right">{esDolares(c.metodo) ? `$ ${nf(c.montoUsd)}` : `Bs ${nf(c.montoBs)}`}</Table.Td>
                                        </Table.Tr>
                                    ))}
                                    <Table.Tr><Table.Td fw={800} colSpan={2}>Total (equivalente en Bs)</Table.Td><Table.Td ta="right" fw={800}>Bs {nf(data.totalCobradoBs)}</Table.Td></Table.Tr>
                                </Table.Tbody>
                            </Table>
                        )}
                    </Paper>

                    <Paper withBorder radius="lg" p="md">
                        <Title order={4} c="navy.9" mb="sm">Relación de facturas y devoluciones (Bs)</Title>
                        <Table.ScrollContainer minWidth={760}>
                            <Table striped verticalSpacing={4}>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>Documento</Table.Th><Table.Th>Est.</Table.Th><Table.Th>RIF</Table.Th><Table.Th>Cliente</Table.Th>
                                        <Table.Th>Condición</Table.Th><Table.Th ta="right">Total crédito</Table.Th><Table.Th ta="right">Total contado</Table.Th><Table.Th ta="right">Devolución</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {data.facturas.map((f) => (
                                        <Table.Tr key={f.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/superuser/ventas/${f.id}`)}>
                                            <Table.Td><Text size="sm" fw={600}>{f.numero}</Text><Text size="xs" c="dimmed">{DOC[f.tipoDocumento]}</Text></Table.Td>
                                            <Table.Td><Badge size="sm" variant="light" color={COLOR_ESTADO[f.estado]}>{f.estado}</Badge></Table.Td>
                                            <Table.Td>{f.rif}</Table.Td>
                                            <Table.Td>{f.cliente || '—'}</Table.Td>
                                            <Table.Td>{f.condicion === 'Credito' ? 'CRÉDITO' : 'CONTADO'}</Table.Td>
                                            <Table.Td ta="right">{f.condicion === 'Credito' ? nf(f.totalBs) : ''}</Table.Td>
                                            <Table.Td ta="right">{f.condicion !== 'Credito' ? nf(f.totalBs) : ''}</Table.Td>
                                            <Table.Td />
                                        </Table.Tr>
                                    ))}
                                    {data.devoluciones.map((d) => (
                                        <Table.Tr key={d.id} style={{ cursor: 'pointer' }} onClick={() => d.ventaId && router.push(`/superuser/ventas/${d.ventaId}`)}>
                                            <Table.Td><Text size="sm" fw={600}>{d.numero}</Text><Text size="xs" c="dimmed">N. crédito</Text></Table.Td>
                                            <Table.Td /><Table.Td>{d.rif}</Table.Td><Table.Td>{d.cliente || '—'}</Table.Td>
                                            <Table.Td /><Table.Td /><Table.Td />
                                            <Table.Td ta="right" c="red.7">{nf(d.totalBs)}</Table.Td>
                                        </Table.Tr>
                                    ))}
                                    {data.facturas.length + data.devoluciones.length === 0 && <Table.Tr><Table.Td colSpan={8} ta="center" c="gray.5">No hay documentos este día.</Table.Td></Table.Tr>}
                                    <Table.Tr>
                                        <Table.Td colSpan={5} fw={800}>TOTALES</Table.Td>
                                        <Table.Td ta="right" fw={800}>{nf(t.credito)}</Table.Td><Table.Td ta="right" fw={800}>{nf(t.contado)}</Table.Td><Table.Td ta="right" fw={800}>{nf(t.devoluciones)}</Table.Td>
                                    </Table.Tr>
                                </Table.Tbody>
                            </Table>
                        </Table.ScrollContainer>
                        <Stack gap={2} align="flex-end" mt="sm">
                            <Text fw={700}>Total devoluciones: Bs {nf(t.devoluciones)}</Text>
                            <Text fw={700}>Total facturas: Bs {nf(t.facturas)}</Text>
                        </Stack>
                    </Paper>
                </Stack>
            )}
        </Box>
    );
}
