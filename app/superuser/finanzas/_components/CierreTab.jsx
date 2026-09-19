'use client';

import React, { useState } from 'react';
import { Alert, Badge, Box, Button, Card, Center, Group, Paper, SegmentedControl, SimpleGrid, Skeleton, Stack, Table, Tabs, Text, Title } from '@mantine/core';
import { DatePickerInput, MonthPickerInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { IconAlertTriangle, IconBook2, IconDownload, IconFileTypePdf, IconInfoCircle, IconReceiptTax } from '@tabler/icons-react';
import { useAuth } from '@/hooks/useAuth';
import { COLUMNAS, TIPOS, descargarCsvLibro, descargarCsvRetenciones, descargarPdfLibro, dinero, fmtFecha } from '../_lib/libroExport';

async function pedirJson(url) {
    const res = await fetch(url);
    const cuerpo = await res.json().catch(() => null);
    if (!res.ok) throw new Error(cuerpo?.error || 'No se pudo cargar');
    return cuerpo;
}

function Dato({ titulo, valor, color, detalle }) {
    return (
        <Card withBorder radius="lg" p="md" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
            <Text size="xs" c="dimmed" fw={700} tt="uppercase">{titulo}</Text>
            <Text fz={21} fw={800} c={color || 'navy.9'} lh={1.3}>Bs {dinero(valor)}</Text>
            {detalle && <Text size="xs" c="dimmed">{detalle}</Text>}
        </Card>
    );
}

function TablaLibro({ tipo, libro }) {
    const cols = COLUMNAS(tipo, libro.filas);
    const r = libro.resumen;
    const valor = (c, f) => { const v = f[c.k]; if (v === null || v === undefined) return ''; if (c.f) return c.f(v); return c.num ? dinero(v) : String(v); };
    if (!libro.filas.length) return <Center py={40}><Text c="dimmed">Sin operaciones en este periodo.</Text></Center>;
    return (
        <Table.ScrollContainer minWidth={1100} h={430}>
            <Table verticalSpacing={3} horizontalSpacing="xs" fz="xs" stickyHeader>
                <Table.Thead><Table.Tr>{cols.map((c) => <Table.Th key={c.k} ta={c.num ? 'right' : 'left'} style={{ whiteSpace: 'pre-line', verticalAlign: 'bottom' }}>{c.t}</Table.Th>)}</Table.Tr></Table.Thead>
                <Table.Tbody>
                    {libro.filas.map((f) => (
                        <Table.Tr key={f.n} bg={f.tipo === 'RET' ? 'var(--mantine-color-grape-0)' : undefined}>
                            {cols.map((c) => <Table.Td key={c.k} ta={c.num ? 'right' : 'left'} style={{ whiteSpace: 'nowrap' }}>{valor(c, f)}</Table.Td>)}
                        </Table.Tr>
                    ))}
                </Table.Tbody>
                <Table.Tfoot>
                    <Table.Tr fw={800}>{cols.map((c) => <Table.Td key={c.k} ta={c.num ? 'right' : 'left'} fw={800}>
                        {c.k === 'nombre' ? `TOTAL TRANSACCIONES: ${r.totalTransacciones}` : c.k === 'total' ? dinero(r.totalGeneral) : c.k === 'base' ? dinero(r.totalImponible.monto) : c.k === 'ivaRetenido' ? dinero(r.ivaRetenido) : c.k === 'exento' ? dinero(r.exento) : c.k === 'iva' ? dinero(r.totalImpuesto) : ''}
                    </Table.Td>)}</Table.Tr>
                </Table.Tfoot>
            </Table>
        </Table.ScrollContainer>
    );
}

function TablaRetenciones({ filas }) {
    if (!filas.length) return <Center py={40}><Text c="dimmed">No hay retenciones en este periodo.</Text></Center>;
    return (
        <Table.ScrollContainer minWidth={1000} h={380}>
            <Table verticalSpacing={3} horizontalSpacing="xs" fz="xs" stickyHeader>
                <Table.Thead><Table.Tr>
                    <Table.Th>Nº</Table.Th><Table.Th>Fecha</Table.Th><Table.Th>RIF</Table.Th><Table.Th>Nombre o razón social</Table.Th><Table.Th>Comprobante</Table.Th><Table.Th>Nº control</Table.Th>
                    <Table.Th ta="right">Total</Table.Th><Table.Th ta="right">Base imponible</Table.Th><Table.Th ta="right">Exento</Table.Th><Table.Th ta="right">IVA</Table.Th><Table.Th>Doc. afectado</Table.Th><Table.Th ta="right">IVA retenido</Table.Th>
                </Table.Tr></Table.Thead>
                <Table.Tbody>
                    {filas.map((f) => (
                        <Table.Tr key={f.n}>
                            <Table.Td>{f.n}</Table.Td><Table.Td>{fmtFecha(f.fecha)}</Table.Td><Table.Td>{f.rif}</Table.Td><Table.Td>{f.nombre}</Table.Td><Table.Td>{f.comprobante}</Table.Td><Table.Td>{f.control}</Table.Td>
                            <Table.Td ta="right">{dinero(f.totalVentas)}</Table.Td><Table.Td ta="right">{dinero(f.base)}</Table.Td><Table.Td ta="right">{dinero(f.exento)}</Table.Td><Table.Td ta="right">{dinero(f.iva)}</Table.Td>
                            <Table.Td>{f.facturaAfectada}</Table.Td><Table.Td ta="right" fw={700}>{dinero(f.ivaRetenido)}</Table.Td>
                        </Table.Tr>
                    ))}
                </Table.Tbody>
                <Table.Tfoot><Table.Tr><Table.Td colSpan={11} ta="right" fw={800}>TOTAL IVA RETENIDO</Table.Td><Table.Td ta="right" fw={800}>{dinero(filas.reduce((a, f) => a + f.ivaRetenido, 0))}</Table.Td></Table.Tr></Table.Tfoot>
            </Table>
        </Table.ScrollContainer>
    );
}

// Cierre de periodo: libros de compras y ventas en formato declarativo, retenciones de IVA y resumen del IVA
export default function CierreTab() {
    const { nombre } = useAuth();
    const [modo, setModo] = useState('mes');
    const [mes, setMes] = useState(dayjs().subtract(1, 'month').startOf('month').toDate()); // por defecto, el mes que se acaba de cerrar
    const [rango, setRango] = useState([dayjs().startOf('month').toDate(), new Date()]);
    const [generando, setGenerando] = useState(false);

    const consulta = modo === 'mes' ? (mes ? `mes=${dayjs(mes).format('YYYY-MM')}` : null) : (rango[0] && rango[1] ? `desde=${dayjs(rango[0]).format('YYYY-MM-DD')}&hasta=${dayjs(rango[1]).format('YYYY-MM-DD')}` : null);
    const { data, isLoading, error } = useQuery({ queryKey: ['libros', consulta], enabled: Boolean(consulta), queryFn: () => pedirJson(`/api/finanzas/libro?${consulta}`) });

    const pdf = async (tipo) => {
        setGenerando(true);
        try { await descargarPdfLibro(tipo, data, nombre); } catch (e) { notifications.show({ color: 'red', title: 'No se pudo generar el PDF', message: e.message }); } finally { setGenerando(false); }
    };

    const iva = data?.iva;
    return (
        <Stack gap="lg">
            <Group justify="space-between" align="flex-end" wrap="wrap">
                <Box>
                    <Title order={4} c="white">Libros de compras y ventas</Title>
                    <Text size="sm" c="gray.4">Libros declarativos con retenciones de IVA, para el cierre del periodo y tu contador.</Text>
                </Box>
                <Group gap="sm">
                    <SegmentedControl color="navy.9" value={modo} onChange={setModo} data={[{ value: 'mes', label: 'Mes' }, { value: 'rango', label: 'Rango' }]} />
                    {modo === 'mes'
                        ? <MonthPickerInput value={mes} onChange={setMes} valueFormat="MMMM YYYY" maxDate={new Date()} w={190} aria-label="Mes del cierre" />
                        : <DatePickerInput type="range" value={rango} onChange={setRango} valueFormat="DD/MM/YYYY" maxDate={new Date()} w={260} aria-label="Rango de fechas" />}
                </Group>
            </Group>

            <Alert color="orange" variant="white" icon={<IconInfoCircle size={18} />} title="Revisa el formato con tu contador">
                {data?.aviso || 'Este formato no está verificado contra la providencia vigente del SENIAT.'}
            </Alert>
            {error && <Alert color="red" icon={<IconAlertTriangle size={18} />}>{error.message}</Alert>}

            <SimpleGrid cols={{ base: 1, xs: 2, lg: 5 }} spacing="md">
                {isLoading || !data ? [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} h={86} radius="lg" />) : <>
                    <Dato titulo="Débito fiscal (ventas)" valor={iva.debitoFiscal} detalle={`${data.ventas.resumen.totalTransacciones - data.ventas.resumen.totalRetenciones.cant} factura(s)`} />
                    <Dato titulo="Crédito fiscal (compras)" valor={iva.creditoFiscal} detalle={`${data.compras.resumen.totalTransacciones - data.compras.resumen.totalRetenciones.cant} factura(s)`} />
                    <Dato titulo="IVA que te retuvieron" valor={iva.ivaRetenidoPorClientes} color="teal.7" detalle="Clientes (a tu favor)" />
                    <Dato titulo="IVA que retuviste" valor={iva.ivaRetenidoAProveedores} color="orange.7" detalle="A proveedores (por enterar al SENIAT)" />
                    <Dato titulo={iva.resultado >= 0 ? 'IVA por pagar' : 'Crédito a favor'} valor={Math.abs(iva.resultado)} color={iva.resultado >= 0 ? 'red.7' : 'teal.7'} detalle="Débito - crédito - retenciones recibidas" />
                </>}
            </SimpleGrid>

            <Paper withBorder radius="lg" p="md" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
                {isLoading || !data ? <Skeleton h={320} /> : (
                    <Tabs defaultValue="compras" keepMounted={false}>
                        <Tabs.List mb="sm" style={{ flexWrap: 'wrap' }}>
                            <Tabs.Tab value="compras" leftSection={<IconBook2 size={16} />}>Compras <Badge ml={6} size="sm" variant="light">{data.compras.filas.length}</Badge></Tabs.Tab>
                            <Tabs.Tab value="ventas" leftSection={<IconBook2 size={16} />}>Ventas <Badge ml={6} size="sm" variant="light">{data.ventas.filas.length}</Badge></Tabs.Tab>
                            <Tabs.Tab value="ret-clientes" leftSection={<IconReceiptTax size={16} />}>Retenciones de clientes <Badge ml={6} size="sm" variant="light" color="teal">{data.ventas.retencionesDetalle.length}</Badge></Tabs.Tab>
                            <Tabs.Tab value="ret-proveedores" leftSection={<IconReceiptTax size={16} />}>Retenciones a proveedores <Badge ml={6} size="sm" variant="light" color="orange">{data.compras.retencionesDetalle.length}</Badge></Tabs.Tab>
                        </Tabs.List>

                        {['compras', 'ventas'].map((tipo) => (
                            <Tabs.Panel key={tipo} value={tipo}>
                                <Group justify="space-between" mb="xs" wrap="wrap">
                                    <Text size="sm" fw={700}>{TIPOS[tipo].titulo} · {fmtFecha(data.desde)} al {fmtFecha(data.hasta)}</Text>
                                    <Group gap="xs">
                                        <Button size="xs" color="accent.6" leftSection={<IconFileTypePdf size={14} />} loading={generando} onClick={() => pdf(tipo)}>Descargar PDF</Button>
                                        <Button size="xs" variant="light" leftSection={<IconDownload size={14} />} onClick={() => descargarCsvLibro(tipo, data)} disabled={!data[tipo].filas.length}>CSV (Excel)</Button>
                                    </Group>
                                </Group>
                                {tipo === 'ventas' && data.ventas.noFiscales?.cant > 0 && (
                                    <Alert color="gray" variant="light" mb="xs" p="xs">{data.ventas.noFiscales.cant} documento(s) que no son factura (notas de entrega o ventas rápidas, Bs {dinero(data.ventas.noFiscales.total)}) no van en el libro de ventas.</Alert>
                                )}
                                <TablaLibro tipo={tipo} libro={data[tipo]} />
                            </Tabs.Panel>
                        ))}
                        {[['ret-clientes', 'ventas', 'Retenciones de IVA que te hicieron tus clientes'], ['ret-proveedores', 'compras', 'Retenciones de IVA que practicaste a tus proveedores']].map(([valor, tipo, titulo]) => (
                            <Tabs.Panel key={valor} value={valor}>
                                <Group justify="space-between" mb="xs" wrap="wrap">
                                    <Text size="sm" fw={700}>{titulo}</Text>
                                    <Button size="xs" variant="light" leftSection={<IconDownload size={14} />} onClick={() => descargarCsvRetenciones(tipo, data)} disabled={!data[tipo].retencionesDetalle.length}>CSV (Excel)</Button>
                                </Group>
                                <TablaRetenciones filas={data[tipo].retencionesDetalle} />
                            </Tabs.Panel>
                        ))}
                    </Tabs>
                )}
            </Paper>
        </Stack>
    );
}
