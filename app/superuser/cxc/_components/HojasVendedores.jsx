'use client';

import React, { useMemo, useState } from 'react';
import { ActionIcon, Alert, Badge, Button, Center, Checkbox, Group, Loader, Modal, NumberInput, Paper, ScrollArea, SegmentedControl, SimpleGrid, Stack, Table, Text, TextInput, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { IconPlus, IconTrash, IconUserPlus } from '@tabler/icons-react';
import CeldaEditable from './CeldaEditable';

const nf = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = (v) => (v === null || v === undefined ? '' : nf.format(Number(v) || 0));
const fmtFecha = (v) => (v ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(2, 4)}` : '');
const ESTATUS = [{ value: 'PENDIENTE', label: 'PENDIENTE' }, { value: 'PAGADA', label: 'PAGADA' }];
const CONCEPTOS = [{ value: 'FACTURA', label: 'FACTURA' }, { value: 'ABONO', label: 'ABONO' }, { value: 'NOTA', label: 'N/C' }];

async function pedir(url, opciones) {
    const res = await fetch(url, opciones);
    const cuerpo = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(cuerpo.error || 'No se pudo completar');
    return cuerpo;
}
const enviar = (url, metodo, body) => pedir(url, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });

// La hoja de cada vendedor a comisión, como la lleva la administradora: sus facturas con el monto a comisionar sin IVA, el %, la comisión,
// cómo va el cobro del cliente y si la comisión ya se pagó. Todo se edita en la celda; la comisión se recalcula con la base y el %.
export default function HojasVendedores() {
    const queryClient = useQueryClient();
    const { data, isLoading, error } = useQuery({ queryKey: ['comisiones'], queryFn: () => pedir('/api/comisiones'), refetchOnWindowFocus: true });
    const [elegido, setElegido] = useState(null);
    const [filtro, setFiltro] = useState('pendientes');
    const [sel, setSel] = useState(() => new Set());
    const [modalVendedor, setModalVendedor] = useState(false);
    const [nuevo, setNuevo] = useState({ nombre: '', porcentaje: 5 });
    const [linea, setLinea] = useState({ documento: '', cliente: '', montoUsd: '', baseUsd: '', concepto: 'FACTURA' });

    const refrescar = () => queryClient.invalidateQueries({ queryKey: ['comisiones'] });
    const avisar = (e) => { notifications.show({ color: 'red', title: 'No se guardó', message: e.message }); throw e; };
    const vendedores = data?.vendedores || [];
    const actual = vendedores.find((v) => v.id === elegido) || vendedores[0] || null;

    const lineas = useMemo(() => (actual?.lineas || []).filter((l) => filtro === 'todas' || (filtro === 'pendientes' ? l.estatusComision !== 'PAGADA' : l.estatusComision === 'PAGADA')), [actual, filtro]);
    const editar = (l, campos) => enviar(`/api/comisiones/${l.id}`, 'PATCH', campos).then(refrescar).catch(avisar);

    const marcar = async (estatus) => {
        try { await Promise.all([...sel].map((id) => enviar(`/api/comisiones/${id}`, 'PATCH', { estatusComision: estatus }))); setSel(new Set()); refrescar(); notifications.show({ color: 'teal', message: `${sel.size} comisión(es) marcadas ${estatus === 'PAGADA' ? 'pagadas' : 'pendientes'}` }); }
        catch (e) { notifications.show({ color: 'red', message: e.message }); }
    };
    const agregar = async () => {
        try {
            const r = await enviar('/api/comisiones', 'POST', { vendedorId: actual.id, ...linea, montoUsd: linea.montoUsd === '' ? null : linea.montoUsd, baseUsd: linea.baseUsd === '' ? null : linea.baseUsd, fecha: new Date().toISOString().slice(0, 10) });
            setLinea({ documento: '', cliente: '', montoUsd: '', baseUsd: '', concepto: 'FACTURA' }); refrescar();
            notifications.show({ color: r.enlazada ? 'teal' : 'yellow', message: r.enlazada ? 'Línea agregada y enlazada con su factura' : 'Línea agregada (no se encontró esa factura en el sistema: queda sin enlazar)' });
        } catch (e) { notifications.show({ color: 'red', message: e.message }); }
    };
    const crearVendedor = async () => {
        try { const r = await enviar('/api/comisiones/vendedores', 'POST', nuevo); setModalVendedor(false); setNuevo({ nombre: '', porcentaje: 5 }); setElegido(r.vendedor.id); refrescar(); }
        catch (e) { notifications.show({ color: 'red', message: e.message }); }
    };

    if (isLoading) return <Center py={60}><Loader /></Center>;
    if (error) return <Alert color="red">{error.message}</Alert>;
    return (
        <Stack gap="md">
            <Group justify="space-between" wrap="wrap">
                <SegmentedControl color="navy.9" value={String(actual?.id ?? '')} onChange={(v) => { setElegido(Number(v)); setSel(new Set()); }} data={vendedores.map((v) => ({ value: String(v.id), label: v.nombre }))} />
                <Button size="sm" variant="light" leftSection={<IconUserPlus size={16} />} onClick={() => setModalVendedor(true)}>Nuevo vendedor</Button>
            </Group>
            {!actual ? <Alert color="blue">Todavía no hay vendedores a comisión. Crea el primero con «Nuevo vendedor».</Alert> : (
                <>
                    <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm">
                        <Paper withBorder p="sm" radius="md"><Text size="xs" c="dimmed" fw={700} tt="uppercase">Comisión pendiente</Text><Text fz={22} fw={800} c="orange.7">${usd(actual.resumen.comisionPendiente)}</Text></Paper>
                        <Paper withBorder p="sm" radius="md"><Text size="xs" c="dimmed" fw={700} tt="uppercase">Comisión pagada</Text><Text fz={22} fw={800} c="teal.7">${usd(actual.resumen.comisionPagada)}</Text></Paper>
                        <Paper withBorder p="sm" radius="md"><Text size="xs" c="dimmed" fw={700} tt="uppercase">% por defecto</Text>
                            <CeldaEditable tipo="numero" valor={actual.porcentaje} formato={(v) => `${v}%`} negrita onGuardar={(v) => enviar('/api/comisiones/vendedores', 'PATCH', { id: actual.id, porcentaje: v }).then(refrescar).catch(avisar)} /></Paper>
                        <Paper withBorder p="sm" radius="md"><Text size="xs" c="dimmed" fw={700} tt="uppercase">Líneas</Text><Text fz={22} fw={800}>{actual.resumen.lineas}</Text></Paper>
                    </SimpleGrid>

                    <Group gap="sm" wrap="wrap" justify="space-between">
                        <SegmentedControl size="xs" value={filtro} onChange={setFiltro} data={[{ value: 'pendientes', label: 'Comisión pendiente' }, { value: 'pagadas', label: 'Pagadas' }, { value: 'todas', label: 'Todas' }]} />
                        <Group gap="xs">
                            <Text size="xs" c="dimmed">{sel.size} seleccionada(s)</Text>
                            <Button size="compact-sm" color="teal" disabled={!sel.size} onClick={() => marcar('PAGADA')}>Marcar pagadas</Button>
                            <Button size="compact-sm" variant="default" disabled={!sel.size} onClick={() => marcar('PENDIENTE')}>Marcar pendientes</Button>
                        </Group>
                    </Group>

                    <ScrollArea h="62vh" type="auto" offsetScrollbars>
                        <Table withColumnBorders withTableBorder verticalSpacing={0} horizontalSpacing={4} fz="sm" stickyHeader miw={1300} style={{ background: '#fff', color: '#1a1b1e' }}>
                            <Table.Thead style={{ background: '#e9ecef' }}>
                                <Table.Tr>
                                    <Table.Th w={30} /><Table.Th w={70}>Concepto</Table.Th><Table.Th w={100}>Fecha</Table.Th><Table.Th w={100}>Vence</Table.Th><Table.Th w={110}>Factura</Table.Th><Table.Th>Cliente</Table.Th>
                                    <Table.Th ta="right" w={95}>Monto USD</Table.Th><Table.Th ta="right" w={105}>A comisionar sin IVA</Table.Th><Table.Th ta="right" w={60}>%</Table.Th><Table.Th ta="right" w={90}>Comisión</Table.Th>
                                    <Table.Th w={150}>Estatus cliente</Table.Th><Table.Th w={110}>Comisión</Table.Th><Table.Th w={100}>Pagada el</Table.Th><Table.Th>Observación</Table.Th><Table.Th w={34} />
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {!lineas.length && <Table.Tr><Table.Td colSpan={15}><Text ta="center" c="dimmed" py="lg">No hay líneas con ese filtro.</Text></Table.Td></Table.Tr>}
                                {lineas.map((l) => (
                                    <Table.Tr key={l.id} style={{ background: l.estatusComision === 'PAGADA' ? '#f1f3f5' : '#fff' }}>
                                        <Table.Td ta="center"><Checkbox size="xs" checked={sel.has(l.id)} onChange={(e) => setSel((s) => { const n = new Set(s); if (e.currentTarget.checked) n.add(l.id); else n.delete(l.id); return n; })} aria-label="Seleccionar" /></Table.Td>
                                        <Table.Td><CeldaEditable tipo="opciones" opciones={CONCEPTOS} valor={l.concepto} formato={(v) => (v === 'NOTA' ? 'N/C' : v)} onGuardar={(v) => editar(l, { concepto: v })} /></Table.Td>
                                        <Table.Td><CeldaEditable tipo="fecha" valor={l.fecha} formato={fmtFecha} onGuardar={(v) => editar(l, { fecha: v })} /></Table.Td>
                                        <Table.Td><CeldaEditable tipo="fecha" valor={l.vencimiento} formato={fmtFecha} onGuardar={(v) => editar(l, { vencimiento: v })} /></Table.Td>
                                        <Table.Td>
                                            <CeldaEditable valor={l.documentoTexto} onGuardar={(v) => editar(l, { documentoTexto: v })} formato={(v) => <>{v}{l.ventaId ? '' : <Tooltip label="No está enlazada con una factura del sistema"><Badge ml={4} size="xs" color="yellow" variant="light">sin enlazar</Badge></Tooltip>}</>} />
                                        </Table.Td>
                                        <Table.Td><CeldaEditable valor={l.clienteTexto} onGuardar={(v) => editar(l, { clienteTexto: v })} /></Table.Td>
                                        <Table.Td><CeldaEditable tipo="numero" valor={l.montoUsd} align="right" formato={usd} onGuardar={(v) => editar(l, { montoUsd: v })} color={l.montoUsd < 0 ? '#e8590c' : undefined} /></Table.Td>
                                        <Table.Td><CeldaEditable tipo="numero" valor={l.baseUsd} align="right" formato={usd} onGuardar={(v) => editar(l, { baseUsd: v })} /></Table.Td>
                                        <Table.Td><CeldaEditable tipo="numero" valor={l.porcentaje} align="right" formato={(v) => (v === null ? '' : `${v}%`)} onGuardar={(v) => editar(l, { porcentaje: v })} /></Table.Td>
                                        <Table.Td><CeldaEditable tipo="numero" valor={l.comisionUsd} align="right" formato={usd} negrita onGuardar={(v) => editar(l, { comisionUsd: v })} /></Table.Td>
                                        <Table.Td><CeldaEditable valor={l.estatusCliente} placeholder="Estatus del cliente" onGuardar={(v) => editar(l, { estatusCliente: v })} /></Table.Td>
                                        <Table.Td><CeldaEditable tipo="opciones" opciones={ESTATUS} valor={l.estatusComision} negrita color={l.estatusComision === 'PAGADA' ? '#2b8a3e' : '#e8590c'} onGuardar={(v) => editar(l, { estatusComision: v })} /></Table.Td>
                                        <Table.Td><CeldaEditable tipo="fecha" valor={l.fechaPagoComision} formato={fmtFecha} onGuardar={(v) => editar(l, { fechaPagoComision: v })} /></Table.Td>
                                        <Table.Td><CeldaEditable valor={l.observacion} placeholder="Observación" onGuardar={(v) => editar(l, { observacion: v })} /></Table.Td>
                                        <Table.Td ta="center"><ActionIcon variant="subtle" color="red" size="sm" aria-label="Borrar línea" onClick={() => { if (window.confirm('¿Borrar esta línea de la hoja del vendedor?')) enviar(`/api/comisiones/${l.id}`, 'DELETE').then(refrescar).catch((e) => notifications.show({ color: 'red', message: e.message })); }}><IconTrash size={14} /></ActionIcon></Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </ScrollArea>

                    <Paper withBorder radius="md" p="sm">
                        <Text size="xs" fw={700} c="dimmed" mb={6}>Agregar una línea a la hoja de {actual.nombre}</Text>
                        <Group gap="xs" align="flex-end" wrap="wrap">
                            <TextInput size="xs" label="Factura / nota" placeholder="146870 o 0000-6611" w={150} value={linea.documento} onChange={(e) => setLinea({ ...linea, documento: e.currentTarget.value })} />
                            <TextInput size="xs" label="Cliente" w={220} value={linea.cliente} onChange={(e) => setLinea({ ...linea, cliente: e.currentTarget.value })} />
                            <NumberInput size="xs" label="Monto USD" w={110} decimalScale={2} value={linea.montoUsd} onChange={(v) => setLinea({ ...linea, montoUsd: v })} />
                            <NumberInput size="xs" label="A comisionar sin IVA" w={140} decimalScale={2} value={linea.baseUsd} onChange={(v) => setLinea({ ...linea, baseUsd: v })} />
                            <Button size="xs" leftSection={<IconPlus size={14} />} disabled={!linea.documento.trim() && !linea.cliente.trim()} onClick={agregar}>Agregar</Button>
                        </Group>
                    </Paper>
                </>
            )}

            <Modal opened={modalVendedor} onClose={() => setModalVendedor(false)} centered title={<Text fw={800}>Nuevo vendedor a comisión</Text>}>
                <Stack gap="sm">
                    <Text size="xs" c="dimmed">No forma parte de la nómina ni tiene acceso al sistema: solo se le lleva su hoja de comisiones.</Text>
                    <TextInput label="Nombre" value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.currentTarget.value })} data-autofocus />
                    <NumberInput label="% de comisión por defecto" min={0} max={100} decimalScale={2} value={nuevo.porcentaje} onChange={(v) => setNuevo({ ...nuevo, porcentaje: v })} />
                    <Group justify="flex-end"><Button variant="default" onClick={() => setModalVendedor(false)}>Cancelar</Button><Button disabled={nuevo.nombre.trim().length < 2} onClick={crearVendedor}>Crear vendedor</Button></Group>
                </Stack>
            </Modal>
        </Stack>
    );
}
