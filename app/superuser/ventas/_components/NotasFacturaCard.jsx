'use client';

import React, { useEffect, useState } from 'react';
import { Badge, Button, Group, Paper, Stack, Text } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { IconFileDiff } from '@tabler/icons-react';
import EmitirNotaModal from './EmitirNotaModal';
import NotaAcciones from './NotaAcciones';
import DiferencialCambiarioModal from './DiferencialCambiarioModal';
import CompensarNotaModal from './CompensarNotaModal';
import AnularFacturaModal from './AnularFacturaModal';
import { useAuth } from '@/hooks/useAuth';

const nf = (v) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);
const fmtFecha = (v) => (v ? `${String(v).slice(8, 10)}/${String(v).slice(5, 7)}/${String(v).slice(0, 4)}` : '');

// Notas de crédito y de débito de una factura de venta: las emitidas y los botones para emitir nuevas
export default function NotasFacturaCard({ pedido, onCambio }) {
    const queryClient = useQueryClient();
    const [emitiendo, setEmitiendo] = useState(null); // 'CREDITO' | 'DEBITO'
    const [diferencial, setDiferencial] = useState(false);
    const [compensar, setCompensar] = useState(null); // nota de crédito recién emitida que dejó saldo a favor: se ofrece compensarlo
    const [controlInicial, setControlInicial] = useState('');
    const [anulando, setAnulando] = useState(false);
    const { isAdmin, esVendedor } = useAuth(); // un vendedor solo emite notas de crédito o débito normales (quedan por aprobar)
    // Abierta desde «Números de control» (?nota=CREDITO&control=00-0122660): se abre la nota con ese número de control
    useEffect(() => {
        const p = new URLSearchParams(window.location.search);
        const tipo = p.get('nota');
        if (!['CREDITO', 'DEBITO'].includes(tipo) || pedido.tipoDocumento !== 'FACTURA' || pedido.statusDespacho === 'Cancelado') return;
        setControlInicial(p.get('control') || '');
        if (tipo === 'CREDITO') setAnulando(true); // la nota de crédito es siempre el mismo formulario: el de anular (total o parcial)
        else setEmitiendo(tipo);
    }, [pedido.tipoDocumento, pedido.statusDespacho]);
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
                <Button size="xs" variant="light" color="red" onClick={() => setAnulando(true)} disabled={data && data.acreditable <= 0}>Anular factura / nota de crédito</Button>
                <Button size="xs" variant="light" color="blue" onClick={() => setEmitiendo('DEBITO')}>Nota de débito</Button>
            </Group>

            {!esVendedor && pedido.moneda === 'USD' && (
                <Button size="xs" variant="light" color="indigo" fullWidth mb="sm" onClick={() => setDiferencial(true)}>Nota de débito por diferencial cambiario</Button>
            )}
            {data && data.acreditable <= 0 && notas.some((n) => n.tipo === 'CREDITO' && n.estado === 'EMITIDA') && (
                <Badge color="red" variant="light" size="lg" fullWidth mb="sm">Factura anulada por completo con nota de crédito</Badge>
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
                                {n.facturasAfectadas?.length > 1 && <Text size="xs" c="dimmed">Afecta a: {n.facturasAfectadas.map((f) => f.numeroDocumento).join(', ')}</Text>}
                                {!n.numeroControl && n.estado === 'EMITIDA' && <Text size="xs" c="dimmed">Sin imprimir: el número de control se asigna al imprimirla</Text>}
                                {Number(n.saldoAFavorUsd) - Number(n.reintegradoUsd) - Number(n.compensadoUsd || 0) > 0.005 && n.estado === 'EMITIDA' && (
                                    <Text size="xs" c="teal.8">Saldo a favor del cliente por reintegrar o compensar: ${nf(Number(n.saldoAFavorUsd) - Number(n.reintegradoUsd) - Number(n.compensadoUsd || 0))}</Text>
                                )}
                                {Number(n.compensadoUsd) > 0.005 && n.estado === 'EMITIDA' && (
                                    <Text size="xs" c="dimmed">Compensado en otras facturas del cliente: ${nf(n.compensadoUsd)}</Text>
                                )}
                            </div>
                            <Group gap={4} wrap="nowrap">
                                <Text size="sm" fw={800} c={n.tipo === 'CREDITO' ? 'red.7' : 'blue.7'} style={{ whiteSpace: 'nowrap', textDecoration: n.estado === 'ANULADA' ? 'line-through' : undefined }}>
                                    {n.tipo === 'CREDITO' ? '−' : '+'}{simbolo}{nf(n.totalFinal)}
                                </Text>
                                {!esVendedor && <NotaAcciones nota={n} onCambio={refrescar} />}
                            </Group>
                        </Group>
                    ))}
                </Stack>
            )}

            {diferencial && <DiferencialCambiarioModal opened onClose={() => setDiferencial(false)} factura={pedido} onEmitida={refrescar} />}
            {emitiendo && <EmitirNotaModal opened onClose={() => { setEmitiendo(null); setControlInicial(''); }} factura={pedido} tipo={emitiendo} controlInicial={controlInicial} onEmitida={(nota) => { refrescar(); if (nota?.tipo === 'CREDITO' && Number(nota.saldoAFavorUsd) > 0.005) setCompensar(nota); }} />}
            {compensar && <CompensarNotaModal nota={compensar} desdeEmision onClose={() => setCompensar(null)} onCambio={refrescar} />}
            {anulando && <AnularFacturaModal opened onClose={() => { setAnulando(false); setControlInicial(''); }} pedido={pedido} onListo={refrescar} controlInicial={controlInicial || null} />}
        </Paper>
    );
}
