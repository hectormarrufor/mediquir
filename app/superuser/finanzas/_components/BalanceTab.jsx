'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Card, Center, Grid, Group, Paper, SegmentedControl, SimpleGrid, Skeleton, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { LineChart, BarChart, DonutChart } from '@mantine/charts';
import { DatePickerInput } from '@mantine/dates';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { IconAlertTriangle, IconArrowDownRight, IconArrowUpRight, IconBuildingWarehouse, IconPercentage, IconReceiptTax, IconScale, IconUsers, IconWallet } from '@tabler/icons-react';
import { aBolivares } from '@/app/constants/facturacion';
import { useTasaBcv } from '@/hooks/useTasaBcv';

const usd = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUsd = (v) => `${Number(v) < 0 ? '-' : ''}$${usd.format(Math.abs(Number(v) || 0))}`;
const fmtBs = (v) => `Bs ${new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0)}`;
const COLORES = ['brand.6', 'accent.6', 'teal.6', 'grape.6', 'yellow.6', 'cyan.6', 'orange.6', 'pink.6'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function rangoDe(p) {
    const hoy = dayjs();
    if (p === 'MES') return [hoy.startOf('month').toDate(), hoy.endOf('month').toDate()];
    if (p === 'MES_ANT') { const m = hoy.subtract(1, 'month'); return [m.startOf('month').toDate(), m.endOf('month').toDate()]; }
    return [hoy.startOf('year').toDate(), hoy.endOf('year').toDate()];
}

async function pedirJson(url) {
    const res = await fetch(url);
    const cuerpo = await res.json().catch(() => null);
    if (!res.ok) throw new Error(cuerpo?.error || 'No se pudo cargar');
    return cuerpo;
}

function Indicador({ icono: Icono, color, titulo, valor, detalle, colorValor, cargando }) {
    return (
        <Card withBorder radius="lg" p="md" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
            <Group wrap="nowrap" align="flex-start">
                <ThemeIcon size={44} radius="md" variant="light" color={color}><Icono size={24} /></ThemeIcon>
                <Box style={{ minWidth: 0 }}>
                    <Text size="xs" c="dimmed" fw={700} tt="uppercase">{titulo}</Text>
                    {cargando ? <Skeleton h={28} w={110} mt={4} /> : <Text fz={24} fw={800} lh={1.2} c={colorValor || 'navy.9'}>{valor}</Text>}
                    {detalle && !cargando && <Text size="xs" c="dimmed">{detalle}</Text>}
                </Box>
            </Group>
        </Card>
    );
}

function Tarjeta({ titulo, children, cargando, vacio }) {
    return (
        <Paper withBorder radius="lg" p="md" h="100%" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
            <Title order={5} c="navy.9" mb="sm">{titulo}</Title>
            {cargando ? <Skeleton h={230} /> : vacio ? <Center h={230}><Text size="sm" c="dimmed">Sin datos en este periodo.</Text></Center> : children}
        </Paper>
    );
}

function Dona({ filas }) {
    const datos = filas.slice(0, 8).map((f, i) => ({ name: f.nombre || f.metodo, value: Number(f.monto.toFixed(2)), color: COLORES[i % COLORES.length] }));
    const total = datos.reduce((a, d) => a + d.value, 0);
    return (
        <Group justify="center" wrap="wrap" gap="lg">
            <DonutChart data={datos} size={160} thickness={24} withTooltip tooltipDataSource="segment" chartLabel={fmtUsd(total)} valueFormatter={(v) => fmtUsd(v)} />
            <Stack gap={5} style={{ flex: 1, minWidth: 140 }}>
                {datos.map((d) => (
                    <Group key={d.name} gap={8} wrap="nowrap" justify="space-between">
                        <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}><Box w={11} h={11} bg={d.color} style={{ borderRadius: 3, flexShrink: 0 }} /><Text size="xs" lineClamp={1}>{d.name}</Text></Group>
                        <Text size="xs" fw={700} style={{ flexShrink: 0 }}>{fmtUsd(d.value)}</Text>
                    </Group>
                ))}
            </Stack>
        </Group>
    );
}

