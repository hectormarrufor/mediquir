'use client';

import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from '@mantine/form';
import { useDebouncedValue, useDisclosure, useMediaQuery } from '@mantine/hooks';
import {
    Alert, Badge, Box, Button, Card, Center, Grid, Group, Modal, NumberInput, Pagination, Paper, SegmentedControl, Select,
    SimpleGrid, Skeleton, Stack, Table, Text, TextInput, Textarea, Title,
} from '@mantine/core';
import { DonutChart } from '@mantine/charts';
import { MonthPickerInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconPlus, IconReceiptTax, IconScale, IconSearch, IconTrendingDown, IconTrendingUp } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { fechaCaracas, formatearFecha } from '@/app/constants/hora';

const CHART_COLORS = ['blue.6', 'teal.6', 'yellow.6', 'orange.6', 'red.6', 'pink.6', 'grape.6', 'violet.6', 'cyan.6'];
// El IVA que se cobra al vender es del SENIAT: se muestra aparte y no suma como ingreso de la empresa (igual que en el Balance)
const CAT_IVA = 'IVA Recaudado';
const POR_PAGINA = 15;
const usd = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUsd = (v) => `$${usd.format(Number(v) || 0)}`;
const fmtBs = (v) => `Bs ${new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0)}`;

async function pedirJson(url) {
    const res = await fetch(url);
    const cuerpo = await res.json().catch(() => null);
    if (!res.ok) throw new Error(cuerpo?.error || 'No se pudo cargar');
    return cuerpo;
}

function Tarjeta({ titulo, valor, color, icono: Icono, detalle, cargando }) {
    return (
        <Card withBorder radius="md" p="md" bg={`${color}.0`}>
            <Group justify="space-between" mb={4} wrap="nowrap">
                <Text size="xs" tt="uppercase" fw={700} c={`${color}.9`}>{titulo}</Text>
                <Icono color={`var(--mantine-color-${color}-7)`} size={22} />
            </Group>
            {cargando ? <Skeleton h={30} w={120} /> : <Text fz={26} fw={900} c={`${color}.9`} lh={1.2}>{valor}</Text>}
            {detalle && !cargando && <Text size="xs" c="dimmed">{detalle}</Text>}
        </Card>
    );
}

