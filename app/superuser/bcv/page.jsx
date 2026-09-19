'use client';

import React, { useMemo, useState } from 'react';
import {
    ActionIcon, Badge, Box, Button, Card, Chip, Group, NumberInput, Paper, SegmentedControl, SimpleGrid, Skeleton, Stack, Table, Text, ThemeIcon, Title, Tooltip,
} from '@mantine/core';
import { LineChart, Sparkline } from '@mantine/charts';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import 'dayjs/locale/es';
import { IconArrowDownRight, IconArrowUpRight, IconCalculator, IconCoin, IconCurrencyDollar, IconCurrencyEuro, IconRefresh, IconScale } from '@tabler/icons-react';
import { useAuth } from '@/hooks/useAuth';

dayjs.locale('es');

const bs = (v, d = 2) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: d, maximumFractionDigits: d }).format(Number(v) || 0);
// Fecha corta en español sin depender de dayjs (en desarrollo hay dos copias y la de idioma queda en inglés)
const corta = (f) => new Date(`${String(f).slice(0, 10)}T12:00:00Z`).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', timeZone: 'UTC' });
const pct = (v) => `${v > 0 ? '+' : ''}${bs(v)}%`;

const MONEDAS = {
    usd: { nombre: 'Dólar BCV', corto: 'USD', color: 'brand.6', icono: IconCurrencyDollar, campo: 'monto' },
    eur: { nombre: 'Euro BCV', corto: 'EUR', color: 'orange.6', icono: IconCurrencyEuro, campo: 'montoEur' },
    usdt: { nombre: 'USDT Binance', corto: 'USDT', color: 'teal.6', icono: IconCoin, campo: 'montoUsdt' },
};

async function pedirJson(url) {
    const res = await fetch(url);
    const cuerpo = await res.json().catch(() => null);
    if (!res.ok) throw new Error('No se pudo cargar');
    return cuerpo;
}

// Tarjeta de una tasa: valor actual, cambio contra el registro anterior y minigráfico del rango elegido
function TarjetaTasa({ clave, serie, cargando }) {
    const m = MONEDAS[clave];
    const valores = serie.map((r) => Number(r[m.campo])).filter((v) => v > 0);
    const actual = valores[valores.length - 1];
    const anterior = valores.length > 1 ? valores[valores.length - 2] : actual;
    const cambio = anterior ? ((actual - anterior) / anterior) * 100 : 0;
    const Icono = m.icono;
    const sube = cambio > 0;
    return (
        <Card withBorder radius="lg" p="md" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
            <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Box>
                    <Text size="xs" c="dimmed" fw={700} tt="uppercase">{m.nombre}</Text>
                    {cargando ? <Skeleton h={34} w={130} mt={4} /> : <Text fz={30} fw={900} c="navy.9" lh={1.15}>Bs {bs(actual)}</Text>}
                    {!cargando && (
                        <Group gap={4} mt={2}>
                            {cambio === 0 ? <Text size="sm" c="dimmed">Sin cambio</Text> : <>
                                {sube ? <IconArrowUpRight size={16} color="var(--mantine-color-red-6)" /> : <IconArrowDownRight size={16} color="var(--mantine-color-teal-6)" />}
                                <Text size="sm" fw={700} c={sube ? 'red.7' : 'teal.7'}>{pct(cambio)}</Text>
                            </>}
                            <Text size="xs" c="dimmed">vs registro anterior</Text>
                        </Group>
                    )}
                </Box>
                <ThemeIcon variant="light" color={m.color} size={42} radius="md"><Icono size={22} /></ThemeIcon>
            </Group>
            {!cargando && valores.length > 1 && <Sparkline mt="md" h={44} data={valores} color={m.color} fillOpacity={0.15} curveType="monotone" areaProps={{ isAnimationActive: false }} />}
        </Card>
    );
}

