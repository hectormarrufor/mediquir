'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Alert, Badge, Box, Button, Card, Container, Grid, Group, Loader, Paper, Table, Text, Title } from '@mantine/core';
import { IconArrowLeft, IconFileText, IconReceiptTax } from '@tabler/icons-react';
import PrecioVisual from '@/app/components/ui/PrecioVisual';
import { formatearFecha, formatearFechaHora } from '@/app/constants/hora';

async function pedirJson(url) {
    const res = await fetch(url);
    const cuerpo = await res.json().catch(() => null);
    if (!res.ok) throw new Error(cuerpo?.error || 'No se pudo cargar la compra');
    return cuerpo;
}

const bs = (n) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);

// Detalle de una compra a un proveedor: documento, productos que entraron al inventario y su comprobante de retención de IVA
export default function DetalleCompraPage() {
    const { id } = useParams();
    const router = useRouter();
    const { data: c, isLoading, error } = useQuery({ queryKey: ['compra-detalle', id], queryFn: () => pedirJson(`/api/compras/${id}`) });

    if (isLoading) return <Container py="xl"><Group justify="center"><Loader /></Group></Container>;
    if (error) return (
        <Container size="sm" py="xl">
            <Alert color="red" title="No se pudo cargar">{error.message}</Alert>
            <Button mt="md" variant="default" leftSection={<IconArrowLeft size={16} />} onClick={() => router.push('/superuser/compras')}>Volver a compras</Button>
        </Container>
    );

    const simbolo = c.moneda === 'BS' ? 'Bs' : '$';
    const ret = (c.retenciones || []).find((r) => r.tipo === 'COMPRA' && r.comprobante);
    const esFactura = c.tipoDocumento === 'FACTURA';

    return (
        <Container size="lg" py="md">
            <Group justify="space-between" mb="md" wrap="wrap">
                <Group>
                    <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => router.push('/superuser/compras')}>Compras</Button>
                    <Title order={2} c="white">{esFactura ? 'Factura' : 'Nota de entrega'} {c.numeroDocumento}</Title>
                    <Badge size="lg" color={esFactura ? 'blue' : 'gray'} variant="light">{esFactura ? 'Factura' : 'Nota de entrega'}</Badge>
                </Group>
                {ret && <Button color="green" leftSection={<IconReceiptTax size={18} />} onClick={() => router.push(`/superuser/compras/${c.id}/retencion`)}>Comprobante de retención</Button>}
            </Group>

            <Grid gutter="md">
                <Grid.Col span={{ base: 12, md: 7 }}>
                    <Paper withBorder radius="lg" p="md" bg="white" mb="md">
                        <Title order={5} c="navy.9" mb="xs">Documento</Title>
                        <Grid>
                            <Grid.Col span={6}><Text size="xs" c="dimmed">Proveedor</Text><Text fw={700}>{c.proveedor?.nombre}</Text><Text size="xs" c="dimmed">RIF: {c.proveedor?.identificacion}</Text></Grid.Col>
                            <Grid.Col span={6}><Text size="xs" c="dimmed">Fecha del documento</Text><Text fw={700}>{formatearFecha(c.fechaFactura)}</Text>{c.numeroControl && <Text size="xs" c="dimmed">Control: {c.numeroControl}</Text>}</Grid.Col>
                            <Grid.Col span={6}><Text size="xs" c="dimmed">Condición de pago</Text><Text fw={700}>{c.condicionPago}{c.condicionPago === 'Credito' ? ` (${c.diasCredito} días)` : ''}</Text></Grid.Col>
                            <Grid.Col span={6}><Text size="xs" c="dimmed">Registrada</Text><Text fw={700}>{formatearFechaHora(c.createdAt)}</Text><Text size="xs" c="dimmed">{c.registrador?.empleado ? `${c.registrador.empleado.nombre} ${c.registrador.empleado.apellido}` : c.registrador?.user}</Text></Grid.Col>
                        </Grid>
                    </Paper>

                    <Paper withBorder radius="lg" p="md" bg="white">
                        <Title order={5} c="navy.9" mb="xs">Productos que entraron al inventario</Title>
                        <Table.ScrollContainer minWidth={420}>
                            <Table verticalSpacing="xs" fz="sm">
                                <Table.Thead><Table.Tr><Table.Th>Producto</Table.Th><Table.Th ta="right">Cantidad</Table.Th><Table.Th ta="right">Costo unit. ($)</Table.Th></Table.Tr></Table.Thead>
                                <Table.Tbody>
                                    {(c.entradas || []).map((e) => (
                                        <Table.Tr key={e.id}>
                                            <Table.Td><Text size="sm" fw={600}>{e.producto?.nombre}</Text><Text size="xs" c="dimmed">{e.producto?.codigo}</Text></Table.Td>
                                            <Table.Td ta="right">{Number(e.cantidad)}</Table.Td>
                                            <Table.Td ta="right">{Number(e.costoUnitario).toFixed(4)}</Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>
                        </Table.ScrollContainer>
                    </Paper>
                </Grid.Col>

                <Grid.Col span={{ base: 12, md: 5 }}>
                    <Card withBorder radius="lg" p="md" bg="white" mb="md">
                        <Title order={5} c="navy.9" mb="xs">Montos</Title>
                        <Group justify="space-between"><Text size="sm">Subtotal</Text><PrecioVisual valor={c.subtotal} simbolo={simbolo} size="sm" /></Group>
                        {esFactura && <Group justify="space-between"><Text size="sm">IVA (16%)</Text><PrecioVisual valor={c.montoIva} simbolo={simbolo} size="sm" /></Group>}
                        {Number(c.montoRetencion) > 0 && <Group justify="space-between"><Text size="sm" c="red.8">Retención de IVA (−)</Text><PrecioVisual valor={c.montoRetencion} simbolo={simbolo} size="sm" c="red.8" /></Group>}
                        <Group justify="space-between" mt={6}><Text fw={800}>Total del documento</Text><PrecioVisual valor={c.totalFinal} simbolo={simbolo} size="lg" fw={800} /></Group>
                        {!esFactura && <Text size="xs" c="dimmed" mt="xs">Nota de entrega: sin IVA ni retención, no entra al libro de compras.</Text>}
                    </Card>

                    {esFactura && (
                        <Card withBorder radius="lg" p="md" bg="white">
                            <Group gap={6} mb="xs"><IconFileText size={18} color="var(--mantine-color-green-7)" /><Title order={5} c="navy.9">Retención de IVA</Title></Group>
                            {ret ? (
                                <>
                                    <Text size="xs" c="dimmed">Comprobante N°</Text>
                                    <Text fw={800} fz="lg" c="navy.9">{ret.comprobante}</Text>
                                    <Text size="sm" mt={4}>Retenido ({Number(ret.porcentajeRetencion)}%): <b>Bs {bs(ret.ivaRetenido)}</b></Text>
                                    <Text size="xs" c="dimmed">Emitido el {formatearFecha(ret.fecha)}</Text>
                                    <Button fullWidth mt="sm" color="green" onClick={() => router.push(`/superuser/compras/${c.id}/retencion`)}>Ver, imprimir o enviar al proveedor</Button>
                                </>
                            ) : <Text size="sm" c="dimmed">Esta factura no generó retención (no tiene IVA o se registró sin retener).</Text>}
                        </Card>
                    )}
                </Grid.Col>
            </Grid>
            <Box h={30} />
        </Container>
    );
}
