'use client';

import React, { useEffect, useState } from 'react';
import { Alert, Badge, Box, Button, Group, Modal, NumberInput, Paper, Select, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPrinter, IconReceiptTax, IconTrash } from '@tabler/icons-react';
import { aBolivares } from '@/app/constants/facturacion';
import { useAuth } from '@/hooks/useAuth';

const bs = (v) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);
const fmtFecha = (v) => (v ? `${String(v).slice(8, 10)}/${String(v).slice(5, 7)}/${String(v).slice(0, 4)}` : '—');
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());

async function pedirJson(url, opciones) {
    const res = await fetch(url, opciones);
    const cuerpo = await res.json().catch(() => null);
    if (!res.ok) throw new Error(cuerpo?.error || 'No se pudo completar la solicitud');
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

    const tasa = Number(pedido.tasaCambio) || 1;
    const ivaBs = pedido.moneda === 'BS' ? Number(pedido.montoIva) : aBolivares(Number(pedido.montoIva), tasa);
    const retencion = pedido.retenciones?.[0] || null;
    const especial = Boolean(pedido.cliente?.esContribuyenteEspecial);
    const porRevisar = retencion?.estado === 'POR_REVISAR'; // el cliente ya subió su comprobante desde el portal

    useEffect(() => { setControl(pedido.numeroControl || ''); }, [pedido.numeroControl]);
    useEffect(() => {
        if (!abierto) return;
        const p = (retencion ? Number(retencion.porcentajeRetencion) === 100 : especial && Number(pedido.cliente?.retencionIvaPorDefecto) === 100) ? '100' : '75';
        setPorcentaje(p);
        // Si el cliente ya subió su comprobante, se parte de lo que declaró (administración lo confirma o lo corrige)
        setComprobante(porRevisar ? (retencion.comprobante || '') : '');
        setFecha(porRevisar && retencion.fecha ? String(retencion.fecha).slice(0, 10) : hoy());
        if (porRevisar && Number(retencion.montoDeclarado) > 0) { setMontoEditado(true); setMonto(Number(retencion.montoDeclarado)); } else setMontoEditado(false);
    }, [abierto, especial, pedido.cliente?.retencionIvaPorDefecto, retencion?.porcentajeRetencion, porRevisar]);
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
        await pedirJson(`/api/ventas/${pedido.id}/retencion`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comprobante, fecha, porcentaje: Number(porcentaje), ivaRetenidoBs: Number(monto) }) });
        notifications.show({ color: 'teal', title: 'Retención registrada', message: retencion ? 'Comprobante confirmado: la retención ya entra al libro de ventas.' : 'Se descontó del saldo por cobrar de la factura.' });
        setAbierto(false);
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
                        {retencion.comprobanteUrl && <Button component="a" href={retencion.comprobanteUrl} target="_blank" rel="noreferrer" size="compact-xs" variant="light" leftSection={<IconPrinter size={12} />}>Ver / imprimir comprobante</Button>}
                        {isAdmin && <Button size="compact-xs" color="red" variant="subtle" leftSection={<IconTrash size={12} />} onClick={eliminar} loading={guardando}>Eliminar retención</Button>}
                    </Group>
                </Alert>
            ) : porRevisar ? (
                <Alert mt="xs" color="blue" variant="light" p="xs" title="El cliente subió su comprobante de retención">
                    <Text size="xs">Comprobante <b>{retencion.comprobante}</b> · {fmtFecha(retencion.fecha)}</Text>
                    <Text size="sm" fw={800}>Bs {bs(retencion.montoDeclarado ?? retencion.ivaRetenido)} <Text span size="xs" fw={500}>declarados ({Number(retencion.porcentajeRetencion)} % del IVA)</Text></Text>
                    <Text size="xs" mb={6}>Revísalo contra el archivo: al confirmarlo entra al libro de ventas.</Text>
                    <Group gap="xs">
                        {retencion.comprobanteUrl && <Button component="a" href={retencion.comprobanteUrl} target="_blank" rel="noreferrer" size="compact-xs" variant="light" leftSection={<IconPrinter size={12} />}>Ver / imprimir</Button>}
                        <Button size="compact-xs" color="grape" onClick={() => setAbierto(true)}>Revisar y confirmar</Button>
                        {isAdmin && <Button size="compact-xs" color="red" variant="subtle" leftSection={<IconTrash size={12} />} onClick={eliminar} loading={guardando}>Quitar</Button>}
                    </Group>
                </Alert>
            ) : retencion ? (
                <Alert mt="xs" color="orange" variant="light" p="xs" title="Retención de IVA pendiente de comprobante">
                    <Text size="sm" fw={800}>Bs {bs(retencion.ivaRetenido)} <Text span size="xs" fw={500}>({Number(retencion.porcentajeRetencion)} % del IVA)</Text></Text>
                    <Text size="xs" mb={6}>Calculada al facturar y ya descontada del saldo: el cliente se la paga al SENIAT. Falta el número del comprobante que emite el cliente; sin él no entra al libro de ventas.</Text>
                    <Group gap="xs">
                        <Button size="compact-xs" color="grape" onClick={() => setAbierto(true)}>Cargar comprobante</Button>
                        {isAdmin && <Button size="compact-xs" color="red" variant="subtle" leftSection={<IconTrash size={12} />} onClick={eliminar} loading={guardando}>Quitar (el cliente no retiene)</Button>}
                    </Group>
                </Alert>
            ) : (
                <Box mt="xs">
                    {especial && <Badge size="sm" color="grape" variant="light" mb={6}>Cliente contribuyente especial: suele retener</Badge>}
                    <Button fullWidth size="xs" variant="light" color="grape" onClick={() => setAbierto(true)}>Registrar retención de IVA</Button>
                </Box>
            )}

            <Modal opened={abierto} onClose={() => setAbierto(false)} title={<Text fw={800}>Retención de IVA del cliente</Text>} centered>
                <Stack gap="sm">
                    <Text size="sm" c="dimmed">Factura <b>{pedido.numeroDocumento}</b> · IVA Bs {bs(ivaBs)}. El cliente retiene parte de ese IVA y se lo paga al SENIAT; a ti te descuenta ese monto del pago.</Text>
                    <TextInput label="N° de comprobante de retención" placeholder="20260700001835" withAsterisk value={comprobante} onChange={(e) => setComprobante(e.currentTarget.value)} data-autofocus />
                    <Group grow>
                        <TextInput type="date" label="Fecha del comprobante" value={fecha} onChange={(e) => setFecha(e.currentTarget.value)} />
                        <Select label="Porcentaje" data={[{ value: '75', label: '75 %' }, { value: '100', label: '100 %' }]} value={porcentaje} onChange={(v) => setPorcentaje(v || '75')} allowDeselect={false} />
                    </Group>
                    <NumberInput label="IVA retenido (Bs)" description="Se calcula solo; edítalo si el comprobante trae otro monto" value={monto} onChange={(v) => { setMontoEditado(true); setMonto(v); }} decimalScale={2} thousandSeparator="." decimalSeparator="," hideControls />
                    <Group justify="flex-end" mt="xs">
                        <Button variant="default" onClick={() => setAbierto(false)}>Cancelar</Button>
                        <Button color="grape" onClick={registrar} loading={guardando} disabled={!comprobante.trim() || !(Number(monto) > 0)}>Registrar retención</Button>
                    </Group>
                </Stack>
            </Modal>
        </Paper>
    );
}
