'use client';

import React from 'react';
import { Alert, Badge, Box, Button, Card, Group, Paper, SimpleGrid, Skeleton, Stack, Table, Text, ThemeIcon, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { IconAlertTriangle, IconArrowRight, IconBuildingStore, IconCalendarDue, IconReceipt2, IconTruckDelivery, IconWallet } from '@tabler/icons-react';
import { aBolivares } from '@/app/constants/facturacion';
import { BadgesPedido } from './_components/Estados';
import { fmtBs, fmtFecha, fmtUsd, pedirJson } from './_lib/formato';

function Indicador({ icono: Icono, color, titulo, valor, detalle, onClick, cargando }) {
    return (
        <Card withBorder radius="lg" p="md" onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default', boxShadow: 'var(--mm-shadow-card)' }}>
            <Group wrap="nowrap" align="flex-start">
                <ThemeIcon size={44} radius="md" variant="light" color={color}><Icono size={24} /></ThemeIcon>
                <Box style={{ minWidth: 0 }}>
                    <Text size="xs" c="dimmed" fw={700} tt="uppercase">{titulo}</Text>
                    {cargando ? <Skeleton h={28} w={110} mt={4} /> : <Text fz={26} fw={800} lh={1.2} c="navy.9">{valor}</Text>}
                    {detalle && !cargando && <Text size="xs" c="dimmed">{detalle}</Text>}
                </Box>
            </Group>
        </Card>
    );
}

export default function B2BInicio() {
    const router = useRouter();
    const { data, isLoading, error } = useQuery({ queryKey: ['b2b', 'resumen'], queryFn: () => pedirJson('/api/b2b/resumen'), refetchOnWindowFocus: true });

    const tasa = data?.tasa;
    const saldoBs = tasa && data ? aBolivares(data.saldoPendiente, tasa) : null;

    return (
        <Stack gap="lg">
            <Group justify="space-between" align="flex-end" wrap="wrap">
                <Box>
                    <Text size="sm" c="dimmed">Portal de clientes</Text>
                    <Title order={2} c="navy.9">{isLoading ? <Skeleton h={30} w={260} /> : `Hola, ${data?.cliente?.nombre || 'cliente'}`}</Title>
                </Box>
                <Button size="md" radius="xl" color="accent.6" leftSection={<IconBuildingStore size={18} />} onClick={() => router.push('/b2b/catalogo')}>Hacer un pedido</Button>
            </Group>

            {error && <Alert color="red" icon={<IconAlertTriangle size={18} />}>{error.message}</Alert>}

            {data?.facturasVencidas > 0 && (
                <Alert color="red" variant="filled" icon={<IconAlertTriangle size={20} />} title="Tienes pagos vencidos">
                    <Group justify="space-between" wrap="wrap">
                        <Text size="sm" c="white">{data.facturasVencidas} {data.facturasVencidas === 1 ? 'pedido vencido' : 'pedidos vencidos'} por {fmtUsd(data.saldoVencido)}.</Text>
                        <Button size="xs" color="white" c="red.8" variant="white" onClick={() => router.push('/b2b/cuentas')}>Ver cuentas por pagar</Button>
                    </Group>
                </Alert>
            )}

            <SimpleGrid cols={{ base: 1, xs: 2, lg: 4 }} spacing="md">
                <Indicador icono={IconTruckDelivery} color="blue" titulo="Pedidos en curso" cargando={isLoading}
                    valor={data?.pedidosActivos ?? 0} detalle={`${data?.totalPedidos ?? 0} pedidos en total`} onClick={() => router.push('/b2b/pedidos?estado=activos')} />
                <Indicador icono={IconWallet} color="orange" titulo="Saldo por pagar" cargando={isLoading}
                    valor={fmtUsd(data?.saldoPendiente)} detalle={saldoBs !== null ? `${fmtBs(saldoBs)} a tasa BCV ${tasa}` : undefined} onClick={() => router.push('/b2b/cuentas')} />
                <Indicador icono={IconReceipt2} color="grape" titulo="Facturas pendientes" cargando={isLoading}
                    valor={data?.facturasPendientes ?? 0} detalle={data?.facturasVencidas ? `${data.facturasVencidas} vencida(s)` : 'Ninguna vencida'} onClick={() => router.push('/b2b/cuentas')} />
                <Indicador icono={IconCalendarDue} color={data?.proximoVencimiento ? 'teal' : 'gray'} titulo="Próximo vencimiento" cargando={isLoading}
                    valor={data?.proximoVencimiento ? fmtFecha(data.proximoVencimiento.vence) : '—'}
                    detalle={data?.proximoVencimiento ? `${data.proximoVencimiento.numero} · ${fmtUsd(data.proximoVencimiento.saldo)}` : 'Sin vencimientos próximos'}
                    onClick={data?.proximoVencimiento ? () => router.push(`/b2b/pedidos/${data.proximoVencimiento.id}`) : undefined} />
            </SimpleGrid>

            <Paper withBorder radius="lg" p="md" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
                <Group justify="space-between" mb="sm">
                    <Title order={4} c="navy.9">Últimos pedidos</Title>
                    <Button variant="subtle" size="xs" rightSection={<IconArrowRight size={14} />} onClick={() => router.push('/b2b/pedidos')}>Ver todos</Button>
                </Group>

                {isLoading ? <Stack gap="xs">{[0, 1, 2].map((i) => <Skeleton key={i} h={38} />)}</Stack>
                    : !data?.ultimosPedidos?.length ? (
                        <Stack align="center" py="xl" gap="xs">
                            <Text c="dimmed">Aún no tienes pedidos.</Text>
                            <Button variant="light" onClick={() => router.push('/b2b/catalogo')}>Explorar el catálogo</Button>
                        </Stack>
                    ) : (
                        <Table.ScrollContainer minWidth={560}>
                            <Table verticalSpacing="sm" highlightOnHover>
                                <Table.Thead><Table.Tr><Table.Th>Pedido</Table.Th><Table.Th>Fecha</Table.Th><Table.Th>Estado</Table.Th><Table.Th ta="right">Total</Table.Th><Table.Th ta="right">Por pagar</Table.Th></Table.Tr></Table.Thead>
                                <Table.Tbody>
                                    {data.ultimosPedidos.map((p) => (
                                        <Table.Tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/b2b/pedidos/${p.id}`)}>
                                            <Table.Td><Text fw={700} size="sm">{p.numero}</Text></Table.Td>
                                            <Table.Td><Text size="sm">{fmtFecha(p.fecha)}</Text></Table.Td>
                                            <Table.Td><BadgesPedido pedido={p} /></Table.Td>
                                            <Table.Td ta="right"><Text size="sm" fw={600}>{fmtUsd(p.total)}</Text></Table.Td>
                                            <Table.Td ta="right">{p.cobro.saldo > 0 ? <Badge color={p.cobro.clave === 'vencido' ? 'red' : 'orange'} variant="light">{fmtUsd(p.cobro.saldo)}</Badge> : <Text size="sm" c="dimmed">—</Text>}</Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>
                        </Table.ScrollContainer>
                    )}
            </Paper>
        </Stack>
    );
}
