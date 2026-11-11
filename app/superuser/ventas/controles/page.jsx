'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import {
    ActionIcon, Alert, Badge, Box, Button, Card, Checkbox, Group, Loader, Menu, Modal, Paper, Select, Stack, Table, Text, TextInput, Textarea, Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { IconAlertTriangle, IconArrowLeft, IconDotsVertical, IconFileOff, IconReceiptRefund, IconFileInvoice } from '@tabler/icons-react';
import { useAuth } from '@/hooks/useAuth';
import { useTasaBcv } from '@/hooks/useTasaBcv';
import { PANTALLA_COMPLETA_MOVIL, useEsTelefono } from '@/app/components/ui/modalMovil';

const PosModal = dynamic(() => import('../../../components/admin/PosModal'), { ssr: false });

const nf = (v) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);
const fecha = (f) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : '');
const TIPOS = { FACTURA: 'Factura', NOTA_CREDITO: 'Nota de crédito', NOTA_DEBITO: 'Nota de débito' };
const MOTIVOS = ['Se dañó (café, agua, manchas)', 'Se rompió', 'Se imprimió mal', 'Nunca se usó (se saltó)', 'Otro'];
const CANTIDADES = [{ value: '150', label: 'Últimos 150' }, { value: '500', label: 'Últimos 500' }, { value: '1500', label: 'Últimos 1.500' }];

async function pedir(url, opciones) {
    const res = await fetch(url, opciones);
    const cuerpo = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(cuerpo.error || 'No se pudo completar');
    return cuerpo;
}

// Documento(s) de un número de control
function Documentos({ fila, onAbrir }) {
    return (
        <Stack gap={2}>
            {fila.documentos.map((d) => (
                <Group key={d.id} gap={6} wrap="nowrap">
                    <Badge size="xs" variant="light" color={d.tipo === 'FACTURA' ? 'blue' : d.tipo === 'NOTA_CREDITO' ? 'red' : 'grape'}>{TIPOS[d.tipo]}</Badge>
                    <Text size="sm" fw={600} c="blue.8" style={{ cursor: d.ventaId ? 'pointer' : 'default' }} onClick={() => d.ventaId && onAbrir(d.ventaId)}>{d.numero}</Text>
                    {d.anulado && <Badge size="xs" color="gray">anulado</Badge>}
                </Group>
            ))}
        </Stack>
    );
}

// Qué hacer con un número sin registro: registrar su documento o marcar la forma como dañada / nunca usada
function MenuFaltante({ fila, onAccion }) {
    return (
        <Menu position="bottom-end" withinPortal>
            <Menu.Target>
                <Button size="xs" color="red" variant="light">Registrar…</Button>
            </Menu.Target>
            <Menu.Dropdown>
                <Menu.Label>{fila.control}</Menu.Label>
                <Menu.Item leftSection={<IconFileInvoice size={16} />} onClick={() => onAccion('FACTURA', fila)}>Factura</Menu.Item>
                <Menu.Item leftSection={<IconReceiptRefund size={16} />} onClick={() => onAccion('CREDITO', fila)}>Nota de crédito</Menu.Item>
                <Menu.Item leftSection={<IconReceiptRefund size={16} />} onClick={() => onAccion('DEBITO', fila)}>Nota de débito</Menu.Item>
                <Menu.Divider />
                <Menu.Item leftSection={<IconFileOff size={16} />} onClick={() => onAccion('ANULAR', fila)}>Forma dañada o nunca usada</Menu.Item>
            </Menu.Dropdown>
        </Menu>
    );
}

