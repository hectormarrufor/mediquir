'use client';

import React, { useState } from 'react';
import { Alert, Badge, Box, Button, Group, NumberInput, Pagination, Paper, SegmentedControl, Skeleton, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { IconCheck, IconSearch, IconUndo } from '@tabler/icons-react';

const fmtFecha = (v) => (v ? new Date(v).toLocaleDateString('es-VE', { timeZone: 'America/Caracas' }) : '');

// Auditoría de existencias sin cerrar la tienda: se cuenta producto por producto cuando toca.
// Naranja = sin auditar (vender o empacar no mueve su stock); verde = auditado (su stock ya es confiable y sí se descuenta).
export default function AuditarStockPage() {
    const queryClient = useQueryClient();
    const [q, setQ] = useState('');
    const [busqueda] = useDebouncedValue(q, 350);
    const [estado, setEstado] = useState('pendiente');
    const [pagina, setPagina] = useState(1);
    const [conteo, setConteo] = useState({}); // id -> cantidad escrita
    const [guardando, setGuardando] = useState(null);
    const [avisoCambio, setAvisoCambio] = useState({}); // id -> stock nuevo, cuando cambió mientras se contaba

    const { data, isLoading, error } = useQuery({
        queryKey: ['auditoria-stock', busqueda, estado, pagina],
        queryFn: async () => {
            const res = await fetch(`/api/inventario/auditoria-stock?q=${encodeURIComponent(busqueda)}&estado=${estado}&pagina=${pagina}`);
            const j = await res.json();
            if (!res.ok) throw new Error(j.error || 'No se pudo cargar');
            return j;
        },
        placeholderData: (previo) => previo,
    });

    const enviar = async (cuerpo, id, mensaje) => {
        setGuardando(id);
        try {
            const res = await fetch('/api/inventario/auditoria-stock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
            const j = await res.json();
            if (res.status === 409 && j.cambio) {
                // El stock cambió mientras se contaba: se muestra el valor nuevo y la siguiente confirmación ya lo da por visto
                setAvisoCambio((a) => ({ ...a, [id]: j.stockActual }));
                notifications.show({ color: 'orange', title: 'El stock cambió mientras contabas', message: j.error, autoClose: 12000 });
                queryClient.invalidateQueries({ queryKey: ['auditoria-stock'] });
                return;
            }
            if (!res.ok) throw new Error(j.error || 'No se pudo guardar');
            setAvisoCambio((a) => { const { [id]: _q, ...resto } = a; return resto; });
            notifications.show({ color: 'teal', message: mensaje });
            setConteo((c) => { const { [id]: _quitado, ...resto } = c; return resto; });
            queryClient.invalidateQueries({ queryKey: ['auditoria-stock'] });
            queryClient.invalidateQueries({ queryKey: ['productos'] });
        } catch (e) {
            notifications.show({ color: 'red', title: 'Error', message: e.message });
        } finally {
            setGuardando(null);
        }
    };

    const r = data?.resumen;
    return (
        <Box maw={1100} mx="auto" px={{ base: 6, sm: 'md' }} py="md">
            <Stack gap="md">
                <Box>
                    <Title order={2} c="white">Auditar existencias</Title>
                    <Text size="sm" c="gray.4">Cuenta cada producto cuando te toque, sin cerrar la tienda. Solo lo ve el personal.</Text>
                </Box>

                <Group gap="xs">
                    <Badge size="lg" color="teal" variant="filled">Auditados: {r?.auditados ?? '—'}</Badge>
                    <Badge size="lg" color="orange" variant="filled">Sin auditar: {r?.pendientes ?? '—'}</Badge>
                    <Badge size="lg" color="gray" variant="light">Total: {r?.total ?? '—'}</Badge>
                </Group>

                <Alert color="blue" variant="light">
                    <b>Sin auditar (naranja):</b> al vender o empacar no se mueve su stock, pero sí se suman las unidades vendidas. <b>Auditado (verde):</b> cuenta la mercancía real,
                    escribe lo que contaste y confirma: ese stock queda corregido y desde entonces cada venta o empaque lo descuenta.
                </Alert>

                <Paper withBorder radius="md" p="sm">
                    <Group justify="space-between" wrap="wrap" gap="sm">
                        <TextInput leftSection={<IconSearch size={16} />} placeholder="Nombre, código, marca o código de barras" value={q} onChange={(e) => { setQ(e.currentTarget.value); setPagina(1); }} style={{ flex: 1, minWidth: 220 }} />
                        <SegmentedControl value={estado} onChange={(v) => { setEstado(v); setPagina(1); }} data={[{ value: 'pendiente', label: 'Sin auditar' }, { value: 'auditado', label: 'Auditados' }, { value: 'todos', label: 'Todos' }]} />
                    </Group>
                </Paper>

                {error && <Alert color="red">{error.message}</Alert>}
                <Paper withBorder radius="md" p="sm" bg="white">
                    {isLoading ? <Skeleton h={240} /> : !data?.productos?.length ? <Text c="dimmed" ta="center" py="lg">No hay productos con ese filtro.</Text> : (
                        <Table.ScrollContainer minWidth={640}>
                            <Table verticalSpacing="xs" highlightOnHover>
                                <Table.Thead><Table.Tr><Table.Th>Producto</Table.Th><Table.Th>Estado</Table.Th><Table.Th ta="right">Stock en sistema</Table.Th><Table.Th>Cantidad contada</Table.Th><Table.Th /></Table.Tr></Table.Thead>
                                <Table.Tbody>
                                    {data.productos.map((p) => (
                                        <Table.Tr key={p.id}>
                                            <Table.Td><Text fw={700} size="sm" lineClamp={2}>{p.nombre}</Text><Text size="xs" c="dimmed">{[p.codigo, p.marca].filter(Boolean).join(' · ')}</Text></Table.Td>
                                            <Table.Td>
                                                <Badge color={p.auditado ? 'teal' : 'orange'} variant="filled">{p.auditado ? 'Auditado' : 'Sin auditar'}</Badge>
                                                {p.auditado && p.auditadoAt && <Text size="xs" c="dimmed">{fmtFecha(p.auditadoAt)}</Text>}
                                            </Table.Td>
                                            <Table.Td ta="right"><Text fw={700}>{p.stock}</Text>{avisoCambio[p.id] !== undefined && <Badge color="orange" variant="light" size="xs">Cambió a {avisoCambio[p.id]}: confirma de nuevo</Badge>}</Table.Td>
                                            <Table.Td>
                                                <NumberInput w={130} size="xs" min={0} allowNegative={false} decimalScale={2} hideControls placeholder="Lo que contaste" value={conteo[p.id] ?? ''} onChange={(v) => setConteo((c) => ({ ...c, [p.id]: v }))} />
                                            </Table.Td>
                                            <Table.Td>
                                                <Group gap={6} wrap="nowrap">
                                                    <Button size="xs" color="teal" leftSection={<IconCheck size={14} />} loading={guardando === p.id} disabled={conteo[p.id] === '' || conteo[p.id] == null}
                                                        onClick={() => enviar({ productoId: p.id, stockReal: conteo[p.id], esperado: avisoCambio[p.id] ?? p.stock }, p.id, `${p.nombre}: stock corregido a ${conteo[p.id]} y marcado como auditado`)}>Confirmar</Button>
                                                    {p.auditado && <Button size="xs" variant="subtle" color="gray" leftSection={<IconUndo size={14} />} loading={guardando === p.id} onClick={() => enviar({ productoId: p.id, quitar: true }, p.id, `${p.nombre}: vuelve a sin auditar`)}>Quitar</Button>}
                                                </Group>
                                            </Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>
                        </Table.ScrollContainer>
                    )}
                    {data?.paginas > 1 && <Group justify="center" mt="sm"><Pagination total={data.paginas} value={pagina} onChange={setPagina} /></Group>}
                </Paper>
            </Stack>
        </Box>
    );
}
