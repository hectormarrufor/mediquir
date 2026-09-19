'use client';

import React, { useState } from 'react';
import { Alert, Badge, Box, Center, Container, Group, Loader, Paper, SegmentedControl, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { IconAlertTriangle, IconTargetArrow } from '@tabler/icons-react';

const TIPOS = { PRODUCTO: 'Otro producto', PRESENTACION: 'Presentación equivocada', MARCA: 'Otra marca' };
const NIVEL = { UNIDAD: 'unidad', CAJA: 'caja', BULTO: 'bulto' };

const aFecha = (d) => new Date(d.getTime() - 4 * 3600000).toISOString().slice(0, 10); // hora de Caracas
const hace = (dias) => aFecha(new Date(Date.now() - dias * 86400000));
const inicioMes = () => `${aFecha(new Date()).slice(0, 8)}01`;

async function pedirJson(url) {
    const res = await fetch(url);
    const cuerpo = await res.json().catch(() => null);
    if (!res.ok) throw new Error(cuerpo?.error || 'No se pudo cargar el reporte');
    return cuerpo;
}

// Quién se equivoca más al buscar productos en el empaque. Solo administradores.
export default function ErroresEmpaquePage() {
    const [rango, setRango] = useState('30');
    const [desde, setDesde] = useState(hace(30));
    const [hasta, setHasta] = useState(aFecha(new Date()));

    const elegirRango = (v) => {
        setRango(v);
        if (v === '7') { setDesde(hace(7)); setHasta(aFecha(new Date())); }
        if (v === '30') { setDesde(hace(30)); setHasta(aFecha(new Date())); }
        if (v === 'mes') { setDesde(inicioMes()); setHasta(aFecha(new Date())); }
    };

    const { data, isLoading, error } = useQuery({
        queryKey: ['empaque-errores', desde, hasta],
        queryFn: () => pedirJson(`/api/empaque/errores?desde=${desde}&hasta=${hasta}`),
        placeholderData: (previa) => previa,
    });

    return (
        <Container size="lg" px="xs" py="md">
            <Stack gap="md">
                <Box>
                    <Title order={2} c="white" fz={26}><IconTargetArrow size={28} style={{ verticalAlign: 'middle' }} /> Errores de empaque</Title>
                    <Text size="sm" c="gray.4">Cada vez que un empacador toma otro producto, otra presentación (unidad, caja o bulto) o elige otra marca, queda anotado a su nombre.</Text>
                </Box>

                <Paper withBorder radius="md" p="sm">
                    <Group align="flex-end" wrap="wrap">
                        <SegmentedControl value={rango} onChange={elegirRango} data={[{ value: '7', label: '7 días' }, { value: '30', label: '30 días' }, { value: 'mes', label: 'Este mes' }, { value: 'otro', label: 'Otro' }]} />
                        <TextInput type="date" label="Desde" value={desde} max={hasta} onChange={(e) => { setDesde(e.currentTarget.value); setRango('otro'); }} />
                        <TextInput type="date" label="Hasta" value={hasta} min={desde} onChange={(e) => { setHasta(e.currentTarget.value); setRango('otro'); }} />
                    </Group>
                </Paper>

                {error && <Alert color="red" icon={<IconAlertTriangle size={18} />}>{error.message}</Alert>}
                {isLoading && !data ? <Center py="xl"><Loader /></Center> : data && (
                    <>
                        <Paper withBorder radius="md" p="sm" style={{ overflowX: 'auto' }}>
                            <Title order={5} mb="xs">Por empleado</Title>
                            {!data.empleados.length ? <Text c="dimmed" size="sm">No hay empaques en este período.</Text> : (
                                <Table verticalSpacing={6} fz="sm" miw={640}>
                                    <Table.Thead>
                                        <Table.Tr>
                                            <Table.Th>Empleado</Table.Th>
                                            <Table.Th ta="right">Productos verificados</Table.Th>
                                            <Table.Th ta="right">Errores</Table.Th>
                                            <Table.Th ta="right">Errores por cada 100</Table.Th>
                                            <Table.Th>Detalle</Table.Th>
                                            <Table.Th ta="right">Novedades</Table.Th>
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {data.empleados.map((e) => (
                                            <Table.Tr key={e.id}>
                                                <Table.Td fw={600}>{e.nombre}</Table.Td>
                                                <Table.Td ta="right">{e.verificados}</Table.Td>
                                                <Table.Td ta="right"><Badge color={e.errores === 0 ? 'teal' : e.errores > 5 ? 'red' : 'orange'} variant="light">{e.errores}</Badge></Table.Td>
                                                <Table.Td ta="right">{e.por100 === null ? '—' : `${e.por100}`}</Table.Td>
                                                <Table.Td>
                                                    <Group gap={4}>
                                                        {Object.keys(TIPOS).filter((t) => e[t] > 0).map((t) => <Badge key={t} size="sm" variant="outline" color="gray" tt="none">{TIPOS[t]}: {e[t]}</Badge>)}
                                                    </Group>
                                                </Table.Td>
                                                <Table.Td ta="right">{e.novedades}</Table.Td>
                                            </Table.Tr>
                                        ))}
                                    </Table.Tbody>
                                </Table>
                            )}
                            <Text size="xs" c="dimmed" mt="xs">La tasa compara contra lo que cada quien empacó: 2 errores en 500 productos es mejor que 1 error en 5. Un mismo error (mismo producto y código) se cuenta una sola vez en 2 minutos.</Text>
                        </Paper>

                        <Paper withBorder radius="md" p="sm" style={{ overflowX: 'auto' }}>
                            <Title order={5} mb="xs">Últimos errores</Title>
                            {!data.recientes.length ? <Text c="dimmed" size="sm">Sin errores en este período.</Text> : (
                                <Table verticalSpacing={4} fz="sm" miw={640}>
                                    <Table.Thead><Table.Tr><Table.Th>Cuándo</Table.Th><Table.Th>Empleado</Table.Th><Table.Th>Pedido</Table.Th><Table.Th>Producto</Table.Th><Table.Th>Error</Table.Th></Table.Tr></Table.Thead>
                                    <Table.Tbody>
                                        {data.recientes.map((r) => (
                                            <Table.Tr key={r.id}>
                                                <Table.Td>{new Date(r.createdAt).toLocaleString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'short', timeStyle: 'short' })}</Table.Td>
                                                <Table.Td>{r.empacador}</Table.Td>
                                                <Table.Td>{r.ventaId ? <Text component={Link} href={`/superuser/ventas/${r.ventaId}`} size="sm" c="blue">{r.pedido}</Text> : r.pedido}</Table.Td>
                                                <Table.Td>{r.producto || '—'}</Table.Td>
                                                <Table.Td>
                                                    {TIPOS[r.tipo] || r.tipo}
                                                    {r.tipo === 'PRESENTACION' && r.nivelEscaneado && <Text span size="xs" c="dimmed"> (pedían {NIVEL[r.nivelPedido] || '—'}, tomó {NIVEL[r.nivelEscaneado] || '—'})</Text>}
                                                </Table.Td>
                                            </Table.Tr>
                                        ))}
                                    </Table.Tbody>
                                </Table>
                            )}
                        </Paper>
                    </>
                )}
            </Stack>
        </Container>
    );
}
