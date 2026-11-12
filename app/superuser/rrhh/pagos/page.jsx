'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ActionIcon, Alert, Badge, Box, Button, Group, Loader, Modal, NumberInput, Paper, Select, SegmentedControl, Stack, Table, Text, Textarea, TextInput, Title, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { IconArrowLeft, IconBan, IconCheck, IconFileTypePdf, IconPlus, IconTrash } from '@tabler/icons-react';
import { fechaCaracas } from '@/app/constants/hora';
import { TIPOS_PAGO, FORMAS_PAGO, ESTADOS_PAGO, totalesPago, fechaCorta, textoPeriodo } from '@/app/constants/pagosEmpleados';
import { abrirReciboPdf, montoEnLetras } from './_lib/reciboPdf';

const nf = (v) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);

async function pedir(url, opciones) {
    const res = await fetch(url, opciones);
    const cuerpo = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(cuerpo.error || 'No se pudo completar');
    return cuerpo;
}
const enviar = (url, datos) => pedir(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) });

// Un recibo en blanco del tipo elegido; si ya hubo uno de ese tipo, arranca con SUS montos (casi siempre se repiten)
function reciboNuevo(tipo, anteriores) {
    const cfg = TIPOS_PAGO[tipo];
    const previo = (anteriores || []).find((p) => p.tipo === tipo && p.estado !== 'ANULADO');
    return {
        tipo, empleadoId: null, fecha: fechaCaracas(), periodoDesde: '', periodoHasta: '', dias: previo?.dias || 7,
        filas: cfg.conceptos.map((concepto, i) => ({ concepto, asignacion: previo?.conceptos?.[i]?.asignacion || '', deduccion: previo?.conceptos?.[i]?.deduccion || '' })),
        monto: '', formaPago: 'TRANSFERENCIA', referencia: '', conceptoTexto: '',
    };
}