function Calculadora({ ultimo }) {
    const [monto, setMonto] = useState('');
    const [base, setBase] = useState('usd');
    const tasas = { usd: Number(ultimo.monto), eur: Number(ultimo.montoEur), usdt: Number(ultimo.montoUsdt), bs: 1 };
    const cantidad = Number(monto) || 0;
    const enBs = cantidad * tasas[base];
    const resultados = ['bs', 'usd', 'eur', 'usdt'].filter((c) => c !== base && tasas[c] > 0);

    return (
        <Paper withBorder radius="lg" p="md" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
            <Group gap="xs" mb="md"><ThemeIcon variant="light" color="violet"><IconCalculator size={18} /></ThemeIcon><Title order={5} c="navy.9">Calculadora de equivalencias</Title></Group>
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
                <Stack gap="sm">
                    <NumberInput size="lg" placeholder="Monto" value={monto} onChange={setMonto} min={0} thousandSeparator="." decimalSeparator="," decimalScale={2} hideControls
                        styles={{ input: { fontSize: '1.3rem', fontWeight: 700 } }} aria-label="Monto a convertir" />
                    <SegmentedControl fullWidth color="navy.9" value={base} onChange={setBase} data={[{ value: 'usd', label: 'USD' }, { value: 'bs', label: 'Bs' }, { value: 'eur', label: 'EUR' }, { value: 'usdt', label: 'USDT' }]} />
                    <Text size="xs" c="dimmed">Equivale a Bs {bs(enBs)}</Text>
                </Stack>
                <SimpleGrid cols={{ base: 1, xs: 2, md: 1, lg: 2 }} spacing="xs">
                    {resultados.map((c) => (
                        <Paper key={c} withBorder radius="md" p="sm" bg="gray.0">
                            <Text size="xs" c="dimmed" fw={700} tt="uppercase">{c === 'bs' ? 'Bolívares' : MONEDAS[c].nombre}</Text>
                            <Text fw={800} fz="lg" c="navy.9">{c === 'bs' ? 'Bs ' : ''}{bs(enBs / tasas[c])}{c !== 'bs' ? ` ${MONEDAS[c].corto}` : ''}</Text>
                        </Paper>
                    ))}
                </SimpleGrid>
            </SimpleGrid>
        </Paper>
    );
}