// Movimientos de caja de un mes: ingresos y gastos asentados (ventas de contado, abonos, compras, pagos, manuales)
export default function FinanzasDashboard() {
    const queryClient = useQueryClient();
    const isMobile = useMediaQuery('(max-width: 48em)');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);
    const [mes, setMes] = useState(dayjs().startOf('month').toDate());
    const [tipo, setTipo] = useState('TODOS');
    const [busqueda, setBusqueda] = useState('');
    const [q] = useDebouncedValue(busqueda.trim().toLowerCase(), 250);
    const [pagina, setPagina] = useState(1);
    const [nuevaCategoria, setNuevaCategoria] = useState('');

    const desde = dayjs(mes || new Date()).startOf('month').format('YYYY-MM-DD');
    const hasta = dayjs(mes || new Date()).endOf('month').format('YYYY-MM-DD');

    const { data: movimientos = [], isLoading, error } = useQuery({
        queryKey: ['movimientos', desde, hasta],
        queryFn: () => pedirJson(`/api/finanzas/movimientos?desde=${desde}&hasta=${hasta}`),
    });
    const { data: categorias = [] } = useQuery({ queryKey: ['categoriasFinancieras'], queryFn: () => pedirJson('/api/finanzas/categorias') });

    const resumen = useMemo(() => {
        let ingresos = 0; let gastos = 0; let iva = 0;
        const mapaIngresos = {}; const mapaGastos = {};
        for (const m of movimientos) {
            const monto = Number(m.montoUsd) || 0;
            const cat = m.categoria?.nombre || 'Sin categoría';
            if (m.tipo === 'INGRESO' && cat === CAT_IVA) { iva += monto; continue; }
            if (m.tipo === 'INGRESO') { ingresos += monto; mapaIngresos[cat] = (mapaIngresos[cat] || 0) + monto; }
            else { gastos += monto; mapaGastos[cat] = (mapaGastos[cat] || 0) + monto; }
        }
        const dona = (mapa, desfase) => Object.entries(mapa).sort((a, b) => b[1] - a[1]).map(([name, value], i) => ({ name, value: Number(value.toFixed(2)), color: CHART_COLORS[(i + desfase) % CHART_COLORS.length] }));
        return { ingresos, gastos, iva, neto: ingresos - gastos, donaIngresos: dona(mapaIngresos, 0), donaGastos: dona(mapaGastos, 4) };
    }, [movimientos]);

    const filtrados = useMemo(() => movimientos.filter((m) => {
        if (tipo !== 'TODOS' && m.tipo !== tipo) return false;
        return !q || [m.descripcion, m.referencia, m.metodoPago, m.categoria?.nombre].some((x) => String(x || '').toLowerCase().includes(q));
    }), [movimientos, tipo, q]);
    const paginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
    const paginaActual = Math.min(pagina, paginas);
    const visibles = filtrados.slice((paginaActual - 1) * POR_PAGINA, paginaActual * POR_PAGINA);

    const form = useForm({
        initialValues: { tipo: 'GASTO', fecha: fechaCaracas(), montoUsd: 0, metodoPago: 'Transferencia', referencia: '', descripcion: '', categoriaId: '' },
        validate: {
            montoUsd: (val) => (!(Number(val) > 0) ? 'El monto debe ser mayor a 0' : null),
            categoriaId: (val) => (!val ? 'Elige una categoría' : null),
            fecha: (val) => (!val ? 'Indica la fecha' : null),
        },
    });

    const categoriasOptions = categorias.filter((c) => c.tipo === form.values.tipo && c.nombre !== CAT_IVA).map((c) => ({ value: c.id.toString(), label: c.nombre }));

    const crearCategoria = async () => {
        const nombre = nuevaCategoria.trim();
        if (nombre.length < 3) return notifications.show({ color: 'orange', message: 'Escribe el nombre de la categoría (mínimo 3 letras)' });
        try {
            const res = await fetch('/api/finanzas/categorias', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre, tipo: form.values.tipo }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'No se pudo crear la categoría');
            await queryClient.invalidateQueries({ queryKey: ['categoriasFinancieras'] });
            form.setFieldValue('categoriaId', String(data.id));
            setNuevaCategoria('');
        } catch (e) {
            notifications.show({ color: 'red', title: 'Error', message: e.message });
        }
    };

    const handleRegistrarMovimiento = async (values) => {
        setIsSubmitting(true);
        try {
            const res = await fetch('/api/finanzas/movimientos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al registrar');
            notifications.show({ title: 'Listo', message: 'Movimiento registrado', color: 'green' });
            queryClient.invalidateQueries({ queryKey: ['movimientos'] });
            queryClient.invalidateQueries({ queryKey: ['balance'] });
            closeModal();
            form.reset();
        } catch (e) {
            notifications.show({ title: 'Error', message: e.message, color: 'red' });
        } finally {
            setIsSubmitting(false);
        }
    };

    // Función de render (no componente): así no se vuelve a montar el gráfico en cada render
    const dona = (titulo, datos, color) => (
        <Paper withBorder p="md" radius="md" h="100%">
            <Title order={5} mb="sm" c={`${color}.9`}>{titulo}</Title>
            {isLoading ? <Skeleton h={180} /> : !datos.length ? <Center h={180}><Text c="dimmed" size="sm">Sin movimientos en este mes.</Text></Center> : (
                <Group justify="center" wrap="wrap" gap="lg">
                    <DonutChart data={datos.slice(0, 8)} size={160} thickness={24} withTooltip tooltipDataSource="segment" valueFormatter={fmtUsd} />
                    <Stack gap={5} style={{ flex: 1, minWidth: 150 }}>
                        {datos.slice(0, 8).map((d) => (
                            <Group key={d.name} gap={8} wrap="nowrap" justify="space-between">
                                <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}><Box w={11} h={11} bg={d.color} style={{ borderRadius: 3, flexShrink: 0 }} /><Text size="xs" lineClamp={1}>{d.name}</Text></Group>
                                <Text size="xs" fw={700} style={{ flexShrink: 0 }}>{fmtUsd(d.value)}</Text>
                            </Group>
                        ))}
                    </Stack>
                </Group>
            )}
        </Paper>
    );

    return (
        <Box p={{ base: 4, sm: 'xs' }}>
            <Group justify="space-between" mb="md" wrap="wrap" gap="sm">
                <Group gap="sm" wrap="wrap">
                    <MonthPickerInput value={mes} onChange={(v) => { setMes(v); setPagina(1); }} valueFormat="MMMM YYYY" maxDate={new Date()} w={190} aria-label="Mes" allowDeselect={false} />
                    <Text size="sm" c="dimmed">{movimientos.length} movimiento(s)</Text>
                </Group>
                <Button color="navy.9" leftSection={<IconPlus size={16} />} onClick={openModal} fullWidth={isMobile}>Registrar movimiento manual</Button>
            </Group>

            {error && <Alert color="red" icon={<IconAlertTriangle size={18} />} mb="md">{error.message}</Alert>}

            <SimpleGrid cols={{ base: 1, xs: 2, lg: 4 }} spacing="md" mb="md">
                <Tarjeta titulo="Ingresos" valor={fmtUsd(resumen.ingresos)} color="green" icono={IconTrendingUp} cargando={isLoading} detalle="Sin el IVA recaudado" />
                <Tarjeta titulo="Egresos" valor={fmtUsd(resumen.gastos)} color="red" icono={IconTrendingDown} cargando={isLoading} />
                <Tarjeta titulo="Neto del mes" valor={`${resumen.neto < 0 ? '-' : ''}${fmtUsd(Math.abs(resumen.neto))}`} color={resumen.neto >= 0 ? 'blue' : 'orange'} icono={IconScale} cargando={isLoading} detalle="Ingresos − egresos" />
                <Tarjeta titulo="IVA recaudado" valor={fmtUsd(resumen.iva)} color="grape" icono={IconReceiptTax} cargando={isLoading} detalle="Es del SENIAT, no de la empresa" />
            </SimpleGrid>

            <Grid gutter="md" mb="md">
                <Grid.Col span={{ base: 12, md: 6 }}>{dona('Ingresos por categoría', resumen.donaIngresos, 'green')}</Grid.Col>
                <Grid.Col span={{ base: 12, md: 6 }}>{dona('Egresos por categoría', resumen.donaGastos, 'red')}</Grid.Col>
            </Grid>

            <Paper withBorder p="md" radius="md">
                <Group gap="sm" mb="md" wrap="wrap" align="flex-end">
                    <SegmentedControl value={tipo} onChange={(v) => { setTipo(v); setPagina(1); }} data={[{ value: 'TODOS', label: 'Todos' }, { value: 'INGRESO', label: 'Ingresos' }, { value: 'GASTO', label: 'Egresos' }]} />
                    <TextInput flex="1 1 220px" placeholder="Buscar descripción, referencia o categoría…" leftSection={<IconSearch size={16} />} value={busqueda} onChange={(e) => { setBusqueda(e.currentTarget.value); setPagina(1); }} />
                </Group>

                {isLoading ? <Stack gap="xs">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} h={40} />)}</Stack>
                    : !visibles.length ? <Center py={40}><Text c="dimmed">No hay movimientos con esos filtros.</Text></Center>
                    : isMobile ? (
                        <Stack gap="xs">
                            {visibles.map((m) => (
                                <Paper key={m.id} withBorder radius="md" p="xs" style={{ borderLeft: `4px solid var(--mantine-color-${m.tipo === 'INGRESO' ? 'green' : 'red'}-6)` }}>
                                    <Group justify="space-between" wrap="nowrap" align="flex-start">
                                        <Box style={{ minWidth: 0 }}>
                                            <Text size="sm" fw={600} lineClamp={2}>{m.descripcion || m.categoria?.nombre || 'Movimiento'}</Text>
                                            <Text size="xs" c="dimmed">{formatearFecha(m.fecha)} · {m.categoria?.nombre || 'Sin categoría'} · {m.metodoPago}</Text>
                                        </Box>
                                        <Box ta="right" style={{ flexShrink: 0 }}>
                                            <Text fw={800} size="sm" c={m.tipo === 'INGRESO' ? 'green.7' : 'red.7'}>{m.tipo === 'INGRESO' ? '+' : '−'}{fmtUsd(m.montoUsd)}</Text>
                                            <Text size="xs" c="dimmed">{fmtBs(m.montoVes)}</Text>
                                        </Box>
                                    </Group>
                                </Paper>
                            ))}
                        </Stack>
                    ) : (
                        <Table.ScrollContainer minWidth={820}>
                            <Table striped highlightOnHover verticalSpacing="xs">
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>Fecha</Table.Th><Table.Th>Tipo</Table.Th><Table.Th>Categoría</Table.Th><Table.Th>Descripción</Table.Th><Table.Th>Método</Table.Th>
                                        <Table.Th ta="right">Monto ($)</Table.Th><Table.Th ta="right">Monto (Bs)</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {visibles.map((m) => (
                                        <Table.Tr key={m.id}>
                                            <Table.Td style={{ whiteSpace: 'nowrap' }}>{formatearFecha(m.fecha)}</Table.Td>
                                            <Table.Td><Badge color={m.tipo === 'INGRESO' ? 'green' : 'red'} variant="light">{m.tipo === 'INGRESO' ? 'Ingreso' : 'Egreso'}</Badge></Table.Td>
                                            <Table.Td>{m.categoria?.nombre || 'Sin categoría'}</Table.Td>
                                            <Table.Td><Text size="sm" lineClamp={2}>{m.descripcion}</Text>{m.referencia && <Text size="xs" c="dimmed">Ref: {m.referencia}</Text>}</Table.Td>
                                            <Table.Td>{m.metodoPago}</Table.Td>
                                            <Table.Td ta="right"><Text fw={700} size="sm" c={m.tipo === 'INGRESO' ? 'green.7' : 'red.7'}>{m.tipo === 'INGRESO' ? '+' : '−'}{fmtUsd(m.montoUsd)}</Text></Table.Td>
                                            <Table.Td ta="right"><Text size="sm" c="dimmed">{fmtBs(m.montoVes)}</Text></Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>
                        </Table.ScrollContainer>
                    )}

                <Group justify="space-between" mt="md" wrap="wrap">
                    <Text size="sm" c="dimmed">{filtrados.length} movimiento(s)</Text>
                    {paginas > 1 && <Pagination total={paginas} value={paginaActual} onChange={setPagina} size="sm" color="navy.9" />}
                </Group>
            </Paper>

            <Modal opened={modalOpened} onClose={closeModal} title={<Text fw={800}>Registrar movimiento manual</Text>} centered fullScreen={isMobile}>
                <form onSubmit={form.onSubmit(handleRegistrarMovimiento)}>
                    <Stack gap="sm">
                        <SegmentedControl fullWidth value={form.values.tipo} onChange={(v) => { form.setFieldValue('tipo', v); form.setFieldValue('categoriaId', ''); }}
                            data={[{ value: 'GASTO', label: 'Gasto / egreso' }, { value: 'INGRESO', label: 'Ingreso extra' }]} />
                        <Select label="Categoría" data={categoriasOptions} placeholder={categoriasOptions.length ? 'Elige una categoría' : 'Crea la primera categoría abajo'} searchable withAsterisk {...form.getInputProps('categoriaId')} />
                        <Group gap="xs" align="flex-end" wrap="nowrap">
                            <TextInput style={{ flex: 1 }} size="xs" label="¿No está? Crea una categoría" placeholder={form.values.tipo === 'GASTO' ? 'Ej. Nómina, Alquiler, Servicios' : 'Ej. Intereses, Otros ingresos'} value={nuevaCategoria} onChange={(e) => setNuevaCategoria(e.currentTarget.value)} />
                            <Button size="xs" variant="light" onClick={crearCategoria}>Crear</Button>
                        </Group>
                        <TextInput type="date" label="Fecha" description="Fija la tasa BCV (si ese día no hubo, la última publicada)" withAsterisk max={fechaCaracas()} {...form.getInputProps('fecha')} />
                        <NumberInput label="Monto (en dólares)" withAsterisk prefix="$ " decimalScale={2} min={0} {...form.getInputProps('montoUsd')} />
                        <Select label="Método de pago" data={['Efectivo ($)', 'Efectivo (Bs)', 'Transferencia', 'Pago Móvil', 'Zelle', 'Punto de Venta']} withAsterisk allowDeselect={false} {...form.getInputProps('metodoPago')} />
                        <TextInput label="Número de referencia" placeholder="Ej. 12345678" {...form.getInputProps('referencia')} />
                        <Textarea label="Descripción / motivo" placeholder="Ej. Pago de quincena a empleados" autosize minRows={2} {...form.getInputProps('descripcion')} />
                        <Button type="submit" color={form.values.tipo === 'INGRESO' ? 'green.7' : 'red.7'} fullWidth loading={isSubmitting} mt="xs">
                            Guardar {form.values.tipo === 'INGRESO' ? 'ingreso' : 'gasto'}
                        </Button>
                    </Stack>
                </form>
            </Modal>
        </Box>
    );
}
