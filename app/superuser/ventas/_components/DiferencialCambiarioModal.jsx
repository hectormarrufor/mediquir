'use client';

import React, { useState } from 'react';
import { Alert, Button, Group, Loader, Modal, NumberInput, Stack, Table, Text } from '@mantine/core';
import { useQuery, useMutation } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';

const nf = (v) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);

// Nota de débito fiscal por diferencial cambiario: la factura se emitió a una tasa y el cliente paga a otra. Entra al libro de ventas.
export default function DiferencialCambiarioModal({ opened, onClose, factura, onEmitida }) {
    const [usd, setUsd] = useState('');
    const usdEnviado = usd === '' ? '' : Number(usd);
    const { data, isLoading, error } = useQuery({
        queryKey: ['diferencial', factura.id, usdEnviado],
        enabled: opened,
        gcTime: 0,
        placeholderData: (previo) => previo,
        queryFn: async () => {
            const res = await fetch(`/api/ventas/${factura.id}/notas${usdEnviado === '' ? '' : `?usd=${usdEnviado}`}`);
            const cuerpo = await res.json();
            if (!res.ok) throw new Error(cuerpo.error || 'No se pudo calcular');
            return cuerpo.diferencial;
        },
    });

    const emitir = useMutation({
        mutationFn: async () => {
            const res = await fetch(`/api/ventas/${factura.id}/notas`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tipo: 'DIFERENCIAL', usdDiferencial: data?.usd }),
            });
            const cuerpo = await res.json();
            if (!res.ok) throw new Error(cuerpo.error || 'No se pudo emitir');
            return cuerpo;
        },
        onSuccess: (r) => {
            notifications.show({ title: 'Nota de débito emitida', message: `${r.nota.numeroDocumento} por diferencial cambiario. Ya está en el libro de ventas.`, color: 'green' });
            onClose();
            onEmitida?.();
        },
        onError: (e) => notifications.show({ title: 'Error', message: e.message, color: 'red' }),
    });

    return (
        <Modal opened={opened} onClose={onClose} title="Nota de débito por diferencial cambiario" centered>
            {isLoading ? <Group justify="center" py="md"><Loader /></Group> : error ? <Alert color="red">{error.message}</Alert> : !data ? <Alert color="orange">No se pudo calcular el diferencial (¿hay tasa BCV registrada?).</Alert> : (
                <Stack gap="sm">
                    <Text size="sm">Nota de débito correspondiente a diferencial cambiario que afecta a la factura número <b>{factura.numeroDocumento}</b></Text>
                    <Table withRowBorders={false} fz="sm">
                        <Table.Tbody>
                            <Table.Tr><Table.Td c="dimmed">Tasa de la factura → tasa de hoy</Table.Td><Table.Td ta="right">{nf(data.tasaFactura)} → <b>{nf(data.tasaHoy)}</b></Table.Td></Table.Tr>
                            <Table.Tr><Table.Td c="dimmed">Saldo por cobrar (USD)</Table.Td><Table.Td ta="right">${nf(data.saldoUsd)}</Table.Td></Table.Tr>
                            <Table.Tr><Table.Td c="dimmed">Ya cubierto con otras notas (USD)</Table.Td><Table.Td ta="right">${nf(data.cubiertoUsd)}</Table.Td></Table.Tr>
                        </Table.Tbody>
                    </Table>
                    <NumberInput label="Tramo de la factura que se paga (USD)" description="Por defecto, todo el saldo por cobrar" value={usd === '' ? (data.usd ?? '') : usd} onChange={setUsd} min={0} decimalScale={2} hideControls />
                    {!data.puede ? <Alert color="orange">{data.motivoNo}</Alert> : (
                        <Table withRowBorders={false} fz="sm">
                            <Table.Tbody>
                                <Table.Tr><Table.Td c="dimmed">Base imponible</Table.Td><Table.Td ta="right">Bs {nf(data.baseImponible)}</Table.Td></Table.Tr>
                                {data.exento > 0 && <Table.Tr><Table.Td c="dimmed">Exento</Table.Td><Table.Td ta="right">Bs {nf(data.exento)}</Table.Td></Table.Tr>}
                                <Table.Tr><Table.Td c="dimmed">IVA</Table.Td><Table.Td ta="right">Bs {nf(data.iva)}</Table.Td></Table.Tr>
                                <Table.Tr><Table.Td fw={700}>Total de la nota</Table.Td><Table.Td ta="right" fw={700}>Bs {nf(data.total)}</Table.Td></Table.Tr>
                            </Table.Tbody>
                        </Table>
                    )}
                    <Text size="xs" c="dimmed">La nota entra al libro de ventas con la fecha de hoy y su número de control se asigna al imprimirla. No cambia lo que el cliente debe en dólares.</Text>
                    <Button fullWidth color="blue" disabled={!data.puede} loading={emitir.isPending} onClick={() => emitir.mutate()}>Emitir nota de débito</Button>
                </Stack>
            )}
        </Modal>
    );
}
