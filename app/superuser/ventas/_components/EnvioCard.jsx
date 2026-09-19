'use client';

import React, { useEffect, useState } from 'react';
import { Badge, Button, NumberInput, Paper, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconTruckDelivery } from '@tabler/icons-react';

async function pedirJson(url, opciones) {
    const res = await fetch(url, opciones);
    const cuerpo = await res.json().catch(() => null);
    if (!res.ok) throw new Error(cuerpo?.error || 'No se pudo completar la solicitud');
    return cuerpo;
}

// Envío de un pedido que no es retiro en tienda: qué empresa (o chofer) pasa a buscarlo y cuánto flete se le cobra al cliente.
// Se puede fijar en cualquier momento antes del despacho; el flete se suma al total de la factura (sin IVA) y a lo que debe el cliente.
export default function EnvioCard({ pedido, onCambio }) {
    const [transporte, setTransporte] = useState(pedido.quienRetira || '');
    const [flete, setFlete] = useState(Number(pedido.costoFlete) || 0);
    const [guardando, setGuardando] = useState(false);

    useEffect(() => { setTransporte(pedido.quienRetira || ''); }, [pedido.quienRetira]);
    useEffect(() => { setFlete(Number(pedido.costoFlete) || 0); }, [pedido.costoFlete]);

    if (pedido.tipoEntrega === 'pickup' || ['Completado', 'Cancelado'].includes(pedido.statusDespacho)) return null;

    const simbolo = pedido.moneda === 'BS' ? 'Bs' : '$';
    const pagada = pedido.statusPago === 'Pagado';
    const cambio = transporte.trim() !== (pedido.quienRetira || '') || Number(flete || 0) !== (Number(pedido.costoFlete) || 0);

    const guardar = async () => {
        setGuardando(true);
        try {
            await pedirJson(`/api/ventas/${pedido.id}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accion: 'DATOS_ENVIO', quienRetira: transporte, costoFlete: Number(flete) || 0 }),
            });
            notifications.show({ color: 'teal', message: 'Datos de envío guardados' });
            onCambio?.();
        } catch (e) {
            notifications.show({ color: 'red', title: 'No se pudo guardar', message: e.message });
        } finally {
            setGuardando(false);
        }
    };

    return (
        <Paper withBorder p="md" radius="md" bg="gray.0">
            <Text fw={700} mb="xs" c="blue.9"><IconTruckDelivery size={16} style={{ verticalAlign: 'middle' }} /> Envío y transporte</Text>
            <TextInput
                size="xs" mb="xs" label="Empresa de transporte o chofer que retira" placeholder="Ej: MRW, Zoom, o nombre y cédula del chofer"
                value={transporte} onChange={(e) => setTransporte(e.currentTarget.value)} maxLength={120}
            />
            <NumberInput
                size="xs" label={`Flete cobrado al cliente (${simbolo})`} decimalScale={2} min={0} hideControls value={flete} onChange={setFlete} disabled={pagada}
                description={pagada ? 'La factura ya está pagada: el flete no se puede cambiar' : 'Se suma al total (sin IVA) y a lo que debe el cliente'}
            />
            <Button mt="sm" fullWidth size="xs" variant="light" onClick={guardar} loading={guardando} disabled={!cambio}>Guardar envío</Button>
            {Number(pedido.costoFlete) > 0 && <Badge mt="xs" size="sm" color="teal" variant="light">Flete en la factura: {simbolo}{Number(pedido.costoFlete).toFixed(2)}</Badge>}
        </Paper>
    );
}
