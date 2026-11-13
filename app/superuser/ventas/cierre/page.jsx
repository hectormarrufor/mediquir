'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Badge, Box, Button, Card, Group, Loader, NumberInput, Paper, SimpleGrid, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { IconArrowLeft, IconPencil, IconPlus, IconPrinter, IconRestore, IconTrash } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { fechaCaracas } from '@/app/constants/hora';
import { abrirCierrePdf } from './_lib/cierreCajaPdf';

const nf = (v) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);
const fechaLarga = (f) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : '');
const DOC = { FACTURA: 'Factura', NOTA_DEBITO: 'N. débito' };
const COLOR_ESTADO = { Pag: 'teal', Abo: 'orange', Pen: 'gray' };
const esDolares = (metodo) => /\(\$\)|zelle/i.test(metodo);

async function pedir(url) {
    const res = await fetch(url);
    const cuerpo = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(cuerpo.error || 'No se pudo cargar');
    return cuerpo;
}

function Cifra({ titulo, valor, color }) {
    return (
        <Card withBorder radius="lg" p="sm">
            <Text size="xs" c="dimmed" fw={700} tt="uppercase">{titulo}</Text>
            <Text fz={22} fw={800} c={color || 'navy.9'} style={{ whiteSpace: 'nowrap' }}>{valor}</Text>
        </Card>
    );
}

