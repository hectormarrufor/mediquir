'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert, Badge, CloseButton, Group, Loader, Modal, Paper, Stack, Table, Tabs, Text, TextInput,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import { IconAlertTriangle, IconCalendar, IconCash, IconClockHour4, IconReceipt2, IconSearch } from '@tabler/icons-react';

const usdFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUsd = (v) => `$${usdFmt.format(Number(v) || 0)}`;
const fmtBs = (v) => `Bs ${new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0)}`;
const fmtFechaCorta = (v) => new Date(v).toLocaleDateString('es-VE', { timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', year: 'numeric' });

const DOC = {
    FACTURA: { etiqueta: 'Factura', color: 'navy' },
    NOTA_ENTREGA: { etiqueta: 'N. entrega', color: 'gray' },
    VENTA_RAPIDA: { etiqueta: 'V. rápida', color: 'lime' },
};

async function pedirListaCondicion(desde, hasta, condicion) {
    const qs = new URLSearchParams({ desde, hasta, condicion, todas: '1' });
    const res = await fetch(`/api/ventas/lista?${qs}`);
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || 'No se pudo cargar la lista de ventas');
    return data;
}

function TablaCondicion({ query, filtro, onAbrirVenta }) {
    const filas = useMemo(() => {
        const lista = query.data?.ventas || [];
        const q = filtro.trim().toLowerCase();
        if (!q) return lista;
        return lista.filter((v) =>
            (v.numero || '').toLowerCase().includes(q) ||
            (v.cliente || '').toLowerCase().includes(q) ||
            (v.vendedor || '').toLowerCase().includes(q)
        );
    }, [query.data, filtro]);

    const montoFiltradoUsd = useMemo(() => filas.reduce((acc, v) => acc + (Number(v.totalUsd) || 0), 0), [filas]);

    if (query.isPending) {
        return (
            <Group justify="center" py="xl">
                <Loader size="sm" />
                <Text size="sm" c="dimmed">Cargando ventas...</Text>
            </Group>
        );
    }

    if (query.isError) {
        return (
            <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />} mt="sm">
                {query.error?.message || 'Error al cargar las ventas'}
            </Alert>
        );
    }

    const totalRegistros = query.data?.total || 0;
    const totalMontoUsd = query.data?.totalMontoUsd || 0;

    return (
        <Stack gap="xs" mt="sm">
            <Paper withBorder radius="md" p="xs" bg="var(--mantine-color-default-hover)">
                <Group justify="space-between" wrap="wrap" gap="xs">
                    <Text size="xs" c="dimmed">
                        Mostrando <Text span fw={700} c="var(--mantine-color-text)">{filas.length}</Text>
                        {filtro.trim() ? ` de ${totalRegistros}` : ''} documento{filas.length === 1 ? '' : 's'}
                        {totalRegistros > 1000 ? ' (límite 1000)' : ''}
                    </Text>
                    <Text size="sm" fw={800}>
                        Total: {fmtUsd(filtro.trim() ? montoFiltradoUsd : totalMontoUsd)}
                    </Text>
                </Group>
            </Paper>

            {filas.length === 0 ? (
                <Text ta="center" c="dimmed" py="xl" size="sm">
                    No hay ventas registradas con esta condición en el rango seleccionado.
                </Text>
            ) : (
                <Table.ScrollContainer minWidth={560} mah={440}>
                    <Table striped highlightOnHover verticalSpacing="xs" stickyHeader>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>N° Documento</Table.Th>
                                <Table.Th>Cliente</Table.Th>
                                <Table.Th ta="right">Monto</Table.Th>
                                <Table.Th>Vendedor</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {filas.map((v) => (
                                <Table.Tr
                                    key={v.id}
                                    onClick={() => onAbrirVenta(v.ventaId || v.id)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <Table.Td>
                                        <Group gap={6} wrap="nowrap">
                                            <Text fw={700} size="sm" ff="monospace">{v.numero}</Text>
                                            {DOC[v.tipoDocumento] && (
                                                <Badge size="xs" variant="light" color={DOC[v.tipoDocumento].color}>
                                                    {DOC[v.tipoDocumento].etiqueta}
                                                </Badge>
                                            )}
                                        </Group>
                                        <Text size="xs" c="dimmed">{fmtFechaCorta(v.fecha)}</Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" fw={500} lineClamp={1}>{v.cliente}</Text>
                                    </Table.Td>
                                    <Table.Td ta="right">
                                        <Text size="sm" fw={700}>{fmtUsd(v.totalUsd)}</Text>
                                        {v.moneda === 'BS' && (
                                            <Text size="xs" c="dimmed">{fmtBs(v.total)}</Text>
                                        )}
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" c={v.vendedor ? undefined : 'dimmed'} lineClamp={1}>
                                            {v.vendedor || '—'}
                                        </Text>
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                </Table.ScrollContainer>
            )}
        </Stack>
    );
}

/**
 * Modal de auditoría para revisar ventas de Contado y a Crédito dentro de un rango de fechas.
 */
export default function ModalContadoCredito({ opened, onClose, rangoInicial, telefono }) {
    const router = useRouter();
    const [rango, setRango] = useState(rangoInicial || [new Date(), new Date()]);
    const [tab, setTab] = useState('Contado');
    const [filtro, setFiltro] = useState('');

    useEffect(() => {
        if (opened && rangoInicial?.[0] && rangoInicial?.[1]) {
            setRango(rangoInicial);
            setFiltro('');
        }
    }, [opened, rangoInicial]);

    const d1 = rango?.[0] ? dayjs(rango[0]).format('YYYY-MM-DD') : null;
    const d2 = rango?.[1] ? dayjs(rango[1]).format('YYYY-MM-DD') : null;
    const habilitado = Boolean(opened && d1 && d2);

    const qContado = useQuery({
        queryKey: ['ventas-revision', 'Contado', d1, d2],
        queryFn: () => pedirListaCondicion(d1, d2, 'Contado'),
        enabled: habilitado,
    });

    const qCredito = useQuery({
        queryKey: ['ventas-revision', 'Credito', d1, d2],
        queryFn: () => pedirListaCondicion(d1, d2, 'Credito'),
        enabled: habilitado,
    });

    const abrirVenta = (id) => {
        onClose();
        router.push(`/superuser/ventas/${id}`);
    };

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            fullScreen={telefono}
            size="xl"
            radius="lg"
            title={
                <Group gap="xs">
                    <IconReceipt2 size={20} />
                    <Text fw={800}>Revisión de ventas: Contado y Crédito</Text>
                </Group>
            }
        >
            <Stack gap="sm">
                <Group grow align="flex-end" wrap="wrap">
                    <DatePickerInput
                        type="range"
                        label="Rango de fechas"
                        placeholder="Selecciona desde - hasta"
                        value={rango}
                        onChange={setRango}
                        valueFormat="DD/MM/YYYY"
                        locale="es"
                        leftSection={<IconCalendar size={16} />}
                        allowSingleDateInRange
                    />
                    <TextInput
                        label="Buscar en la lista"
                        placeholder="N° documento, cliente o vendedor..."
                        value={filtro}
                        onChange={(e) => setFiltro(e.currentTarget.value)}
                        leftSection={<IconSearch size={16} />}
                        rightSection={filtro ? <CloseButton size="sm" onClick={() => setFiltro('')} /> : null}
                    />
                </Group>

                {!d1 || !d2 ? (
                    <Text size="sm" c="dimmed" ta="center" py="lg">
                        Selecciona la fecha inicial y final del rango para consultar las ventas.
                    </Text>
                ) : (
                    <Tabs value={tab} onChange={(v) => setTab(v || 'Contado')}>
                        <Tabs.List grow>
                            <Tabs.Tab
                                value="Contado"
                                color="green"
                                leftSection={<IconCash size={16} />}
                                rightSection={
                                    <Badge size="sm" variant="light" color="green">
                                        {qContado.data?.total ?? '...'}
                                    </Badge>
                                }
                            >
                                De Contado
                            </Tabs.Tab>
                            <Tabs.Tab
                                value="Credito"
                                color="indigo"
                                leftSection={<IconClockHour4 size={16} />}
                                rightSection={
                                    <Badge size="sm" variant="light" color="indigo">
                                        {qCredito.data?.total ?? '...'}
                                    </Badge>
                                }
                            >
                                A Crédito
                            </Tabs.Tab>
                        </Tabs.List>

                        <Tabs.Panel value="Contado">
                            <TablaCondicion query={qContado} filtro={filtro} onAbrirVenta={abrirVenta} />
                        </Tabs.Panel>

                        <Tabs.Panel value="Credito">
                            <TablaCondicion query={qCredito} filtro={filtro} onAbrirVenta={abrirVenta} />
                        </Tabs.Panel>
                    </Tabs>
                )}
            </Stack>
        </Modal>
    );
}
