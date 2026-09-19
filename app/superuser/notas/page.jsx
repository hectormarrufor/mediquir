'use client';

import React, { useState } from 'react';
import { Alert, Anchor, Badge, Box, Button, Center, Group, Paper, SegmentedControl, Select, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { IconAlertTriangle, IconFileDiff, IconListNumbers, IconSearch } from '@tabler/icons-react';
import NotaAcciones from '../ventas/_components/NotaAcciones';
import NumeracionFiscalModal, { useNumeracion } from '../_components/NumeracionFiscal';

const nf = (v) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);
const fmtFecha = (v) => (v ? `${String(v).slice(8, 10)}/${String(v).slice(5, 7)}/${String(v).slice(0, 4)}` : '');

// Lista de notas de crédito y de débito: las que emite la empresa a sus clientes y las que recibe de sus proveedores
export default function NotasPage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [origen, setOrigen] = useState('');
    const [tipo, setTipo] = useState('');
    const [busqueda, setBusqueda] = useState('');
    const [verNumeracion, setVerNumeracion] = useState(false);
    const { data: numeracion } = useNumeracion();
    const pendientes = (numeracion?.series || []).filter((s) => !s.configurado);
    const [q] = useDebouncedValue(busqueda.trim(), 300);

    const { data, isLoading, error } = useQuery({
        queryKey: ['notas', origen, tipo, q],
        queryFn: async () => {
            const p = new URLSearchParams();
            if (origen) p.set('origen', origen);
            if (tipo) p.set('tipo', tipo);
            if (q) p.set('q', q);
            const res = await fetch(`/api/notas?${p}`);
            const cuerpo = await res.json().catch(() => null);
            if (!res.ok) throw new Error(cuerpo?.error || 'No se pudieron cargar las notas');
            return cuerpo;
        },
    });
    const notas = data?.notas || [];
    const refrescar = () => queryClient.invalidateQueries({ queryKey: ['notas'] });

    return (
        <Box maw={1400} mx="auto" px="md" py="md">
            <Stack gap="md">
                <Group justify="space-between" align="flex-end" wrap="wrap">
                    <Box>
                        <Title order={2} c="white"><IconFileDiff size={26} style={{ verticalAlign: 'middle' }} /> Notas de crédito y débito</Title>
                        <Text size="sm" c="gray.4">Las notas de venta se emiten desde el detalle de cada factura; las de compra, desde el historial de compras.</Text>
                    </Box>
                    <Button variant="white" leftSection={<IconListNumbers size={18} />} onClick={() => setVerNumeracion(true)}>Numeración fiscal</Button>
                </Group>

                {pendientes.length > 0 && (
                    <Alert color="orange" variant="white" icon={<IconAlertTriangle size={18} />} title="Falta configurar la numeración">
                        Indica con qué número empieza: {pendientes.map((s) => s.etiqueta.toLowerCase()).join(', ')}. <Anchor size="sm" onClick={() => setVerNumeracion(true)}>Configurar ahora</Anchor>
                    </Alert>
                )}

                {error && <Alert color="red" icon={<IconAlertTriangle size={18} />}>{error.message}</Alert>}

                <Paper withBorder radius="lg" p="md">
                    <Group gap="sm" mb="md" wrap="wrap" align="flex-end">
                        <SegmentedControl color="navy.9" value={origen} onChange={setOrigen} data={[{ value: '', label: 'Todas' }, { value: 'VENTA', label: 'Emitidas a clientes' }, { value: 'COMPRA', label: 'Recibidas de proveedores' }]} />
                        <Select w={170} placeholder="Tipo" clearable data={[{ value: 'CREDITO', label: 'Crédito' }, { value: 'DEBITO', label: 'Débito' }]} value={tipo || null} onChange={(v) => setTipo(v || '')} />
                        <TextInput flex="1 1 240px" placeholder="Buscar por número, cliente, proveedor o factura…" leftSection={<IconSearch size={16} />} value={busqueda} onChange={(e) => setBusqueda(e.currentTarget.value)} />
                    </Group>

                    {isLoading ? <Center py={50}><Text c="dimmed">Cargando…</Text></Center> : !notas.length ? <Center py={50}><Text c="dimmed">No hay notas con esos filtros.</Text></Center> : (
                        <Table.ScrollContainer minWidth={980}>
                            <Table verticalSpacing="xs" highlightOnHover fz="sm">
                                <Table.Thead><Table.Tr>
                                    <Table.Th>Nota</Table.Th><Table.Th>Fecha</Table.Th><Table.Th>Cliente / proveedor</Table.Th><Table.Th>Factura afectada</Table.Th><Table.Th>N° control</Table.Th>
                                    <Table.Th>Motivo</Table.Th><Table.Th ta="right">Total</Table.Th><Table.Th />
                                </Table.Tr></Table.Thead>
                                <Table.Tbody>
                                    {notas.map((n) => (
                                        <Table.Tr key={n.id} opacity={n.estado === 'ANULADA' ? 0.55 : 1}>
                                            <Table.Td>
                                                <Group gap={6} wrap="nowrap">
                                                    <Text fw={700} size="sm">{n.numeroDocumento}</Text>
                                                    <Badge size="xs" color={n.tipo === 'CREDITO' ? 'red' : 'blue'} variant="light">{n.tipo === 'CREDITO' ? 'Crédito' : 'Débito'}</Badge>
                                                    {n.origen === 'COMPRA' && <Badge size="xs" color="grape" variant="outline">Proveedor</Badge>}
                                                    {n.estado === 'ANULADA' && <Badge size="xs" color="gray">Anulada</Badge>}
                                                </Group>
                                            </Table.Td>
                                            <Table.Td>{fmtFecha(n.fecha)}</Table.Td>
                                            <Table.Td>{n.contraparte || '—'}</Table.Td>
                                            <Table.Td>
                                                {n.origen === 'VENTA' && n.ventaId
                                                    ? <Anchor size="sm" onClick={() => router.push(`/superuser/ventas/${n.ventaId}`)}>{n.facturaAfectada}</Anchor>
                                                    : n.facturaAfectada}
                                            </Table.Td>
                                            <Table.Td>{n.numeroControl || <Text span size="xs" c="dimmed" title="Se asigna solo al imprimir la nota">Sin imprimir</Text>}</Table.Td>
                                            <Table.Td><Text size="xs" lineClamp={2} maw={260}>{n.motivo}</Text></Table.Td>
                                            <Table.Td ta="right" fw={700} c={n.tipo === 'CREDITO' ? 'red.7' : 'blue.7'}>{n.tipo === 'CREDITO' ? '−' : '+'}{n.moneda === 'BS' ? 'Bs ' : '$'}{nf(n.total)}</Table.Td>
                                            <Table.Td><NotaAcciones nota={n} onCambio={refrescar} /></Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>
                        </Table.ScrollContainer>
                    )}
                    <Text size="xs" c="dimmed" mt="sm">{notas.length} nota(s)</Text>
                </Paper>
            </Stack>
            <NumeracionFiscalModal opened={verNumeracion} onClose={() => setVerNumeracion(false)} />
        </Box>
    );
}
