'use client';

import React, { useEffect, useState } from 'react';
import { Alert, Badge, Box, Button, Divider, Group, Paper, Stack, Text, TextInput, ThemeIcon } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconClock, IconFileCheck, IconReceiptTax, IconTrash } from '@tabler/icons-react';
import { aBolivares } from '@/app/constants/facturacion';
import { useAuth } from '@/hooks/useAuth';
import DatosRetencionModal from './DatosRetencionModal';

const bs = (v) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);
const fmtFecha = (v) => (v ? `${String(v).slice(8, 10)}/${String(v).slice(5, 7)}/${String(v).slice(0, 4)}` : '—');

async function pedirJson(url, opciones) {
    const res = await fetch(url, opciones);
    const cuerpo = await res.json().catch(() => null);
    if (!res.ok) throw new Error(cuerpo?.error || 'No se pudo completar la solicitud');
    return cuerpo;
}

// Datos fiscales de una factura de venta: número de control y retención de IVA (75 % por contribuyente especial).
export default function RetencionIvaCard({ pedido, onCambio }) {
    const { isAdmin } = useAuth();
    const [abierto, setAbierto] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [control, setControl] = useState(pedido.numeroControl || '');

    const tasa = Number(pedido.tasaCambio) || 1;
    const ivaBs = pedido.moneda === 'BS' ? Number(pedido.montoIva) : aBolivares(Number(pedido.montoIva), tasa);
    const retEsperadaBs = Math.round(ivaBs * 75) / 100;
    const retencion = pedido.retenciones?.[0] || null;

    useEffect(() => { setControl(pedido.numeroControl || ''); }, [pedido.numeroControl]);

    if (pedido.tipoDocumento !== 'FACTURA' || !(Number(pedido.montoIva) > 0)) return null;

    const llamar = async (accion) => {
        setGuardando(true);
        try {
            await accion();
            onCambio?.();
        } catch (e) {
            notifications.show({ color: 'red', title: 'No se pudo guardar', message: e.message });
        } finally {
            setGuardando(false);
        }
    };

    const guardarControl = () => llamar(async () => {
        await pedirJson(`/api/ventas/${pedido.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accion: 'NUMERO_CONTROL', numeroControl: control }),
        });
        notifications.show({ color: 'teal', message: 'Número de control guardado' });
    });

    const declarar = () => llamar(async () => {
        await pedirJson(`/api/ventas/${pedido.id}/retencion/declarar`, { method: 'POST' });
        notifications.show({
            color: 'teal',
            title: 'Retención aplicada',
            message: 'Se descontó el 75 % del IVA del saldo. Cuando el cliente envíe el comprobante, carga su número y fecha.',
        });
    });

    const eliminar = () => llamar(async () => {
        await pedirJson(`/api/ventas/${pedido.id}/retencion`, { method: 'DELETE' });
        notifications.show({ color: 'orange', message: 'Retención eliminada; el saldo volvió a su monto original.' });
    });

    const estadoBadge = !retencion
        ? { color: 'gray', label: 'Sin retención' }
        : retencion.estado === 'REGISTRADA'
            ? { color: 'teal', label: 'Retención aplicada' }
            : retencion.estado === 'POR_REVISAR'
                ? { color: 'yellow', label: 'Comprobante por revisar' }
                : { color: 'orange', label: 'Falta comprobante' };

    return (
        <Paper withBorder p="md" radius="lg" bg="white" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
            <Group justify="space-between" align="center" mb="sm" wrap="wrap" gap="xs">
                <Group gap="xs" wrap="nowrap">
                    <ThemeIcon variant="light" color="grape" size="md" radius="md">
                        <IconReceiptTax size={18} />
                    </ThemeIcon>
                    <Text fw={800} size="sm" c="navy.9">Datos fiscales y retención</Text>
                </Group>
                <Badge size="sm" variant="light" color={estadoBadge.color}>
                    {estadoBadge.label}
                </Badge>
            </Group>

            <Group gap="xs" align="flex-end" wrap="nowrap" mb="sm">
                <TextInput
                    size="xs"
                    label="N° de control"
                    description={pedido.facturaTalonario ? 'Factura de talonario: el de la hoja' : 'Se asigna automáticamente al imprimir'}
                    placeholder="Sin asignar"
                    value={control}
                    readOnly={!pedido.facturaTalonario}
                    onChange={(e) => setControl(e.currentTarget.value)}
                    style={{ flex: 1 }}
                />
                {pedido.facturaTalonario && (
                    <Button size="xs" variant="light" onClick={guardarControl} loading={guardando} disabled={control === (pedido.numeroControl || '')}>
                        Guardar
                    </Button>
                )}
            </Group>

            <Divider my="xs" color="gray.2" />

            <Group justify="space-between" mb="xs">
                <Text size="xs" c="dimmed">IVA facturado (16 %)</Text>
                <Text size="xs" fw={700}>Bs {bs(ivaBs)}</Text>
            </Group>

            {retencion && retencion.estado === 'REGISTRADA' ? (
                <Alert color="teal" variant="light" radius="md" p="sm" icon={<IconFileCheck size={18} />} title="Retención de IVA aplicada y confirmada">
                    <Stack gap={4}>
                        <Text size="sm" fw={800} c="teal.9">
                            Bs {bs(retencion.ivaRetenido)}{' '}
                            <Text span size="xs" fw={500} c="dimmed">({Number(retencion.porcentajeRetencion)} % del IVA)</Text>
                        </Text>
                        <Text size="xs">Comprobante <b>{retencion.comprobante}</b> · Fecha: {fmtFecha(retencion.fecha)}</Text>
                        {isAdmin && (
                            <Button size="compact-xs" mt={4} w="fit-content" color="red" variant="subtle" leftSection={<IconTrash size={13} />} onClick={eliminar} loading={guardando}>
                                Quitar retención
                            </Button>
                        )}
                    </Stack>
                </Alert>
            ) : retencion ? (
                <Alert
                    color="orange"
                    variant="light"
                    radius="md"
                    p="sm"
                    icon={<IconClock size={18} />}
                    title={retencion.estado === 'POR_REVISAR' ? 'Retención aplicada · comprobante por revisar' : 'Retención aplicada · falta el comprobante'}
                >
                    <Stack gap={6}>
                        <Text size="sm" fw={800} c="orange.9">
                            Bs {bs(retencion.ivaRetenido)}{' '}
                            <Text span size="xs" fw={500} c="dimmed">({Number(retencion.porcentajeRetencion)} % del IVA)</Text>
                        </Text>
                        <Text size="xs">
                            Ya está descontada del saldo de la factura. Carga el número y la fecha del comprobante para incluirla en el libro de ventas.
                        </Text>
                        <Group gap="xs" wrap="wrap">
                            <Button size="xs" color="grape" leftSection={<IconCheck size={14} />} onClick={() => setAbierto(true)}>
                                {retencion.estado === 'POR_REVISAR' ? 'Revisar y confirmar' : 'Cargar comprobante'}
                            </Button>
                            {isAdmin && (
                                <Button size="xs" color="red" variant="subtle" leftSection={<IconTrash size={14} />} onClick={eliminar} loading={guardando}>
                                    Quitar retención
                                </Button>
                            )}
                        </Group>
                    </Stack>
                </Alert>
            ) : (
                <Box p="sm" style={{ borderRadius: 10, background: 'var(--mantine-color-gray-0)', border: '1px solid var(--mantine-color-gray-2)' }}>
                    <Text size="xs" fw={700} c="dark.6" mb={2}>
                        Esta factura no tiene retención de IVA aplicada
                    </Text>
                    <Text size="xs" c="dimmed" mb="sm">
                        Si el cliente es contribuyente especial, puedes aplicar el 75 % de retención (<b>Bs {bs(retEsperadaBs)}</b>) para descontarlo del saldo desde ya.
                    </Text>
                    <Button fullWidth size="xs" color="grape" leftSection={<IconReceiptTax size={15} />} onClick={declarar} loading={guardando}>
                        Aplicar retención de IVA (75 %)
                    </Button>
                </Box>
            )}

            <DatosRetencionModal
                opened={abierto}
                onClose={() => setAbierto(false)}
                onListo={onCambio}
                retencion={retencion && {
                    ventaId: pedido.id,
                    documento: pedido.numeroDocumento,
                    numeroControl: pedido.numeroControl,
                    cliente: pedido.cliente?.nombre,
                    rif: pedido.cliente?.identificacion,
                    pct: Number(retencion.porcentajeRetencion),
                    ivaRetenidoBs: Number(retencion.ivaRetenido),
                    estado: retencion.estado,
                    comprobante: retencion.comprobante,
                    fecha: retencion.fecha,
                    montoDeclarado: retencion.montoDeclarado,
                }}
            />
        </Paper>
    );
}