function FormularioRecibo({ opened, onClose, empleados, historial }) {
    const queryClient = useQueryClient();
    const [f, setF] = useState(() => reciboNuevo('ALIMENTACION', historial));
    const [enviando, setEnviando] = useState(false);
    const [error, setError] = useState(null);
    useEffect(() => { if (opened) { setF(reciboNuevo('ALIMENTACION', historial)); setError(null); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [opened]);

    const cfg = TIPOS_PAGO[f.tipo];
    const esQuincena = f.tipo === 'QUINCENA';
    const empleado = (empleados || []).find((e) => String(e.id) === String(f.empleadoId));
    const t = esQuincena ? { totalAsignaciones: Number(f.monto) || 0, totalDeducciones: 0, totalCobrar: Number(f.monto) || 0 } : totalesPago(f.filas);
    const conceptoQuincena = f.conceptoTexto || (f.periodoDesde && f.periodoHasta ? `Quincena del ${fechaCorta(f.periodoDesde).replace(/\//g, '-')} al ${fechaCorta(f.periodoHasta).replace(/\//g, '-')}` : 'Quincena');
    const set = (parche) => setF((x) => ({ ...x, ...parche }));
    const setFila = (i, parche) => setF((x) => ({ ...x, filas: x.filas.map((fila, j) => (j === i ? { ...fila, ...parche } : fila)) }));

    const valido = f.empleadoId && t.totalCobrar > 0 && (esQuincena || (f.periodoDesde && f.periodoHasta && Number(f.dias) > 0));

    const guardar = async () => {
        setEnviando(true); setError(null);
        try {
            const cuerpo = {
                tipo: f.tipo, empleadoId: Number(f.empleadoId), fecha: f.fecha, periodoDesde: f.periodoDesde || undefined, periodoHasta: f.periodoHasta || undefined, dias: Number(f.dias) || undefined,
                conceptos: esQuincena ? [{ concepto: conceptoQuincena, asignacion: Number(f.monto) || 0, deduccion: 0 }] : f.filas.map((x) => ({ concepto: x.concepto, asignacion: Number(x.asignacion) || 0, deduccion: Number(x.deduccion) || 0 })),
                formaPago: esQuincena ? f.formaPago : undefined, referencia: f.referencia || undefined, conceptoTexto: esQuincena ? conceptoQuincena : undefined,
            };
            const r = await enviar('/api/rrhh/pagos', cuerpo);
            notifications.show({ color: 'teal', title: 'Recibo registrado', message: r.notificado ? `Se le avisó a ${empleado?.nombre} para que lo confirme desde su usuario.` : `${empleado?.nombre} no tiene usuario: el recibo queda por confirmar, imprímelo para su firma.` });
            queryClient.invalidateQueries({ queryKey: ['pagos-empleados'] });
            onClose();
            abrirReciboPdf(r.pago).catch(() => {});
        } catch (e) { setError(e.message); } finally { setEnviando(false); }
    };

    return (
        <Modal opened={opened} onClose={onClose} size="lg" title={<Text fw={800}>Nuevo recibo de pago</Text>} centered>
            <Stack gap="sm">
                <SegmentedControl fullWidth value={f.tipo} onChange={(v) => setF(reciboNuevo(v, historial))} data={Object.entries(TIPOS_PAGO).map(([value, c]) => ({ value, label: c.etiqueta }))} />
                <Select label="Empleado" withAsterisk searchable value={f.empleadoId ? String(f.empleadoId) : null} onChange={(v) => set({ empleadoId: v })} placeholder="Elige al empleado"
                    data={(empleados || []).map((e) => ({ value: String(e.id), label: `${e.nombre} · C.I. ${e.cedula}${e.tieneUsuario ? '' : ' (sin usuario)'}` }))} />
                {empleado && !empleado.tieneUsuario && <Alert color="yellow" variant="light">Este empleado no tiene usuario: no podrá confirmar desde el sistema. El recibo se imprime y se firma en papel.</Alert>}
                <Group grow align="flex-start">
                    <TextInput type="date" label="Fecha del recibo" value={f.fecha} onChange={(e) => set({ fecha: e.currentTarget.value })} />
                    <TextInput type="date" label={esQuincena ? 'Quincena desde' : 'Desde'} withAsterisk={!esQuincena} value={f.periodoDesde} onChange={(e) => set({ periodoDesde: e.currentTarget.value })} />
                    <TextInput type="date" label={esQuincena ? 'Quincena hasta' : 'Hasta'} withAsterisk={!esQuincena} value={f.periodoHasta} onChange={(e) => set({ periodoHasta: e.currentTarget.value })} />
                </Group>
                {!esQuincena && f.periodoDesde && f.periodoHasta && <Text size="sm" fw={700} c="blue.9">{textoPeriodo(f.periodoDesde, f.periodoHasta)}</Text>}

                {esQuincena ? (
                    <>
                        <NumberInput label="Monto (Bs)" withAsterisk min={0} decimalScale={2} thousandSeparator="." decimalSeparator="," hideControls value={f.monto} onChange={(v) => set({ monto: v })} />
                        <TextInput label="Por concepto de" value={f.conceptoTexto} onChange={(e) => set({ conceptoTexto: e.currentTarget.value })} placeholder={conceptoQuincena} maxLength={250} />
                        <Group grow align="flex-start">
                            <Select label="¿Cómo se pagó?" allowDeselect={false} value={f.formaPago} onChange={(v) => set({ formaPago: v })} data={Object.entries(FORMAS_PAGO).map(([value, label]) => ({ value, label }))} />
                            <TextInput label="Referencia (opcional)" value={f.referencia} onChange={(e) => set({ referencia: e.currentTarget.value })} maxLength={100} />
                        </Group>
                        {t.totalCobrar > 0 && <Text size="sm" c="dimmed">La cantidad de: <b>{montoEnLetras(t.totalCobrar)}</b></Text>}
                    </>
                ) : (
                    <>
                        <NumberInput label="Días trabajados" withAsterisk min={1} max={31} allowDecimal={false} value={f.dias} onChange={(v) => set({ dias: v })} w={160} />
                        <Stack gap={6}>
                            <Text size="sm" fw={600}>Conceptos (los montos son editables)</Text>
                            {f.filas.map((fila, i) => (
                                <Group key={i} gap="xs" wrap="nowrap" align="flex-end">
                                    <TextInput style={{ flex: 1 }} placeholder="Concepto" value={fila.concepto} onChange={(e) => setFila(i, { concepto: e.currentTarget.value })} maxLength={120} />
                                    <NumberInput w={130} placeholder="Asignación" min={0} decimalScale={2} thousandSeparator="." decimalSeparator="," hideControls value={fila.asignacion} onChange={(v) => setFila(i, { asignacion: v })} />
                                    <NumberInput w={120} placeholder="Deducción" min={0} decimalScale={2} thousandSeparator="." decimalSeparator="," hideControls value={fila.deduccion} onChange={(v) => setFila(i, { deduccion: v })} />
                                    <ActionIcon variant="subtle" color="red" onClick={() => setF((x) => ({ ...x, filas: x.filas.filter((_, j) => j !== i) }))} disabled={f.filas.length <= 1}><IconTrash size={16} /></ActionIcon>
                                </Group>
                            ))}
                            <Button variant="subtle" size="compact-sm" leftSection={<IconPlus size={14} />} onClick={() => setF((x) => ({ ...x, filas: [...x.filas, { concepto: '', asignacion: '', deduccion: '' }] }))} w="fit-content">Agregar concepto</Button>
                        </Stack>
                    </>
                )}

                <Alert color="blue" variant="light" title={`Total a cobrar: Bs ${nf(t.totalCobrar)}`}>
                    {!esQuincena && <Text size="xs">Asignaciones Bs {nf(t.totalAsignaciones)} − deducciones Bs {nf(t.totalDeducciones)}.</Text>}
                    <Text size="xs">El empleado recibe un aviso y lo confirma desde su usuario; el recibo se abre en PDF para imprimirlo y archivarlo.</Text>
                </Alert>
                {error && <Alert color="red">{error}</Alert>}
                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose}>Cancelar</Button>
                    <Button leftSection={<IconCheck size={18} />} loading={enviando} disabled={!valido} onClick={guardar}>Registrar y abrir PDF</Button>
                </Group>
            </Stack>
        </Modal>
    );
}

export default function PagosEmpleadosPage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [tipo, setTipo] = useState('TODOS');
    const [empleadoId, setEmpleadoId] = useState(null);
    const [estado, setEstado] = useState(null);
    const [desde, setDesde] = useState('');
    const [hasta, setHasta] = useState('');
    const [nuevo, setNuevo] = useState(false);
    const [aAnular, setAAnular] = useState(null);
    const [motivo, setMotivo] = useState('');

    const qs = useMemo(() => {
        const p = new URLSearchParams();
        if (tipo !== 'TODOS') p.set('tipo', tipo);
        if (empleadoId) p.set('empleadoId', empleadoId);
        if (estado) p.set('estado', estado);
        if (desde) p.set('desde', desde);
        if (hasta) p.set('hasta', hasta);
        return p.toString();
    }, [tipo, empleadoId, estado, desde, hasta]);

    const { data: pagos, isLoading, error } = useQuery({ queryKey: ['pagos-empleados', qs], queryFn: () => pedir(`/api/rrhh/pagos?${qs}`) });
    const { data: empleados } = useQuery({ queryKey: ['pagos-empleados-lista'], staleTime: 60_000, queryFn: () => pedir('/api/rrhh/pagos/empleados') });
    const total = (pagos || []).filter((p) => p.estado !== 'ANULADO').reduce((a, p) => a + Number(p.totalCobrar), 0);

    const anular = async () => {
        try {
            await enviar(`/api/rrhh/pagos/${aAnular.id}/anular`, { motivo });
            notifications.show({ color: 'teal', message: 'Recibo anulado' });
            setAAnular(null); setMotivo('');
            queryClient.invalidateQueries({ queryKey: ['pagos-empleados'] });
        } catch (e) { notifications.show({ color: 'red', message: e.message }); }
    };
    const verPdf = (p) => abrirReciboPdf(p).catch((e) => notifications.show({ color: 'red', message: e.message || 'No se pudo generar el PDF' }));

    return (
        <Box p={{ base: 'sm', sm: 'lg' }} maw={1200} mx="auto">
            <Group justify="space-between" mb="md" wrap="wrap">
                <Group gap="sm">
                    <Button variant="subtle" color="gray" leftSection={<IconArrowLeft size={18} />} onClick={() => router.push('/superuser/rrhh')}>Personal</Button>
                    <Title order={2} c="navy.9">Pagos a empleados</Title>
                </Group>
                <Button leftSection={<IconPlus size={18} />} onClick={() => setNuevo(true)}>Nuevo recibo</Button>
            </Group>

            <Paper withBorder radius="lg" p="md" mb="md">
                <Stack gap="sm">
                    <SegmentedControl value={tipo} onChange={setTipo} data={[{ value: 'TODOS', label: 'Todos' }, ...Object.entries(TIPOS_PAGO).map(([value, c]) => ({ value, label: c.etiqueta }))]} />
                    <Group grow align="flex-end">
                        <Select label="Empleado" clearable searchable value={empleadoId} onChange={setEmpleadoId} data={(empleados || []).map((e) => ({ value: String(e.id), label: e.nombre }))} placeholder="Todos" />
                        <Select label="Estado" clearable value={estado} onChange={setEstado} data={Object.entries(ESTADOS_PAGO).map(([value, c]) => ({ value, label: c.etiqueta }))} placeholder="Todos" />
                        <TextInput type="date" label="Desde" value={desde} onChange={(e) => setDesde(e.currentTarget.value)} />
                        <TextInput type="date" label="Hasta" value={hasta} onChange={(e) => setHasta(e.currentTarget.value)} />
                    </Group>
                </Stack>
            </Paper>

            {error && <Alert color="red" mb="md">{error.message}</Alert>}
            {isLoading ? <Group justify="center" py="xl"><Loader /></Group> : (
                <Paper withBorder radius="lg" p="md">
                    <Table.ScrollContainer minWidth={760}>
                        <Table striped verticalSpacing="xs">
                            <Table.Thead><Table.Tr><Table.Th>Fecha</Table.Th><Table.Th>Tipo</Table.Th><Table.Th>Empleado</Table.Th><Table.Th>Período</Table.Th><Table.Th ta="right">Total (Bs)</Table.Th><Table.Th>Estado</Table.Th><Table.Th /></Table.Tr></Table.Thead>
                            <Table.Tbody>
                                {(pagos || []).map((p) => (
                                    <Table.Tr key={p.id}>
                                        <Table.Td>{fechaCorta(p.fecha)}</Table.Td>
                                        <Table.Td><Badge variant="light" color={TIPOS_PAGO[p.tipo]?.color}>{TIPOS_PAGO[p.tipo]?.etiqueta}</Badge></Table.Td>
                                        <Table.Td><Text size="sm" fw={600}>{p.empleadoNombre}</Text><Text size="xs" c="dimmed">C.I. {p.cedula}</Text></Table.Td>
                                        <Table.Td><Text size="xs">{p.periodoDesde && p.periodoHasta ? `${fechaCorta(p.periodoDesde)} al ${fechaCorta(p.periodoHasta)}` : '—'}</Text></Table.Td>
                                        <Table.Td ta="right" fw={700}>{nf(p.totalCobrar)}</Table.Td>
                                        <Table.Td>
                                            <Badge color={ESTADOS_PAGO[p.estado]?.color}>{ESTADOS_PAGO[p.estado]?.etiqueta}</Badge>
                                            {p.confirmadoAt && <Text size="xs" c="dimmed">{new Date(p.confirmadoAt).toLocaleString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'short', timeStyle: 'short' })}</Text>}
                                        </Table.Td>
                                        <Table.Td>
                                            <Group gap={4} wrap="nowrap" justify="flex-end">
                                                <Tooltip label="PDF para imprimir"><ActionIcon variant="light" onClick={() => verPdf(p)}><IconFileTypePdf size={18} /></ActionIcon></Tooltip>
                                                {p.estado !== 'ANULADO' && <Tooltip label="Anular"><ActionIcon variant="subtle" color="red" onClick={() => setAAnular(p)}><IconBan size={18} /></ActionIcon></Tooltip>}
                                            </Group>
                                        </Table.Td>
                                    </Table.Tr>
                                ))}
                                {!pagos?.length && <Table.Tr><Table.Td colSpan={7} ta="center" c="dimmed">No hay recibos con estos filtros.</Table.Td></Table.Tr>}
                            </Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>
                    {pagos?.length > 0 && <Text ta="right" fw={700} mt="sm">Total (sin anulados): Bs {nf(total)}</Text>}
                </Paper>
            )}

            <FormularioRecibo opened={nuevo} onClose={() => setNuevo(false)} empleados={empleados} historial={pagos} />
            <Modal opened={Boolean(aAnular)} onClose={() => setAAnular(null)} centered title={<Text fw={800}>Anular recibo</Text>}>
                <Stack>
                    <Text size="sm">{aAnular?.empleadoNombre} · {TIPOS_PAGO[aAnular?.tipo]?.etiqueta} · Bs {nf(aAnular?.totalCobrar)}. No se borra: queda en el histórico como anulado.</Text>
                    <Textarea label="Motivo" withAsterisk minRows={2} value={motivo} onChange={(e) => setMotivo(e.currentTarget.value)} maxLength={250} />
                    <Group justify="flex-end"><Button variant="default" onClick={() => setAAnular(null)}>Cancelar</Button><Button color="red" disabled={motivo.trim().length < 5} onClick={anular}>Anular</Button></Group>
                </Stack>
            </Modal>
        </Box>
    );
}