// Balance del periodo: resultado (ingresos - gastos), posición actual, IVA y gráficos
export default function BalanceTab() {
    const { tasa } = useTasaBcv();
    const [periodo, setPeriodo] = useState('MES');
    const [rango, setRango] = useState(rangoDe('MES'));
    useEffect(() => { if (periodo !== 'RANGO') setRango(rangoDe(periodo)); }, [periodo]);

    const [d1, d2] = rango;
    const listo = Boolean(d1 && d2);
    const desde = listo ? dayjs(d1).format('YYYY-MM-DD') : null;
    const hasta = listo ? dayjs(d2).format('YYYY-MM-DD') : null;
    const { data, isLoading, error } = useQuery({ queryKey: ['balance', desde, hasta], enabled: listo, queryFn: () => pedirJson(`/api/finanzas/balance?desde=${desde}&hasta=${hasta}`) });

    const serieDia = useMemo(() => {
        if (!listo) return [];
        const porDia = new Map((data?.porDia || []).map((d) => [d.dia, d]));
        const n = Math.min(dayjs(d2).diff(dayjs(d1), 'day') + 1, 92);
        return Array.from({ length: n }, (_, i) => {
            const dia = dayjs(d1).add(i, 'day'); const d = porDia.get(dia.format('YYYY-MM-DD'));
            return { dia: dia.format('DD/MM'), Ingresos: Number((d?.ingresos || 0).toFixed(2)), Gastos: Number((d?.gastos || 0).toFixed(2)) };
        });
    }, [data, d1, d2, listo]);
    const serieMes = (data?.mensual || []).map((m) => ({ mes: `${MESES[Number(m.mes.slice(5, 7)) - 1]} ${m.mes.slice(2, 4)}`, Ingresos: Number(m.ingresos.toFixed(2)), Gastos: Number(m.gastos.toFixed(2)) }));

    const k = data?.kpi; const p = data?.posicion; const iva = data?.iva;
    const positivo = (k?.utilidad || 0) >= 0;

    return (
        <Stack gap="lg">
            <Group gap="sm" wrap="wrap">
                <SegmentedControl color="navy.9" value={periodo} onChange={setPeriodo} data={[{ value: 'MES', label: 'Este mes' }, { value: 'MES_ANT', label: 'Mes pasado' }, { value: 'ANIO', label: 'Este año' }, { value: 'RANGO', label: 'Rango' }]} />
                {periodo === 'RANGO' && <DatePickerInput type="range" valueFormat="DD/MM/YYYY" value={rango} onChange={setRango} placeholder="Elige el rango" maxDate={new Date()} clearable w={{ base: '100%', sm: 280 }} />}
            </Group>

            {error && <Alert color="red" icon={<IconAlertTriangle size={18} />}>{error.message}</Alert>}

            <SimpleGrid cols={{ base: 1, xs: 2, lg: 4 }} spacing="md">
                <Indicador icono={IconArrowUpRight} color="teal" titulo="Ingresos" cargando={isLoading} valor={fmtUsd(k?.ingresos)} detalle={tasa ? fmtBs(aBolivares(k?.ingresos || 0, tasa)) : 'Cobros del periodo, sin IVA'} />
                <Indicador icono={IconArrowDownRight} color="red" titulo="Gastos" cargando={isLoading} valor={fmtUsd(k?.gastos)} detalle={tasa ? fmtBs(aBolivares(k?.gastos || 0, tasa)) : undefined} />
                <Indicador icono={IconScale} color={positivo ? 'teal' : 'red'} titulo="Utilidad del periodo" cargando={isLoading} valor={fmtUsd(k?.utilidad)} colorValor={positivo ? 'teal.7' : 'red.7'} detalle="Ingresos - gastos" />
                <Indicador icono={IconPercentage} color="grape" titulo="Margen" cargando={isLoading} valor={`${k?.margen ?? 0}%`} detalle={`${k?.movimientos ?? 0} movimientos`} />
            </SimpleGrid>

            <SimpleGrid cols={{ base: 1, xs: 2, lg: 4 }} spacing="md">
                <Indicador icono={IconBuildingWarehouse} color="blue" titulo="Inventario a costo" cargando={isLoading} valor={fmtUsd(p?.inventario)} detalle="Existencia x costo" />
                <Indicador icono={IconUsers} color="orange" titulo="Por cobrar" cargando={isLoading} valor={fmtUsd(p?.porCobrar)} detalle="Lo que te deben hoy" />
                <Indicador icono={IconWallet} color="red" titulo="Por pagar" cargando={isLoading} valor={fmtUsd(p?.porPagar)} detalle="Lo que debes hoy" />
                <Indicador icono={IconReceiptTax} color="cyan" titulo="IVA del periodo" cargando={isLoading} valor={fmtUsd(Math.abs(iva?.aPagar || 0))} detalle={`${(iva?.aPagar || 0) >= 0 ? 'Por pagar' : 'A favor'} · débito ${fmtUsd(iva?.debito)} / crédito ${fmtUsd(iva?.credito)}`} />
            </SimpleGrid>

            <Grid gutter="lg">
                <Grid.Col span={{ base: 12, lg: 7 }}>
                    <Tarjeta titulo="Ingresos y gastos por día (USD)" cargando={isLoading}>
                        <LineChart h={240} data={serieDia} dataKey="dia" series={[{ name: 'Ingresos', color: 'teal.6' }, { name: 'Gastos', color: 'red.6' }]} curveType="monotone" withLegend valueFormatter={(v) => fmtUsd(v)} tickLine="none" />
                    </Tarjeta>
                </Grid.Col>
                <Grid.Col span={{ base: 12, lg: 5 }}>
                    <Tarjeta titulo="Últimos 12 meses (USD)" cargando={isLoading} vacio={!serieMes.length}>
                        <BarChart h={240} data={serieMes} dataKey="mes" series={[{ name: 'Ingresos', color: 'teal.6' }, { name: 'Gastos', color: 'red.6' }]} withLegend valueFormatter={(v) => fmtUsd(v)} tickLine="none" />
                    </Tarjeta>
                </Grid.Col>
                <Grid.Col span={{ base: 12, md: 6 }}>
                    <Tarjeta titulo="Gastos por categoría" cargando={isLoading} vacio={!data?.gastosPorCategoria?.length}><Dona filas={data?.gastosPorCategoria || []} /></Tarjeta>
                </Grid.Col>
                <Grid.Col span={{ base: 12, md: 6 }}>
                    <Tarjeta titulo="Ingresos por método de pago" cargando={isLoading} vacio={!data?.porMetodo?.length}><Dona filas={data?.porMetodo || []} /></Tarjeta>
                </Grid.Col>
            </Grid>

            <Text size="xs" c="gray.5">Ingresos = cobros registrados en caja sin el IVA recaudado (que no es de la empresa). Los gastos incluyen el IVA pagado en las compras. La posición actual no depende del periodo elegido; el inventario se valora al costo registrado.</Text>
        </Stack>
    );
}
