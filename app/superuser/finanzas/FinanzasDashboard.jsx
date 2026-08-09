'use client';

import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { 
    Box, Button, Group, Title, Text, Paper, Grid, Badge, 
    ActionIcon, Loader, Center, Tabs, Modal, Select, 
    TextInput, NumberInput, Textarea, Stack, Card 
} from '@mantine/core';
import { DonutChart } from '@mantine/charts';
import { MantineReactTable, useMantineReactTable } from 'mantine-react-table';
import { notifications } from '@mantine/notifications';
import { 
    IconPlus, IconTrendingUp, IconTrendingDown, IconScale, 
    IconListDetails, IconChartPie 
} from '@tabler/icons-react';
import dayjs from 'dayjs';

// Paleta de colores atractiva para los gráficos
const CHART_COLORS = [
    'blue.6', 'teal.6', 'yellow.6', 'orange.6', 
    'red.6', 'pink.6', 'grape.6', 'violet.6', 'cyan.6'
];

export default function FinanzasDashboard() {
    const queryClient = useQueryClient();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);

    // 1. Fetch de Movimientos y Categorías
    const { data: movimientos = [], isLoading } = useQuery({
        queryKey: ['movimientos'],
        queryFn: async () => (await fetch('/api/finanzas/movimientos')).json()
    });

    const { data: categorias = [] } = useQuery({
        queryKey: ['categoriasFinancieras'],
        queryFn: async () => (await fetch('/api/finanzas/categorias')).json()
    });

    // 2. Cálculos Financieros y Preparación de Gráficos
    const { 
        totalIngresos, totalGastos, balanceNeto, 
        datosGraficoIngresos, datosGraficoGastos 
    } = useMemo(() => {
        let _ingresos = 0;
        let _gastos = 0;
        const mapaIngresos = {};
        const mapaGastos = {};

        movimientos.forEach(m => {
            const monto = Number(m.montoUsd);
            const catNombre = m.categoria?.nombre || 'Sin Categoría';

            if (m.tipo === 'INGRESO') {
                _ingresos += monto;
                mapaIngresos[catNombre] = (mapaIngresos[catNombre] || 0) + monto;
            } else {
                _gastos += monto;
                mapaGastos[catNombre] = (mapaGastos[catNombre] || 0) + monto;
            }
        });

        // Formatear para Mantine Charts: [{ name: 'Nomina', value: 500, color: 'blue.6' }]
        const _datosGraficoIngresos = Object.entries(mapaIngresos).map(([name, value], i) => ({
            name, value, color: CHART_COLORS[i % CHART_COLORS.length]
        }));

        const _datosGraficoGastos = Object.entries(mapaGastos).map(([name, value], i) => ({
            name, value, color: CHART_COLORS[(i + 4) % CHART_COLORS.length] // Desfase para usar otros colores
        }));

        return {
            totalIngresos: _ingresos,
            totalGastos: _gastos,
            balanceNeto: _ingresos - _gastos,
            datosGraficoIngresos: _datosGraficoIngresos,
            datosGraficoGastos: _datosGraficoGastos
        };
    }, [movimientos]);

    // 3. Configuración del Formulario para Movimiento Manual
    const form = useForm({
        initialValues: {
            tipo: 'GASTO',
            fecha: dayjs().format('YYYY-MM-DD'),
            montoUsd: 0,
            metodoPago: 'Transferencia',
            referencia: '',
            descripcion: '',
            categoriaId: ''
        },
        validate: {
            montoUsd: (val) => (val <= 0 ? 'Monto debe ser mayor a 0' : null),
            categoriaId: (val) => (!val ? 'Seleccione una categoría' : null),
        }
    });

    // Filtrar categorías dinámicamente según el tipo seleccionado en el formulario
    const categoriasOptions = categorias
        .filter(c => c.tipo === form.values.tipo)
        .map(c => ({ value: c.id.toString(), label: c.nombre }));

    const handleRegistrarMovimiento = async (values) => {
        setIsSubmitting(true);
        try {
            const res = await fetch('/api/finanzas/movimientos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(values)
            });
            const data = await res.json();
            
            if (!res.ok) throw new Error(data.error || 'Error al registrar');

            notifications.show({ title: 'Éxito', message: 'Movimiento registrado', color: 'green' });
            queryClient.invalidateQueries({ queryKey: ['movimientos'] });
            closeModal();
            form.reset();
        } catch (error) {
            notifications.show({ title: 'Error', message: error.message, color: 'red' });
        } finally {
            setIsSubmitting(false);
        }
    };

    // 4. Configuración de la Tabla (Libro Mayor)
    const columns = useMemo(() => [
        { 
            accessorKey: 'fecha', header: 'Fecha', size: 120,
            Cell: ({ cell }) => dayjs(cell.getValue()).format('DD/MM/YYYY')
        },
        { 
            accessorKey: 'tipo', header: 'Tipo', size: 100,
            Cell: ({ cell }) => (
                <Badge color={cell.getValue() === 'INGRESO' ? 'green' : 'red'} variant="light">
                    {cell.getValue()}
                </Badge>
            )
        },
        { accessorKey: 'categoria.nombre', header: 'Categoría', size: 150 },
        { 
            accessorKey: 'descripcion', header: 'Descripción', size: 250,
            Cell: ({ cell }) => <Text size="sm" lineClamp={2}>{cell.getValue()}</Text>
        },
        { 
            accessorKey: 'montoUsd', header: 'Monto ($)', size: 120,
            Cell: ({ row }) => (
                <Text fw={700} c={row.original.tipo === 'INGRESO' ? 'green.7' : 'red.7'}>
                    {row.original.tipo === 'INGRESO' ? '+' : '-'}${Number(row.original.montoUsd).toFixed(2)}
                </Text>
            )
        },
    ], []);

    const table = useMantineReactTable({
        columns,
        data: movimientos,
        state: { isLoading },
        enableRowActions: false,
        initialState: { pagination: { pageSize: 15 }, sorting: [{ id: 'fecha', desc: true }] },
        mantineTableHeadCellProps: { style: { backgroundColor: "lightblue" } },
    });

    if (isLoading) return <Center h="50vh"><Loader size="xl" /></Center>;

    return (
        <Box p="md">
            <Group justify="space-between" mb="xl">
                <Title order={3} c="gray.7">Visión General</Title>
                <Button color="blue.9" leftSection={<IconPlus size={16} />} onClick={openModal}>
                    Registrar Movimiento Manual
                </Button>
            </Group>

            <Tabs defaultValue="dashboard" variant="outline" radius="md">
                <Tabs.List bg="white">
                    <Tabs.Tab value="dashboard" leftSection={<IconChartPie size={16} />}>Gráficos y Resumen</Tabs.Tab>
                    <Tabs.Tab value="libro" leftSection={<IconListDetails size={16} />}>Libro Mayor (Detalle)</Tabs.Tab>
                </Tabs.List>

                {/* TAB 1: DASHBOARD Y GRÁFICOS */}
                <Tabs.Panel value="dashboard" pt="xl">
                    {/* Tarjetas Superiores */}
                    <Grid mb="xl" gutter="md">
                        <Grid.Col span={{ base: 12, md: 4 }}>
                            <Card withBorder radius="md" p="xl" bg="green.0">
                                <Group justify="space-between" mb="sm">
                                    <Text size="sm" tt="uppercase" fw={700} c="green.9">Total Ingresos</Text>
                                    <IconTrendingUp color="#2b8a3e" size={24} />
                                </Group>
                                <Text size="h1" fw={900} c="green.9">${totalIngresos.toFixed(2)}</Text>
                            </Card>
                        </Grid.Col>
                        
                        <Grid.Col span={{ base: 12, md: 4 }}>
                            <Card withBorder radius="md" p="xl" bg="red.0">
                                <Group justify="space-between" mb="sm">
                                    <Text size="sm" tt="uppercase" fw={700} c="red.9">Total Egresos</Text>
                                    <IconTrendingDown color="#e03131" size={24} />
                                </Group>
                                <Text size="h1" fw={900} c="red.9">${totalGastos.toFixed(2)}</Text>
                            </Card>
                        </Grid.Col>

                        <Grid.Col span={{ base: 12, md: 4 }}>
                            <Card withBorder radius="md" p="xl" bg={balanceNeto >= 0 ? 'blue.0' : 'orange.0'}>
                                <Group justify="space-between" mb="sm">
                                    <Text size="sm" tt="uppercase" fw={700} c={balanceNeto >= 0 ? 'blue.9' : 'orange.9'}>Balance Neto</Text>
                                    <IconScale color={balanceNeto >= 0 ? '#1864ab' : '#d9480f'} size={24} />
                                </Group>
                                <Text size="h1" fw={900} c={balanceNeto >= 0 ? 'blue.9' : 'orange.9'}>
                                    ${balanceNeto.toFixed(2)}
                                </Text>
                            </Card>
                        </Grid.Col>
                    </Grid>

                    {/* Gráficos de Torta (DonutCharts) */}
                    <Grid gutter="xl">
                        <Grid.Col span={{ base: 12, md: 6 }}>
                            <Paper withBorder p="xl" radius="md" ta="center">
                                <Title order={4} mb="xl" c="green.9">Distribución de Ingresos</Title>
                                {datosGraficoIngresos.length > 0 ? (
                                    <Group justify="center">
                                        <DonutChart 
                                            data={datosGraficoIngresos} 
                                            size={220} 
                                            thickness={30} 
                                            withTooltip
                                            tooltipDataSource="segment"
                                        />
                                    </Group>
                                ) : (
                                    <Text c="dimmed" py="xl">No hay ingresos registrados aún.</Text>
                                )}
                            </Paper>
                        </Grid.Col>
                        
                        <Grid.Col span={{ base: 12, md: 6 }}>
                            <Paper withBorder p="xl" radius="md" ta="center">
                                <Title order={4} mb="xl" c="red.9">Distribución de Egresos</Title>
                                {datosGraficoGastos.length > 0 ? (
                                    <Group justify="center">
                                        <DonutChart 
                                            data={datosGraficoGastos} 
                                            size={220} 
                                            thickness={30} 
                                            withTooltip
                                            tooltipDataSource="segment"
                                        />
                                    </Group>
                                ) : (
                                    <Text c="dimmed" py="xl">No hay gastos registrados aún.</Text>
                                )}
                            </Paper>
                        </Grid.Col>
                    </Grid>
                </Tabs.Panel>

                {/* TAB 2: LIBRO MAYOR (TABLA) */}
                <Tabs.Panel value="libro" pt="xl">
                    <Box style={{ overflowX: 'auto' }}>
                        <MantineReactTable table={table} />
                    </Box>
                </Tabs.Panel>
            </Tabs>

            {/* MODAL PARA REGISTRAR MOVIMIENTO MANUAL */}
            <Modal opened={modalOpened} onClose={closeModal} title={<Title order={4}>Registrar Movimiento</Title>} centered>
                <form onSubmit={form.onSubmit(handleRegistrarMovimiento)}>
                    <Stack gap="md">
                        <Select 
                            label="Tipo de Movimiento" 
                            data={[{ value: 'INGRESO', label: 'Ingreso Extra' }, { value: 'GASTO', label: 'Gasto / Egreso' }]}
                            {...form.getInputProps('tipo')}
                        />
                        <Select 
                            label="Categoría" 
                            data={categoriasOptions} 
                            placeholder="Seleccione una categoría"
                            searchable
                            withAsterisk
                            {...form.getInputProps('categoriaId')}
                        />
                        <TextInput 
                            type="date" label="Fecha (Fija la Tasa BCV)" withAsterisk 
                            {...form.getInputProps('fecha')} 
                        />
                        <NumberInput 
                            label="Monto (En Dólares)" withAsterisk prefix="$ " decimalScale={2}
                            {...form.getInputProps('montoUsd')} 
                        />
                        <Select 
                            label="Método de Pago" 
                            data={['Efectivo USD', 'Efectivo Bs', 'Transferencia', 'Pago Móvil', 'Zelle', 'Punto de Venta']} 
                            withAsterisk
                            {...form.getInputProps('metodoPago')} 
                        />
                        <TextInput 
                            label="Número de Referencia" placeholder="Ej. 12345678" 
                            {...form.getInputProps('referencia')} 
                        />
                        <Textarea 
                            label="Descripción / Motivo" placeholder="Ej. Pago de quincena a empleados..." 
                            {...form.getInputProps('descripcion')} 
                        />
                        <Button type="submit" color={form.values.tipo === 'INGRESO' ? 'green.7' : 'red.7'} fullWidth loading={isSubmitting} mt="md">
                            Guardar {form.values.tipo === 'INGRESO' ? 'Ingreso' : 'Gasto'}
                        </Button>
                    </Stack>
                </form>
            </Modal>
        </Box>
    );
}