'use client';

import React, { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import {
    ActionIcon, Alert, Badge, Box, Button, Card, Center, Grid, Group, Modal, Pagination, Paper, Progress, SegmentedControl, Select, SimpleGrid,
    Skeleton, Stack, Table, Text, TextInput, ThemeIcon, Title, Tooltip, UnstyledButton,
} from '@mantine/core';
import { LineChart, DonutChart } from '@mantine/charts';
import { DatePickerInput } from '@mantine/dates';
import { useDebouncedValue } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import {
    IconAlertTriangle, IconCash, IconChevronDown, IconChevronUp, IconCircleCheck, IconClockHour4, IconPackage, IconPlus, IconPrinter,
    IconReceipt2, IconSearch, IconShoppingBag, IconTrash, IconTruckDelivery, IconFileInvoice, IconListNumbers,
} from '@tabler/icons-react';
import { useAuth } from '@/hooks/useAuth';
import { useTasaBcv } from '@/hooks/useTasaBcv';
import { useEsTelefono } from '@/app/components/ui/modalMovil';

const PosModal = dynamic(() => import('../../components/admin/PosModal'), { ssr: false });

const usd = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUsd = (v) => `$${usd.format(Number(v) || 0)}`;
const fmtBs = (v) => `Bs ${new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0)}`;
const fmtFecha = (v) => new Date(v).toLocaleString('es-VE', { timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });

async function pedirJson(url, opciones) {
    const res = await fetch(url, opciones);
    const cuerpo = await res.json().catch(() => null);
    if (!res.ok) throw new Error(cuerpo?.error || 'No se pudo completar la solicitud');
    return cuerpo;
}

const TIPOS = { DETAL: { etiqueta: 'Detal', color: 'yellow' }, MAYOR: { etiqueta: 'Mayor', color: 'grape' }, ONLINE: { etiqueta: 'Online', color: 'cyan' } };
const COLOR_DESPACHO = { Pendiente: 'blue', Empacado: 'violet', Parcial: 'orange', Completado: 'teal', Cancelado: 'gray' };
const COLOR_PAGO = { Pagado: 'teal', Pendiente: 'orange', Vencido: 'red' };
const COLOR_DONA = { DETAL: 'yellow.6', MAYOR: 'grape.6', ONLINE: 'cyan.6' };

// Rango de fechas de cada periodo (semana de lunes a domingo)
function rangoDe(periodo) {
    const hoy = dayjs();
    if (periodo === 'HOY') return [hoy.startOf('day').toDate(), hoy.endOf('day').toDate()];
    if (periodo === 'SEMANA') { const ini = hoy.subtract((hoy.day() + 6) % 7, 'day').startOf('day'); return [ini.toDate(), ini.add(6, 'day').toDate()]; }
    if (periodo === 'MES1') return [hoy.subtract(1, 'month').startOf('day').toDate(), hoy.endOf('day').toDate()];
    if (periodo === 'MES3') return [hoy.subtract(3, 'month').startOf('day').toDate(), hoy.endOf('day').toDate()];
    if (periodo === 'ANIO') return [hoy.startOf('year').toDate(), hoy.endOf('day').toDate()];
    return [hoy.startOf('month').toDate(), hoy.endOf('month').toDate()];
}

const PERIODOS = [
    { value: 'HOY', label: 'Hoy' }, { value: 'SEMANA', label: 'Esta semana' }, { value: 'MES', label: 'Este mes' },
    { value: 'MES1', label: 'Hace 1 mes' }, { value: 'MES3', label: 'Hace 3 meses' }, { value: 'ANIO', label: 'Este año' }, { value: 'RANGO', label: 'Rango' },
];
const DOCUMENTOS = [
    { value: 'FACTURA', label: 'Facturas' }, { value: 'NOTA_ENTREGA', label: 'Notas de entrega' }, { value: 'VENTA_RAPIDA', label: 'Ventas rápidas' },
    { value: 'NOTA_CREDITO', label: 'Notas de crédito' }, { value: 'NOTA_DEBITO', label: 'Notas de débito' },
];
const DOC = {
    FACTURA: { etiqueta: 'Factura', color: 'navy' }, NOTA_ENTREGA: { etiqueta: 'N. entrega', color: 'gray' }, VENTA_RAPIDA: { etiqueta: 'V. rápida', color: 'lime' },
    NOTA_CREDITO: { etiqueta: 'N. crédito', color: 'red' }, NOTA_DEBITO: { etiqueta: 'N. débito', color: 'blue' },
};
const esNota = (v) => v.tipoDocumento === 'NOTA_CREDITO' || v.tipoDocumento === 'NOTA_DEBITO';
const COLOR_NOTA = { Emitida: 'teal', Anulada: 'gray' };

function Indicador({ icono: Icono, color, titulo, valor, detalle, cargando }) {
    return (
        <Card withBorder radius="lg" p={{ base: 'sm', sm: 'md' }} style={{ boxShadow: 'var(--mm-shadow-card)' }}>
            <Group wrap="nowrap" align="flex-start" gap="sm">
                {/* En el teléfono van dos por fila: sin ícono para que la cifra quepa */}
                <ThemeIcon size={44} radius="md" variant="light" color={color} visibleFrom="sm" style={{ flexShrink: 0 }}><Icono size={24} /></ThemeIcon>
                <Box style={{ minWidth: 0 }}>
                    <Text size="xs" c="dimmed" fw={700} tt="uppercase" lineClamp={1}>{titulo}</Text>
                    {cargando ? <Skeleton h={28} w={110} mt={4} /> : <Text fz={{ base: 19, sm: 24 }} fw={800} lh={1.2} c="navy.9" style={{ whiteSpace: 'nowrap' }}>{valor}</Text>}
                    {detalle && !cargando && <Text size="xs" c="dimmed" lineClamp={1}>{detalle}</Text>}
                </Box>
            </Group>
        </Card>
    );
}

// Una venta en el teléfono: lo mismo que la fila de la tabla, en una tarjeta que se toca para abrirla
function TarjetaVenta({ v, esVendedor, isAdmin, onAbrir, onEliminar }) {
    return (
        <Paper withBorder radius="md" p="sm" bg="white" role="button" tabIndex={0} onClick={onAbrir} onKeyDown={(e) => { if (e.key === 'Enter') onAbrir(); }} style={{ cursor: 'pointer' }}>
            <Group justify="space-between" wrap="nowrap" align="flex-start" gap="xs">
                <Box style={{ minWidth: 0 }}>
                    <Group gap={6} wrap="nowrap">
                        <Text fw={800} size="sm">{v.numero}</Text>
                        <Badge size="xs" variant="light" color={DOC[v.tipoDocumento]?.color}>{DOC[v.tipoDocumento]?.etiqueta}</Badge>
                        {v.tipo && <Badge size="xs" variant="light" color={TIPOS[v.tipo]?.color}>{TIPOS[v.tipo]?.etiqueta}</Badge>}
                    </Group>
                    <Text size="sm" fw={600} lineClamp={1}>{v.cliente}</Text>
                    <Text size="xs" c="dimmed" lineClamp={1}>{fmtFecha(v.fecha)}{esNota(v) ? '' : ` · ${v.articulos} art.`}{!esVendedor && v.vendedor ? ` · ${v.vendedor}` : ''}</Text>
                </Box>
                <Box ta="right" style={{ flexShrink: 0 }}>
                    <Text fw={800} size="md" c={v.tipoDocumento === 'NOTA_CREDITO' ? 'red.7' : undefined} style={{ whiteSpace: 'nowrap' }}>{fmtUsd(v.totalUsd)}</Text>
                    {v.moneda === 'BS' && <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>{fmtBs(v.total)}</Text>}
                </Box>
            </Group>
            <Group justify="space-between" wrap="nowrap" mt={8} gap="xs">
                <Group gap={6} wrap="wrap" style={{ minWidth: 0 }}>
                    <Badge variant="light" color={(esNota(v) ? COLOR_NOTA : COLOR_DESPACHO)[v.estado] || 'gray'}>{v.estado}</Badge>
                    {v.pago && <Badge variant="light" color={COLOR_PAGO[v.pago] || 'gray'}>{v.pago}</Badge>}
                    {v.tipo === 'MAYOR' && v.empacadorId && (
                        <Group gap={2} wrap="nowrap" aria-label={`Empaque ${v.empacadoAt ? 'firmado' : 'pendiente'} · Etiquetado ${v.etiquetadoAt ? 'firmado' : 'pendiente'}`}>
                            <IconPackage size={16} color={v.empacadoAt ? 'var(--mantine-color-teal-6)' : 'var(--mantine-color-gray-5)'} />
                            <IconCircleCheck size={16} color={v.etiquetadoAt ? 'var(--mantine-color-teal-6)' : 'var(--mantine-color-gray-5)'} />
                        </Group>
                    )}
                </Group>
                {!esNota(v) && (
                    <Group gap={2} wrap="nowrap" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                        <ActionIcon size="lg" variant="subtle" color="gray" aria-label="Imprimir" onClick={() => window.open(`/superuser/ventas/imprimir/${v.id}`, '_blank')}><IconPrinter size={18} /></ActionIcon>
                        {isAdmin && <ActionIcon size="lg" variant="subtle" color="red" aria-label="Eliminar" onClick={onEliminar}><IconTrash size={18} /></ActionIcon>}
                    </Group>
                )}
            </Group>
        </Paper>
    );
}

const ORDENES_TELEFONO = [
    { value: 'fecha:desc', label: 'Más recientes primero' },
    { value: 'fecha:asc', label: 'Más antiguas primero' },
    { value: 'total:desc', label: 'Mayor total primero' },
    { value: 'total:asc', label: 'Menor total primero' },
    { value: 'numero:desc', label: 'Documento (mayor a menor)' },
    { value: 'numero:asc', label: 'Documento (menor a mayor)' },
];

function Ranking({ titulo, filas, formato, cargando }) {
    const max = Math.max(...filas.map((f) => f.valor), 1);
    return (
        <Paper withBorder radius="lg" p="md" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
            <Title order={5} c="navy.9" mb="sm">{titulo}</Title>
            {cargando ? <Skeleton h={120} /> : !filas.length ? <Text size="sm" c="dimmed">Sin datos en este periodo.</Text> : (
                <Stack gap={10}>
                    {filas.map((f) => (
                        <Box key={f.nombre}>
                            <Group justify="space-between" wrap="nowrap" mb={2}>
                                <Text size="sm" fw={600} lineClamp={1}>{f.nombre}</Text>
                                <Text size="sm" fw={700} style={{ flexShrink: 0 }}>{formato(f)}</Text>
                            </Group>
                            <Progress value={(f.valor / max) * 100} size="sm" radius="xl" color="brand.6" />
                        </Box>
                    ))}
                </Stack>
            )}
        </Paper>
    );
}

function Encabezado({ campo, etiqueta, orden, onOrden, align = 'left' }) {
    const activo = orden.sort === campo;
    return (
        <Table.Th ta={align}>
            <UnstyledButton onClick={() => onOrden(campo)} style={{ fontWeight: 700, fontSize: 'inherit' }}>
                <Group gap={4} wrap="nowrap" justify={align === 'right' ? 'flex-end' : 'flex-start'}>
                    {etiqueta}{activo && (orden.dir === 'asc' ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />)}
                </Group>
            </UnstyledButton>
        </Table.Th>
    );
}

export default function VentasDashboard() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { esVendedor, isAdmin } = useAuth();
    const { tasa } = useTasaBcv();
    const telefono = useEsTelefono();

    const [periodo, setPeriodo] = useState('SEMANA');
    const [rango, setRango] = useState(rangoDe('SEMANA'));
    const [busqueda, setBusqueda] = useState('');
    const [q] = useDebouncedValue(busqueda.trim(), 350);
    const [tipo, setTipo] = useState('todos');
    const [doc, setDoc] = useState(null);
    const [estado, setEstado] = useState(null);
    const [pago, setPago] = useState(null);
    const [orden, setOrden] = useState({ sort: 'fecha', dir: 'desc' });
    const [pagina, setPagina] = useState(1);
    const [posAbierto, setPosAbierto] = useState(false);
    const [porEliminar, setPorEliminar] = useState(null);
    const [eliminando, setEliminando] = useState(false);

    useEffect(() => { if (periodo !== 'RANGO') setRango(rangoDe(periodo)); }, [periodo]);
    // Enlaces antiguos a "nuevo pedido" llegan con ?nueva=1: se abre el POS
    useEffect(() => { if (new URLSearchParams(window.location.search).get('nueva')) setPosAbierto(true); }, []);
    useEffect(() => { setPagina(1); }, [rango, q, tipo, doc, estado, pago, orden]);

    const [d1, d2] = rango;
    const listo = Boolean(d1 && d2);
    const desde = listo ? dayjs(d1).format('YYYY-MM-DD') : null;
    const hasta = listo ? dayjs(d2).format('YYYY-MM-DD') : null;

    const resumen = useQuery({
        queryKey: ['ventas', 'resumen', desde, hasta], enabled: listo,
        queryFn: () => pedirJson(`/api/ventas/resumen?desde=${desde}&hasta=${hasta}`),
    });

    const params = new URLSearchParams({ desde: desde || '', hasta: hasta || '', page: String(pagina), sort: orden.sort, dir: orden.dir });
    if (q) params.set('q', q);
    if (tipo !== 'todos') params.set('tipo', tipo);
    if (doc) params.set('doc', doc);
    if (estado) params.set('estado', estado);
    if (pago) params.set('pago', pago);
    const lista = useQuery({
        queryKey: ['ventas', 'lista', desde, hasta, q, tipo, doc, estado, pago, orden, pagina], enabled: listo,
        queryFn: () => pedirJson(`/api/ventas/lista?${params}`),
        placeholderData: keepPreviousData,
    });

    // Serie diaria completa (los días sin ventas cuentan como 0) para que el gráfico no salte
    const serie = useMemo(() => {
        if (!listo) return [];
        const porDia = new Map((resumen.data?.porDia || []).map((d) => [d.dia, d.total]));
        const dias = dayjs(d2).diff(dayjs(d1), 'day') + 1;
        // Más de ~3 meses: una barra por mes para que el gráfico siga legible
        if (dias > 92) {
            const meses = new Map();
            for (let i = 0; i < dias; i++) {
                const dia = dayjs(d1).add(i, 'day');
                const clave = dia.format('MM/YYYY');
                meses.set(clave, (meses.get(clave) || 0) + (porDia.get(dia.format('YYYY-MM-DD')) || 0));
            }
            return [...meses].map(([dia, total]) => ({ dia, total: Number(total.toFixed(2)) }));
        }
        return Array.from({ length: dias }, (_, i) => {
            const dia = dayjs(d1).add(i, 'day');
            return { dia: dia.format('DD/MM'), total: Number((porDia.get(dia.format('YYYY-MM-DD')) || 0).toFixed(2)) };
        });
    }, [resumen.data, d1, d2, listo]);

    const dona = (resumen.data?.porTipo || []).map((t) => ({ name: TIPOS[t.tipo]?.etiqueta || t.tipo, value: Number(t.total.toFixed(2)), color: COLOR_DONA[t.tipo] || 'gray.6' }));
    const r = resumen.data;

    const cambiarOrden = (campo) => setOrden((o) => (o.sort === campo ? { sort: campo, dir: o.dir === 'asc' ? 'desc' : 'asc' } : { sort: campo, dir: 'desc' }));

    const eliminar = async () => {
        setEliminando(true);
        try {
            await pedirJson(`/api/ventas/${porEliminar.id}`, { method: 'DELETE' });
            notifications.show({ color: 'red', icon: <IconTrash size={16} />, title: 'Venta eliminada', message: 'Se devolvió el stock y se revirtieron los ingresos.' });
            setPorEliminar(null);
            queryClient.invalidateQueries({ queryKey: ['ventas'] });
        } catch (e) {
            notifications.show({ color: 'red', title: 'No se pudo eliminar', message: e.message });
        } finally {
            setEliminando(false);
        }
    };

    return (
        <Box maw={1500} mx="auto" px={{ base: 'xs', sm: 'md' }} py="md">
            <Stack gap={telefono ? 'md' : 'lg'}>
                <Group justify="space-between" align="flex-end" wrap="wrap">
                    <Box>
                        <Title order={telefono ? 3 : 2} c="white">Ventas y pedidos</Title>
                        <Text size="sm" c="gray.4">{esVendedor ? 'Tus ventas y los pedidos que te asignaron.' : 'Todo lo vendido: al detal, al mayor y online.'}{tasa ? ` · BCV ${tasa} Bs/$` : ''}</Text>
                    </Box>
                    {/* En el teléfono la venta nueva va primero y a todo el ancho */}
                    <Group gap="xs" w={telefono ? '100%' : undefined} wrap={telefono ? 'nowrap' : 'wrap'}>
                        {!esVendedor && <Button size="md" variant="light" color="gray" leftSection={<IconListNumbers size={18} />} onClick={() => router.push('/superuser/ventas/controles')} px={telefono ? 'sm' : undefined} style={telefono ? { order: 3, flexShrink: 0 } : undefined}>{telefono ? 'Controles' : 'Números de control'}</Button>}
                        <Button size="md" variant="light" color="teal" leftSection={<IconFileInvoice size={18} />} onClick={() => router.push('/superuser/presupuestos')} px={telefono ? 'sm' : undefined} style={telefono ? { order: 2, flexShrink: 0 } : undefined}>Presupuestos</Button>
                        <Button size="md" color="accent.6" leftSection={<IconPlus size={18} />} onClick={() => setPosAbierto(true)} style={telefono ? { flex: 1, minWidth: 0 } : undefined}>{telefono ? 'Nueva venta' : 'Nueva venta o pedido'}</Button>
                    </Group>
                </Group>

                <Group gap="sm" wrap="wrap">
                    {telefono
                        ? <Select aria-label="Periodo" allowDeselect={false} data={PERIODOS} value={periodo} onChange={(v) => v && setPeriodo(v)} w="100%" />
                        : <SegmentedControl color="navy.9" value={periodo} onChange={setPeriodo} data={PERIODOS} />}
                    {periodo === 'RANGO' && (
                        <DatePickerInput type="range" valueFormat="DD/MM/YYYY" value={rango} onChange={setRango} placeholder="Elige el rango" maxDate={new Date()} clearable w={{ base: '100%', sm: 280 }}
                            dropdownType={telefono ? 'modal' : 'popover'} />
                    )}
                </Group>

                {(resumen.error || lista.error) && <Alert color="red" icon={<IconAlertTriangle size={18} />}>{(resumen.error || lista.error).message}</Alert>}

                <SimpleGrid cols={{ base: 2, sm: 3, lg: 5 }} spacing={{ base: 'xs', sm: 'md' }}>
                    <Indicador icono={IconShoppingBag} color="blue" titulo="Ventas" cargando={resumen.isLoading} valor={r?.ventas ?? 0} detalle={r?.anuladas ? `${r.anuladas} anulada(s)` : 'Sin anuladas'} />
                    <Indicador icono={IconCash} color="teal" titulo="Total vendido" cargando={resumen.isLoading} valor={fmtUsd(r?.total)} detalle={tasa ? fmtBs((r?.total || 0) * tasa) : undefined} />
                    <Indicador icono={IconReceipt2} color="grape" titulo="Ticket promedio" cargando={resumen.isLoading} valor={fmtUsd(r?.ticketPromedio)} />
                    <Indicador icono={IconClockHour4} color="orange" titulo="Por cobrar" cargando={resumen.isLoading} valor={fmtUsd(r?.porCobrar)} detalle="Ventas sin pagar" />
                    <Indicador icono={IconTruckDelivery} color="violet" titulo="Por despachar" cargando={resumen.isLoading} valor={r?.porDespachar ?? 0} detalle="Pendientes de entrega" />
                </SimpleGrid>

                <Grid gutter="lg">
                    <Grid.Col span={{ base: 12, lg: 6 }}>
                    <Paper withBorder radius="lg" p="md" h="100%" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
                        <Title order={5} c="navy.9" mb="sm">Ventas por día (USD)</Title>
                        {resumen.isLoading ? <Skeleton h={230} /> : (
                            <LineChart h={230} data={serie} dataKey="dia" series={[{ name: 'total', label: 'Vendido', color: 'brand.6' }]}
                                curveType="monotone" withDots={serie.length <= 31} valueFormatter={(v) => fmtUsd(v)} gridAxis="xy" tickLine="none" />
                        )}
                    </Paper>
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, sm: 6, lg: 3 }}>
                    <Paper withBorder radius="lg" p="md" h="100%" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
                        <Title order={5} c="navy.9" mb="sm">Por tipo de venta</Title>
                        {resumen.isLoading ? <Skeleton h={230} /> : !dona.length ? <Center h={230}><Text size="sm" c="dimmed">Sin ventas en este periodo.</Text></Center> : (
                            <Stack align="center" gap="md">
                                <DonutChart data={dona} size={170} thickness={26} withTooltip tooltipDataSource="segment" chartLabel={fmtUsd(r?.total)} valueFormatter={(v) => fmtUsd(v)} />
                                <Stack gap={6}>{dona.map((d) => (
                                    <Group key={d.name} gap={8} wrap="nowrap"><Box w={12} h={12} bg={d.color} style={{ borderRadius: 4 }} /><Text size="sm">{d.name}</Text><Text size="sm" fw={700}>{fmtUsd(d.value)}</Text></Group>
                                ))}</Stack>
                            </Stack>
                        )}
                    </Paper>
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, sm: 6, lg: 3 }}>
                    <Ranking titulo="Productos más vendidos" cargando={resumen.isLoading} filas={(r?.topProductos || []).map((p) => ({ nombre: p.nombre, valor: p.cantidad, cantidad: p.cantidad }))} formato={(f) => `${f.cantidad} und.`} />
                    </Grid.Col>
                </Grid>

                {!esVendedor && (r?.topVendedores?.length > 0 || resumen.isLoading) && (
                    <Ranking titulo="Ventas por vendedor" cargando={resumen.isLoading} filas={(r?.topVendedores || []).map((v) => ({ nombre: v.nombre, valor: v.total, total: v.total, ventas: v.ventas }))} formato={(f) => `${fmtUsd(f.total)} · ${f.ventas} ventas`} />
                )}

                <Paper withBorder radius="lg" p={{ base: 'sm', sm: 'md' }} style={{ boxShadow: 'var(--mm-shadow-card)' }}>
                    {telefono ? (
                        <Stack gap="xs" mb="sm">
                            <SegmentedControl fullWidth color="navy.9" value={tipo} onChange={setTipo} data={[{ value: 'todos', label: 'Todas' }, { value: 'DETAL', label: 'Detal' }, { value: 'MAYOR', label: 'Mayor' }, { value: 'ONLINE', label: 'Online' }]} />
                            <TextInput placeholder="Documento, cliente o RIF…" leftSection={<IconSearch size={16} />} value={busqueda} onChange={(e) => setBusqueda(e.currentTarget.value)} inputMode="search" enterKeyHint="search" />
                            <SimpleGrid cols={2} spacing="xs">
                                <Select placeholder="Documento" clearable data={DOCUMENTOS} value={doc} onChange={setDoc} />
                                <Select placeholder="Despacho" clearable data={['Pendiente', 'Empacado', 'Parcial', 'Completado', 'Cancelado']} value={estado} onChange={setEstado} />
                                <Select placeholder="Pago" clearable data={['Pagado', 'Pendiente', 'Vencido']} value={pago} onChange={setPago} />
                            </SimpleGrid>
                            <Select aria-label="Ordenar" leftSection={<IconChevronDown size={16} />} allowDeselect={false} data={ORDENES_TELEFONO}
                                value={`${orden.sort}:${orden.dir}`} onChange={(v) => { if (v) { const [sort, dir] = v.split(':'); setOrden({ sort, dir }); } }} />
                        </Stack>
                    ) : (
                        <Group gap="sm" mb="md" wrap="wrap" align="flex-end">
                            <SegmentedControl color="navy.9" value={tipo} onChange={setTipo} data={[{ value: 'todos', label: 'Todas' }, { value: 'DETAL', label: 'Detal' }, { value: 'MAYOR', label: 'Mayor' }, { value: 'ONLINE', label: 'Online' }]} />
                            <TextInput flex="1 1 220px" placeholder="Buscar por documento, cliente o RIF…" leftSection={<IconSearch size={16} />} value={busqueda} onChange={(e) => setBusqueda(e.currentTarget.value)} />
                            <Select placeholder="Documento" clearable data={DOCUMENTOS} value={doc} onChange={setDoc} w={170} />
                            <Select placeholder="Despacho" clearable data={['Pendiente', 'Empacado', 'Parcial', 'Completado', 'Cancelado']} value={estado} onChange={setEstado} w={150} />
                            <Select placeholder="Pago" clearable data={['Pagado', 'Pendiente', 'Vencido']} value={pago} onChange={setPago} w={140} />
                        </Group>
                    )}

                    {lista.isLoading ? <Stack gap="xs">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} h={telefono ? 96 : 44} />)}</Stack>
                        : !lista.data?.ventas?.length ? <Center py={50}><Text c="dimmed">No hay documentos con estos filtros.</Text></Center>
                        : telefono ? (
                            <Stack gap="xs" style={{ opacity: lista.isFetching ? 0.7 : 1 }}>
                                {lista.data.ventas.map((v) => (
                                    <TarjetaVenta key={`${v.tipoDocumento}-${v.id}`} v={v} esVendedor={esVendedor} isAdmin={isAdmin} onAbrir={() => router.push(`/superuser/ventas/${v.ventaId || v.id}`)} onEliminar={() => setPorEliminar(v)} />
                                ))}
                            </Stack>
                        ) : (
                            <Table.ScrollContainer minWidth={900}>
                                <Table verticalSpacing="sm" highlightOnHover style={{ opacity: lista.isFetching ? 0.7 : 1 }}>
                                    <Table.Thead>
                                        <Table.Tr>
                                            <Encabezado campo="numero" etiqueta="Documento" orden={orden} onOrden={cambiarOrden} />
                                            <Encabezado campo="fecha" etiqueta="Fecha" orden={orden} onOrden={cambiarOrden} />
                                            <Table.Th>Cliente</Table.Th>
                                            {!esVendedor && <Table.Th>Vendedor</Table.Th>}
                                            <Table.Th ta="right">Art.</Table.Th>
                                            <Encabezado campo="total" etiqueta="Total" orden={orden} onOrden={cambiarOrden} align="right" />
                                            <Table.Th>Despacho</Table.Th>
                                            <Table.Th>Pago</Table.Th>
                                            <Table.Th />
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {lista.data.ventas.map((v) => (
                                            <Table.Tr key={`${v.tipoDocumento}-${v.id}`} style={{ cursor: 'pointer' }} onClick={() => router.push(`/superuser/ventas/${v.ventaId || v.id}`)}>
                                                <Table.Td><Group gap={6} wrap="nowrap"><Text fw={700} size="sm">{v.numero}</Text><Badge size="xs" variant="light" color={DOC[v.tipoDocumento]?.color}>{DOC[v.tipoDocumento]?.etiqueta}</Badge>{v.tipo && <Badge size="xs" variant="light" color={TIPOS[v.tipo]?.color}>{TIPOS[v.tipo]?.etiqueta}</Badge>}</Group></Table.Td>
                                                <Table.Td><Text size="xs">{fmtFecha(v.fecha)}</Text></Table.Td>
                                                <Table.Td><Text size="sm" lineClamp={1} maw={180}>{v.cliente}</Text></Table.Td>
                                                {!esVendedor && <Table.Td><Text size="sm" c="dimmed" lineClamp={1} maw={140}>{v.vendedor || '—'}</Text></Table.Td>}
                                                <Table.Td ta="right"><Text size="sm">{esNota(v) ? '—' : v.articulos}</Text></Table.Td>
                                                <Table.Td ta="right">
                                                    <Text size="sm" fw={800} c={v.tipoDocumento === 'NOTA_CREDITO' ? 'red.7' : undefined}>{fmtUsd(v.totalUsd)}</Text>
                                                    {v.moneda === 'BS' && <Text size="xs" c="dimmed">{fmtBs(v.total)}</Text>}
                                                </Table.Td>
                                                <Table.Td>
                                                    <Group gap={6} wrap="nowrap">
                                                        <Badge variant="light" color={(esNota(v) ? COLOR_NOTA : COLOR_DESPACHO)[v.estado] || 'gray'}>{v.estado}</Badge>
                                                        {v.tipo === 'MAYOR' && v.empacadorId && (
                                                            <Tooltip label={`Empaque ${v.empacadoAt ? 'firmado' : 'pendiente'} · Etiquetado ${v.etiquetadoAt ? 'firmado' : 'pendiente'}`}>
                                                                <Group gap={2} wrap="nowrap">
                                                                    <IconPackage size={16} color={v.empacadoAt ? 'var(--mantine-color-teal-6)' : 'var(--mantine-color-gray-5)'} />
                                                                    <IconCircleCheck size={16} color={v.etiquetadoAt ? 'var(--mantine-color-teal-6)' : 'var(--mantine-color-gray-5)'} />
                                                                </Group>
                                                            </Tooltip>
                                                        )}
                                                    </Group>
                                                </Table.Td>
                                                <Table.Td>{v.pago ? <Badge variant="light" color={COLOR_PAGO[v.pago] || 'gray'}>{v.pago}</Badge> : <Text size="sm" c="dimmed">—</Text>}</Table.Td>
                                                <Table.Td onClick={(e) => e.stopPropagation()}>
                                                    {!esNota(v) && (
                                                        <Group gap={4} wrap="nowrap" justify="flex-end">
                                                            <Tooltip label="Imprimir"><ActionIcon variant="subtle" color="gray" onClick={() => window.open(`/superuser/ventas/imprimir/${v.id}`, '_blank')}><IconPrinter size={16} /></ActionIcon></Tooltip>
                                                            {isAdmin && <Tooltip label="Eliminar"><ActionIcon variant="subtle" color="red" onClick={() => setPorEliminar(v)}><IconTrash size={16} /></ActionIcon></Tooltip>}
                                                        </Group>
                                                    )}
                                                </Table.Td>
                                            </Table.Tr>
                                        ))}
                                    </Table.Tbody>
                                </Table>
                            </Table.ScrollContainer>
                        )}

                    {lista.data && (
                        <Group justify={telefono ? 'center' : 'space-between'} mt="md" wrap="wrap">
                            <Text size="sm" c="dimmed">{lista.data.total} {lista.data.total === 1 ? 'documento' : 'documentos'}</Text>
                            {lista.data.paginas > 1 && <Pagination total={lista.data.paginas} value={pagina} onChange={setPagina} color="navy.9" size={telefono ? 'md' : 'sm'} siblings={telefono ? 0 : 1} />}
                        </Group>
                    )}
                </Paper>
            </Stack>

            <Modal opened={Boolean(porEliminar)} onClose={() => setPorEliminar(null)} centered title={<Text fw={800}>Eliminar venta</Text>}>
                <Stack gap="md">
                    <Text size="sm">Vas a eliminar <b>{porEliminar?.numero}</b>. Se devolverá el stock, se borrarán sus ingresos y el correlativo retrocederá. Solo se permite con la última venta registrada. No se puede deshacer.</Text>
                    <Group justify="flex-end" grow={telefono}>
                        <Button variant="default" onClick={() => setPorEliminar(null)}>Cancelar</Button>
                        <Button color="red" loading={eliminando} onClick={eliminar} leftSection={<IconTrash size={16} />}>Eliminar</Button>
                    </Group>
                </Stack>
            </Modal>

            {posAbierto && <PosModal opened={posAbierto} onClose={() => { setPosAbierto(false); queryClient.invalidateQueries({ queryKey: ['ventas'] }); }} tasaBcv={tasa || 0} />}
        </Box>
    );
}