export default function BcvDashboard() {
    const queryClient = useQueryClient();
    const { esVendedor } = useAuth();
    const esMovil = useMediaQuery('(max-width: 48em)');
    const [rango, setRango] = useState('30d');
    const [mostrar, setMostrar] = useState(['usd', 'eur', 'usdt']);
    const [actualizando, setActualizando] = useState(false);

    const { data, isLoading } = useQuery({
        queryKey: ['bcv', 'historico'],
        queryFn: async () => { const r = await pedirJson('/api/bcv/obtenerTodos'); return r.success ? r.data : []; },
        refetchOnWindowFocus: true,
    });

    const todos = data || [];
    const serie = useMemo(() => {
        if (rango === 'todos') return todos;
        const dias = { '7d': 7, '30d': 30, '90d': 90 }[rango];
        const limite = dayjs().subtract(dias, 'day').startOf('day');
        return todos.filter((r) => !dayjs(r.fecha).isBefore(limite));
    }, [todos, rango]);

    const ultimo = todos[todos.length - 1];
    const datosGrafico = serie.map((r) => ({ fecha: corta(r.fecha), usd: Number(r.monto) || null, eur: Number(r.montoEur) || null, usdt: Number(r.montoUsdt) || null }));

    // Brecha (spread) del USDT y el euro contra el dólar BCV, y extremos del rango
    const stats = useMemo(() => {
        if (!serie.length) return null;
        const usd = serie.map((r) => Number(r.monto)).filter((v) => v > 0);
        const brechas = serie.filter((r) => r.monto > 0 && r.montoUsdt > 0).map((r) => ((r.montoUsdt - r.monto) / r.monto) * 100);
        const hoy = ultimo && ultimo.monto > 0 && ultimo.montoUsdt > 0 ? ((ultimo.montoUsdt - ultimo.monto) / ultimo.monto) * 100 : 0;
        return {
            max: Math.max(...usd), min: Math.min(...usd),
            variacionRango: usd.length > 1 ? ((usd[usd.length - 1] - usd[0]) / usd[0]) * 100 : 0,
            brechaHoy: hoy, brechaPromedio: brechas.length ? brechas.reduce((a, b) => a + b, 0) / brechas.length : 0,
        };
    }, [serie, ultimo]);

    const actualizar = async () => {
        setActualizando(true);
        try {
            const r = await pedirJson('/api/bcv?force=true');
            await queryClient.invalidateQueries({ queryKey: ['bcv'] });
            notifications.show({ color: 'teal', title: 'Tasas actualizadas', message: `Dólar BCV: Bs ${bs(r.precio)}` });
        } catch {
            notifications.show({ color: 'red', title: 'No se pudo actualizar', message: 'Inténtalo de nuevo en unos minutos.' });
        } finally {
            setActualizando(false);
        }
    };

    const filas = [...todos].reverse().slice(0, 10);

    return (
        <Box maw={1400} mx="auto" px="md" py="md">
            <Stack gap="lg">
                <Group justify="space-between" align="flex-end" wrap="wrap">
                    <Box>
                        <Title order={2} c="white">Monitor cambiario</Title>
                        <Text size="sm" c="gray.4">{ultimo ? `Última tasa: ${new Date(`${String(ultimo.fecha).slice(0, 10)}T12:00:00Z`).toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}` : 'Tasas oficiales y brechas'}</Text>
                    </Box>
                    {!esVendedor && <Button variant="white" color="navy.9" leftSection={<IconRefresh size={16} />} loading={actualizando} onClick={actualizar}>Actualizar ahora</Button>}
                </Group>

                <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
                    {['usd', 'eur', 'usdt'].map((c) => <TarjetaTasa key={c} clave={c} serie={serie} cargando={isLoading} />)}
                </SimpleGrid>

                <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
                    {[
                        { t: 'Brecha USDT hoy', v: stats ? pct(stats.brechaHoy) : '—', d: 'sobre el dólar BCV', i: IconScale, c: 'teal' },
                        { t: 'Brecha promedio', v: stats ? pct(stats.brechaPromedio) : '—', d: 'en el rango elegido', i: IconScale, c: 'grape' },
                        { t: 'Máximo del rango', v: stats ? `Bs ${bs(stats.max)}` : '—', d: 'Dólar BCV', i: IconArrowUpRight, c: 'red' },
                        { t: 'Mínimo del rango', v: stats ? `Bs ${bs(stats.min)}` : '—', d: `Variación ${stats ? pct(stats.variacionRango) : ''}`, i: IconArrowDownRight, c: 'blue' },
                    ].map((k) => (
                        <Card key={k.t} withBorder radius="lg" p="sm" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
                            <Text size="xs" c="dimmed" fw={700} tt="uppercase" lineClamp={1}>{k.t}</Text>
                            {isLoading ? <Skeleton h={24} w={90} mt={4} /> : <Text fz={{ base: 'md', sm: 'xl' }} fw={800} c="navy.9" lh={1.3}>{k.v}</Text>}
                            <Text size="xs" c="dimmed" lineClamp={1}>{k.d}</Text>
                        </Card>
                    ))}
                </SimpleGrid>

                <Paper withBorder radius="lg" p="md" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
                    <Group justify="space-between" mb="sm" wrap="wrap" gap="sm">
                        <Title order={5} c="navy.9">Evolución de las tasas</Title>
                        <SegmentedControl size="xs" color="navy.9" value={rango} onChange={setRango} data={[{ value: '7d', label: '7 días' }, { value: '30d', label: '30 días' }, { value: '90d', label: '90 días' }, { value: 'todos', label: 'Todo' }]} />
                    </Group>
                    <Chip.Group multiple value={mostrar} onChange={(v) => setMostrar(v.length ? v : mostrar)}>
                        <Group gap={6} mb="sm">{Object.entries(MONEDAS).map(([k, m]) => <Chip key={k} value={k} size="xs" variant="light" color={m.color.split('.')[0]}>{m.corto}</Chip>)}</Group>
                    </Chip.Group>
                    {isLoading ? <Skeleton h={300} /> : (
                        <LineChart h={esMovil ? 260 : 340} data={datosGrafico} dataKey="fecha" curveType="monotone" withDots={datosGrafico.length <= 31 && !esMovil} connectNulls
                            series={mostrar.map((k) => ({ name: k, label: MONEDAS[k].corto, color: MONEDAS[k].color }))} strokeWidth={2.5}
                            valueFormatter={(v) => `Bs ${bs(v)}`} yAxisProps={{ domain: ['auto', 'auto'], width: 56, tickFormatter: (v) => bs(v, 0) }} tickLine="none" gridAxis="xy" withLegend />
                    )}
                </Paper>

                {ultimo && <Calculadora ultimo={ultimo} />}

                <Paper withBorder radius="lg" p="md" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
                    <Title order={5} c="navy.9" mb="sm">Últimos registros</Title>
                    <Table.ScrollContainer minWidth={460}>
                        <Table verticalSpacing="xs" highlightOnHover>
                            <Table.Thead><Table.Tr><Table.Th>Fecha</Table.Th><Table.Th ta="right">USD BCV</Table.Th><Table.Th ta="right">EUR BCV</Table.Th><Table.Th ta="right">USDT</Table.Th><Table.Th ta="right">Brecha USDT</Table.Th></Table.Tr></Table.Thead>
                            <Table.Tbody>
                                {isLoading ? <Table.Tr><Table.Td colSpan={5}><Skeleton h={30} /></Table.Td></Table.Tr> : filas.map((r) => {
                                    const brecha = r.monto > 0 && r.montoUsdt > 0 ? ((r.montoUsdt - r.monto) / r.monto) * 100 : null;
                                    return (
                                        <Table.Tr key={r.fecha}>
                                            <Table.Td>{dayjs(r.fecha).format('DD/MM/YYYY')}</Table.Td>
                                            <Table.Td ta="right"><Text fw={700} size="sm">{bs(r.monto)}</Text></Table.Td>
                                            <Table.Td ta="right">{r.montoEur > 0 ? bs(r.montoEur) : '—'}</Table.Td>
                                            <Table.Td ta="right">{r.montoUsdt > 0 ? bs(r.montoUsdt) : '—'}</Table.Td>
                                            <Table.Td ta="right">{brecha === null ? '—' : <Badge variant="light" color="teal">{pct(brecha)}</Badge>}</Table.Td>
                                        </Table.Tr>
                                    );
                                })}
                            </Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>
                </Paper>
            </Stack>
        </Box>
    );
}
