'use client';

import React, { useEffect, useState } from 'react';
import { Badge, Button, Group, NumberInput, Paper, Select, Text, TextInput, ThemeIcon } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useQueryClient } from '@tanstack/react-query';
import { IconTruckDelivery } from '@tabler/icons-react';
import { AGENCIAS_ENVIO, AGENCIAS_ENVIO_CON_OTRA } from '@/app/constants/agencias';

async function pedirJson(url, opciones) {
    const res = await fetch(url, opciones);
    const cuerpo = await res.json().catch(() => null);
    if (!res.ok) throw new Error(cuerpo?.error || 'No se pudo completar la solicitud');
    return cuerpo;
}

function dividirAgencia(valor) {
    const limpio = String(valor || '').trim();
    if (!limpio) return { sel: '', otra: '' };
    if (AGENCIAS_ENVIO.includes(limpio)) return { sel: limpio, otra: '' };
    return { sel: 'Otra agencia / chofer', otra: limpio };
}

// Envío de un pedido que no es retiro en tienda: qué agencia (o chofer) pasa a buscarlo y, para administración, cuánto flete se cobra.
// Se puede fijar en cualquier momento antes del despacho; el flete se suma al total de la factura (sin IVA) y a lo que debe el cliente.
export default function EnvioCard({ pedido, onCambio, soloAgencia = false }) {
    const queryClient = useQueryClient();
    const inicial = dividirAgencia(pedido.quienRetira);
    const [agenciaSel, setAgenciaSel] = useState(inicial.sel);
    const [agenciaOtra, setAgenciaOtra] = useState(inicial.otra);
    const [flete, setFlete] = useState(Number(pedido.costoFlete) || 0);
    const [guardando, setGuardando] = useState(false);

    useEffect(() => {
        const d = dividirAgencia(pedido.quienRetira);
        setAgenciaSel(d.sel);
        setAgenciaOtra(d.otra);
    }, [pedido.quienRetira]);
    useEffect(() => { setFlete(Number(pedido.costoFlete) || 0); }, [pedido.costoFlete]);

    if (['pickup', 'sitio'].includes(pedido.tipoEntrega) || ['Completado', 'Cancelado'].includes(pedido.statusDespacho)) return null;

    const simbolo = pedido.moneda === 'BS' ? 'Bs' : '$';
    const pagada = pedido.statusPago === 'Pagado';
    const transporte = agenciaSel === 'Otra agencia / chofer' ? agenciaOtra.trim() : agenciaSel;
    const cambioAgencia = transporte !== String(pedido.quienRetira || '').trim();
    const cambioFlete = !soloAgencia && Number(flete || 0) !== (Number(pedido.costoFlete) || 0);
    const cambio = cambioAgencia || cambioFlete;

    const guardar = async () => {
        if (agenciaSel === 'Otra agencia / chofer' && !agenciaOtra.trim()) {
            notifications.show({ color: 'red', title: 'Falta el nombre', message: 'Indica el nombre de la agencia o chofer que retira' });
            return;
        }
        if (soloAgencia && !transporte) {
            notifications.show({ color: 'red', title: 'Falta la agencia', message: 'Selecciona la agencia de envíos que va a retirar el pedido' });
            return;
        }
        setGuardando(true);
        try {
            const payload = soloAgencia
                ? { accion: 'DATOS_ENVIO', quienRetira: transporte }
                : { accion: 'DATOS_ENVIO', quienRetira: transporte, costoFlete: Number(flete) || 0 };
            await pedirJson(`/api/ventas/${pedido.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            notifications.show({ color: 'teal', message: soloAgencia ? 'Agencia de envío guardada' : 'Datos de envío guardados' });
            queryClient.invalidateQueries({ queryKey: ['ventas', 'despachos-pendientes'] });
            queryClient.invalidateQueries({ queryKey: ['vendedor'] });
            onCambio?.();
        } catch (e) {
            notifications.show({ color: 'red', title: 'No se pudo guardar', message: e.message });
        } finally {
            setGuardando(false);
        }
    };

    return (
        <Paper withBorder p="md" radius="lg" bg="white" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
            <Group gap="xs" mb="sm">
                <ThemeIcon variant="light" color="cyan" size="md" radius="md">
                    <IconTruckDelivery size={18} />
                </ThemeIcon>
                <Text fw={800} size="sm" c="navy.9">{soloAgencia ? 'Agencia de envíos' : 'Envío y transporte'}</Text>
            </Group>
            <Select
                size="xs"
                mb="xs"
                label="Agencia de envíos que retira el pedido"
                placeholder="Selecciona la agencia…"
                clearable={!soloAgencia}
                data={AGENCIAS_ENVIO_CON_OTRA}
                value={agenciaSel || null}
                onChange={(v) => {
                    setAgenciaSel(v || '');
                    if (v !== 'Otra agencia / chofer') setAgenciaOtra('');
                }}
            />
            {agenciaSel === 'Otra agencia / chofer' && (
                <TextInput
                    size="xs"
                    mb="xs"
                    label="Nombre de la agencia o chofer"
                    placeholder="Ej: MRW, Zoom, Tealca, transporte propio…"
                    value={agenciaOtra}
                    onChange={(e) => setAgenciaOtra(e.currentTarget.value)}
                    maxLength={120}
                    withAsterisk
                />
            )}
            {!soloAgencia && (
                <NumberInput
                    size="xs"
                    label={`Flete cobrado al cliente (${simbolo})`}
                    decimalScale={2}
                    min={0}
                    allowNegative={false}
                    inputMode="decimal"
                    hideControls
                    value={flete}
                    onChange={setFlete}
                    disabled={pagada}
                    description={pagada ? 'La factura ya está pagada: el flete no se puede cambiar' : 'Se suma al total (sin IVA) y a lo que debe el cliente'}
                />
            )}
            <Button
                mt="sm"
                fullWidth
                size="xs"
                variant="light"
                onClick={guardar}
                loading={guardando}
                disabled={!cambio || (soloAgencia && !transporte)}
            >
                {soloAgencia ? (pedido.quienRetira ? 'Actualizar agencia' : 'Asignar agencia') : 'Guardar envío'}
            </Button>
            {!soloAgencia && Number(pedido.costoFlete) > 0 && (
                <Badge mt="xs" size="sm" color="teal" variant="light">
                    Flete en la factura: {simbolo}{Number(pedido.costoFlete).toFixed(2)}
                </Badge>
            )}
        </Paper>
    );
}
