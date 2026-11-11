'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Box, Button, Card, Checkbox, Group, Loader, Paper, SegmentedControl, Select, SimpleGrid, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { IconArrowLeft, IconDownload, IconSearch } from '@tabler/icons-react';
import { useEsTelefono } from '@/app/components/ui/modalMovil';
import { normalizar } from '@/app/helpers/busquedaProductos';

const nf = (v, d = 2) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: d, maximumFractionDigits: d }).format(Number(v) || 0);
const iso = (f) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(f);
const hoy = () => new Date();

// Periodos: [desde, hasta] en la fecha de Caracas
function rango(periodo) {
    const h = hoy();
    const [a, m] = iso(h).split('-').map(Number);
    const primero = (ano, mes) => `${ano}-${String(mes).padStart(2, '0')}-01`;
    const ultimo = (ano, mes) => iso(new Date(Date.UTC(ano, mes, 0, 12)));
    switch (periodo) {
        case 'mes': return [primero(a, m), iso(h)];
        case 'mesPasado': return m === 1 ? [primero(a - 1, 12), ultimo(a - 1, 12)] : [primero(a, m - 1), ultimo(a, m - 1)];
        case 'tresMeses': { const d = new Date(Date.UTC(a, m - 3, 1, 12)); return [iso(d), iso(h)]; }
        case 'anoPasado': return [`${a - 1}-01-01`, `${a - 1}-12-31`];
        case 'todo': return ['2023-01-01', iso(h)];
        default: return [`${a}-01-01`, iso(h)];
    }
}
const PERIODOS = [
    { value: 'mes', label: 'Este mes' }, { value: 'mesPasado', label: 'Mes pasado' }, { value: 'tresMeses', label: 'Últimos 3 meses' },
    { value: 'ano', label: 'Este año' }, { value: 'anoPasado', label: 'Año pasado' }, { value: 'todo', label: 'Desde 2023' }, { value: 'otro', label: 'Otras fechas' },
];