// Listado de todos los números de control de la forma libre (facturas y notas de crédito/débito), de mayor a menor. Donde la secuencia
// se rompe (un número sin documento ni forma anulada) se marca en rojo para registrar lo que falta.
export default function NumerosDeControlPage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const telefono = useEsTelefono();
    const { isAdmin } = useAuth();
    const { tasa } = useTasaBcv();
    const [cantidad, setCantidad] = useState('150');
    const [soloFaltan, setSoloFaltan] = useState(false);
    const [anular, setAnular] = useState(null); // fila
    const [motivo, setMotivo] = useState(MOTIVOS[0]);
    const [detalle, setDetalle] = useState('');
    const [nota, setNota] = useState(null); // { tipo, fila }
    const [facturaNota, setFacturaNota] = useState('');
    const [posControl, setPosControl] = useState(null);
    const [enviando, setEnviando] = useState(false);

    const { data, isLoading, error, refetch } = useQuery({
        queryKey: ['numeros-control', cantidad],
        queryFn: () => pedir(`/api/ventas/controles?cantidad=${cantidad}`),
    });
    const filas = (data?.filas || []).filter((f) => !soloFaltan || f.estado === 'FALTA' || f.estado === 'DUPLICADO');
    const abrir = (ventaId) => router.push(`/superuser/ventas/${ventaId}`);

    const accion = (tipo, fila) => {
        if (tipo === 'ANULAR') { setAnular(fila); setMotivo(MOTIVOS[0]); setDetalle(''); return; }
        if (tipo === 'FACTURA') { setPosControl(fila.control); return; }
        setNota({ tipo, fila }); setFacturaNota('');
    };

    const guardarAnulada = async () => {
        setEnviando(true);
        try {
            const texto = motivo === 'Otro' ? detalle.trim() : `${motivo}${detalle.trim() ? `: ${detalle.trim()}` : ''}`;
            await pedir('/api/ventas/controles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ numero: anular.control, motivo: texto }) });
            notifications.show({ message: `${anular.control} quedó registrada como forma anulada`, color: 'green' });
            setAnular(null);
            refetch();
        } catch (e) {
            notifications.show({ title: 'No se guardó', message: e.message, color: 'red' });
        } finally { setEnviando(false); }
    };

    const deshacer = async (fila) => {
        try {
            await pedir(`/api/ventas/controles?numero=${encodeURIComponent(fila.control)}`, { method: 'DELETE' });
            notifications.show({ message: `${fila.control} ya no está marcada como anulada`, color: 'green' });
            refetch();
        } catch (e) {
            notifications.show({ title: 'No se deshizo', message: e.message, color: 'red' });
        }
    };

    // La nota se emite desde su factura: se busca la factura y se abre con la nota y el control ya puestos
    const irANota = async () => {
        setEnviando(true);
        try {
            const f = await pedir(`/api/ventas/controles?factura=${encodeURIComponent(facturaNota)}`);
            router.push(`/superuser/ventas/${f.id}?nota=${nota.tipo}&control=${encodeURIComponent(nota.fila.control)}`);
        } catch (e) {
            notifications.show({ title: 'Factura no encontrada', message: e.message, color: 'red' });
            setEnviando(false);
        }
    };

    const celdaEstado = (f) => {
        if (f.estado === 'FALTA') return (
            <Group gap={6} wrap="nowrap" justify="space-between">
                <Group gap={4} wrap="nowrap"><IconAlertTriangle size={16} color="var(--mantine-color-red-7)" /><Text size="sm" c="red.8" fw={600}>Falta registro en este número de control</Text></Group>
                {isAdmin && <MenuFaltante fila={f} onAccion={accion} />}
            </Group>
        );
        if (f.estado === 'ANULADA') return (
            <Group gap={6} wrap="nowrap" justify="space-between">
                <Text size="sm" c="dimmed"><b>Forma anulada:</b> {f.anulada?.motivo || 'sin motivo'}</Text>
                {isAdmin && (
                    <Menu position="bottom-end" withinPortal>
                        <Menu.Target><ActionIcon variant="subtle" color="gray" aria-label="Más opciones"><IconDotsVertical size={16} /></ActionIcon></Menu.Target>
                        <Menu.Dropdown><Menu.Item onClick={() => deshacer(f)}>Deshacer (no estaba anulada)</Menu.Item></Menu.Dropdown>
                    </Menu>
                )}
            </Group>
        );
        if (f.estado === 'DUPLICADO') return <Text size="sm" c="orange.8" fw={600}>Este número de control está en {f.documentos.length} documentos: revisa cuál es el correcto</Text>;
        return null;
    };
    const fondo = (f) => (f.estado === 'FALTA' ? 'var(--mantine-color-red-0)' : f.estado === 'DUPLICADO' ? 'var(--mantine-color-orange-0)' : f.estado === 'ANULADA' ? 'var(--mantine-color-gray-0)' : undefined);

    return (
        <Box maw={1200} mx="auto" px={{ base: 'xs', sm: 'md' }} py="md">
            <Stack gap="md">
                <Group justify="space-between" align="flex-end" wrap="wrap">
                    <Group gap="xs" wrap="nowrap">
                        <ActionIcon size="lg" variant="light" onClick={() => router.push('/superuser/ventas')} aria-label="Volver a ventas"><IconArrowLeft size={18} /></ActionIcon>
                        <Box>
                            <Title order={telefono ? 3 : 2} c="white">Números de control</Title>
                            <Text size="sm" c="gray.4">Cada hoja de la forma libre lleva un número: debe tener su factura o nota, o quedar anotada como dañada.{data?.siguiente ? ` Siguiente: ${data.siguiente}.` : ''}</Text>
                        </Box>
                    </Group>
                    <Group gap="xs">
                        <Select w={160} data={CANTIDADES} value={cantidad} onChange={(v) => v && setCantidad(v)} allowDeselect={false} aria-label="Cuántos números mostrar" />
                        <Checkbox label="Solo los que faltan" checked={soloFaltan} onChange={(e) => setSoloFaltan(e.currentTarget.checked)} styles={{ label: { color: 'white' } }} />
                    </Group>
                </Group>

                {isLoading ? <Group justify="center" py="xl"><Loader /></Group> : error ? <Alert color="red">{error.message}</Alert> : (
                    <>
                        <Paper withBorder radius="md" p="sm">
                            <Text size="sm">
                                Del <b>{data.filas.at(-1)?.control}</b> al <b>{data.filas[0]?.control}</b>: {data.resumen.documentos} con documento · {data.resumen.anuladas} formas anuladas
                                {data.resumen.faltan > 0 && <Text span c="red.8" fw={700}> · {data.resumen.faltan} sin registro</Text>}
                                {data.resumen.duplicados > 0 && <Text span c="orange.8" fw={700}> · {data.resumen.duplicados} repetidos</Text>}
                            </Text>
                        </Paper>

                        {telefono ? (
                            <Stack gap="xs">
                                {filas.map((f) => (
                                    <Card key={f.n} withBorder radius="md" p="sm" style={{ background: fondo(f) }}>
                                        <Group justify="space-between" mb={4}><Text fw={700}>{f.control}</Text>{f.documentos[0] && <Text size="xs" c="dimmed">{fecha(f.documentos[0].fecha)}</Text>}</Group>
                                        {f.documentos.length > 0 && <Documentos fila={f} onAbrir={abrir} />}
                                        {f.documentos[0] && <Text size="xs" c="dimmed">{f.documentos[0].cliente} · {f.documentos[0].moneda === 'BS' ? 'Bs' : '$'} {nf(f.documentos[0].total)}</Text>}
                                        {celdaEstado(f)}
                                    </Card>
                                ))}
                            </Stack>
                        ) : (
                            <Paper withBorder radius="md">
                                <Table verticalSpacing={6} fz="sm" stickyHeader>
                                    <Table.Thead>
                                        <Table.Tr><Table.Th>N° de control</Table.Th><Table.Th>Documento</Table.Th><Table.Th>Fecha</Table.Th><Table.Th>Cliente</Table.Th><Table.Th ta="right">Total</Table.Th><Table.Th /></Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {filas.map((f) => (
                                            <Table.Tr key={f.n} style={{ background: fondo(f) }}>
                                                <Table.Td fw={700} style={{ whiteSpace: 'nowrap' }}>{f.control}</Table.Td>
                                                {f.estado === 'DOCUMENTO' || f.estado === 'DUPLICADO' ? (
                                                    <>
                                                        <Table.Td><Documentos fila={f} onAbrir={abrir} /></Table.Td>
                                                        <Table.Td>{f.documentos.map((d) => <div key={d.id}>{fecha(d.fecha)}</div>)}</Table.Td>
                                                        <Table.Td>{f.documentos.map((d) => <div key={d.id}>{d.cliente || '—'}</div>)}</Table.Td>
                                                        <Table.Td ta="right">{f.documentos.map((d) => <div key={d.id}>{d.moneda === 'BS' ? 'Bs' : '$'} {nf(d.total)}</div>)}</Table.Td>
                                                        <Table.Td>{celdaEstado(f)}</Table.Td>
                                                    </>
                                                ) : <Table.Td colSpan={5}>{celdaEstado(f)}</Table.Td>}
                                            </Table.Tr>
                                        ))}
                                    </Table.Tbody>
                                </Table>
                            </Paper>
                        )}
                        {filas.length === 0 && <Text c="gray.4" ta="center">No hay números sin registro en este tramo.</Text>}
                    </>
                )}
            </Stack>

            <Modal {...PANTALLA_COMPLETA_MOVIL} opened={Boolean(anular)} onClose={() => setAnular(null)} title={<Text fw={800}>Forma {anular?.control}</Text>} centered>
                <Stack gap="sm">
                    <Text size="sm">Queda anotado que esta hoja de la forma libre <b>nunca llevó un documento</b>. El hueco en la secuencia queda explicado y el sistema no vuelve a usar este número.</Text>
                    <Select label="¿Qué pasó?" data={MOTIVOS} value={motivo} onChange={(v) => setMotivo(v || MOTIVOS[0])} allowDeselect={false} />
                    <Textarea label={motivo === 'Otro' ? 'Explica qué pasó' : 'Detalle (opcional)'} autosize minRows={2} value={detalle} onChange={(e) => setDetalle(e.currentTarget.value)} />
                    <Text size="xs" c="dimmed">Guarda la hoja dañada: el SENIAT puede pedirla.</Text>
                    <Button loading={enviando} disabled={motivo === 'Otro' && !detalle.trim()} onClick={guardarAnulada}>Anotar como forma anulada</Button>
                </Stack>
            </Modal>

            <Modal {...PANTALLA_COMPLETA_MOVIL} opened={Boolean(nota)} onClose={() => setNota(null)} title={<Text fw={800}>{nota?.tipo === 'CREDITO' ? 'Nota de crédito' : 'Nota de débito'} con el control {nota?.fila.control}</Text>} centered>
                <Stack gap="sm">
                    <Text size="sm">La nota se registra desde la factura que afecta. Escribe su número y se abre con la nota y este número de control ya puestos.</Text>
                    <TextInput label="Número de la factura" placeholder="146870" value={facturaNota} onChange={(e) => setFacturaNota(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && facturaNota.trim() && irANota()} data-autofocus />
                    <Button loading={enviando} disabled={!facturaNota.trim()} onClick={irANota}>Abrir la factura</Button>
                </Stack>
            </Modal>

            {posControl && (
                <PosModal opened controlInicial={posControl} tasaBcv={tasa || 0}
                    onClose={() => { setPosControl(null); queryClient.invalidateQueries({ queryKey: ['ventas'] }); refetch(); }} />
            )}
        </Box>
    );
}
