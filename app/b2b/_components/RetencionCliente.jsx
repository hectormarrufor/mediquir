'use client';

import React, { useState } from 'react';
import { Alert, Anchor, Badge, Button, Card, FileInput, Group, Modal, NumberInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useQueryClient } from '@tanstack/react-query';
import { IconAlertTriangle, IconReceiptTax, IconUpload } from '@tabler/icons-react';
import imageCompression from 'browser-image-compression';
import { fmtBs, fmtFecha, pedirJson } from '../_lib/formato';

const MAX_BYTES = 4 * 1024 * 1024; // límite del servidor por petición
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());

const ESTADOS = {
    PENDIENTE: { color: 'orange', etiqueta: 'Falta tu comprobante' },
    POR_REVISAR: { color: 'blue', etiqueta: 'En revisión' },
    REGISTRADA: { color: 'teal', etiqueta: 'Registrada' },
};

// Retención de IVA de una factura: el cliente contribuyente especial retiene una parte del IVA y solo paga el resto.
// Aquí sube el comprobante de esa retención para que la empresa lo registre (montos en bolívares: es un dato fiscal).
export default function RetencionCliente({ pedido }) {
    const r = pedido.retencion;
    const queryClient = useQueryClient();
    const [abierto, { open, close }] = useDisclosure(false);
    const [comprobante, setComprobante] = useState('');
    const [fecha, setFecha] = useState(hoy());
    const [monto, setMonto] = useState('');
    const [archivo, setArchivo] = useState(null);
    const [enviando, setEnviando] = useState(false);
    const [error, setError] = useState(null);

    if (!r) return null;
    const estado = ESTADOS[r.estado] || ESTADOS.PENDIENTE;

    const abrir = () => {
        setComprobante(r.comprobante || '');
        setFecha(r.fecha ? String(r.fecha).slice(0, 10) : hoy());
        setMonto(r.montoDeclarado ?? r.retenidoBs);
        setArchivo(null);
        setError(null);
        open();
    };

    const enviar = async () => {
        setEnviando(true);
        setError(null);
        try {
            // Las fotos se reducen antes de subirlas; un PDF pesado no se puede reducir
            let cuerpo = archivo;
            if (archivo.type.startsWith('image/')) cuerpo = await imageCompression(archivo, { maxSizeMB: 1.5, maxWidthOrHeight: 2200, useWebWorker: true });
            if (cuerpo.size > MAX_BYTES) throw new Error('El archivo pesa más de 4 MB. Comprímelo o envía una foto más pequeña.');

            const datos = new URLSearchParams({ comprobante: comprobante.trim(), fecha, monto: String(Number(monto)) });
            await pedirJson(`/api/b2b/pedidos/${pedido.id}/retencion?${datos}`, { method: 'POST', headers: { 'Content-Type': cuerpo.type || archivo.type }, body: cuerpo });
            notifications.show({ color: 'teal', title: 'Comprobante enviado', message: 'Lo revisaremos y lo registraremos. Ya no debes hacer nada más.' });
            close();
            queryClient.invalidateQueries({ queryKey: ['b2b'] });
        } catch (e) {
            setError(e.message);
        } finally {
            setEnviando(false);
        }
    };

    const listo = comprobante.trim() && /^\d{4}-\d{2}-\d{2}$/.test(fecha) && Number(monto) > 0 && archivo;

    return (
        <Card withBorder radius="lg" p="md" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
            <Group justify="space-between" mb="xs" wrap="nowrap">
                <Title order={5} c="navy.9"><IconReceiptTax size={18} style={{ verticalAlign: 'middle' }} /> Retención de IVA</Title>
                <Badge color={estado.color} variant="light">{estado.etiqueta}</Badge>
            </Group>

            <Text size="sm">
                Como contribuyente especial retienes el <b>{r.porcentaje}%</b> del IVA de esta factura (<b>{fmtBs(r.retenidoBs)}</b>) y lo declaras al SENIAT.
                A nosotros solo nos pagas el resto: esa retención ya está descontada de lo que debes.
            </Text>

            {r.estado === 'PENDIENTE' && (
                <>
                    <Text size="sm" mt="xs">Sube el comprobante de retención que emites para que lo registremos.</Text>
                    <Button mt="sm" fullWidth leftSection={<IconUpload size={16} />} onClick={abrir}>Subir comprobante de retención</Button>
                </>
            )}
            {r.estado === 'POR_REVISAR' && (
                <>
                    <Text size="sm" mt="xs">Recibimos tu comprobante <b>{r.comprobante}</b> ({fmtFecha(r.fecha)}). Lo estamos revisando.</Text>
                    <Group mt="sm" gap="xs">
                        {r.comprobanteUrl && <Anchor size="sm" href={r.comprobanteUrl} target="_blank" rel="noreferrer">Ver el archivo</Anchor>}
                        <Button size="compact-sm" variant="subtle" onClick={abrir}>Subir otro</Button>
                    </Group>
                </>
            )}
            {r.estado === 'REGISTRADA' && (
                <Text size="sm" mt="xs">Comprobante <b>{r.comprobante}</b> registrado ({fmtFecha(r.fecha)}). ¡Gracias!</Text>
            )}

            <Modal opened={abierto} onClose={close} title="Comprobante de retención de IVA" centered>
                <Stack gap="md">
                    <Text size="sm" c="dimmed">Factura {pedido.numero}. Escribe los datos tal como aparecen en tu comprobante.</Text>
                    <TextInput label="N° de comprobante" placeholder="20260900000123" value={comprobante} onChange={(e) => setComprobante(e.currentTarget.value)} maxLength={30} data-autofocus />
                    <Group grow align="flex-start">
                        <TextInput type="date" label="Fecha del comprobante" value={fecha} max={hoy()} onChange={(e) => setFecha(e.currentTarget.value)} />
                        <NumberInput
                            label="IVA retenido (Bs)" hideControls min={0} decimalScale={2} decimalSeparator="," thousandSeparator="."
                            value={monto} onChange={setMonto} description={`Calculado: ${fmtBs(r.retenidoBs)}`}
                        />
                    </Group>
                    <FileInput
                        label="Archivo del comprobante" placeholder="PDF o foto" accept="application/pdf,image/jpeg,image/png,image/webp"
                        value={archivo} onChange={setArchivo} clearable description="PDF o imagen, hasta 4 MB"
                    />
                    {error && <Alert color="red" icon={<IconAlertTriangle size={18} />}>{error}</Alert>}
                    <Group justify="flex-end">
                        <Button variant="default" onClick={close}>Cancelar</Button>
                        <Button onClick={enviar} loading={enviando} disabled={!listo}>Enviar comprobante</Button>
                    </Group>
                </Stack>
            </Modal>
        </Card>
    );
}
