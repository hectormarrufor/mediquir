'use client';

import React, { useState } from 'react';
import { Alert, Badge, Box, Button, Card, Center, Group, Paper, SimpleGrid, Skeleton, Stack, Table, Tabs, Text, ThemeIcon, Title } from '@mantine/core';
import { MonthPickerInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { IconAlertTriangle, IconBook2, IconDownload, IconFileTypePdf, IconInfoCircle } from '@tabler/icons-react';
import { LIBROS, descargarCsv, descargarPdfCierre, nombreMes } from '../_lib/libroExport';

const bs = (v) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);

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
            <Text fz={22} fw={800} c={color || 'navy.9'} lh={1.3}>Bs {valor}</Text>
            {detalle && <Text size="xs" c="dimmed">{detalle}</Text>}
        </Card>
    );
}

// Vista previa de un libro (los datos exactos que salen en el CSV y el PDF)
function TablaLibro({ clave, filas }) {
    const libro = LIBROS[clave];
    if (!filas.length) return <Center py={40}><Text c="dimmed">Sin operaciones en este mes.</Text></Center>;
    const valor = (c, f) => {
        if (c.vacia) return '';
        const v = f[c.clave];
        if (v === null || v === undefined) return '';
        if (c.f) return c.f(v);
        if (c.num) return bs(v);
        if (c.clave === 'alicuota') return v ? `${v}%` : '';
        return String(v);
    };
    return (
        <Table.ScrollContainer minWidth={1000} h={420}>
            <Table verticalSpacing={4} horizontalSpacing="xs" fz="xs" stickyHeader striped>
                <Table.Thead><Table.Tr>{libro.columnas.map((c) => <Table.Th key={c.clave} ta={c.num ? 'right' : 'left'} style={{ whiteSpace: 'nowrap' }}>{c.titulo}</Table.Th>)}</Table.Tr></Table.Thead>
                <Table.Tbody>
                    {filas.map((f, i) => <Table.Tr key={i}>{libro.columnas.map((c) => <Table.Td key={c.clave} ta={c.num ? 'right' : 'left'} c={c.vacia ? 'dimmed' : undefined}>{c.vacia ? '—' : valor(c, f)}</Table.Td>)}</Table.Tr>)}
                </Table.Tbody>
            </Table>
        </Table.ScrollContainer>
    );
}

// Cierre de mes: libros de ventas y compras, caja y resumen de IVA, para el contador
export default function CierreTab() {
    const [mes, setMes] = useState(dayjs().subtract(1, 'month').startOf('month').toDate()); // por defecto, el mes que se acaba de cerrar
    const clave = mes ? dayjs(mes).format('YYYY-MM') : null;
    const { data, isLoading, error } = useQuery({ queryKey: ['libro', clave], enabled: Boolean(clave), queryFn: () => pedirJson(`/api/finanzas/libro?mes=${clave}`) });
    const [generando, setGenerando] = useState(false);

    const pdf = async () => {
        setGenerando(true);
        try { await descargarPdfCierre(data); } catch (e) { notifications.show({ color: 'red', title: 'No se pudo generar el PDF', message: e.message }); } finally { setGenerando(false); }
    };

    return (
        <Stack gap="lg">
            <Group justify="space-between" align="flex-end" wrap="wrap">
                <Box>
                    <Title order={4} c="white">Cierre mensual</Title>
                    <Text size="sm" c="gray.4">Libros del mes para entregar al contador. Descárgalos en CSV (Excel) o en un PDF con todo el cierre.</Text>
                </Box>
                <Group gap="sm">
                    <MonthPickerInput value={mes} onChange={setMes} valueFormat="MMMM YYYY" maxDate={new Date()} w={190} aria-label="Mes del cierre" />
                    <Button color="accent.6" leftSection={<IconFileTypePdf size={18} />} onClick={pdf} loading={generando} disabled={!data}>Cierre en PDF</Button>
                </Group>
            </Group>

            <Alert color="orange" variant="light" icon={<IconInfoCircle size={18} />} title="Borrador para revisión del contador">
                {data?.aviso || 'Este cierre no se verificó contra la providencia vigente del SENIAT; el sistema no guarda número de control, factura afectada ni IVA retenido por el comprador.'}
            </Alert>
            {error && <Alert color="red" icon={<IconAlertTriangle size={18} />}>{error.message}</Alert>}

            <SimpleGrid cols={{ base: 1, xs: 2, lg: 4 }} spacing="md">
                {isLoading || !data ? [0, 1, 2, 3].map((i) => <Skeleton key={i} h={86} radius="lg" />) : <>
                    <Dato titulo="Débito fiscal (ventas)" valor={bs(data.iva.debitoFiscal)} detalle={`${data.ventas.length} documento(s)`} />
                    <Dato titulo="Crédito fiscal (compras)" valor={bs(data.iva.creditoFiscal)} detalle={`${data.compras.length} factura(s)`} />
                    <Dato titulo="IVA retenido en compras" valor={bs(data.iva.ivaRetenido)} />
                    <Dato titulo={data.iva.resultado >= 0 ? 'IVA por pagar del mes' : 'Crédito fiscal a favor'} valor={bs(Math.abs(data.iva.resultado))} color={data.iva.resultado >= 0 ? 'red.7' : 'teal.7'} detalle={`Ventas ${nombreMes(data.mes)}`} />
                </>}
            </SimpleGrid>

            <Paper withBorder radius="lg" p="md" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
                {isLoading || !data ? <Skeleton h={300} /> : (
                    <Tabs defaultValue="ventas" keepMounted={false}>
                        <Group justify="space-between" mb="sm" wrap="wrap">
                            <Tabs.List>
                                {Object.entries(LIBROS).map(([k, l]) => <Tabs.Tab key={k} value={k} leftSection={<IconBook2 size={16} />}>{l.titulo.replace('Libro de ', '')} <Badge ml={6} size="sm" variant="light">{data[k].length}</Badge></Tabs.Tab>)}
                            </Tabs.List>
                            {data.anuladas > 0 && <Badge color="gray" variant="light">{data.anuladas} documento(s) anulado(s) no incluidos</Badge>}
                        </Group>
                        {Object.keys(LIBROS).map((k) => (
                            <Tabs.Panel key={k} value={k}>
                                <Group justify="space-between" mb="xs">
                                    <Text size="sm" fw={700}>{LIBROS[k].titulo} · {nombreMes(data.mes)}</Text>
                                    <Button size="xs" variant="light" leftSection={<IconDownload size={14} />} onClick={() => descargarCsv(k, data)} disabled={!data[k].length}>Descargar CSV</Button>
                                </Group>
                                <TablaLibro clave={k} filas={data[k]} />
                            </Tabs.Panel>
                        ))}
                    </Tabs>
                )}
            </Paper>
        </Stack>
    );
}
