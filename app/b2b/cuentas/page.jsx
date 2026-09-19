'use client';

import React from 'react';
import { Alert, Badge, Box, Card, Center, Group, Paper, Progress, SimpleGrid, Skeleton, Stack, Table, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { IconAlertTriangle, IconCircleCheck } from '@tabler/icons-react';
import { useTasaBcv } from '@/hooks/useTasaBcv';
import { aBolivares } from '@/app/constants/facturacion';
import { BadgeCobro } from '../_components/Estados';
import { fmtBs, fmtFecha, fmtUsd, pedirJson } from '../_lib/formato';

const CUBETAS = [
    { clave: 'alDia', etiqueta: 'Al día', color: 'teal' },
    { clave: 'vencido1a30', etiqueta: 'Vencido 1–30 días', color: 'yellow' },
    { clave: 'vencido31a60', etiqueta: 'Vencido 31–60 días', color: 'orange' },
    { clave: 'vencidoMas60', etiqueta: 'Vencido +60 días', color: 'red' },
];

export default function B2BCuentas() {
    const router = useRouter();
    const { tasa } = useTasaBcv();
    const { data, isLoading, error } = useQuery({ queryKey: ['b2b', 'cuentas'], queryFn: () => pedirJson('/api/b2b/cuentas'), refetchOnWindowFocus: true });

    return (
        <Stack gap="md">
            <Box>
                <Title order={2} c="navy.9">Cuentas por pagar</Title>
                <Text size="sm" c="dimmed">Tus pedidos con saldo pendiente y los pagos que hemos registrado.</Text>
            </Box>

            {error && <Alert color="red" icon={<IconAlertTriangle size={18} />}>{error.message}</Alert>}

            <Card withBorder radius="lg" p="lg" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
                <Text size="xs" c="dimmed" fw={700} tt="uppercase">Total pendiente</Text>
                {isLoading ? <Skeleton h={38} w={180} mt={4} /> : (
                    <Group align="baseline" gap="sm" wrap="wrap">
                        <Text fz={34} fw={900} c="navy.9" lh={1.2}>{fmtUsd(data?.totalPendiente)}</Text>
                        {tasa && <Text c="dimmed" fw={600}>{fmtBs(aBolivares(data?.totalPendiente || 0, tasa))} · tasa BCV {tasa}</Text>}
                    </Group>
                )}

                {data && data.totalPendiente > 0 && (
                    <>
                        <Progress.Root size={14} radius="xl" mt="md">
                            {CUBETAS.map((c) => data.cubetas[c.clave] > 0 && (
                                <Progress.Section key={c.clave} value={(data.cubetas[c.clave] / data.totalPendiente) * 100} color={c.color} />
                            ))}
                        </Progress.Root>
                        <SimpleGrid cols={{ base: 2, sm: 4 }} mt="md" spacing="xs">
                            {CUBETAS.map((c) => (
                                <Box key={c.clave}>
                                    <Group gap={6} wrap="nowrap"><Box w={10} h={10} bg={`${c.color}.6`} style={{ borderRadius: 3, flexShrink: 0 }} /><Text size="xs" c="dimmed">{c.etiqueta}</Text></Group>
                                    <Text fw={700} size="sm">{fmtUsd(data.cubetas[c.clave])}</Text>
                                </Box>
                            ))}
                        </SimpleGrid>
                    </>
                )}
            </Card>

            <Paper withBorder radius="lg" p="md" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
                <Title order={4} c="navy.9" mb="sm">Facturas pendientes</Title>
                {isLoading ? <Stack gap="xs">{[0, 1, 2].map((i) => <Skeleton key={i} h={38} />)}</Stack>
                    : !data?.pendientes?.length ? (
                        <Center py={40}><Group gap="xs"><IconCircleCheck color="var(--mantine-color-teal-6)" /><Text c="dimmed">No tienes saldos pendientes. ¡Gracias!</Text></Group></Center>
                    ) : (
                        <Table.ScrollContainer minWidth={620}>
                            <Table verticalSpacing="sm" highlightOnHover>
                                <Table.Thead><Table.Tr><Table.Th>Pedido</Table.Th><Table.Th>Emitido</Table.Th><Table.Th>Vence</Table.Th><Table.Th>Estado</Table.Th><Table.Th ta="right">Total</Table.Th><Table.Th ta="right">Saldo</Table.Th></Table.Tr></Table.Thead>
                                <Table.Tbody>
                                    {data.pendientes.map((c) => (
                                        <Table.Tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/b2b/pedidos/${c.id}`)}>
                                            <Table.Td><Text fw={700} size="sm">{c.numero}</Text></Table.Td>
                                            <Table.Td><Text size="sm">{fmtFecha(c.fecha)}</Text></Table.Td>
                                            <Table.Td><Text size="sm">{c.vence ? fmtFecha(c.vence) : '—'}</Text></Table.Td>
                                            <Table.Td><BadgeCobro cobro={{ clave: c.estado, etiqueta: c.etiqueta }} /></Table.Td>
                                            <Table.Td ta="right"><Text size="sm">{fmtUsd(c.total)}</Text></Table.Td>
                                            <Table.Td ta="right"><Text size="sm" fw={800} c={c.estado === 'vencido' ? 'red.7' : 'navy.9'}>{fmtUsd(c.saldo)}</Text>{tasa && <Text size="xs" c="dimmed">{fmtBs(aBolivares(c.saldo, tasa))}</Text>}</Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>
                        </Table.ScrollContainer>
                    )}
            </Paper>

            {data?.pagos?.length > 0 && (
                <Paper withBorder radius="lg" p="md" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
                    <Title order={4} c="navy.9" mb="sm">Pagos registrados</Title>
                    <Table.ScrollContainer minWidth={520}>
                        <Table verticalSpacing="xs">
                            <Table.Thead><Table.Tr><Table.Th>Fecha</Table.Th><Table.Th>Pedido</Table.Th><Table.Th>Método</Table.Th><Table.Th>Referencia</Table.Th><Table.Th ta="right">Monto</Table.Th></Table.Tr></Table.Thead>
                            <Table.Tbody>
                                {data.pagos.map((a) => (
                                    <Table.Tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/b2b/pedidos/${a.pedidoId}`)}>
                                        <Table.Td>{fmtFecha(a.fecha)}</Table.Td><Table.Td><Badge variant="light" color="gray">{a.pedido}</Badge></Table.Td><Table.Td>{a.metodo}</Table.Td><Table.Td>{a.referencia || '—'}</Table.Td>
                                        <Table.Td ta="right"><Text size="sm" fw={700}>{fmtUsd(a.montoUsd)}</Text><Text size="xs" c="dimmed">{fmtBs(a.montoVes)}</Text></Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>
                </Paper>
            )}
        </Stack>
    );
}
