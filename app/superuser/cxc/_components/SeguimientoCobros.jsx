'use client';

// Dos listas para cobrar mejor: retenciones de IVA sin comprobante cargado y facturas que el cliente dice haber pagado completas pero aún deben.
import React, { useState } from 'react';
import { Alert, Badge, Box, Button, Group, Paper, SimpleGrid, Stack, Text } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { IconAlertTriangle, IconCircleCheck, IconReceiptTax, IconUserQuestion } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { EstadoVacio, Esqueleto } from './Piezas';
import { bolivares, dolares, fmtFechaLarga } from './utilidades';
import DatosRetencionModal from '../../ventas/_components/DatosRetencionModal';

function Fila({ titulo, cliente, rif, detalle, cifra, dias, accion, telefono, extra }) {
    return (
        <Paper withBorder p="xs" radius="md">
            <Group justify="space-between" wrap="nowrap" align="flex-start" gap="xs">
                <Box style={{ minWidth: 0 }}>
                    <Text fw={800} size="sm">{titulo} <Text span fw={500} c="dimmed">· {cliente}</Text></Text>
                    <Text size="xs" c="dimmed">{rif}{telefono ? ` · Tel. ${telefono}` : ''}</Text>
                    <Text size="xs" mt={2}>{detalle}</Text>
                </Box>
                <Box ta="right" style={{ flexShrink: 0 }}>
                    <Text fw={800} size="sm">{cifra}</Text>
                    <Badge size="xs" variant="light" color={dias > 15 ? 'red' : dias > 7 ? 'orange' : 'gray'}>hace {dias} día(s)</Badge>
                </Box>
            </Group>
            <Group mt={6} gap="xs">
                {extra}
                <Button size="compact-xs" variant="light" onClick={accion}>Abrir la factura</Button>
            </Group>
        </Paper>
    );
}

export default function SeguimientoCobros() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [completando, setCompletando] = useState(null); // retención a la que se le cargan los datos del comprobante
    const { data, isLoading, error, refetch } = useQuery({
        queryKey: ['cxc-seguimiento'],
        queryFn: async () => { const r = await fetch('/api/finanzas/cxc/seguimiento'); const j = await r.json(); if (!r.ok) throw new Error(j.error || 'No se pudo cargar'); return j; },
    });
    if (isLoading) return <Esqueleto indicadores={2} filas={4} />;
    if (error) return <Alert color="red" icon={<IconAlertTriangle size={18} />}>{error.message}</Alert>;
    const abrir = (id) => router.push(`/superuser/ventas/${id}`);
    const ret = data.retencionSinComprobante;
    const dicen = data.dicenPagaron;
    return (
        <>
            <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="sm">
                <Stack gap={6}>
                    <Group gap={6}><IconReceiptTax size={18} /><Text fw={800}>Retención sin comprobante ({ret.length})</Text></Group>
                    <Text size="xs" c="dimmed">El cliente retuvo el IVA pero todavía no se cargan los datos de su comprobante. Recuérdale que lo envíe; cuando te lo pase, pulsa «El cliente ya pasó los datos». Solo desde noviembre de 2026.</Text>
                    {!ret.length ? <EstadoVacio icono={IconCircleCheck} titulo="Todas las retenciones tienen comprobante" texto="No hay nada que pedirle a los clientes." /> : ret.map((r) => (
                        <Fila key={r.id} titulo={r.documento} cliente={r.cliente} rif={r.rif} telefono={r.telefono} dias={r.dias}
                            detalle={`Retención del ${r.pct} % del IVA, declarada el ${fmtFechaLarga(r.fecha)}${r.estado === 'POR_REVISAR' ? ' · el cliente ya subió su comprobante: falta confirmarlo' : ''}`}
                            cifra={bolivares(r.ivaRetenidoBs)} accion={() => abrir(r.ventaId)}
                            extra={<Button size="compact-xs" color="grape" onClick={() => setCompletando(r)}>{r.estado === 'POR_REVISAR' ? 'Revisar y confirmar' : 'El cliente ya pasó los datos'}</Button>} />
                    ))}
                </Stack>
                <Stack gap={6}>
                    <Group gap={6}><IconUserQuestion size={18} /><Text fw={800}>Dicen que pagaron completo y deben ({dicen.length})</Text></Group>
                    <Text size="xs" c="dimmed">Facturas que el cliente dijo cerrar con su último pago, pero que aún tienen deuda (diferencia de tasa, un pago corto…). Salen de la lista cuando se cobra lo que falta.</Text>
                    {!dicen.length ? <EstadoVacio icono={IconCircleCheck} titulo="Ninguna factura en esta situación" texto="Todo lo que el cliente dijo haber cerrado quedó en cero." /> : dicen.map((c) => (
                        <Fila key={c.id} titulo={c.documento} cliente={c.cliente} rif={c.rif} telefono={c.telefono} dias={c.dias}
                            detalle={`Dijo que cerraba la factura el ${fmtFechaLarga(c.declarada)} y aún debe`} cifra={`Debe ${dolares(c.saldo)}`} accion={() => abrir(c.ventaId)} />
                    ))}
                </Stack>
            </SimpleGrid>
            <DatosRetencionModal
                opened={Boolean(completando)} onClose={() => setCompletando(null)}
                retencion={completando && { ...completando, ivaRetenidoBs: completando.ivaRetenidoBs, pct: completando.pct }}
                onListo={() => { refetch(); queryClient.invalidateQueries({ queryKey: ['cxc-libro'] }); }}
            />
        </>
    );
}
