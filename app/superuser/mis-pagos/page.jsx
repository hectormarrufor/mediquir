'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ActionIcon, Alert, Badge, Box, Button, Checkbox, Group, Loader, Modal, Paper, Stack, Text, Title, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { IconArrowLeft, IconCheck, IconFileTypePdf } from '@tabler/icons-react';
import { TIPOS_PAGO, ESTADOS_PAGO, fechaCorta, textoPeriodo } from '@/app/constants/pagosEmpleados';
import { abrirReciboPdf } from '../rrhh/pagos/_lib/reciboPdf';

const nf = (v) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);

async function pedir(url, opciones) {
    const res = await fetch(url, opciones);
    const cuerpo = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(cuerpo.error || 'No se pudo completar');
    return cuerpo;
}

// Los recibos de pago del propio empleado (beneficios y quincena): los nuevos se confirman desde aquí
export default function MisPagosPage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [aConfirmar, setAConfirmar] = useState(null);
    const [acepto, setAcepto] = useState(false);
    const [enviando, setEnviando] = useState(false);
    const { data: pagos, isLoading, error } = useQuery({ queryKey: ['pagos-empleados', 'mios'], queryFn: () => pedir('/api/rrhh/pagos') });
    const pendientes = (pagos || []).filter((p) => p.estado === 'PENDIENTE');

    const confirmar = async () => {
        setEnviando(true);
        try {
            await pedir(`/api/rrhh/pagos/${aConfirmar.id}/confirmar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acepto: true }) });
            notifications.show({ color: 'teal', title: 'Recibo confirmado', message: 'Quedó registrado con la fecha y hora de hoy.' });
            setAConfirmar(null); setAcepto(false);
            queryClient.invalidateQueries({ queryKey: ['pagos-empleados'] });
        } catch (e) { notifications.show({ color: 'red', message: e.message }); } finally { setEnviando(false); }
    };
    const verPdf = (p) => abrirReciboPdf(p).catch((e) => notifications.show({ color: 'red', message: e.message || 'No se pudo generar el PDF' }));
    const detalle = (p) => (p.periodoDesde && p.periodoHasta ? textoPeriodo(p.periodoDesde, p.periodoHasta) : p.conceptoTexto || '');

    return (
        <Box p={{ base: 'sm', sm: 'lg' }} maw={760} mx="auto">
            <Group mb="md" gap="sm">
                <Button variant="subtle" color="gray" leftSection={<IconArrowLeft size={18} />} onClick={() => router.push('/superuser')}>Inicio</Button>
                <Title order={2} c="navy.9">Mis recibos de pago</Title>
            </Group>
            {error && <Alert color="red" mb="md">{error.message}</Alert>}
            {isLoading && <Group justify="center" py="xl"><Loader /></Group>}
            {pagos && pendientes.length > 0 && <Alert color="yellow" variant="light" mb="md" title={`Tienes ${pendientes.length} recibo(s) por confirmar`}>Revisa el monto y confírmalo con el botón «Confirmar recibo».</Alert>}
            <Stack gap="sm">
                {(pagos || []).map((p) => (
                    <Paper key={p.id} withBorder radius="lg" p="md" style={p.estado === 'PENDIENTE' ? { borderColor: 'var(--mantine-color-yellow-5)', borderWidth: 2 } : undefined}>
                        <Group justify="space-between" wrap="nowrap" align="flex-start">
                            <Box>
                                <Group gap={8}><Badge variant="light" color={TIPOS_PAGO[p.tipo]?.color}>{TIPOS_PAGO[p.tipo]?.etiqueta}</Badge><Badge color={ESTADOS_PAGO[p.estado]?.color}>{ESTADOS_PAGO[p.estado]?.etiqueta}</Badge></Group>
                                <Text size="xs" c="dimmed" mt={4}>{fechaCorta(p.fecha)}{detalle(p) ? ` · ${detalle(p)}` : ''}{p.dias ? ` · ${p.dias} días` : ''}</Text>
                                {p.confirmadoAt && <Text size="xs" c="teal.8">Confirmado el {new Date(p.confirmadoAt).toLocaleString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'short', timeStyle: 'short' })}</Text>}
                            </Box>
                            <Group gap="xs" wrap="nowrap">
                                <Text fz={20} fw={800} style={{ whiteSpace: 'nowrap' }}>Bs {nf(p.totalCobrar)}</Text>
                                <Tooltip label="PDF"><ActionIcon variant="light" onClick={() => verPdf(p)}><IconFileTypePdf size={18} /></ActionIcon></Tooltip>
                            </Group>
                        </Group>
                        {p.estado === 'PENDIENTE' && <Button mt="sm" fullWidth color="green.8" leftSection={<IconCheck size={18} />} onClick={() => { setAcepto(false); setAConfirmar(p); }}>Confirmar recibo</Button>}
                    </Paper>
                ))}
                {pagos && !pagos.length && <Text c="dimmed" ta="center" py="xl">Todavía no tienes recibos registrados.</Text>}
            </Stack>

            <Modal opened={Boolean(aConfirmar)} onClose={() => setAConfirmar(null)} centered title={<Text fw={800}>Confirmar recibo</Text>}>
                {aConfirmar && (
                    <Stack>
                        <Text size="sm">{TIPOS_PAGO[aConfirmar.tipo]?.etiqueta}{detalle(aConfirmar) ? ` · ${detalle(aConfirmar)}` : ''}</Text>
                        <Text fz={26} fw={900} c="blue.9">Bs {nf(aConfirmar.totalCobrar)}</Text>
                        <Checkbox checked={acepto} onChange={(e) => setAcepto(e.currentTarget.checked)}
                            label={<Text size="sm" fw={600}>Confirmo que recibí de Mediquir el monto indicado por este concepto.</Text>} />
                        <Text size="xs" c="dimmed">Queda registrada la fecha y hora de tu confirmación desde tu usuario.</Text>
                        <Group justify="flex-end"><Button variant="default" onClick={() => setAConfirmar(null)}>Cancelar</Button><Button color="green.8" disabled={!acepto} loading={enviando} onClick={confirmar}>Confirmar</Button></Group>
                    </Stack>
                )}
            </Modal>
        </Box>
    );
}
