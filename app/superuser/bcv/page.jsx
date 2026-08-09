'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Paper, Title, Group, Text, SimpleGrid, 
  LoadingOverlay, SegmentedControl, Stack, ThemeIcon, Badge, Tooltip,
  Button, NumberInput, Card, Center, Box, rem
} from '@mantine/core';
import { LineChart } from '@mantine/charts';
import {
  IconCurrencyDollar, IconCurrencyEuro, IconCoin,
  IconArrowUpRight, IconArrowDownRight, IconScale, IconChartBar,
  IconCalculator, IconEqual
} from '@tabler/icons-react';
import '@mantine/charts/styles.css';
import dayjs from 'dayjs';
import 'dayjs/locale/es';
dayjs.locale('es');

// --- SUB-COMPONENTE: CALCULADORA DE TASAS ---
const CalculadoraDeTasas = ({ stats }) => {
    const [monto, setMonto] = useState(undefined);
    const [monedaBase, setMonedaBase] = useState('usd'); // 'usd', 'eur', 'usdt', 'bs'

    if (!stats) return null;

    // 1. Mapa de Tasas
    const tasas = {
        usd: stats.usd.monto,
        eur: stats.eur.monto,
        usdt: stats.usdt.monto,
        bs: 1
    };

    // 2. Calcular pivote en Bs
    const totalEnBolivares = monto * tasas[monedaBase];

    // 3. Helper para icono dinámico en el Input
    const getCurrencyIcon = () => {
        switch (monedaBase) {
            case 'usd': return <IconCurrencyDollar style={{ width: rem(18), height: rem(18) }} />;
            case 'eur': return <IconCurrencyEuro style={{ width: rem(18), height: rem(18) }} />;
            case 'usdt': return <IconCoin style={{ width: rem(18), height: rem(18) }} />;
            default: return <Text size="xs" fw={700}>Bs</Text>;
        }
    };

    // 4. Renderizar tarjeta de resultado
    const ResultadoCard = ({ codigo, icono: Icono, color, label }) => {
        if (codigo === monedaBase) return null; 

        const valorConvertido = totalEnBolivares / tasas[codigo];
        
        let porcentajeDif = 0;
        let mostrarPorcentaje = false;

        if (monedaBase !== 'bs' && codigo !== 'bs') {
            mostrarPorcentaje = true;
            porcentajeDif = ((valorConvertido - monto) / monto) * 100;
        }

        return (
            <Card padding="sm" radius="md" withBorder style={{ backgroundColor: 'rgba(255,255,255,0.6)' }}>
                <Group justify="space-between" wrap="nowrap">
                    <Group gap="xs">
                        <ThemeIcon color={color} variant="light" size="md" radius="xl">
                            <Icono size={16} />
                        </ThemeIcon>
                        <div>
                            <Text size="xs" c="dimmed" fw={700} tt="uppercase">{label}</Text>
                            <Text fw={700} size="lg" style={{ lineHeight: 1.2 }}>
                                {codigo === 'bs' ? 'Bs. ' : ''}
                                {(valorConvertido || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                {codigo !== 'bs' ? ` ${codigo.toUpperCase()}` : ''}
                            </Text>
                        </div>
                    </Group>

                    {mostrarPorcentaje && (
                        <Badge 
                            color={porcentajeDif < 0 ? 'teal' : 'red'} 
                            variant="light" 
                            size="sm"
                        >
                            {porcentajeDif > 0 ? '+' : ''}{isNaN(porcentajeDif.toFixed(1)) ? 0 : porcentajeDif.toFixed(1)}%
                        </Badge>
                    )}
                </Group>
            </Card>
        );
    };

    return (
        <Paper withBorder p="md" radius="md" mt="md" bg="gray.0">
            <Group mb="md" gap="xs">
                <ThemeIcon color="violet" variant="light"><IconCalculator size={18} /></ThemeIcon>
                <Title order={5}>Calculadora de Equivalencias</Title>
            </Group>
            
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg" mb="md">
                {/* INPUTS Y SELECCIÓN DE MONEDA */}
                <Paper p="md" radius="md" withBorder bg="white">
                    <Stack gap="md">
                        <Group justify="space-between">
                             <Text size="sm" fw={700} c="dimmed" tt="uppercase">Tengo / Me cobran:</Text>
                             <Text size="xs" c="dimmed">
                                Base: <Text span fw={700} c="dark">Bs. {isNaN(totalEnBolivares) ? '0.00' : totalEnBolivares.toLocaleString('es-VE', { maximumFractionDigits: 2 })}</Text>
                             </Text>
                        </Group>
                       
                        {/* 1. INPUT NUMÉRICO */}
                        <NumberInput
                            value={monto}
                            onChange={(val) => setMonto(val || undefined)}
                            min={0}
                            thousandSeparator="."
                            decimalSeparator=","
                            hideControls
                            size="lg"
                            radius="md"
                            placeholder="0.00"
                            leftSection={getCurrencyIcon()} // Icono cambia según selección
                            styles={{ input: { fontSize: '1.2rem', fontWeight: 600 } }}
                        />

                        {/* 2. BUTTON GROUP (Segmented Control) */}
                        <SegmentedControl
                            value={monedaBase}
                            onChange={setMonedaBase}
                            fullWidth
                            size="md"
                            radius="md"
                            color="blue"
                            transitionDuration={200}
                            data={[
                                { 
                                    value: 'usd', 
                                    label: (
                                        <Center>
                                            <IconCurrencyDollar style={{ width: rem(16), height: rem(16) }} />
                                            <Box ml={5}>USD</Box>
                                        </Center>
                                    ) 
                                },
                                { 
                                    value: 'bs', 
                                    label: (
                                        <Center>
                                            <Text span fw={700} size="xs" style={{ lineHeight: 1 }}>Bs</Text>
                                            <Box ml={5}>Bolívar</Box>
                                        </Center>
                                    ) 
                                },
                                { 
                                    value: 'eur', 
                                    label: (
                                        <Center>
                                            <IconCurrencyEuro style={{ width: rem(16), height: rem(16) }} />
                                            <Box ml={5}>EUR</Box>
                                        </Center>
                                    ) 
                                },
                                { 
                                    value: 'usdt', 
                                    label: (
                                        <Center>
                                            <IconCoin style={{ width: rem(16), height: rem(16) }} />
                                            <Box ml={5}>USDT</Box>
                                        </Center>
                                    ) 
                                },
                            ]}
                        />
                    </Stack>
                </Paper>

                {/* OUTPUTS (Resultados) */}
                <Stack gap="xs">
                    <Text size="sm" fw={700} c="dimmed" tt="uppercase">Equivale a:</Text>
                    <SimpleGrid cols={{ base: 1, sm: 2 }}>
                        <ResultadoCard codigo="usdt" icono={IconCoin} color="teal" label="Binance (USDT)" />
                        <ResultadoCard codigo="usd" icono={IconCurrencyDollar} color="blue" label="Dólar BCV" />
                        <ResultadoCard codigo="eur" icono={IconCurrencyEuro} color="orange" label="Euro BCV" />
                        <ResultadoCard codigo="bs" icono={IconChartBar} color="gray" label="Bolívares" />
                    </SimpleGrid>
                </Stack>
            </SimpleGrid>
        </Paper>
    );
};
// --- FIN SUB-COMPONENTE ---

export default function BcvDashboard() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rango, setRango] = useState('30d');
  const [mounted, setMounted] = useState(false);

  // 1. Cargar Datos
  useEffect(() => {
    setMounted(true);
    const fetchBcv = async () => {
      try {
        const res = await fetch('/api/bcv/obtenerTodos');
        const result = await res.json();
        if (result.success) setData(result.data);
      } catch (error) {
        console.error("Error cargando BCV:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchBcv();
  }, []);

  // 2. Filtrar Datos según el Rango
  const chartData = useMemo(() => {
    if (rango === 'todos') return data;
    const dias = rango === '7d' ? 7 : 30;
    const fechaLimite = new Date();
    fechaLimite.setDate(fechaLimite.getDate() - dias);
    return data.filter(item => new Date(item.fecha) >= fechaLimite);
  }, [data, rango]);

  // 3. Calcular Estadísticas y Spreads
  const stats = useMemo(() => {
    if (data.length === 0) return null;

    const actual = data[data.length - 1];
    const anterior = data.length > 1 ? data[data.length - 2] : actual;
    const varUsd = ((actual.monto - anterior.monto) / anterior.monto) * 100;

    const calcSpread = (target, base) => {
        if (!base || !target) return 0;
        return ((target - base) / base) * 100;
    };

    const spreadEurHoy = calcSpread(actual.montoEur, actual.monto);
    const spreadUsdtHoy = calcSpread(actual.montoUsdt, actual.monto);

    let sumaSpreadEur = 0;
    let sumaSpreadUsdt = 0;
    let countEur = 0;
    let countUsdt = 0;

    chartData.forEach(item => {
        if (item.monto > 0) {
            if (item.montoEur > 0) {
                sumaSpreadEur += calcSpread(item.montoEur, item.monto);
                countEur++;
            }
            if (item.montoUsdt > 0) {
                sumaSpreadUsdt += calcSpread(item.montoUsdt, item.monto);
                countUsdt++;
            }
        }
    });

    return {
      fecha: actual.fecha,
      usd: {
        monto: actual.monto,
        variacion: Math.abs(varUsd).toFixed(2),
        subio: varUsd >= 0
      },
      eur: {
        monto: actual.montoEur,
        spreadHoy: spreadEurHoy.toFixed(2),
        spreadPromedio: countEur > 0 ? (sumaSpreadEur / countEur).toFixed(2) : 0
      },
      usdt: {
        monto: actual.montoUsdt,
        spreadHoy: spreadUsdtHoy.toFixed(2),
        spreadPromedio: countUsdt > 0 ? (sumaSpreadUsdt / countUsdt).toFixed(2) : 0
      }
    };
  }, [data, chartData]);

  // Componente de Tarjeta KPI
  const CurrencyCard = ({ title, amount, mainMetric, secondaryMetric, isBaseCurrency, icon: Icon, color }) => (
    <Paper withBorder p="md" radius="md" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div>
        <Group justify="space-between" align="flex-start" mb="xs">
          <div>
            <Text c="dimmed" size="xs" tt="uppercase" fw={700}>{title}</Text>
            <Text fw={700} size="xl" style={{ lineHeight: 1 }}>Bs. {amount?.toFixed(2)}</Text>
          </div>
          <ThemeIcon variant="light" color={color} size="lg" radius="md">
            <Icon size="1.2rem" />
          </ThemeIcon>
        </Group>
      </div>
      
      <Stack gap="xs" mt="sm">
        <Group gap={5} align="center">
            {isBaseCurrency ? (
                <>
                    {mainMetric.subio ? <IconArrowUpRight size={16} color="red" /> : <IconArrowDownRight size={16} color="green" />}
                    <Text size="sm" c={mainMetric.subio ? 'red' : 'green'} fw={600}>
                        {mainMetric.val}%
                    </Text>
                    <Text size="xs" c="dimmed">vs ayer</Text>
                </>
            ) : (
                <Tooltip label="Porcentaje por encima del Dólar BCV hoy">
                    <Group gap={4} style={{ cursor: 'help' }}>
                        <IconScale size={16} color="gray" />
                        <Text size="sm" fw={600} c="dark.3">
                            Spread: <Text span c={color} fw={700}>+{mainMetric}%</Text>
                        </Text>
                    </Group>
                </Tooltip>
            )}
        </Group>

        {!isBaseCurrency && (
             <Badge variant="light" color="gray" size="sm" leftSection={<IconChartBar size={10}/>} fullWidth>
                Promedio {rango === 'todos' ? 'Hist.' : rango}: +{secondaryMetric}%
             </Badge>
        )}
      </Stack>
    </Paper>
  );

  if (!mounted) return <LoadingOverlay visible />;

  return (
    <Paper p="md" radius="md">
      <Stack gap="lg">
        {/* HEADER */}
        <Group justify="space-between" wrap="wrap">
          <div>
            <Title order={2}>Monitor Cambiario</Title>
            <Text c="dimmed" size="sm">Análisis de brechas y equivalencias</Text>
          </div>
          <Group>
            <Button variant="outline" onClick={() => {
                fetch("/api/bcv?force=true").then(() => {
                setLoading(true);
                fetch('/api/bcv/obtenerTodos').then(res => res.json()).then(result => {
                    if (result.success) setData(result.data);
                    setLoading(false);
                });
                });
            }}>
                Actualizar
            </Button>
            <SegmentedControl
                value={rango}
                onChange={setRango}
                data={[
                { label: '7 Días', value: '7d' },
                { label: '30 Días', value: '30d' },
                { label: 'Histórico', value: 'todos' }
                ]}
            />
          </Group>
        </Group>

        <LoadingOverlay visible={loading} />

        {/* KPI CARDS */}
        {stats && (
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <CurrencyCard 
              title="Dólar BCV (Base)" amount={stats.usd.monto} isBaseCurrency={true}
              mainMetric={{ val: stats.usd.variacion, subio: stats.usd.subio }}
              icon={IconCurrencyDollar} color="blue"
            />
            <CurrencyCard 
              title="Euro BCV" amount={stats.eur.monto} isBaseCurrency={false}
              mainMetric={stats.eur.spreadHoy} secondaryMetric={stats.eur.spreadPromedio}
              icon={IconCurrencyEuro} color="orange"
            />
            <CurrencyCard 
              title="USDT (Binance)" amount={stats.usdt.monto} isBaseCurrency={false}
              mainMetric={stats.usdt.spreadHoy} secondaryMetric={stats.usdt.spreadPromedio}
              icon={IconCoin} color="teal"
            />
          </SimpleGrid>
        )}

        {/* CALCULADORA (ACTUALIZADA) */}
        {stats && <CalculadoraDeTasas stats={stats} />}

        {/* GRÁFICO */}
        <Paper withBorder p="md" radius="md">
          <Group justify="space-between" mb="md">
             <Title order={4}>Evolución de Tasas</Title>
             <Badge variant="outline" color="gray">{chartData.length} registros</Badge>
          </Group>

          <LineChart
            h={350}
            data={chartData}
            dataKey="fecha"
            series={[
              { name: 'monto', label: 'USD BCV', color: 'blue.6' },
              { name: 'montoEur', label: 'EUR BCV', color: 'orange.6' },
              { name: 'montoUsdt', label: 'USDT Binance', color: 'teal.6' }
            ]}
            tickLine="xy"
            gridAxis="xy"
            xAxisProps={{
              tickFormatter: (value) => dayjs(value).format('DD MMM'), 
            }}
            yAxisProps={{ 
                domain: ['auto', 'auto'],
                tickFormatter: (value) => `${value}`
            }}
            valueFormatter={(val) => `Bs. ${val.toFixed(2)}`}
            dotProps={{ r: 3, strokeWidth: 1 }}
            activeDotProps={{ r: 5, strokeWidth: 1 }}
            tooltipAnimationDuration={200}
            strokeWidth={3}
            lineProps={{
                label: { 
                  fill: '#495057', 
                  fontSize: 12,
                  fontWeight: 700,
                  position: 'top',
                  offset: 10,
                  formatter: (val) => val.toFixed(0) 
                } 
            }}
            withPointLabels
            legendProps={{ verticalAlign: 'bottom', height: 50 }}
            curveType="monotone"
            withLegend
            withTooltip
          />
        </Paper>
      </Stack>
    </Paper>
  );
}