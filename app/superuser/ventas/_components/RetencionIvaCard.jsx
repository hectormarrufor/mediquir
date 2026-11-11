'use client';

import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, Group, Paper, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconReceiptTax, IconTrash } from '@tabler/icons-react';
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

// Datos fiscales de una factura de venta: número de control y retención de IVA que le hace el cliente (contribuyente especial).
// La retención se declara primero (desde el abono o aquí: «el cliente retuvo») y baja la deuda; cuando el cliente pasa su comprobante
// se cargan solo su número y su fecha (DatosRetencionModal).
export default function RetencionIvaCard({ pedido, onCambio }) {
    const { isAdmin } = useAuth();
    const [abierto, setAbierto] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [control, setControl] = useState(pedido.numeroControl || '');

    const tasa = Number(pedido.tasaCambio) || 1;
    const ivaBs = pedido.moneda === 'BS' ? Number(pedido.montoIva) : aBolivares(Number(pedido.montoIva), tasa);
    const retencion = pedido.retenciones?.[0] || null;

    useEffect(() => { setControl(pedido.numeroControl || ''); }, [pedido.numeroControl]);

    if (pedido.tipoDocumento !== 'FACTURA' || !(Number(pedido.montoIva) > 0)) return null;

    const llamar = async (accion) => {
        setGuardando(true);
        try { await accion(); onCambio?.(); } catch (e) { notifications.show({ color: 'red', title: 'No se pudo guardar', message: e.message }); } finally { setGuardando(false); }
    };
    const guardarControl = () => llamar(async () => {
        await pedirJson(`/api/ventas/${pedido.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'NUMERO_CONTROL', numeroControl: control }) });
        notifications.show({ color: 'teal', message: 'Número de control guardado' });
    });
    const declarar = () => llamar(async () => {
        await pedirJson(`/api/ventas/${pedido.id}/retencion/declarar`, { method: 'POST' });
        notifications.show({ color: 'teal', title: 'Retención declarada', message: 'Se descontó del saldo. Cuando el cliente pase su comprobante, carga su número y su fecha.' });
    });
    const eliminar = () => llamar(async () => {
        await pedirJson(`/api/ventas/${pedido.id}/retencion`, { method: 'DELETE' });
        notifications.show({ color: 'orange', message: 'Retención eliminada; el saldo volvió a como estaba.' });
    });

    return (
        <Paper withBorder p="md" radius="md" bg="gray.0">
            <Text fw={700} mb="xs" c="blue.9"><IconReceiptTax size={16} style={{ verticalAlign: 'middle' }} /> Datos fiscales</Text>

            <Group gap="xs" align="flex-end" wrap="nowrap" mb="sm">
                <TextInput size="xs" label="N° de control" description="Se asigna solo al imprimir la factura" placeholder="00-000000" value={control} onChange={(e) => setControl(e.currentTarget.value)} style={{ flex: 1 }} />
                <Button size="xs" variant="light" onClick={guardarControl} loading={guardando} disabled={control === (pedido.numeroControl || '')}>Guardar</Button>
            </Group>

            <Text size="xs" c="dimmed">IVA de la factura: <b>Bs {bs(ivaBs)}</b></Text>
            {retencion && retencion.estado === 'REGISTRADA' ? (
                <Alert mt="xs" color="teal" variant="light" p="xs" title="Retenida · comprobante registrado">
                    <Text size="xs">Comprobante <b>{retencion.comprobante}</b> · {fmtFecha(retencion.fecha)}</Text>
                    <Text size="sm" fw={800}>Bs {bs(retencion.ivaRetenido)} <Text span size="xs" fw={500}>({Number(retencion.porcentajeRetencion)} % del IVA)</Text></Text>
                    {isAdmin && <Button size="compact-xs" mt={6} color="red" variant="subtle" leftSection={<IconTrash size={12} />} onClick={eliminar} loading={guardando}>Eliminar retención</Button>}
                </Alert>
            ) : retencion ? (
                <Alert mt="xs" color="orange" variant="light" p="xs" title={retencion.estado === 'POR_REVISAR' ? 'Retenida · el cliente subió su comprobante' : 'Retenida · falta el comprobante'}>
                    <Text size="sm" fw={800}>Bs {bs(retencion.ivaRetenido)} <Text span size="xs" fw={500}>({Number(retencion.porcentajeRetencion)} % del IVA)</Text></Text>
                    <Text size="xs" mb={6}>Ya descontada del saldo: el cliente se la paga al SENIAT. Falta el número y la fecha de su comprobante; sin ellos no entra al libro de ventas.</Text>
                    <Group gap="xs">
                        <Button size="compact-xs" color="grape" onClick={() => setAbierto(true)}>{retencion.estado === 'POR_REVISAR' ? 'Revisar y confirmar' : 'El cliente ya pasó los datos'}</Button>
                        {isAdmin && <Button size="compact-xs" color="red" variant="subtle" leftSection={<IconTrash size={12} />} onClick={eliminar} loading={guardando}>Quitar (el cliente no retiene)</Button>}
                    </Group>
                </Alert>
            ) : (
                <Box mt="xs">
                    <Button fullWidth size="xs" variant="light" color="grape" onClick={declarar} loading={guardando}>El cliente retuvo el 75 % del IVA</Button>
                    <Text size="xs" c="dimmed" mt={4}>Baja la deuda desde ya. Los datos del comprobante se cargan después, cuando el cliente te los pase.</Text>
                </Box>
            )}

            <DatosRetencionModal
                opened={abierto} onClose={() => setAbierto(false)} onListo={onCambio}
                retencion={retencion && {
                    ventaId: pedido.id, documento: pedido.numeroDocumento, numeroControl: pedido.numeroControl, cliente: pedido.cliente?.nombre, rif: pedido.cliente?.identificacion,
                    pct: Number(retencion.porcentajeRetencion), ivaRetenidoBs: Number(retencion.ivaRetenido), estado: retencion.estado,
                    comprobante: retencion.comprobante, fecha: retencion.fecha, montoDeclarado: retencion.montoDeclarado,
                }}
            />
        </Paper>
    );
}
