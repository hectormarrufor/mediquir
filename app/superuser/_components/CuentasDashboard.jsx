'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
    ActionIcon, Alert, Badge, Box, Button, Card, Center, Grid, Group, Pagination, Paper, SegmentedControl, SimpleGrid, Skeleton, Stack, Table, Text, TextInput,
    ThemeIcon, Title, Tooltip,
} from '@mantine/core';
import { BarChart, DonutChart } from '@mantine/charts';
import { useDebouncedValue } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { IconAlertTriangle, IconArrowRight, IconBrandWhatsapp, IconCash, IconClockExclamation, IconFileInvoice, IconSearch, IconUsers } from '@tabler/icons-react';
import { aBolivares } from '@/app/constants/facturacion';
import { telefonoWhatsapp } from '../clientes/_components/AccesoModal';

const usd = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUsd = (v) => `$${usd.format(Number(v) || 0)}`;
const fmtBs = (v) => `Bs ${new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0)}`;
const fmtFecha = (v) => (v ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : '—');
const TAMANO = 12;

const COLOR_CUBETA = ['teal.6', 'yellow.6', 'orange.6', 'red.5', 'red.8'];
const ESTADO = {
    'vencida': { color: 'red', etiqueta: (c) => `Vencida hace ${-c.diasParaVencer} d` },
    'por-vencer': { color: 'orange', etiqueta: (c) => (c.diasParaVencer === 0 ? 'Vence hoy' : `Vence en ${c.diasParaVencer} d`) },
    'al-dia': { color: 'teal', etiqueta: (c) => `Vence en ${c.diasParaVencer} d` },
    'sin-fecha': { color: 'gray', etiqueta: () => 'Sin fecha de pago' },
};
const COLORES_DONA = ['brand.6', 'accent.6', 'teal.6', 'grape.6', 'yellow.6', 'cyan.6'];

async function pedirJson(url) {
    const res = await fetch(url);
    const cuerpo = await res.json().catch(() => null);
    if (!res.ok) throw new Error(cuerpo?.error || 'No se pudo cargar');
    return cuerpo;
}

function Indicador({ icono: Icono, color, titulo, valor, detalle, cargando }) {
    return (
        <Card withBorder radius="lg" p="md" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
            <Group wrap="nowrap" align="flex-start">
                <ThemeIcon size={44} radius="md" variant="light" color={color}><Icono size={24} /></ThemeIcon>
                <Box style={{ minWidth: 0 }}>
                    <Text size="xs" c="dimmed" fw={700} tt="uppercase">{titulo}</Text>
                    {cargando ? <Skeleton h={28} w={110} mt={4} /> : <Text fz={24} fw={800} lh={1.2} c="navy.9">{valor}</Text>}
                    {detalle && !cargando && <Text size="xs" c="dimmed">{detalle}</Text>}
                </Box>
            </Group>
        </Card>
    );
}

