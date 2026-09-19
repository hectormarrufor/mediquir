'use client';

import React, { useState } from 'react';
import { Alert, Button, Divider, Group, Modal, NumberInput, Stack, Text, TextInput } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useQueryClient } from '@tanstack/react-query';
import { IconAlertTriangle, IconDeviceMobileMessage } from '@tabler/icons-react';
import { aBolivares } from '@/app/constants/facturacion';
import { DATOS_PAGO_MOVIL } from '@/app/constants/empresa';
import { useTasaBcv } from '@/hooks/useTasaBcv';
import { fmtBs, fmtUsd, pedirJson } from '../_lib/formato';

// El cliente paga (total o parcial) una factura a crédito por Pago Móvil y reporta los últimos 4 dígitos de la referencia
// y el monto: el sistema busca el pago entre los avisos del banco y crea el abono solo.
export default function PagarConPagoMovil({ pedido }) {
    const queryClient = useQueryClient();
    const { tasa } = useTasaBcv();
    const [abierto, { open, close }] = useDisclosure(false);
    const [referencia, setReferencia] = useState('');
    const [monto, setMonto] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [error, setError] = useState(null);

    const saldoBs = tasa ? aBolivares(pedido.cobro.saldo, tasa) : null;

    const cerrar = () => { close(); setError(null); };

    const enviar = async () => {
        setEnviando(true);
        setError(null);
        try {
            const r = await pedirJson(`/api/b2b/pedidos/${pedido.id}/pago-movil`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ referencia, monto: Number(monto) }),
            });
            notifications.show({
                color: 'teal', title: r.liquidada ? '¡Factura pagada!' : 'Abono registrado',
                message: r.liquidada ? `Recibimos tu pago de ${fmtUsd(r.abonoUsd)}. Tu factura quedó pagada.` : `Recibimos tu pago de ${fmtUsd(r.abonoUsd)}. Te queda un saldo de ${r.monedaCuenta === 'USD' ? fmtUsd(r.saldoRestante) : fmtBs(r.saldoRestante)}.`,
            });
            setReferencia('');
            setMonto('');
            close();
            queryClient.invalidateQueries({ queryKey: ['b2b'] });
        } catch (e) {
            setError(e.message);
        } finally {
            setEnviando(false);
        }
    };

    const listo = referencia.length === 4 && Number(monto) > 0;

    return (
        <>
            <Button leftSection={<IconDeviceMobileMessage size={18} />} onClick={open} fullWidth>Pagar con Pago Móvil</Button>

            <Modal opened={abierto} onClose={cerrar} title="Pagar con Pago Móvil" centered>
                <Stack gap="md">
                    <Stack gap={2}>
                        <Text size="sm" fw={700}>1. Haz tu Pago Móvil a:</Text>
                        <Text size="sm">Banco: <b>{DATOS_PAGO_MOVIL.banco}</b></Text>
                        <Text size="sm">Teléfono: <b>{DATOS_PAGO_MOVIL.telefono}</b></Text>
                        <Text size="sm">Cédula: <b>{DATOS_PAGO_MOVIL.cedula}</b></Text>
                        <Text size="xs" c="dimmed" mt={4}>
                            Debes {fmtUsd(pedido.cobro.saldo)}{saldoBs !== null && <> (≈ {fmtBs(saldoBs)} a la tasa de hoy)</>}. Puedes pagar el total o abonar una parte.
                        </Text>
                    </Stack>
                    <Divider />
                    <Text size="sm" fw={700}>2. Cuéntanos el pago para registrarlo:</Text>
                    <TextInput
                        label="Últimos 4 dígitos de la referencia" placeholder="Ej: 4321" maxLength={4} inputMode="numeric"
                        value={referencia} onChange={(e) => setReferencia(e.currentTarget.value.replace(/\D/g, ''))}
                    />
                    <NumberInput
                        label="Monto que pagaste (Bs)" placeholder="0,00" min={0} decimalScale={2} decimalSeparator="," thousandSeparator="."
                        hideControls value={monto} onChange={setMonto}
                        description={saldoBs !== null ? undefined : 'Escribe el monto exacto que aparece en tu comprobante'}
                    />
                    {saldoBs !== null && (
                        <Button variant="subtle" size="compact-sm" w="fit-content" onClick={() => setMonto(saldoBs)}>Usar el saldo completo ({fmtBs(saldoBs)})</Button>
                    )}
                    {error && <Alert color="red" icon={<IconAlertTriangle size={18} />}>{error}</Alert>}
                    <Group justify="flex-end">
                        <Button variant="default" onClick={cerrar}>Cancelar</Button>
                        <Button onClick={enviar} loading={enviando} disabled={!listo}>Registrar pago</Button>
                    </Group>
                </Stack>
            </Modal>
        </>
    );
}