export default function CierreCajaPage() {
    const router = useRouter();
    const [fecha, setFecha] = useState(fechaCaracas());
    const { data, isLoading, error } = useQuery({
        queryKey: ['ventas-cierre', fecha],
        queryFn: () => pedir(`/api/ventas/cierre?fecha=${fecha}`),
        enabled: /^\d{4}-\d{2}-\d{2}$/.test(fecha),
    });
    const t = data?.totales;
    // Montos de cada metodo de pago corregibles antes de cerrar (otro sistema de facturacion puede traer ventas que aqui no se asentaron).
    // Solo viven en esta pantalla y en el PDF: no cambian los cobros registrados.
    const [editando, setEditando] = useState(false);
    const [ajustes, setAjustes] = useState({});   // metodo -> monto en la moneda del metodo ($ o Bs)
    const [extras, setExtras] = useState([]);     // metodos que no estaban: { metodo, monto, bs }
    useEffect(() => { setEditando(false); setAjustes({}); setExtras([]); }, [fecha]);
    const cobros = useMemo(() => {
        if (!data) return [];
        const base = data.cobros.map((c) => {
            const v = ajustes[c.metodo];
            if (v === undefined || v === '' || v === null) return c;
            if (esDolares(c.metodo)) { const tasa = c.montoUsd > 0 ? c.montoBs / c.montoUsd : 0; return { ...c, montoUsd: Number(v), montoBs: Math.round(Number(v) * tasa * 100) / 100, modificado: true }; }
            return { ...c, montoBs: Number(v), modificado: true };
        });
        const nuevos = extras.filter((e) => e.metodo.trim() && Number(e.monto) > 0).map((e) => (esDolares(e.metodo)
            ? { metodo: e.metodo.trim(), cobros: 0, montoUsd: Number(e.monto), montoBs: Number(e.bs) || 0, modificado: true }
            : { metodo: e.metodo.trim(), cobros: 0, montoUsd: 0, montoBs: Number(e.monto), modificado: true }));
        return [...base, ...nuevos];
    }, [data, ajustes, extras]);
    const totalCobradoBs = Math.round(cobros.reduce((s, c) => s + c.montoBs, 0) * 100) / 100;
    const modificado = Object.keys(ajustes).length > 0 || extras.length > 0;
    const dataFinal = data ? { ...data, cobros, totalCobradoBs } : data;
    const [generando, setGenerando] = useState(false);
    const imprimir = async () => {
        setGenerando(true);
        try { await abrirCierrePdf(dataFinal); }
        catch (e) { notifications.show({ message: e.message || 'No se pudo generar el PDF', color: 'red' }); }
        finally { setGenerando(false); }
    };

    return (
        <Box p={{ base: 'sm', sm: 'lg' }} maw={1200} mx="auto">
            <Group justify="space-between" mb="md" wrap="wrap">
                <Group gap="sm">
                    <Button variant="subtle" color="gray.2" leftSection={<IconArrowLeft size={18} />} onClick={() => router.push('/superuser/ventas')}>Ventas</Button>
                    <Title order={2} c="white">Cierre de caja</Title>
                </Group>
                <Group gap="sm" align="flex-end">
                    <TextInput type="date" label="Día" styles={{ label: { color: 'white' } }} value={fecha} max={fechaCaracas()} onChange={(e) => e.currentTarget.value && setFecha(e.currentTarget.value)} />
                    <Button variant="light" leftSection={<IconPrinter size={18} />} loading={generando} disabled={!data} onClick={imprimir}>PDF / Imprimir</Button>
                </Group>
            </Group>

            {error && <Alert color="red" mb="md">{error.message}</Alert>}
            {isLoading && <Group justify="center" py="xl"><Loader /></Group>}

            {data && (
                <Stack gap="lg">
                    <SimpleGrid cols={{ base: 2, md: 4 }}>
                        <Cifra titulo="Vendido (Bs)" valor={nf(t.facturas)} />
                        <Cifra titulo="A crédito (Bs)" valor={nf(t.credito)} />
                        <Cifra titulo="Devoluciones (Bs)" valor={nf(t.devoluciones)} color="red.7" />
                        <Cifra titulo="Cobrado hoy (Bs)" valor={nf(totalCobradoBs)} color="teal.7" />
                    </SimpleGrid>

                    <Paper withBorder radius="lg" p="md">
                        <Title order={4} c="navy.9">Recibo de caja · {fechaLarga(data.fecha)}</Title>
                        <Text size="sm" c="dimmed" mb="sm">Lo cobrado ese día por cada método de pago (ventas de contado y abonos de cobranza).</Text>
                        <Group gap="xs" mb="xs">
                            <Button size="xs" variant={editando ? 'filled' : 'light'} leftSection={<IconPencil size={14} />} onClick={() => setEditando((e) => !e)}>{editando ? 'Listo' : 'Modificar montos'}</Button>
                            {modificado && <Button size="xs" variant="subtle" color="gray" leftSection={<IconRestore size={14} />} onClick={() => { setAjustes({}); setExtras([]); }}>Restablecer</Button>}
                            {modificado && <Badge color="orange" variant="light">Montos modificados · el PDF sale con estos</Badge>}
                        </Group>
                        {cobros.length === 0 && !editando ? <Text c="gray.5">No hubo cobros este día.</Text> : (
                            <Table>
                                <Table.Thead><Table.Tr><Table.Th>Método de pago</Table.Th><Table.Th ta="right">Cobros</Table.Th><Table.Th ta="right">Monto</Table.Th></Table.Tr></Table.Thead>
                                <Table.Tbody>
                                    {data.cobros.map((c) => {
                                        const usd = esDolares(c.metodo);
                                        const ajustado = cobros.find((x) => x.metodo === c.metodo);
                                        return (
                                            <Table.Tr key={c.metodo}>
                                                <Table.Td fw={600}>{c.metodo}{ajustado?.modificado && <Badge ml={6} size="xs" color="orange" variant="light">modificado</Badge>}</Table.Td>
                                                <Table.Td ta="right">{c.cobros}</Table.Td>
                                                <Table.Td ta="right">
                                                    {editando
                                                        ? <NumberInput size="xs" w={150} ml="auto" decimalScale={2} min={0} hideControls leftSection={usd ? '$' : 'Bs'} value={ajustes[c.metodo] ?? (usd ? c.montoUsd : c.montoBs)} onChange={(v) => setAjustes((a) => ({ ...a, [c.metodo]: v }))} />
                                                        : (usd ? `$ ${nf(ajustado.montoUsd)}` : `Bs ${nf(ajustado.montoBs)}`)}
                                                </Table.Td>
                                            </Table.Tr>
                                        );
                                    })}
                                    {extras.map((e, i) => (
                                        <Table.Tr key={`x${i}`}>
                                            <Table.Td>{editando ? <TextInput size="xs" placeholder="Método (ej. Efectivo ($))" value={e.metodo} onChange={(ev) => setExtras((xs) => xs.map((x, j) => (j === i ? { ...x, metodo: ev.currentTarget.value } : x)))} /> : e.metodo}</Table.Td>
                                            <Table.Td ta="right">—</Table.Td>
                                            <Table.Td ta="right">
                                                {editando ? (
                                                    <Group gap={4} justify="flex-end" wrap="nowrap">
                                                        <NumberInput size="xs" w={120} decimalScale={2} min={0} hideControls placeholder={esDolares(e.metodo) ? 'Monto $' : 'Monto Bs'} value={e.monto} onChange={(v) => setExtras((xs) => xs.map((x, j) => (j === i ? { ...x, monto: v } : x)))} />
                                                        {esDolares(e.metodo) && <NumberInput size="xs" w={120} decimalScale={2} min={0} hideControls placeholder="Equiv. Bs" value={e.bs} onChange={(v) => setExtras((xs) => xs.map((x, j) => (j === i ? { ...x, bs: v } : x)))} />}
                                                        <Button size="compact-xs" variant="subtle" color="red" onClick={() => setExtras((xs) => xs.filter((_, j) => j !== i))}><IconTrash size={14} /></Button>
                                                    </Group>
                                                ) : (esDolares(e.metodo) ? `$ ${nf(e.monto)}` : `Bs ${nf(e.monto)}`)}
                                            </Table.Td>
                                        </Table.Tr>
                                    ))}
                                    {editando && <Table.Tr><Table.Td colSpan={3}><Button size="compact-xs" variant="subtle" leftSection={<IconPlus size={14} />} onClick={() => setExtras((xs) => [...xs, { metodo: '', monto: '', bs: '' }])}>Agregar un método de pago</Button></Table.Td></Table.Tr>}
                                    <Table.Tr><Table.Td fw={800} colSpan={2}>Total (equivalente en Bs)</Table.Td><Table.Td ta="right" fw={800}>Bs {nf(totalCobradoBs)}</Table.Td></Table.Tr>
                                </Table.Tbody>
                            </Table>
                        )}
                    </Paper>

                    <Paper withBorder radius="lg" p="md">
                        <Title order={4} c="navy.9" mb="sm">Relación de facturas y devoluciones (Bs)</Title>
                        <Table.ScrollContainer minWidth={760}>
                            <Table striped verticalSpacing={4}>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>Documento</Table.Th><Table.Th>Est.</Table.Th><Table.Th>RIF</Table.Th><Table.Th>Cliente</Table.Th>
                                        <Table.Th>Condición</Table.Th><Table.Th ta="right">Total crédito</Table.Th><Table.Th ta="right">Total contado</Table.Th><Table.Th ta="right">Devolución</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {data.facturas.map((f) => (
                                        <Table.Tr key={f.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/superuser/ventas/${f.ventaId || f.id}`)}>
                                            <Table.Td><Text size="sm" fw={600}>{f.numero}</Text><Text size="xs" c="dimmed">{DOC[f.tipoDocumento]}</Text></Table.Td>
                                            <Table.Td>{f.estado && <Badge size="sm" variant="light" color={COLOR_ESTADO[f.estado]}>{f.estado}</Badge>}</Table.Td>
                                            <Table.Td>{f.rif}</Table.Td>
                                            <Table.Td>{f.cliente || '—'}</Table.Td>
                                            <Table.Td>{f.condicion === 'Credito' ? 'CRÉDITO' : 'CONTADO'}</Table.Td>
                                            <Table.Td ta="right">{f.condicion === 'Credito' ? nf(f.totalBs) : ''}</Table.Td>
                                            <Table.Td ta="right">{f.condicion !== 'Credito' ? nf(f.totalBs) : ''}</Table.Td>
                                            <Table.Td />
                                        </Table.Tr>
                                    ))}
                                    {data.devoluciones.map((d) => (
                                        <Table.Tr key={d.id} style={{ cursor: 'pointer' }} onClick={() => d.ventaId && router.push(`/superuser/ventas/${d.ventaId}`)}>
                                            <Table.Td><Text size="sm" fw={600}>{d.numero}</Text><Text size="xs" c="dimmed">N. crédito</Text></Table.Td>
                                            <Table.Td /><Table.Td>{d.rif}</Table.Td><Table.Td>{d.cliente || '—'}</Table.Td>
                                            <Table.Td /><Table.Td /><Table.Td />
                                            <Table.Td ta="right" c="red.7">{nf(d.totalBs)}</Table.Td>
                                        </Table.Tr>
                                    ))}
                                    {data.facturas.length + data.devoluciones.length === 0 && <Table.Tr><Table.Td colSpan={8} ta="center" c="gray.5">No hay documentos este día.</Table.Td></Table.Tr>}
                                    <Table.Tr>
                                        <Table.Td colSpan={5} fw={800}>TOTALES</Table.Td>
                                        <Table.Td ta="right" fw={800}>{nf(t.credito)}</Table.Td><Table.Td ta="right" fw={800}>{nf(t.contado)}</Table.Td><Table.Td ta="right" fw={800}>{nf(t.devoluciones)}</Table.Td>
                                    </Table.Tr>
                                </Table.Tbody>
                            </Table>
                        </Table.ScrollContainer>
                        <Stack gap={2} align="flex-end" mt="sm">
                            <Text fw={700}>Total devoluciones: Bs {nf(t.devoluciones)}</Text>
                            <Text fw={700}>Total facturas: Bs {nf(t.facturas)}</Text>
                        </Stack>
                    </Paper>
                </Stack>
            )}
        </Box>
    );
}
