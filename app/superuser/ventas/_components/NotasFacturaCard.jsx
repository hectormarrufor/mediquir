'use client';

import React, { useState } from 'react';
import { Badge, Button, Group, Paper, Stack, Text } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { IconFileDiff } from '@tabler/icons-react';
import EmitirNotaModal from './EmitirNotaModal';
import NotaAcciones from './NotaAcciones';
import DiferencialCambiarioModal from './DiferencialCambiarioModal';

const nf = (v) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);
const fmtFecha = (v) => (v ? `${String(v).slice(8, 10)}/${String(v).slice(5, 7)}/${String(v).slice(0, 4)}` : '');

// Notas de crédito y de débito de una factura de venta: las emitidas y los botones para emitir nuevas
export default function NotasFacturaCard({ pedido, onCambio }) {
    const queryClient = useQueryClient();
    const [emitiendo, setEmitiendo] = useState(null); // 'CREDITO' | 'DEBITO'
    const [diferencial, setDiferencial] = useState(false);
    const { data, refetch } = useQuery({
        queryKey: ['notas-venta', pedido.id],
        queryFn: async () => {
            const res = await fetch(`/api/ventas/${pedido.id}/notas`);
            return res.ok ? res.json() : null;
        },
    });

    if (pedido.tipoDocumento !== 'FACTURA' || pedido.statusDespacho === 'Cancelado') return null;
    const simbolo = pedido.moneda === 'BS' ? 'Bs' : '$';
    const notas = data?.notas || [];
    const refrescar = () => { refetch(); queryClient.invalidateQueries({ queryKey: ['notas-venta', pedido.id] }); onCambio?.(); };

    return (
        <Paper withBorder p="md" radius="md" bg="gray.0">
            <Text fw={700} mb="xs" c="blue.9"><IconFileDiff size={16} style={{ verticalAlign: 'middle' }} /> Notas de crédito y débito</Text>
            <Group gap="xs" mb="sm" grow>
                <Button size="xs" variant="light" color="red" onClick={() => setEmitiendo('CREDITO')} disabled={data && data.acreditable <= 0}>Nota de crédito</Button>
                <Button size="xs" variant="light" color="blue" onClick={() => setEmitiendo('DEBITO')}>Nota de débito</Button>
            </Group>

            {pedido.moneda === 'USD' && (
                <Button size="xs" variant="light" color="indigo" fullWidth mb="sm" onClick={() => setDiferencial(true)}>Nota de débito por diferencial cambiario</Button>
            )}

            {!notas.length ? <Text size="xs" c="dimmed">Esta factura no tiene notas.</Text> : (
                <Stack gap={6}>
                    {notas.map((n) => (
                        <Group key={n.id} justify="space-between" wrap="nowrap" align="flex-start">
                            <div style={{ minWidth: 0 }}>
                                <Group gap={6}>
                                    <Text size="sm" fw={700}>{n.numeroDocumento}</Text>
                                    <Badge size="xs" color={n.tipo === 'CREDITO' ? 'red' : 'blue'} variant="light">{n.tipo === 'CREDITO' ? 'Crédito' : 'Débito'}</Badge>
                                    {n.estado === 'ANULADA' && <Badge size="xs" color="gray">Anulada</Badge>}
                                </Group>
                                <Text size="xs" c="dimmed" lineClamp={2}>{fmtFecha(n.fecha)} · {n.motivo}</Text>
                                {!n.numeroControl && n.estado === 'EMITIDA' && <Text size="xs" c="dimmed">Sin imprimir: el número de control se asigna al imprimirla</Text>}
                                {Number(n.saldoAFavorUsd) - Number(n.reintegradoUsd) > 0.005 && n.estado === 'EMITIDA' && (
                                    <Text size="xs" c="teal.8">Por reintegrar al cliente: ${nf(Number(n.saldoAFavorUsd) - Number(n.reintegradoUsd))}</Text>
                                )}
                            </div>
                            <Group gap={4} wrap="nowrap">
                                <Text size="sm" fw={800} c={n.tipo === 'CREDITO' ? 'red.7' : 'blue.7'} style={{ whiteSpace: 'nowrap', textDecoration: n.estado === 'ANULADA' ? 'line-through' : undefined }}>
                                    {n.tipo === 'CREDITO' ? '−' : '+'}{simbolo}{nf(n.totalFinal)}
                                </Text>
                                <NotaAcciones nota={n} onCambio={refrescar} />
                            </Group>
                        </Group>
                    ))}
                </Stack>
            )}

            {diferencial && <DiferencialCambiarioModal opened onClose={() => setDiferencial(false)} factura={pedido} onEmitida={refrescar} />}
            {emitiendo && <EmitirNotaModal opened onClose={() => setEmitiendo(null)} factura={pedido} tipo={emitiendo} onEmitida={refrescar} />}
        </Paper>
    );
}
