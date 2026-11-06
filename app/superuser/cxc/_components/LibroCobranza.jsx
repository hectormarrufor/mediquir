'use client';

import React, { useMemo, useState } from 'react';
import { ActionIcon, Alert, Badge, Box, Button, Center, Checkbox, Group, Loader, Modal, NumberInput, Paper, ScrollArea, SimpleGrid, Stack, Table, Text, TextInput, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IconChevronDown, IconChevronRight, IconCoin, IconDownload, IconSearch, IconTrash } from '@tabler/icons-react';
import CeldaEditable from './CeldaEditable';
import CambioDeudaModal from './CambioDeudaModal';

const nf = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = (v) => (v === null || v === undefined ? '' : nf.format(Number(v) || 0));
const fmtFecha = (v) => (v ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(2, 4)}` : '');

async function pedir(url, opciones) {
    const res = await fetch(url, opciones);
    const cuerpo = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(cuerpo.error || 'No se pudo completar');
    return cuerpo;
}
const enviar = (url, metodo, body) => pedir(url, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });

function Dato({ titulo, valor, color }) {
    return (
        <Paper withBorder radius="md" p="sm">
            <Text size="xs" c="dimmed" fw={700} tt="uppercase">{titulo}</Text>
            <Text fz={22} fw={800} c={color || 'navy.9'}>{valor}</Text>
        </Paper>
    );
}

// Las cuentas por cobrar como las lleva la administradora en Excel: una fila por documento, agrupadas por cliente, y cada celda se edita ahí mismo.
// El saldo no se sobrescribe: al cambiarlo se pide registrar el abono o el ajuste que lo explica. El monto del documento se corrige con su motivo.
export default function LibroCobranza() {
    const queryClient = useQueryClient();
    const [pagadas, setPagadas] = useState(false);
    const [soloVencidas, setSoloVencidas] = useState(false);
    const [busqueda, setBusqueda] = useState('');
    const [abiertas, setAbiertas] = useState(() => new Set()); // filas con sus abonos desplegados
    const [cambio, setCambio] = useState(null); // { cuenta, nuevoSaldo }
    const [montoModal, setMontoModal] = useState(null); // { cuenta, nuevo, motivo }

    const { data, isLoading, error } = useQuery({ queryKey: ['cxc-libro', pagadas], queryFn: () => pedir(`/api/finanzas/cxc/libro${pagadas ? '?pagadas=1' : ''}`), refetchOnWindowFocus: true });
    const refrescar = () => { queryClient.invalidateQueries({ queryKey: ['cxc-libro'] }); queryClient.invalidateQueries({ queryKey: ['cuentas'] }); };
    const avisar = (e) => { notifications.show({ color: 'red', title: 'No se guardó', message: e.message }); throw e; };

    const editar = (cuenta, campos) => enviar(`/api/finanzas/cxc/${cuenta.id}`, 'PATCH', campos).then(refrescar).catch(avisar);
    const editarAbono = (abono, campos) => enviar(`/api/finanzas/cxc/abonos/${abono.id}`, 'PUT', campos).then(refrescar).catch(avisar);
    const borrarAbono = useMutation({
        mutationFn: (abono) => enviar(`/api/finanzas/cxc/abonos/${abono.id}`, 'DELETE'),
        onSuccess: () => { notifications.show({ color: 'teal', message: 'Abono borrado: la deuda se recalculó' }); refrescar(); },
        onError: (e) => notifications.show({ color: 'red', message: e.message }),
    });

    const q = busqueda.trim().toLowerCase();
    const filas = useMemo(() => (data?.filas || []).filter((f) => (!soloVencidas || f.vencida) && (!q || [f.cliente, f.documento, f.rif, f.observacion, f.vendedor].some((x) => String(x || '').toLowerCase().includes(q)))), [data, soloVencidas, q]);
    const grupos = useMemo(() => {
        const m = new Map();
        for (const f of filas) (m.get(f.clienteId) || m.set(f.clienteId, { id: f.clienteId, nombre: f.cliente, filas: [] }).get(f.clienteId)).push(f);
        return [...m.values()];
    }, [filas]);

    const alternar = (id) => setAbiertas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    const descargar = () => {
        const lineas = [['Cliente', 'Documento', 'Emisión', 'Vence', 'Monto USD', 'Abonado', 'Saldo', 'Vendedor', 'Observación']];
        for (const f of filas) lineas.push([f.cliente, f.documento, f.emision, f.vence, f.monto, f.abonado, f.saldo, f.vendedor || '', f.observacion]);
        const csv = lineas.map((l) => l.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' })); a.download = `cuentas-por-cobrar-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    };

    if (isLoading) return <Center py={60}><Loader /></Center>;
    if (error) return <Alert color="red">{error.message}</Alert>;
    const r = data.resumen;
    return (
        <Stack gap="md">
            <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm">
                <Dato titulo="Por cobrar" valor={`$${usd(r.saldo)}`} />
                <Dato titulo="Vencido" valor={`$${usd(r.vencido)}`} color="red.7" />
                <Dato titulo="Documentos" valor={r.documentos} />
                <Dato titulo="Clientes" valor={r.clientes} />
            </SimpleGrid>

            <Paper withBorder radius="md" p="sm">
                <Group gap="sm" wrap="wrap" align="flex-end">
                    <TextInput flex="1 1 240px" placeholder="Buscar cliente, documento, RIF, vendedor u observación…" leftSection={<IconSearch size={16} />} value={busqueda} onChange={(e) => setBusqueda(e.currentTarget.value)} />
                    <Checkbox label="Solo vencidas" checked={soloVencidas} onChange={(e) => setSoloVencidas(e.currentTarget.checked)} />
                    <Checkbox label="Incluir pagadas" checked={pagadas} onChange={(e) => setPagadas(e.currentTarget.checked)} />
                    <Button variant="light" size="sm" leftSection={<IconDownload size={16} />} onClick={descargar}>Excel (CSV)</Button>
                </Group>
                <Text size="xs" c="dimmed" mt={6}>Haz clic en una celda para editarla (Enter guarda, Esc cancela). Cambiar el <b>saldo</b> abre el registro del abono o ajuste que lo explica; el <b>monto</b> del documento se corrige con su motivo. <b>▸</b> muestra los abonos de cada documento.</Text>
            </Paper>

            <ScrollArea h="68vh" type="auto" offsetScrollbars>
                <Table withColumnBorders withTableBorder verticalSpacing={0} horizontalSpacing={4} fz="sm" stickyHeader miw={1100} style={{ background: '#fff', color: '#1a1b1e' }}>
                    <Table.Thead style={{ background: '#e9ecef' }}>
                        <Table.Tr>
                            <Table.Th w={28} />
                            <Table.Th>Documento</Table.Th><Table.Th w={80}>Emisión</Table.Th><Table.Th w={110}>Vence</Table.Th>
                            <Table.Th ta="right" w={110}>Monto USD</Table.Th><Table.Th ta="right" w={100}>Abonado</Table.Th><Table.Th ta="right" w={110}>Saldo</Table.Th>
                            <Table.Th w={120}>Vendedor</Table.Th><Table.Th>Observación</Table.Th><Table.Th w={44} />
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {!grupos.length && <Table.Tr><Table.Td colSpan={10}><Text ta="center" c="dimmed" py="lg">No hay cuentas por cobrar con esos filtros.</Text></Table.Td></Table.Tr>}
                        {grupos.map((g) => {
                            const saldoCliente = g.filas.reduce((a, f) => a + f.saldo, 0);
                            return (
                                <React.Fragment key={g.id}>
                                    <Table.Tr style={{ background: '#dbe4ff' }}>
                                        <Table.Td colSpan={6}><Text fw={800} size="sm" pl={6}>{g.nombre} <Text span size="xs" c="dimmed" fw={500}>· {g.filas.length} documento(s)</Text></Text></Table.Td>
                                        <Table.Td ta="right"><Text fw={800} size="sm" pr={6}>{usd(saldoCliente)}</Text></Table.Td>
                                        <Table.Td colSpan={3} />
                                    </Table.Tr>
                                    {g.filas.map((f) => (
                                        <React.Fragment key={f.id}>
                                            <Table.Tr style={{ background: f.saldo <= 0.005 ? '#f1f3f5' : f.vencida ? '#fff5f5' : '#fff' }}>
                                                <Table.Td ta="center">
                                                    <ActionIcon variant="subtle" size="sm" color="gray" onClick={() => alternar(f.id)} aria-label="Ver abonos">{abiertas.has(f.id) ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}</ActionIcon>
                                                </Table.Td>
                                                <Table.Td><Text size="sm" fw={600} px={6}>{f.documento}{f.vencida && <Badge ml={6} size="xs" color="red" variant="light">Vencida</Badge>}{f.saldo <= 0.005 && <Badge ml={6} size="xs" color="teal" variant="light">Pagada</Badge>}</Text></Table.Td>
                                                <Table.Td><Text size="xs" px={6}>{fmtFecha(f.emision)}</Text></Table.Td>
                                                <Table.Td><CeldaEditable tipo="fecha" valor={f.vence} formato={fmtFecha} onGuardar={(v) => editar(f, { fechaVencimiento: v })} color={f.vencida ? '#c92a2a' : undefined} /></Table.Td>
                                                <Table.Td><CeldaEditable tipo="numero" valor={f.monto} align="right" formato={usd} onGuardar={(v) => { setMontoModal({ cuenta: f, nuevo: v, motivo: '' }); return Promise.resolve(); }} /></Table.Td>
                                                <Table.Td><Text size="sm" ta="right" px={6} c="dimmed">{usd(f.abonado)}</Text></Table.Td>
                                                <Table.Td><CeldaEditable tipo="numero" valor={f.saldo} align="right" formato={usd} negrita onGuardar={(v) => { setCambio({ cuenta: f, nuevoSaldo: v }); return Promise.resolve(); }} /></Table.Td>
                                                <Table.Td><Text size="xs" px={6} lineClamp={1}>{f.vendedor || ''}</Text></Table.Td>
                                                <Table.Td><CeldaEditable valor={f.observacion} placeholder="Observación" onGuardar={(v) => editar(f, { observacion: v })} /></Table.Td>
                                                <Table.Td ta="center">
                                                    <Tooltip label="Registrar abono"><ActionIcon variant="light" color="teal" size="sm" onClick={() => setCambio({ cuenta: f, nuevoSaldo: null })} aria-label="Registrar abono"><IconCoin size={14} /></ActionIcon></Tooltip>
                                                </Table.Td>
                                            </Table.Tr>
                                            {abiertas.has(f.id) && (
                                                <Table.Tr style={{ background: '#f8f9fa' }}>
                                                    <Table.Td />
                                                    <Table.Td colSpan={9}>
                                                        {f.abonos.length === 0 ? <Text size="xs" c="dimmed" py={6}>Sin abonos registrados.</Text> : (
                                                            <Table withRowBorders verticalSpacing={0} fz="xs" my={4} style={{ color: '#1a1b1e' }}>
                                                                <Table.Thead><Table.Tr><Table.Th w={110}>Fecha</Table.Th><Table.Th w={110} ta="right">Monto</Table.Th><Table.Th w={160}>Método</Table.Th><Table.Th>Referencia</Table.Th><Table.Th>Notas</Table.Th><Table.Th w={36} /></Table.Tr></Table.Thead>
                                                                <Table.Tbody>
                                                                    {f.abonos.map((a) => (
                                                                        <Table.Tr key={a.id}>
                                                                            <Table.Td><CeldaEditable tipo="fecha" valor={a.fecha} formato={fmtFecha} onGuardar={(v) => editarAbono(a, { fecha: v })} /></Table.Td>
                                                                            <Table.Td><CeldaEditable tipo="numero" valor={a.monto} align="right" formato={usd} onGuardar={(v) => editarAbono(a, { monto: v })} color={a.monto < 0 ? '#e8590c' : undefined} /></Table.Td>
                                                                            <Table.Td><CeldaEditable valor={a.metodo} onGuardar={(v) => editarAbono(a, { metodo: v })} /></Table.Td>
                                                                            <Table.Td><CeldaEditable valor={a.referencia} placeholder="Referencia" onGuardar={(v) => editarAbono(a, { referencia: v })} /></Table.Td>
                                                                            <Table.Td><CeldaEditable valor={a.notas} placeholder="Notas" onGuardar={(v) => editarAbono(a, { notas: v })} /></Table.Td>
                                                                            <Table.Td ta="center"><ActionIcon variant="subtle" color="red" size="sm" onClick={() => { if (window.confirm(`¿Borrar el abono de $${usd(a.monto)}? La deuda vuelve a subir.`)) borrarAbono.mutate(a); }} aria-label="Borrar abono"><IconTrash size={14} /></ActionIcon></Table.Td>
                                                                        </Table.Tr>
                                                                    ))}
                                                                </Table.Tbody>
                                                            </Table>
                                                        )}
                                                    </Table.Td>
                                                </Table.Tr>
                                            )}
                                        </React.Fragment>
                                    ))}
                                </React.Fragment>
                            );
                        })}
                    </Table.Tbody>
                </Table>
            </ScrollArea>

            {cambio && <CambioDeudaModal cuenta={cambio.cuenta} nuevoSaldo={cambio.nuevoSaldo} onCerrar={() => setCambio(null)} />}
            {montoModal && (
                <Modal opened onClose={() => setMontoModal(null)} centered title={<Text fw={800}>Corregir el monto de {montoModal.cuenta.documento}</Text>}>
                    <Stack gap="sm">
                        <Text size="sm">Monto actual <b>${usd(montoModal.cuenta.monto)}</b> → nuevo <b>${usd(montoModal.nuevo)}</b>. Es una corrección del documento (no un pago): el saldo se recalcula con lo ya abonado.</Text>
                        <TextInput label="Motivo de la corrección" placeholder="Ej: error al transcribir la factura" value={montoModal.motivo} onChange={(e) => setMontoModal({ ...montoModal, motivo: e.currentTarget.value })} data-autofocus />
                        <Group justify="flex-end">
                            <Button variant="default" onClick={() => setMontoModal(null)}>Cancelar</Button>
                            <Button color="orange" disabled={montoModal.motivo.trim().length < 5} onClick={() => editar(montoModal.cuenta, { montoTotal: montoModal.nuevo, motivo: montoModal.motivo }).then(() => setMontoModal(null)).catch(() => {})}>Corregir monto</Button>
                        </Group>
                    </Stack>
                </Modal>
            )}
        </Stack>
    );
}