// Cuentas por cobrar (tipo="cobrar") o por pagar (tipo="pagar"): mismos indicadores, gráficos y tabla
export default function CuentasDashboard({ tipo }) {
    const router = useRouter();
    const cobrar = tipo === 'cobrar';
    const { data, isLoading, error } = useQuery({ queryKey: ['cuentas', tipo], queryFn: () => pedirJson(`/api/finanzas/cuentas?tipo=${tipo}`), refetchOnWindowFocus: true });

    const [busqueda, setBusqueda] = useState('');
    const [q] = useDebouncedValue(busqueda.trim().toLowerCase(), 250);
    const [filtro, setFiltro] = useState('todas');
    const [pagina, setPagina] = useState(1);
    useEffect(() => { setPagina(1); }, [q, filtro, tipo]);

    const cuentas = data?.cuentas || [];
    const filtradas = useMemo(() => cuentas.filter((c) => {
        if (filtro === 'vencidas' && c.estado !== 'vencida') return false;
        if (filtro === 'por-vencer' && c.estado !== 'por-vencer') return false;
        if (filtro === 'al-dia' && !['al-dia', 'sin-fecha'].includes(c.estado)) return false;
        return !q || [c.contraparte.nombre, c.contraparte.identificacion, c.documento].some((x) => String(x || '').toLowerCase().includes(q));
    }), [cuentas, q, filtro]);
    const paginas = Math.max(1, Math.ceil(filtradas.length / TAMANO));
    const visibles = filtradas.slice((pagina - 1) * TAMANO, pagina * TAMANO);

    const r = data?.resumen;
    const tasa = data?.tasa;
    const dona = (data?.top || []).map((t, i) => ({ name: t.nombre, value: t.saldo, color: COLORES_DONA[i % COLORES_DONA.length] }));
    const barras = (data?.cubetas || []).map((c, i) => ({ etiqueta: c.etiqueta.replace('Vencido ', ''), monto: c.monto, color: COLOR_CUBETA[i] }));

    const recordatorio = (c) => {
        const wa = telefonoWhatsapp(c.contraparte.telefono);
        if (!wa) return null;
        const texto = `Hola ${c.contraparte.nombre || ''}, te escribimos de Mediquir. Tienes un saldo pendiente de ${fmtUsd(c.saldo)} del documento ${c.documento || ''}${c.vence ? ` (vencimiento ${fmtFecha(c.vence)})` : ''}. ¿Nos confirmas el pago? ¡Gracias!`;
        return `https://wa.me/${wa}?text=${encodeURIComponent(texto)}`;
    };

    return (
        <Box maw={1500} mx="auto" px="md" py="md">
            <Stack gap="lg">
                <Group justify="space-between" align="flex-end" wrap="wrap">
                    <Box>
                        <Title order={2} c="white">{cobrar ? 'Cuentas por cobrar' : 'Cuentas por pagar'}</Title>
                        <Text size="sm" c="gray.4">{cobrar ? 'Lo que tus clientes te deben, ordenado por vencimiento.' : 'Lo que le debes a tus proveedores, ordenado por vencimiento.'}{tasa ? ` · BCV ${tasa} Bs/$` : ''}</Text>
                    </Box>
                    <SegmentedControl color="navy.9" value={tipo} onChange={(v) => router.push(v === 'cobrar' ? '/superuser/cxc' : '/superuser/cxp')}
                        data={[{ value: 'cobrar', label: 'Por cobrar' }, { value: 'pagar', label: 'Por pagar' }]} />
                </Group>

                {error && <Alert color="red" icon={<IconAlertTriangle size={18} />}>{error.message}</Alert>}

                <SimpleGrid cols={{ base: 1, xs: 2, lg: 4 }} spacing="md">
                    <Indicador icono={IconCash} color="blue" titulo="Total pendiente" cargando={isLoading} valor={fmtUsd(r?.total)} detalle={tasa ? fmtBs(aBolivares(r?.total || 0, tasa)) : undefined} />
                    <Indicador icono={IconClockExclamation} color="red" titulo="Vencido" cargando={isLoading} valor={fmtUsd(r?.vencido)} detalle={`${r?.vencidos ?? 0} documento(s)`} />
                    <Indicador icono={IconClockExclamation} color="orange" titulo="Vence en 7 días" cargando={isLoading} valor={fmtUsd(r?.porVencer)} />
                    <Indicador icono={cobrar ? IconUsers : IconFileInvoice} color="grape" titulo={cobrar ? 'Clientes con saldo' : 'Proveedores con saldo'} cargando={isLoading} valor={r?.contrapartes ?? 0} detalle={`${r?.documentos ?? 0} documento(s)`} />
                </SimpleGrid>

                <Grid gutter="lg">
                    <Grid.Col span={{ base: 12, lg: 7 }}>
                        <Paper withBorder radius="lg" p="md" h="100%" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
                            <Title order={5} c="navy.9" mb="sm">Antigüedad de la deuda (USD)</Title>
                            {isLoading ? <Skeleton h={240} /> : !r?.total ? <Center h={240}><Text c="dimmed" size="sm">No hay saldos pendientes.</Text></Center> : (
                                <BarChart h={240} data={barras} dataKey="etiqueta" series={[{ name: 'monto', label: 'Monto', color: 'brand.6' }]} valueFormatter={(v) => fmtUsd(v)} tickLine="none" gridAxis="y"
                                    getBarColor={(v) => barras.find((b) => b.monto === v)?.color || 'brand.6'} />
                            )}
                        </Paper>
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, lg: 5 }}>
                        <Paper withBorder radius="lg" p="md" h="100%" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
                            <Title order={5} c="navy.9" mb="sm">{cobrar ? 'Quién más te debe' : 'A quién más le debes'}</Title>
                            {isLoading ? <Skeleton h={240} /> : !dona.length ? <Center h={240}><Text c="dimmed" size="sm">Sin datos.</Text></Center> : (
                                <Group justify="center" wrap="wrap" gap="lg">
                                    <DonutChart data={dona} size={170} thickness={26} withTooltip tooltipDataSource="segment" chartLabel={fmtUsd(r?.total)} valueFormatter={(v) => fmtUsd(v)} />
                                    <Stack gap={6} style={{ minWidth: 0, flex: 1 }}>{dona.map((d) => (
                                        <Group key={d.name} gap={8} wrap="nowrap" justify="space-between">
                                            <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}><Box w={12} h={12} bg={d.color} style={{ borderRadius: 4, flexShrink: 0 }} /><Text size="sm" lineClamp={1}>{d.name}</Text></Group>
                                            <Text size="sm" fw={700} style={{ flexShrink: 0 }}>{fmtUsd(d.value)}</Text>
                                        </Group>
                                    ))}</Stack>
                                </Group>
                            )}
                        </Paper>
                    </Grid.Col>
                </Grid>

                <Paper withBorder radius="lg" p="md" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
                    <Group gap="sm" mb="md" wrap="wrap" align="flex-end">
                        <SegmentedControl color="navy.9" value={filtro} onChange={setFiltro} data={[{ value: 'todas', label: 'Todas' }, { value: 'vencidas', label: 'Vencidas' }, { value: 'por-vencer', label: 'Por vencer' }, { value: 'al-dia', label: 'Al día' }]} />
                        <TextInput flex="1 1 240px" placeholder={cobrar ? 'Buscar cliente, RIF o documento…' : 'Buscar proveedor, RIF o factura…'} leftSection={<IconSearch size={16} />} value={busqueda} onChange={(e) => setBusqueda(e.currentTarget.value)} />
                    </Group>

                    {isLoading ? <Stack gap="xs">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} h={48} />)}</Stack>
                        : !visibles.length ? <Center py={50}><Text c="dimmed">No hay cuentas con esos filtros.</Text></Center> : (
                            <Table.ScrollContainer minWidth={820}>
                                <Table verticalSpacing="sm" highlightOnHover>
                                    <Table.Thead><Table.Tr>
                                        <Table.Th>{cobrar ? 'Cliente' : 'Proveedor'}</Table.Th><Table.Th>Documento</Table.Th><Table.Th>Emisión</Table.Th><Table.Th>Vencimiento</Table.Th>
                                        <Table.Th ta="right">Total</Table.Th><Table.Th ta="right">Saldo</Table.Th><Table.Th />
                                    </Table.Tr></Table.Thead>
                                    <Table.Tbody>
                                        {visibles.map((c) => {
                                            const wa = cobrar ? recordatorio(c) : null;
                                            return (
                                                <Table.Tr key={`${c.origen}-${c.id}`}>
                                                    <Table.Td><Text fw={700} size="sm" lineClamp={1} maw={230}>{c.contraparte.nombre || c.contraparte.identificacion}</Text><Text size="xs" c="dimmed">{c.contraparte.identificacion}</Text></Table.Td>
                                                    <Table.Td><Text size="sm" fw={600}>{c.documento || '—'}</Text>{c.origen === 'pedido' && <Badge size="xs" variant="light" color="gray">Pedido sin pagar</Badge>}</Table.Td>
                                                    <Table.Td><Text size="sm">{fmtFecha(c.emision)}</Text></Table.Td>
                                                    <Table.Td><Text size="sm">{fmtFecha(c.vence)}</Text><Badge size="sm" variant={c.estado === 'vencida' ? 'filled' : 'light'} color={ESTADO[c.estado].color}>{ESTADO[c.estado].etiqueta(c)}</Badge></Table.Td>
                                                    <Table.Td ta="right"><Text size="sm">{fmtUsd(c.total)}</Text></Table.Td>
                                                    <Table.Td ta="right"><Text size="sm" fw={800} c={c.estado === 'vencida' ? 'red.7' : 'navy.9'}>{fmtUsd(c.saldo)}</Text>{tasa && <Text size="xs" c="dimmed">{fmtBs(aBolivares(c.saldo, tasa))}</Text>}</Table.Td>
                                                    <Table.Td>
                                                        <Group gap={4} wrap="nowrap" justify="flex-end">
                                                            {wa && <Tooltip label="Recordar por WhatsApp"><ActionIcon variant="subtle" color="green" component="a" href={wa} target="_blank"><IconBrandWhatsapp size={18} /></ActionIcon></Tooltip>}
                                                            <Tooltip label={cobrar ? 'Ver documento y registrar abono' : 'Ver compras'}>
                                                                <ActionIcon variant="light" color="navy.9" onClick={() => router.push(cobrar ? `/superuser/ventas/${c.docId}` : '/superuser/compras')}><IconArrowRight size={16} /></ActionIcon>
                                                            </Tooltip>
                                                        </Group>
                                                    </Table.Td>
                                                </Table.Tr>
                                            );
                                        })}
                                    </Table.Tbody>
                                </Table>
                            </Table.ScrollContainer>
                        )}

                    <Group justify="space-between" mt="md" wrap="wrap">
                        <Text size="sm" c="dimmed">{filtradas.length} {filtradas.length === 1 ? 'documento' : 'documentos'}</Text>
                        {paginas > 1 && <Pagination total={paginas} value={pagina} onChange={setPagina} color="navy.9" size="sm" />}
                    </Group>
                </Paper>
            </Stack>
        </Box>
    );
}
