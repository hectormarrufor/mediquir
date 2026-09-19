'use client';

import React from 'react';
import { Paper, Group, Text, Badge, Table, Image, Title, Stack, Button, SimpleGrid, Alert, Anchor } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { IconShieldCheck, IconAlertTriangle } from '@tabler/icons-react';

const METODOS = { escaneo: 'Escaneo', codigo: 'Código', marca: 'Marca', manual: 'Manual' };
const hora = (d) => (d ? new Date(d).toLocaleString('es-VE') : '—');

function duracion(desde, hasta) {
    if (!desde || !hasta) return null;
    const min = Math.max(0, Math.round((new Date(hasta) - new Date(desde)) / 60000));
    return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
}

// Quién empacó, cómo se comprobó cada producto y las fotos de la caja: la respuesta a "¿quién fue?"
export default function EvidenciaEmpaque({ ventaId, puedeLiberar }) {
    const queryClient = useQueryClient();
    const { data, refetch } = useQuery({
        queryKey: ['empaque', ventaId],
        queryFn: async () => {
            const res = await fetch(`/api/ventas/${ventaId}/empaque`);
            return res.ok ? res.json() : null;
        },
    });
    if (!data || !data.venta.empacadorId) return null;
    const { venta, items } = data;
    const iniciado = items.some((i) => i.verificadoAt) || venta.empaqueIniciadoAt;
    if (!iniciado && !venta.empacadoAt) return null;

    const errores = items.reduce((s, i) => s + i.intentosFallidos, 0);
    const conNovedad = items.filter((i) => i.estado === 'NOVEDAD');

    const liberar = async (detalleId) => {
        const res = await fetch(`/api/ventas/${ventaId}/empaque`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accion: 'LIBERAR_ITEM', detalleId }),
        });
        const r = await res.json();
        if (!res.ok) return notifications.show({ title: 'Error', message: r.error, color: 'red' });
        notifications.show({ message: 'Renglón liberado: el empacador puede verificarlo de nuevo.', color: 'teal' });
        queryClient.invalidateQueries({ queryKey: ['empaque', ventaId] });
        refetch();
    };

    return (
        <Paper withBorder p="md" radius="md" bg="white" mb="md">
            <Stack gap="sm">
                <Group justify="space-between">
                    <Title order={5}>Evidencia de empaque</Title>
                    {venta.empacadoAt && (venta.empaqueVerificado
                        ? <Badge color="teal" leftSection={<IconShieldCheck size={12} />}>Verificado paso a paso</Badge>
                        : <Badge color="gray">Sin verificación (empaque anterior o atajo de administración)</Badge>)}
                </Group>
                <Text size="sm">
                    Responsable: <b>{venta.empacadorNombre || '—'}</b> · Inició: {hora(venta.empaqueIniciadoAt)}
                    {venta.empacadoAt && <> · Firmó: {hora(venta.empacadoAt)} {duracion(venta.empaqueIniciadoAt, venta.empacadoAt) && `(${duracion(venta.empaqueIniciadoAt, venta.empacadoAt)})`}</>}
                </Text>
                {errores > 0 && <Text size="xs" c="dimmed">El sistema frenó {errores} intento(s) con un producto equivocado.</Text>}
                {conNovedad.length > 0 && (
                    <Alert color="orange" icon={<IconAlertTriangle size={18} />} title="Novedades por resolver">
                        {conNovedad.map((i) => (
                            <Group key={i.detalleId} justify="space-between" mt={4}>
                                <Text size="sm">{i.nombre}: pedido {i.cantidadPedida}, reportó {i.cantidadEmpacada}. “{i.observacion}”</Text>
                                {puedeLiberar && <Button size="compact-xs" variant="light" onClick={() => liberar(i.detalleId)}>Liberar para reintentar</Button>}
                            </Group>
                        ))}
                    </Alert>
                )}
                <Table verticalSpacing={4} fz="sm">
                    <Table.Thead><Table.Tr><Table.Th>Producto</Table.Th><Table.Th ta="right">Pedido</Table.Th><Table.Th ta="right">Empacó</Table.Th><Table.Th>Comprobado por</Table.Th><Table.Th>Hora</Table.Th></Table.Tr></Table.Thead>
                    <Table.Tbody>
                        {items.map((i) => (
                            <Table.Tr key={i.detalleId}>
                                <Table.Td>{i.nombre}</Table.Td>
                                <Table.Td ta="right">{i.cantidadPedida}</Table.Td>
                                <Table.Td ta="right">{i.cantidadEmpacada ?? '—'}</Table.Td>
                                <Table.Td>{i.estado === 'NOVEDAD' ? <Badge color="orange" size="sm">Novedad</Badge> : (METODOS[i.metodo] || '—')}{i.intentosFallidos > 0 && ` · ${i.intentosFallidos} error(es)`}</Table.Td>
                                <Table.Td>{i.verificadoAt ? new Date(i.verificadoAt).toLocaleTimeString('es-VE') : '—'}</Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
                {(venta.fotoCajaAbiertaUrl || venta.fotoCajaSelladaUrl) && (
                    <SimpleGrid cols={{ base: 1, sm: 2 }}>
                        {[['Caja abierta', venta.fotoCajaAbiertaUrl], ['Caja sellada', venta.fotoCajaSelladaUrl]].map(([titulo, url]) => url && (
                            <Stack key={titulo} gap={2}>
                                <Text size="xs" c="dimmed">{titulo}</Text>
                                <Anchor href={url} target="_blank"><Image src={url} h={180} fit="cover" radius="sm" alt={titulo} /></Anchor>
                            </Stack>
                        ))}
                    </SimpleGrid>
                )}
            </Stack>
        </Paper>
    );
}
