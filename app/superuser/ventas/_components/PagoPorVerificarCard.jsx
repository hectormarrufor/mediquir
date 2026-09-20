'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Alert, Badge, Button, Group, Modal, Stack, Text, Textarea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconCircleCheck, IconCircleX } from '@tabler/icons-react';
import { aBolivares } from '@/app/constants/facturacion';
import { formatearFechaHora } from '@/app/constants/hora';

async function pedirJson(url, opciones) {
    const res = await fetch(url, opciones);
    const cuerpo = await res.json().catch(() => null);
    if (!res.ok) throw new Error(cuerpo?.error || 'No se pudo completar la solicitud');
    return cuerpo;
}

const ETIQUETAS = {
    CONFIRMADO: { color: 'teal', texto: 'Pago confirmado por administración' },
    CONFIRMADO_AUTO: { color: 'teal', texto: 'Pago confirmado solo al llegar el SMS' },
    RECHAZADO: { color: 'red', texto: 'Pago rechazado: no existía' },
    VENCIDO: { color: 'gray', texto: 'Cancelado: nadie confirmó el pago a tiempo' },
};

// Compra de la tienda cuyo cliente asegura haber pagado por Pago Móvil pero el SMS no llegó. El sistema no puede saber si el aviso solo se
// retrasó o si el pago nunca existió: administración lo verifica en el banco y resuelve aquí. También muestra cómo terminó una verificación.
export default function PagoPorVerificarCard({ pedido, esAdmin, onCambio }) {
    const [accion, setAccion] = useState(null); // 'CONFIRMAR_PAGO' | 'RECHAZAR_PAGO'
    const [nota, setNota] = useState('');
    const [enviando, setEnviando] = useState(false);

    const estado = pedido.verificacionPago;
    if (!estado) return null;

    const esperadoBs = pedido.moneda === 'BS' ? Number(pedido.totalFinal) : aBolivares(Number(pedido.totalFinal), Number(pedido.tasaCambio));
    const fmtBs = (n) => `Bs ${Number(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    if (estado !== 'POR_VERIFICAR') {
        const e = ETIQUETAS[estado];
        if (!e) return null;
        return (
            <Alert color={e.color} variant="light" icon={estado === 'RECHAZADO' || estado === 'VENCIDO' ? <IconCircleX size={18} /> : <IconCircleCheck size={18} />} title={e.texto}>
                <Text size="xs" c="dimmed">Referencia declarada: {pedido.referenciaDeclarada || '—'} · {formatearFechaHora(pedido.verificacionAt)}</Text>
                {pedido.verificacionNota && <Text size="xs" mt={4}>{pedido.verificacionNota}</Text>}
            </Alert>
        );
    }

    const resolver = async () => {
        setEnviando(true);
        try {
            const r = await pedirJson(`/api/ventas/${pedido.id}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accion, nota: accion === 'RECHAZAR_PAGO' ? nota : undefined }),
            });
            notifications.show({ color: accion === 'CONFIRMAR_PAGO' ? 'teal' : 'orange', message: r.message });
            setAccion(null);
            onCambio?.();
        } catch (e) {
            notifications.show({ color: 'red', title: 'No se pudo resolver', message: e.message });
        } finally {
            setEnviando(false);
        }
    };

    return (
        <>
            <Alert color="orange" variant="light" icon={<IconAlertTriangle size={18} />} title="Pago por verificar">
                <Stack gap={6}>
                    <Text size="sm">El cliente asegura haber pagado por Pago Móvil, pero el SMS del banco no llegó. No se puede saber si solo se retrasó o si el pago no existe: <b>confírmalo en el banco</b>.</Text>
                    <Group gap="xs">
                        <Badge color="orange" variant="light" tt="none">Referencia: {pedido.referenciaDeclarada || '—'}</Badge>
                        <Badge color="orange" variant="light" tt="none">Monto exacto: {fmtBs(esperadoBs)}</Badge>
                    </Group>
                    <Text size="xs" c="dimmed">Registrado {formatearFechaHora(pedido.verificacionAt)} (hora de Caracas). Si el SMS llega con esa referencia y ese monto, el pedido se confirma solo; si nadie lo resuelve en 72 horas se cancela y el stock vuelve al inventario.</Text>
                    {pedido.verificacionNota && <Text size="xs" c="red.8" fw={600}>{pedido.verificacionNota}</Text>}
                    <Group gap="xs" mt={4}>
                        {esAdmin ? (
                            <>
                                <Button size="xs" color="teal" leftSection={<IconCircleCheck size={14} />} onClick={() => setAccion('CONFIRMAR_PAGO')}>Ya lo vi en el banco: confirmar pago</Button>
                                <Button size="xs" color="red" variant="light" leftSection={<IconCircleX size={14} />} onClick={() => setAccion('RECHAZAR_PAGO')}>El pago no existe: cancelar pedido</Button>
                            </>
                        ) : <Text size="xs" c="dimmed">Solo un administrador puede resolverlo.</Text>}
                        <Button size="xs" variant="subtle" component={Link} href="/superuser/pagos-recibidos">Ver pagos recibidos</Button>
                    </Group>
                </Stack>
            </Alert>

            <Modal opened={Boolean(accion)} onClose={() => setAccion(null)} centered title={accion === 'CONFIRMAR_PAGO' ? 'Confirmar el pago' : 'Cancelar el pedido'}>
                <Stack gap="sm">
                    {accion === 'CONFIRMAR_PAGO' ? (
                        <Text size="sm">Confirmas que viste en el banco un pago con la referencia <b>{pedido.referenciaDeclarada}</b> por <b>{fmtBs(esperadoBs)}</b>. El pedido quedará <b>pagado</b>, se asentará el ingreso en tesorería y ya se podrá preparar.</Text>
                    ) : (
                        <>
                            <Text size="sm">Confirmas que el pago <b>no existe</b> en el banco. El pedido se <b>cancelará</b> y el stock volverá al inventario. No se asienta ningún movimiento.</Text>
                            <Textarea label="Nota (opcional)" placeholder="Ej: referencia inexistente" value={nota} onChange={(e) => setNota(e.currentTarget.value)} maxLength={300} autosize minRows={2} />
                        </>
                    )}
                    <Group justify="flex-end">
                        <Button variant="default" onClick={() => setAccion(null)}>Volver</Button>
                        <Button color={accion === 'CONFIRMAR_PAGO' ? 'teal' : 'red'} loading={enviando} onClick={resolver}>{accion === 'CONFIRMAR_PAGO' ? 'Sí, confirmar pago' : 'Sí, cancelar pedido'}</Button>
                    </Group>
                </Stack>
            </Modal>
        </>
    );
}
