'use client';

import React from 'react';
import { Alert, Button, Group, Loader, Modal, Stack, Table, Text } from '@mantine/core';
import { useQuery, useMutation } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';

const nf = (v) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);

// Nota de entrega a crédito -> factura el día que el cliente paga: suma el IVA, toma la tasa de hoy y entra al libro de ventas con la fecha de hoy
export default function ConvertirNotaEntregaModal({ opened, onClose, pedido, onListo }) {
    const { data, isLoading, error } = useQuery({
        queryKey: ['convertir-factura', pedido.id],
        enabled: opened,
        gcTime: 0,
        queryFn: async () => {
            const res = await fetch(`/api/ventas/${pedido.id}/convertir-factura`);
            const cuerpo = await res.json();
            if (!res.ok) throw new Error(cuerpo.error || 'No se pudo calcular');
            return cuerpo;
        },
    });

    const convertir = useMutation({
        mutationFn: async () => {
            const res = await fetch(`/api/ventas/${pedido.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'CONVERTIR_A_FACTURA' }) });
            const cuerpo = await res.json();
            if (!res.ok) throw new Error(cuerpo.error || 'No se pudo convertir');
            return cuerpo;
        },
        onSuccess: (r) => {
            notifications.show({ title: 'Factura emitida', message: `${r.numeroAnterior} pasó a ser la factura ${r.numeroDocumento}, con la tasa de hoy.`, color: 'green' });
            onClose();
            onListo?.();
        },
        onError: (e) => notifications.show({ title: 'Error', message: e.message, color: 'red' }),
    });

    return (
        <Modal opened={opened} onClose={onClose} title="Pasar la nota de entrega a factura" centered>
            {isLoading ? <Group justify="center" py="md"><Loader /></Group> : error ? <Alert color="red">{error.message}</Alert> : (
                <Stack gap="sm">
                    <Text size="sm">La nota <b>{data.numeroActual}</b> pasará a ser una <b>factura</b> con número F- nuevo y fecha de emisión <b>de hoy</b>: entra al libro de ventas de este periodo y los bolívares se actualizan a la tasa de hoy.</Text>
                    <Table withRowBorders={false} fz="sm">
                        <Table.Tbody>
                            <Table.Tr><Table.Td c="dimmed">Tasa del pedido → tasa de hoy</Table.Td><Table.Td ta="right">{nf(data.tasaAntes)} → <b>{nf(data.tasaHoy)}</b></Table.Td></Table.Tr>
                            <Table.Tr><Table.Td c="dimmed">IVA que se suma (USD)</Table.Td><Table.Td ta="right">+${nf(data.deltaIvaUsd)}</Table.Td></Table.Tr>
                            <Table.Tr><Table.Td c="dimmed">Total en dólares</Table.Td><Table.Td ta="right">${nf(data.totalAntesUsd)} → <b>${nf(data.totalNuevoUsd)}</b></Table.Td></Table.Tr>
                            <Table.Tr><Table.Td c="dimmed">Total en bolívares</Table.Td><Table.Td ta="right">Bs {nf(data.totalAntesBs)} → <b>Bs {nf(data.totalNuevoBs)}</b></Table.Td></Table.Tr>
                            <Table.Tr><Table.Td c="dimmed">Saldo por cobrar (USD)</Table.Td><Table.Td ta="right"><b>${nf(data.saldoNuevoUsd)}</b></Table.Td></Table.Tr>
                        </Table.Tbody>
                    </Table>
                    <Text size="xs" c="dimmed">Si el cliente es contribuyente especial, la retención de IVA queda calculada. El número de control se asigna al imprimir. Esta acción no se puede deshacer.</Text>
                    <Button loading={convertir.isPending} fullWidth color="indigo" onClick={() => convertir.mutate()}>Sí, emitir la factura</Button>
                </Stack>
            )}
        </Modal>
    );
}
