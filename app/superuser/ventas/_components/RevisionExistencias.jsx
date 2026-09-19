'use client';

import React, { useState } from 'react';
import { ActionIcon, Alert, Badge, Button, Group, NumberInput, Paper, Stack, Table, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconCheck, IconTrash } from '@tabler/icons-react';

const usd = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Pedido B2B que pidió más de lo que hay: administración confirma si consigue las cantidades en 1 o pocos días,
// o ajusta (reduce o quita) los renglones. Solo se puede mientras la factura no se haya impreso: después se usan notas de crédito.
// Al confirmar nacen la cuenta por cobrar y la retención de IVA y se avisa al cliente.
export default function RevisionExistencias({ pedido, onCambio }) {
    const [edits, setEdits] = useState({});
    const [ocupado, setOcupado] = useState(false);
    if (pedido.revisionStock !== 'PENDIENTE') return null;

    const detalles = pedido.detalles || [];
    const pedidoPorProducto = new Map();
    detalles.forEach((d) => pedidoPorProducto.set(d.productoId, (pedidoPorProducto.get(d.productoId) || 0) + Number(d.cantidad)));
    const faltaDe = (d) => Math.max(0, (pedidoPorProducto.get(d.productoId) || 0) - (Number(d.producto?.stockAlmacen) || 0));
    const hayFaltantes = detalles.some((d) => faltaDe(d) > 0);
    const esPres = (d) => d.presentacionPedida && d.presentacionPedida !== 'UNIDAD' && d.cantidadPresentacion;
    const valorDe = (d) => (esPres(d) ? Number(d.cantidadPresentacion) : Number(d.cantidad));

    const enviar = async (cuerpo, mensaje) => {
        setOcupado(true);
        try {
            const res = await fetch(`/api/ventas/${pedido.id}/revision`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
            const r = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(r.error || 'No se pudo completar la acción');
            notifications.show({ color: 'teal', icon: <IconCheck size={16} />, message: mensaje });
            setEdits({});
            onCambio?.();
        } catch (e) {
            notifications.show({ color: 'red', title: 'No se pudo', message: e.message });
        } finally {
            setOcupado(false);
        }
    };

    return (
        <Paper withBorder p="md" radius="md" bg="yellow.0" mb="md" style={{ borderColor: 'var(--mantine-color-yellow-5)' }}>
            <Stack gap="sm">
                <Group gap="xs"><IconAlertTriangle size={20} color="var(--mantine-color-yellow-8)" /><Title order={5}>Pedido en revisión de existencias</Title></Group>
                <Text size="sm">
                    El cliente pidió más de lo que hay en almacén. Confirma si puedes conseguir las cantidades en 1 o pocos días; si no, reduce o quita el renglón (el IVA, el total y la retención se recalculan solos).
                    Hasta que confirmes, el cliente no paga ni hace la retención y el pedido no se puede asignar ni empacar.
                </Text>
                <Table verticalSpacing={4} fz="sm">
                    <Table.Thead><Table.Tr><Table.Th>Producto</Table.Th><Table.Th ta="right">Piden</Table.Th><Table.Th ta="right">En almacén</Table.Th><Table.Th ta="right">Falta</Table.Th><Table.Th ta="right">Ajustar</Table.Th></Table.Tr></Table.Thead>
                    <Table.Tbody>
                        {detalles.map((d) => {
                            const falta = faltaDe(d);
                            const actual = valorDe(d);
                            const nuevo = edits[d.id] ?? actual;
                            return (
                                <Table.Tr key={d.id}>
                                    <Table.Td>{d.producto?.nombre || d.nombreFicticio}</Table.Td>
                                    <Table.Td ta="right">
                                        {esPres(d) ? `${d.cantidadPresentacion} × ${d.presentacionPedida === 'CAJA' ? 'caja' : 'bulto'} x${d.unidadesPorPresentacion}` : Number(d.cantidad)}
                                        {esPres(d) && <Text size="xs" c="dimmed">{Number(d.cantidad)} und</Text>}
                                    </Table.Td>
                                    <Table.Td ta="right">{Number(d.producto?.stockAlmacen) || 0}</Table.Td>
                                    <Table.Td ta="right">{falta > 0 ? <Badge color="red" variant="light">{falta} und</Badge> : <Badge color="teal" variant="light">Alcanza</Badge>}</Table.Td>
                                    <Table.Td>
                                        <Group gap={4} justify="flex-end" wrap="nowrap">
                                            <NumberInput size="xs" w={80} min={1} allowDecimal={false} allowNegative={false} hideControls value={nuevo} onChange={(v) => setEdits((e) => ({ ...e, [d.id]: v }))} aria-label="Cantidad" />
                                            <Button size="compact-xs" variant="light" disabled={ocupado || Number(nuevo) === actual || !(Number(nuevo) >= 1)} onClick={() => enviar({ accion: 'CAMBIAR_CANTIDAD', detalleId: d.id, cantidadPresentacion: Number(nuevo) }, 'Cantidad ajustada; el total se recalculó')}>Guardar</Button>
                                            <ActionIcon size="sm" color="red" variant="subtle" disabled={ocupado || detalles.length < 2} title={detalles.length < 2 ? 'Es el único renglón: cancela el pedido' : 'Quitar renglón'} onClick={() => enviar({ accion: 'QUITAR', detalleId: d.id }, 'Renglón quitado; el total se recalculó')}><IconTrash size={16} /></ActionIcon>
                                        </Group>
                                    </Table.Td>
                                </Table.Tr>
                            );
                        })}
                    </Table.Tbody>
                </Table>
                <Group justify="space-between" wrap="wrap">
                    <Text size="sm" fw={700}>Total actual del pedido: ${usd.format(Number(pedido.totalFinal) || 0)}</Text>
                    <Button color="teal" loading={ocupado} leftSection={<IconCheck size={16} />} onClick={() => enviar({ accion: 'CONFIRMAR' }, 'Pedido confirmado: se avisó al cliente')}>
                        Confirmar pedido
                    </Button>
                </Group>
                {hayFaltantes && <Alert color="orange" variant="light" icon={<IconAlertTriangle size={16} />}>Aún faltan existencias en almacén. Al confirmar se asume que consigues lo que falta por fuera: al empacar solo se descuenta del inventario lo que sí hay (el stock nunca queda negativo).</Alert>}
                {pedido.revisionNota && <Text size="xs" c="dimmed" style={{ whiteSpace: 'pre-line' }}>Ajustes hechos: {'\n'}{pedido.revisionNota}</Text>}
            </Stack>
        </Paper>
    );
}