// Lo vendido de cada producto en el periodo (facturas, notas de entrega y ventas rápidas no anuladas), en unidades y en dólares sin IVA
export default function VentasPorProductoPage() {
    const router = useRouter();
    const telefono = useEsTelefono();
    const [periodo, setPeriodo] = useState('ano');
    const [fechas, setFechas] = useState(rango('ano'));
    const [juntas, setJuntas] = useState(false);
    const [orden, setOrden] = useState('usd');
    const [busqueda, setBusqueda] = useState('');
    const [busquedaDiferida] = useDebouncedValue(busqueda, 200);
    const [limite, setLimite] = useState(200);
    const [desde, hasta] = periodo === 'otro' ? fechas : rango(periodo);

    const { data, isLoading, isFetching, error } = useQuery({
        queryKey: ['ventas-por-producto', desde, hasta, juntas],
        placeholderData: keepPreviousData,
        queryFn: async () => {
            const res = await fetch(`/api/inventario/ventas-por-producto?desde=${desde}&hasta=${hasta}${juntas ? '&marcas=juntas' : ''}`);
            const cuerpo = await res.json();
            if (!res.ok) throw new Error(cuerpo.error || 'No se pudo cargar');
            return cuerpo;
        },
    });
    const filas = useMemo(() => {
        const palabras = normalizar(busquedaDiferida).split(' ').filter(Boolean);
        const lista = (data?.filas || []).filter((f) => {
            if (!palabras.length) return true;
            const texto = normalizar(`${f.codigo} ${f.nombre} ${f.marca || ''}`);
            return palabras.every((p) => texto.includes(p));
        });
        return [...lista].sort((a, b) => (orden === 'unidades' ? b.neto - a.neto : b.usd - a.usd));
    }, [data, busquedaDiferida, orden]);

    const exportar = () => {
        const encabezado = ['Código', 'Producto', 'Marca', 'Unidades vendidas', 'Devueltas', 'Neto', 'Vendido USD sin IVA', 'Documentos'];
        const lineas = filas.map((f) => [f.codigo, f.nombre, f.marca || '', f.unidades, f.devueltas, f.neto, String(f.usd).replace('.', ','), f.documentos]);
        const csv = [encabezado, ...lineas].map((l) => l.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
        // Con la marca BOM al inicio Excel abre bien las tildes
        const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url; a.download = `ventas-por-producto_${desde}_${hasta}.csv`; a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <Box maw={1300} mx="auto" px={{ base: 'xs', sm: 'md' }} py="md">
            <Stack gap="md">
                <Group gap="sm">
                    <Button variant="subtle" color="gray.3" leftSection={<IconArrowLeft size={16} />} onClick={() => router.push('/superuser/inventario')}>Inventario</Button>
                    <Box>
                        <Title order={telefono ? 3 : 2} c="white">Ventas por producto</Title>
                        <Text size="sm" c="gray.4">Unidades y dólares (sin IVA) vendidos de cada producto, menos lo devuelto con notas de crédito.</Text>
                    </Box>
                </Group>

                <Paper withBorder radius="md" p="sm">
                    <SimpleGrid cols={{ base: 1, sm: periodo === 'otro' ? 4 : 2, md: periodo === 'otro' ? 5 : 3 }} spacing="sm">
                        <Select label="Periodo" data={PERIODOS} value={periodo} allowDeselect={false} onChange={(v) => { if (!v) return; setPeriodo(v); if (v !== 'otro') setFechas(rango(v)); setLimite(200); }} />
                        {periodo === 'otro' && <TextInput type="date" label="Desde" value={fechas[0]} max={fechas[1]} onChange={(e) => setFechas([e.currentTarget.value, fechas[1]])} />}
                        {periodo === 'otro' && <TextInput type="date" label="Hasta" value={fechas[1]} min={fechas[0]} max={iso(hoy())} onChange={(e) => setFechas([fechas[0], e.currentTarget.value])} />}
                        <TextInput label="Buscar" placeholder="Código, nombre o marca" leftSection={<IconSearch size={16} />} value={busqueda} onChange={(e) => setBusqueda(e.currentTarget.value)} />
                        <Stack gap={6} justify="flex-end">
                            <SegmentedControl size="xs" value={orden} onChange={setOrden} data={[{ value: 'usd', label: 'Por dólares' }, { value: 'unidades', label: 'Por unidades' }]} />
                            <Checkbox size="xs" label="Juntar las marcas de un mismo producto" checked={juntas} onChange={(e) => setJuntas(e.currentTarget.checked)} />
                        </Stack>
                    </SimpleGrid>
                </Paper>

                {isLoading ? <Group justify="center" py="xl"><Loader /></Group> : error ? <Alert color="red">{error.message}</Alert> : (
                    <>
                        <Group justify="space-between" wrap="wrap" gap="xs">
                            <Text c="white" size="sm">
                                <b>{data.totales.productos}</b> productos · <b>{nf(data.totales.unidades, 0)}</b> unidades · <b>${nf(data.totales.usd)}</b> sin IVA {isFetching && <Loader size="xs" ml={6} />}
                            </Text>
                            <Button size="xs" variant="light" leftSection={<IconDownload size={14} />} onClick={exportar} disabled={!filas.length}>Descargar (Excel)</Button>
                        </Group>
                        {data.sinProducto.usd > 0 && (
                            <Alert color="yellow" variant="light">
                                <Group justify="space-between" wrap="wrap" gap="xs">
                                    <Text size="sm">Además hay <b>${nf(data.sinProducto.usd)}</b> en {nf(data.sinProducto.renglones, 0)} renglones escritos a mano que todavía no cuentan para ningún producto.</Text>
                                    <Button size="xs" variant="white" onClick={() => router.push('/superuser/inventario/sin-producto')}>Enlazarlos</Button>
                                </Group>
                            </Alert>
                        )}
                        {telefono ? (
                            <Stack gap="xs">
                                {filas.slice(0, limite).map((f) => (
                                    <Card key={f.id} withBorder radius="md" p="sm">
                                        <Text size="sm" fw={700} lh={1.25}>{f.nombre}</Text>
                                        <Text size="xs" c="dimmed">{f.codigo}{f.marca ? ` · ${f.marca}` : ''}</Text>
                                        <Group justify="space-between" mt={4}>
                                            <Text size="sm">{nf(f.neto, 0)} und.{f.devueltas ? <Text span size="xs" c="dimmed"> ({f.devueltas} devueltas)</Text> : null}</Text>
                                            <Text size="sm" fw={700}>${nf(f.usd)}</Text>
                                        </Group>
                                    </Card>
                                ))}
                            </Stack>
                        ) : (
                            <Paper withBorder radius="md">
                                <Table striped highlightOnHover stickyHeader fz="sm" verticalSpacing={6}>
                                    <Table.Thead>
                                        <Table.Tr><Table.Th>Código</Table.Th><Table.Th>Producto</Table.Th><Table.Th>Marca</Table.Th><Table.Th ta="right">Vendidas</Table.Th><Table.Th ta="right">Devueltas</Table.Th><Table.Th ta="right">Neto</Table.Th><Table.Th ta="right">Vendido $</Table.Th><Table.Th ta="right">Documentos</Table.Th></Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {filas.slice(0, limite).map((f) => (
                                            <Table.Tr key={f.id}>
                                                <Table.Td style={{ whiteSpace: 'nowrap' }}>{f.codigo}</Table.Td>
                                                <Table.Td>{f.nombre}</Table.Td>
                                                <Table.Td c="dimmed">{f.marca}</Table.Td>
                                                <Table.Td ta="right">{nf(f.unidades, 0)}</Table.Td>
                                                <Table.Td ta="right" c={f.devueltas ? 'red.7' : 'dimmed'}>{nf(f.devueltas, 0)}</Table.Td>
                                                <Table.Td ta="right" fw={700}>{nf(f.neto, 0)}</Table.Td>
                                                <Table.Td ta="right" fw={700}>{nf(f.usd)}</Table.Td>
                                                <Table.Td ta="right" c="dimmed">{f.documentos}</Table.Td>
                                            </Table.Tr>
                                        ))}
                                    </Table.Tbody>
                                </Table>
                            </Paper>
                        )}
                        {filas.length > limite && <Button variant="light" onClick={() => setLimite((l) => l + 300)}>Ver más ({filas.length - limite} productos)</Button>}
                        {!filas.length && <Text c="gray.4" ta="center">No hay ventas de productos en este periodo.</Text>}
                    </>
                )}
            </Stack>
        </Box>
    );
}
