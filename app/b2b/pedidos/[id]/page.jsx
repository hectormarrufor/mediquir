'use client';

import React, { useState } from 'react';
import { Alert, Box, Button, Card, Divider, Grid, Group, Image, Modal, Paper, Skeleton, Stack, Table, Text, ThemeIcon, Timeline, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { IconAlertTriangle, IconArrowLeft, IconBan, IconCheck, IconClock, IconPackage, IconTruckDelivery, IconX } from '@tabler/icons-react';
import { aBolivares } from '@/app/constants/facturacion';
import { getMainImage, PLACEHOLDER_IMG } from '@/app/components/landing/productUtils';
import { BadgesPedido } from '../../_components/Estados';
import PagarConPagoMovil from '../../_components/PagarConPagoMovil';
import RetencionCliente from '../../_components/RetencionCliente';
import { fmtBs, fmtFecha, fmtFechaHora, fmtPrecio, fmtUsd, pedirJson } from '../../_lib/formato';

const ICONOS = { recibido: IconClock, empacado: IconPackage, entregado: IconTruckDelivery, cancelado: IconX };

export default function B2BPedidoDetalle() {
    const { id } = useParams();
    const router = useRouter();
    const queryClient = useQueryClient();
    const [cancelando, setCancelando] = useState(false);
    const [modalCancelar, { open: abrirCancelar, close: cerrarCancelar }] = useDisclosure(false);

    const { data: p, isLoading, error } = useQuery({ queryKey: ['b2b', 'pedido', id], queryFn: () => pedirJson(`/api/b2b/pedidos/${id}`), refetchInterval: 60000 });

    const cancelar = async () => {
        setCancelando(true);
        try {
            await pedirJson(`/api/b2b/pedidos/${id}/cancelar`, { method: 'POST' });
            notifications.show({ color: 'teal', message: 'Pedido cancelado' });
            cerrarCancelar();
            queryClient.invalidateQueries({ queryKey: ['b2b'] });
        } catch (e) {
            notifications.show({ color: 'red', title: 'No se pudo cancelar', message: e.message });
            cerrarCancelar();
        } finally {
            setCancelando(false);
        }
    };

    if (error) {
        return (
            <Stack gap="md">
                <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => router.push('/b2b/pedidos')} w="fit-content">Mis pedidos</Button>
                <Alert color="red" icon={<IconAlertTriangle size={18} />}>{error.message}</Alert>
            </Stack>
        );
    }

    const tasa = p?.tasaCambio;
    const pasoActivo = p ? p.lineaDeTiempo.filter((s) => s.hecho).length - 1 : 0;

    return (
        <Stack gap="md">
            <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => router.push('/b2b/pedidos')} w="fit-content">Mis pedidos</Button>

            <Group justify="space-between" align="flex-start" wrap="wrap">
                <Box>
                    <Title order={2} c="navy.9">{isLoading ? <Skeleton h={30} w={200} /> : `Pedido ${p.numero}`}</Title>
                    {p && <Text size="sm" c="dimmed">{fmtFechaHora(p.fecha)} · {p.tipoEntrega === 'pickup' ? 'Retiro en tienda' : 'Envío'}{p.tipoEntrega !== 'pickup' && p.quienRetira ? ` · Retira: ${p.quienRetira}` : ''}</Text>}
                </Box>
                {p && <BadgesPedido pedido={p} />}
            </Group>

            {isLoading ? <Skeleton h={300} radius="lg" /> : (
                <Grid gutter="lg">
                    <Grid.Col span={{ base: 12, md: 8 }}>
                        <Stack gap="md">
                            <Paper withBorder radius="lg" p="md" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
                                <Title order={5} c="navy.9" mb="sm">Productos</Title>
                                <Table.ScrollContainer minWidth={500}>
                                    <Table verticalSpacing="xs">
                                        <Table.Thead><Table.Tr><Table.Th>Producto</Table.Th><Table.Th ta="right">Precio</Table.Th><Table.Th ta="right">Cant.</Table.Th><Table.Th ta="right">Monto</Table.Th></Table.Tr></Table.Thead>
                                        <Table.Tbody>
                                            {p.detalles.map((d) => (
                                                <Table.Tr key={d.id}>
                                                    <Table.Td>
                                                        <Group gap="sm" wrap="nowrap">
                                                            <Image src={getMainImage({ imagen: d.imagen, marca: d.marca })} w={40} h={40} fit="contain" radius="sm" bg="gray.0" fallbackSrc={PLACEHOLDER_IMG} alt="" />
                                                            <Box style={{ minWidth: 0 }}><Text size="sm" fw={600} lineClamp={2}>{d.nombre}</Text>{!d.aplicaIva && <Text size="xs" c="dimmed">Exento de IVA</Text>}</Box>
                                                        </Group>
                                                    </Table.Td>
                                                    <Table.Td ta="right"><Text size="sm">{fmtPrecio(d.precioUnitario)}</Text></Table.Td>
                                                    <Table.Td ta="right"><Text size="sm">{d.cantidad}</Text></Table.Td>
                                                    <Table.Td ta="right"><Text size="sm" fw={700}>{fmtUsd(d.subtotal)}</Text></Table.Td>
                                                </Table.Tr>
                                            ))}
                                        </Table.Tbody>
                                    </Table>
                                </Table.ScrollContainer>
                            </Paper>

                            {p.abonos.length > 0 && (
                                <Paper withBorder radius="lg" p="md" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
                                    <Title order={5} c="navy.9" mb="sm">Pagos recibidos</Title>
                                    <Table.ScrollContainer minWidth={420}>
                                        <Table verticalSpacing="xs">
                                            <Table.Thead><Table.Tr><Table.Th>Fecha</Table.Th><Table.Th>Método</Table.Th><Table.Th>Referencia</Table.Th><Table.Th ta="right">Monto</Table.Th></Table.Tr></Table.Thead>
                                            <Table.Tbody>{p.abonos.map((a) => (
                                                <Table.Tr key={a.id}><Table.Td>{fmtFecha(a.fecha)}</Table.Td><Table.Td>{a.metodo}</Table.Td><Table.Td>{a.referencia || '—'}</Table.Td>
                                                    <Table.Td ta="right"><Text size="sm" fw={700}>{fmtUsd(a.montoUsd)}</Text><Text size="xs" c="dimmed">{fmtBs(a.montoVes)}</Text></Table.Td></Table.Tr>
                                            ))}</Table.Tbody>
                                        </Table>
                                    </Table.ScrollContainer>
                                </Paper>
                            )}
                        </Stack>
                    </Grid.Col>

                    <Grid.Col span={{ base: 12, md: 4 }}>
                        <Stack gap="md">
                            <Card withBorder radius="lg" p="md" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
                                <Title order={5} c="navy.9" mb="sm">Seguimiento</Title>
                                <Timeline active={pasoActivo} bulletSize={26} lineWidth={2} color={p.estado === 'Cancelado' ? 'gray' : 'teal'}>
                                    {p.lineaDeTiempo.map((s) => {
                                        const Icono = ICONOS[s.clave] || IconCheck;
                                        return (
                                            <Timeline.Item key={s.clave} title={s.titulo} bullet={<Icono size={14} />} color={s.clave === 'cancelado' ? 'gray' : undefined}>
                                                <Text size="xs" c="dimmed">{s.hecho ? (s.fecha ? fmtFechaHora(s.fecha) : s.detalle) : 'Pendiente'}</Text>
                                            </Timeline.Item>
                                        );
                                    })}
                                </Timeline>
                            </Card>

                            <Card withBorder radius="lg" p="md" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
                                <Title order={5} c="navy.9" mb="sm">Totales</Title>
                                <Stack gap={6}>
                                    <Group justify="space-between"><Text size="sm">Subtotal</Text><Text size="sm">{fmtUsd(p.subtotal)}</Text></Group>
                                    {p.montoIva > 0 && <Group justify="space-between"><Text size="sm">IVA</Text><Text size="sm">{fmtUsd(p.montoIva)}</Text></Group>}
                                    {p.flete > 0 && <Group justify="space-between"><Text size="sm">Flete</Text><Text size="sm">{fmtUsd(p.flete)}</Text></Group>}
                                    <Divider />
                                    <Group justify="space-between" align="flex-start"><Text fw={800}>Total</Text>
                                        <Box ta="right"><Text fw={900} fz={20} c="navy.9" lh={1.1}>{fmtUsd(p.total)}</Text><Text size="xs" c="dimmed">{fmtBs(aBolivares(p.total, tasa))} · tasa {tasa}</Text></Box></Group>
                                    {p.estado !== 'Cancelado' && (
                                        <>
                                            <Divider />
                                            <Group justify="space-between"><Text size="sm" fw={600}>Por pagar</Text><Text size="sm" fw={800} c={p.cobro.saldo > 0 ? (p.cobro.clave === 'vencido' ? 'red.7' : 'orange.8') : 'teal.7'}>{p.cobro.saldo > 0 ? fmtUsd(p.cobro.saldo) : 'Pagado'}</Text></Group>
                                            {p.cobro.vence && p.cobro.saldo > 0 && <Text size="xs" c="dimmed" ta="right">Vence el {fmtFecha(p.cobro.vence)} · {p.cobro.etiqueta}</Text>}
                                        </>
                                    )}
                                </Stack>
                            </Card>

                            {p.retencion && p.estado !== 'Cancelado' && <RetencionCliente pedido={p} />}

                            {p.condicionPago === 'Credito' && p.estado !== 'Cancelado' && p.cobro.saldo > 0 && <PagarConPagoMovil pedido={p} />}

                            {p.cancelable && (
                                <Button variant="light" color="red" leftSection={<IconBan size={16} />} onClick={abrirCancelar}>Cancelar pedido</Button>
                            )}
                        </Stack>
                    </Grid.Col>
                </Grid>
            )}

            <Modal opened={modalCancelar} onClose={cerrarCancelar} title="Cancelar pedido" centered>
                <Stack gap="md">
                    <Text size="sm">¿Seguro que quieres cancelar el pedido {p?.numero}? Esta acción no se puede deshacer.</Text>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={cerrarCancelar}>Volver</Button>
                        <Button color="red" onClick={cancelar} loading={cancelando}>Sí, cancelar</Button>
                    </Group>
                </Stack>
            </Modal>
        </Stack>
    );
}
