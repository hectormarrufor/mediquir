'use client';

import React, { useEffect, useState } from 'react';
import { Alert, Badge, Box, Button, Group, Modal, NumberInput, Paper, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { PANTALLA_COMPLETA_MOVIL } from '@/app/components/ui/modalMovil';
import { IconReceiptTax, IconTrash } from '@tabler/icons-react';
import { aBolivares } from '@/app/constants/facturacion';
import { useAuth } from '@/hooks/useAuth';

const bs = (v) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);
const fmtFecha = (v) => (v ? `${String(v).slice(8, 10)}/${String(v).slice(5, 7)}/${String(v).slice(0, 4)}` : '—');
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());

async function pedirJson(url, opciones) {
    const res = await fetch(url, opciones);
    const cuerpo = await res.json().catch(() => null);
    if (!res.ok) throw Object.assign(new Error(cuerpo?.error || 'No se pudo completar la solicitud'), { datos: cuerpo });
    return cuerpo;
}

// Datos fiscales de una factura de venta: número de control y retención de IVA que le hace el cliente (contribuyente especial)
export default function RetencionIvaCard({ pedido, onCambio }) {
    const { isAdmin } = useAuth();
    const [abierto, setAbierto] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [control, setControl] = useState(pedido.numeroControl || '');
    const [comprobante, setComprobante] = useState('');
    const [fecha, setFecha] = useState(hoy());
    const [porcentaje, setPorcentaje] = useState('75');
    const [monto, setMonto] = useState('');
    const [montoEditado, setMontoEditado] = useState(false); // si se escribió a mano, deja de recalcularse
    const [difAviso, setDifAviso] = useState(null); // el comprobante no coincide con lo esperado: se pide confirmar
    const [controlModal, setControlModal] = useState('');

    const tasa = Number(pedido.tasaCambio) || 1;
    const ivaBs = pedido.moneda === 'BS' ? Number(pedido.montoIva) : aBolivares(Number(pedido.montoIva), tasa);
    const retencion = pedido.retenciones?.[0] || null;
    const porRevisar = retencion?.estado === 'POR_REVISAR'; // el cliente ya subió su comprobante desde el portal

    useEffect(() => { setControl(pedido.numeroControl || ''); }, [pedido.numeroControl]);
    useEffect(() => {
        if (!abierto) return;
        const p = retencion && Number(retencion.porcentajeRetencion) === 100 ? '100' : '75'; // a todos nos retienen el 75 %
        setControlModal(pedido.numeroControl || ''); setDifAviso(null);
        setPorcentaje(p);
        // Si el cliente ya subió su comprobante, se parte de lo que declaró (administración lo confirma o lo corrige)
        setComprobante(porRevisar ? (retencion.comprobante || '') : '');
        setFecha(porRevisar && retencion.fecha ? String(retencion.fecha).slice(0, 10) : hoy());
        if (porRevisar && Number(retencion.montoDeclarado) > 0) { setMontoEditado(true); setMonto(Number(retencion.montoDeclarado)); } else setMontoEditado(false);
    }, [abierto, retencion?.porcentajeRetencion, porRevisar]);
    useEffect(() => { if (!montoEditado) setMonto(Math.round(ivaBs * Number(porcentaje)) / 100); }, [porcentaje, ivaBs, montoEditado]);

    if (pedido.tipoDocumento !== 'FACTURA' || !(Number(pedido.montoIva) > 0)) return null;

    const llamar = async (accion) => {
        setGuardando(true);
        try { await accion(); onCambio?.(); } catch (e) { notifications.show({ color: 'red', title: 'No se pudo guardar', message: e.message }); } finally { setGuardando(false); }
    };

    const guardarControl = () => llamar(async () => {
        await pedirJson(`/api/ventas/${pedido.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'NUMERO_CONTROL', numeroControl: control }) });
        notifications.show({ color: 'teal', message: 'Número de control guardado' });
    });
    const registrar = () => llamar(async () => {
        await pedirJson(`/api/ventas/${pedido.id}/retencion`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comprobante, fecha, porcentaje: Number(porcentaje), ivaRetenidoBs: Number(monto), numeroControl: controlModal, aceptarDiferencia: Boolean(difAviso?.aceptada) }) }).catch((e) => { if (e.datos?.diferencia) { setDifAviso({ ...e.datos, mensaje: e.message, aceptada: false }); throw new Error(e.message); } throw e; });
        notifications.show({ color: 'teal', title: 'Retención registrada', message: retencion ? 'Comprobante confirmado: la retención ya entra al libro de ventas.' : 'Se descontó del saldo por cobrar de la factura.' });
        setAbierto(false);
    });
    const declarar = () => llamar(async () => {
        await pedirJson(`/api/ventas/${pedido.id}/retencion/declarar`, { method: 'POST' });
        notifications.show({ color: 'teal', title: 'Retención declarada', message: 'Se descontó del saldo. Falta cargar los datos del comprobante.' });
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
                <Alert mt="xs" color="teal" variant="light" p="xs" title="Retención de IVA registrada">
                    <Text size="xs">Comprobante <b>{retencion.comprobante}</b> · {fmtFecha(retencion.fecha)}</Text>
                    <Text size="sm" fw={800}>Bs {bs(retencion.ivaRetenido)} <Text span size="xs" fw={500}>({Number(retencion.porcentajeRetencion)} % del IVA)</Text></Text>
                    <Group gap="xs" mt={6}>
                                                {isAdmin && <Button size="compact-xs" color="red" variant="subtle" leftSection={<IconTrash size={12} />} onClick={eliminar} loading={guardando}>Eliminar retención</Button>}
                    </Group>
                </Alert>
            ) : retencion ? (
                <Alert mt="xs" color="orange" variant="light" p="xs" title="Retención de IVA pendiente de comprobante">
                    <Text size="sm" fw={800}>Bs {bs(retencion.ivaRetenido)} <Text span size="xs" fw={500}>({Number(retencion.porcentajeRetencion)} % del IVA)</Text></Text>
                    <Text size="xs" mb={6}>Ya descontada del saldo: el cliente se la paga al SENIAT. Faltan los datos de su comprobante (fecha, número y monto); sin ellos no entra al libro de ventas.</Text>
                    <Group gap="xs">
                        <Button size="compact-xs" color="grape" onClick={() => setAbierto(true)}>Cargar datos del comprobante</Button>
                        {isAdmin && <Button size="compact-xs" color="red" variant="subtle" leftSection={<IconTrash size={12} />} onClick={eliminar} loading={guardando}>Quitar (el cliente no retiene)</Button>}
                    </Group>
                </Alert>
            ) : (
                <Box mt="xs">
                    <Button fullWidth size="xs" variant="light" color="grape" onClick={declarar} loading={guardando}>El cliente retuvo el 75 % del IVA</Button>
                    <Text size="xs" c="dimmed" mt={4}>Baja la deuda desde ya. Los datos del comprobante se cargan después, cuando el cliente te los pase.</Text>
                </Box>
            )}

            <Modal {...PANTALLA_COMPLETA_MOVIL} opened={abierto} onClose={() => setAbierto(false)} title={<Text fw={800}>Retención de IVA del cliente</Text>} centered>
                <Stack gap="sm">
                    <Text size="sm" c="dimmed">Factura <b>{pedido.numeroDocumento}</b> · IVA Bs {bs(ivaBs)}. El cliente retiene parte de ese IVA y se lo paga al SENIAT; a ti te descuenta ese monto del pago.</Text>
                    {/* Orden del comprobante: fecha, RIF, razón social, nº de comprobante, nº de control, nº de factura y monto retenido */}
                    <TextInput type="date" label="1. Fecha del comprobante" value={fecha} onChange={(e) => setFecha(e.currentTarget.value)} data-autofocus />
                    <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
                        <TextInput label="2. RIF" value={pedido.cliente?.identificacion || ''} readOnly variant="filled" />
                        <TextInput label="3. Razón social" value={pedido.cliente?.nombre || ''} readOnly variant="filled" />
                    </SimpleGrid>
                    <TextInput label="4. N° de comprobante de retención" description="Lo emite y lo pasa el cliente" placeholder="20260700001835" withAsterisk value={comprobante} onChange={(e) => setComprobante(e.currentTarget.value)} />
                    <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
                        <TextInput label="5. N° de control de la factura" value={controlModal} onChange={(e) => setControlModal(e.currentTarget.value)} readOnly={Boolean(pedido.numeroControl)} variant={pedido.numeroControl ? 'filled' : 'default'} placeholder="00-000000" />
                        <TextInput label="6. N° de factura" value={pedido.numeroDocumento} readOnly variant="filled" />
                    </SimpleGrid>
                    <Select label="Porcentaje" data={[{ value: '75', label: '75 %' }, { value: '100', label: '100 %' }]} value={porcentaje} onChange={(v) => setPorcentaje(v || '75')} allowDeselect={false} />
                    <NumberInput label="7. Monto retenido (Bs)" description={`Esperado: Bs ${bs(Math.round(ivaBs * Number(porcentaje)) / 100)} (${porcentaje} % del IVA a la tasa de la factura)`} value={monto} onChange={(v) => { setMontoEditado(true); setMonto(v); setDifAviso(null); }} decimalScale={2} thousandSeparator="." decimalSeparator="," hideControls inputMode="decimal" />
                    {difAviso && (
                        <Alert color="orange" variant="light" p="xs" title="No coincide con lo esperado">
                            <Text size="xs">{difAviso.mensaje}</Text>
                            <Button size="compact-xs" mt={6} color="orange" variant={difAviso.aceptada ? 'filled' : 'light'} onClick={() => setDifAviso({ ...difAviso, aceptada: true })}>{difAviso.aceptada ? 'Confirmado: se registra con ese monto' : 'Es correcto, registrar con ese monto'}</Button>
                        </Alert>
                    )}
                    <Group justify="flex-end" mt="xs">
                        <Button variant="default" onClick={() => setAbierto(false)}>Cancelar</Button>
                        <Button color="grape" onClick={registrar} loading={guardando} disabled={!comprobante.trim() || !(Number(monto) > 0)}>Registrar retención</Button>
                    </Group>
                </Stack>
            </Modal>
        </Paper>
    );
}
