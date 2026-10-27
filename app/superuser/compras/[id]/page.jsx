'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Box, Button, Card, Container, Divider, Grid, Group, Loader, Modal, NumberInput, Paper, Select, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft, IconCash, IconFileText, IconReceiptTax } from '@tabler/icons-react';
import PrecioVisual from '@/app/components/ui/PrecioVisual';
import { fechaCaracas, formatearFecha, formatearFechaHora } from '@/app/constants/hora';
import { aBolivares, aDolares } from '@/app/constants/facturacion';
import { useTasaBcv } from '@/hooks/useTasaBcv';
import { useAuth } from '@/hooks/useAuth';

async function pedirJson(url) {
    const res = await fetch(url);
    const cuerpo = await res.json().catch(() => null);
    if (!res.ok) throw new Error(cuerpo?.error || 'No se pudo cargar la compra');
    return cuerpo;
}

const bs = (n) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
const METODOS = ['Transferencia', 'Pago Móvil', 'Efectivo ($)', 'Efectivo (Bs)', 'Zelle', 'Punto de Venta'];

// Lo que se le debe al proveedor por esta compra, los pagos asentados en caja y el botón para registrar uno nuevo
function PagoProveedorCard({ compra, onCambio }) {
    const { tasa } = useTasaBcv();
    const [abierto, setAbierto] = useState(false);
    const [enviando, setEnviando] = useState(false);
    const [form, setForm] = useState({ monto: 0, moneda: 'USD', metodoPago: 'Transferencia', referencia: '' });
    const cxp = compra.cuentaPorPagar;
    const pagos = compra.pagos || [];
    const monedaCuenta = cxp?.moneda || compra.moneda;
    const simboloCuenta = monedaCuenta === 'BS' ? 'Bs' : '$';
    const saldo = Number(cxp?.saldoPendiente) || 0;
    const vencida = cxp && saldo > 0 && cxp.fechaVencimiento && String(cxp.fechaVencimiento).slice(0, 10) < fechaCaracas();

    const abrir = () => { setForm({ monto: saldo, moneda: monedaCuenta, metodoPago: monedaCuenta === 'BS' ? 'Transferencia' : 'Zelle', referencia: '' }); setAbierto(true); };
    const equivalente = form.moneda !== monedaCuenta && tasa > 0 && Number(form.monto) > 0
        ? (monedaCuenta === 'USD' ? `$${aDolares(Number(form.monto), tasa).toFixed(2)}` : `Bs ${bs(aBolivares(Number(form.monto), tasa))}`)
        : null;

    const pagar = async () => {
        if (!(Number(form.monto) > 0)) return notifications.show({ color: 'red', message: 'Indica el monto del pago' });
        setEnviando(true);
        try {
            const res = await fetch(`/api/compras/${compra.id}/pago`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'No se pudo registrar el pago');
            notifications.show({ color: 'teal', title: data.liquidada ? 'Cuenta pagada' : 'Pago registrado', message: data.liquidada ? 'La compra quedó pagada por completo.' : `Saldo restante: ${simboloCuenta} ${bs(data.saldoRestante)}` });
            setAbierto(false);
            onCambio();
        } catch (e) {
            notifications.show({ color: 'red', title: 'Error', message: e.message });
        } finally {
            setEnviando(false);
        }
    };

    return (
        <Card withBorder radius="lg" p="md" bg="white" mb="md">
            <Group gap={6} mb="xs" justify="space-between">
                <Group gap={6}><IconCash size={18} color="var(--mantine-color-teal-7)" /><Title order={5} c="navy.9">Pago al proveedor</Title></Group>
                {cxp ? <Badge color={saldo <= 0 ? 'teal' : vencida ? 'red' : 'orange'} variant="light">{saldo <= 0 ? 'Pagada' : vencida ? 'Vencida' : 'Pendiente'}</Badge> : <Badge color="teal" variant="light">De contado</Badge>}
            </Group>
            {cxp && (
                <>
                    <Group justify="space-between"><Text size="sm">Monto a pagar (sin la retención)</Text><PrecioVisual valor={cxp.montoTotal} simbolo={simboloCuenta} size="sm" /></Group>
                    <Group justify="space-between"><Text size="sm">Vence</Text><Text size="sm" fw={600} c={vencida ? 'red.7' : undefined}>{formatearFecha(cxp.fechaVencimiento) || '—'}</Text></Group>
                    <Group justify="space-between" mt={4}><Text fw={800}>Saldo pendiente</Text><PrecioVisual valor={saldo} simbolo={simboloCuenta} size="lg" fw={800} c={saldo > 0 ? 'red.7' : 'teal.7'} /></Group>
                    {saldo > 0 && <Button fullWidth mt="sm" color="teal" leftSection={<IconCash size={18} />} onClick={abrir}>Registrar pago</Button>}
                </>
            )}
            <Divider my="sm" label="Pagos asentados en caja" labelPosition="left" />
            {!pagos.length ? <Text size="sm" c="dimmed">Todavía no hay pagos registrados.</Text> : (
                <Stack gap={6}>
                    {pagos.map((p) => (
                        <Group key={p.id} justify="space-between" wrap="nowrap" align="flex-start">
                            <Box style={{ minWidth: 0 }}>
                                <Text size="sm" fw={600}>{formatearFecha(p.fecha)} · {p.metodoPago}</Text>
                                {p.referencia && <Text size="xs" c="dimmed" lineClamp={1}>Ref: {p.referencia}</Text>}
                            </Box>
                            <Box ta="right" style={{ flexShrink: 0 }}>
                                <Text size="sm" fw={700}>${Number(p.montoUsd).toFixed(2)}</Text>
                                <Text size="xs" c="dimmed">Bs {bs(p.montoVes)}</Text>
                            </Box>
                        </Group>
                    ))}
                </Stack>
            )}

            <Modal opened={abierto} onClose={() => setAbierto(false)} title={<Text fw={800}>Registrar pago a {compra.proveedor?.nombre || 'proveedor'}</Text>} centered>
                <Stack gap="sm">
                    <Text size="sm" c="dimmed">Saldo pendiente: <b>{simboloCuenta} {bs(saldo)}</b></Text>
                    <Group grow align="flex-start">
                        <NumberInput label="Monto" min={0} decimalScale={2} value={form.monto} onChange={(v) => setForm((f) => ({ ...f, monto: v }))} withAsterisk />
                        <Select label="Moneda" data={['USD', 'BS']} allowDeselect={false} value={form.moneda} onChange={(v) => setForm((f) => ({ ...f, moneda: v }))} />
                    </Group>
                    {form.moneda !== monedaCuenta && <Text size="xs" c="orange.8">Se convierte con la tasa BCV de hoy ({tasa || '…'} Bs/$){equivalente ? `: equivale a ${equivalente}` : ''}.</Text>}
                    <Select label="Método de pago" data={METODOS} allowDeselect={false} value={form.metodoPago} onChange={(v) => setForm((f) => ({ ...f, metodoPago: v }))} />
                    <TextInput label="Referencia (opcional)" placeholder="Número de la transferencia o del recibo" value={form.referencia} onChange={(e) => { const v = e.currentTarget.value; setForm((f) => ({ ...f, referencia: v })); }} />
                    <Text size="xs" c="dimmed">El pago se asienta hoy como egreso en caja y baja la deuda con el proveedor.</Text>
                    <Button color="teal" loading={enviando} onClick={pagar} leftSection={<IconCash size={18} />}>Registrar pago</Button>
                </Stack>
            </Modal>
        </Card>
    );
}

// Detalle de una compra a un proveedor: documento, productos que entraron al inventario y su comprobante de retención de IVA
export default function DetalleCompraPage() {
    const { id } = useParams();
    const router = useRouter();
    const queryClient = useQueryClient();
    const { esVendedor } = useAuth();
    const { data: c, isLoading, error } = useQuery({ queryKey: ['compra-detalle', id], queryFn: () => pedirJson(`/api/compras/${id}`) });
    const refrescar = () => {
        queryClient.invalidateQueries({ queryKey: ['compra-detalle', id] });
        queryClient.invalidateQueries({ queryKey: ['cuentas'] });
    };

    if (isLoading) return <Container py="xl"><Group justify="center"><Loader /></Group></Container>;
    if (error) return (
        <Container size="sm" py="xl">
            <Alert color="red" title="No se pudo cargar">{error.message}</Alert>
            <Button mt="md" variant="default" leftSection={<IconArrowLeft size={16} />} onClick={() => router.push('/superuser/compras')}>Volver a compras</Button>
        </Container>
    );

    const simbolo = c.moneda === 'BS' ? 'Bs' : '$';
    const ret = (c.retenciones || []).find((r) => r.tipo === 'COMPRA' && r.comprobante);
    const esFactura = c.tipoDocumento === 'FACTURA';

    return (
        <Container size="lg" py="md">
            <Group justify="space-between" mb="md" wrap="wrap">
                <Group gap="sm">
                    <Button variant="subtle" color="gray.3" leftSection={<IconArrowLeft size={16} />} onClick={() => (window.history.length > 1 ? router.back() : router.push('/superuser/compras'))}>Volver</Button>
                    <Title order={2} c="white">{esFactura ? 'Factura' : 'Nota de entrega'} {c.numeroDocumento}</Title>
                    <Badge size="lg" color={esFactura ? 'blue' : 'gray'} variant="light">{esFactura ? 'Factura' : 'Nota de entrega'}</Badge>
                    {c.esGasto && <Badge size="lg" color="teal" variant="light">Gasto</Badge>}
                </Group>
                {ret && <Button color="green" leftSection={<IconReceiptTax size={18} />} onClick={() => router.push(`/superuser/compras/${c.id}/retencion`)}>Comprobante de retención</Button>}
            </Group>

            <Grid gutter="md">
                <Grid.Col span={{ base: 12, md: 7 }}>
                    <Paper withBorder radius="lg" p="md" bg="white" mb="md">
                        <Title order={5} c="navy.9" mb="xs">Documento</Title>
                        <Grid>
                            <Grid.Col span={6}><Text size="xs" c="dimmed">Proveedor</Text><Text fw={700}>{c.proveedor?.nombre}</Text><Text size="xs" c="dimmed">RIF: {c.proveedor?.identificacion}</Text></Grid.Col>
                            <Grid.Col span={6}><Text size="xs" c="dimmed">Fecha del documento</Text><Text fw={700}>{formatearFecha(c.fechaFactura)}</Text>{c.numeroControl && <Text size="xs" c="dimmed">Control: {c.numeroControl}</Text>}</Grid.Col>
                            <Grid.Col span={6}><Text size="xs" c="dimmed">Condición de pago</Text><Text fw={700}>{c.condicionPago}{c.condicionPago === 'Credito' ? ` (${c.diasCredito} días)` : ''}</Text></Grid.Col>
                            <Grid.Col span={6}><Text size="xs" c="dimmed">Registrada</Text><Text fw={700}>{formatearFechaHora(c.createdAt)}</Text><Text size="xs" c="dimmed">{c.registrador?.empleado ? `${c.registrador.empleado.nombre} ${c.registrador.empleado.apellido}` : c.registrador?.user}</Text></Grid.Col>
                        </Grid>
                    </Paper>

                    <Paper withBorder radius="lg" p="md" bg="white">
                        {c.esGasto ? (
                            <>
                                <Title order={5} c="navy.9" mb="xs">Gasto</Title>
                                <Text fw={700}>{c.descripcionGasto}</Text>
                                <Text size="xs" c="dimmed">No afecta el inventario.</Text>
                            </>
                        ) : <>
                        <Title order={5} c="navy.9" mb="xs">Productos que entraron al inventario</Title>
                        <Table.ScrollContainer minWidth={420}>
                            <Table verticalSpacing="xs" fz="sm">
                                <Table.Thead><Table.Tr><Table.Th>Producto</Table.Th><Table.Th ta="right">Cantidad</Table.Th><Table.Th ta="right">Costo unit. ($)</Table.Th></Table.Tr></Table.Thead>
                                <Table.Tbody>
                                    {(c.entradas || []).map((e) => (
                                        <Table.Tr key={e.id}>
                                            <Table.Td><Text size="sm" fw={600}>{e.producto?.nombre}</Text><Text size="xs" c="dimmed">{e.producto?.codigo}</Text></Table.Td>
                                            <Table.Td ta="right">{Number(e.cantidad)}</Table.Td>
                                            <Table.Td ta="right">{Number(e.costoUnitario).toFixed(4)}</Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>
                        </Table.ScrollContainer>
                        </>}
                    </Paper>
                </Grid.Col>

                <Grid.Col span={{ base: 12, md: 5 }}>
                    <Card withBorder radius="lg" p="md" bg="white" mb="md">
                        <Title order={5} c="navy.9" mb="xs">Montos</Title>
                        <Group justify="space-between"><Text size="sm">Subtotal</Text><PrecioVisual valor={c.subtotal} simbolo={simbolo} size="sm" /></Group>
                        {esFactura && <Group justify="space-between"><Text size="sm">IVA (16%)</Text><PrecioVisual valor={c.montoIva} simbolo={simbolo} size="sm" /></Group>}
                        {Number(c.montoRetencion) > 0 && <Group justify="space-between"><Text size="sm" c="red.8">Retención de IVA (−)</Text><PrecioVisual valor={c.montoRetencion} simbolo={simbolo} size="sm" c="red.8" /></Group>}
                        <Group justify="space-between" mt={6}><Text fw={800}>Total del documento</Text><PrecioVisual valor={c.totalFinal} simbolo={simbolo} size="lg" fw={800} /></Group>
                        {Number(c.montoRetencion) > 0 && <Group justify="space-between"><Text size="sm" c="dimmed">A pagar al proveedor</Text><PrecioVisual valor={Number(c.totalFinal) - Number(c.montoRetencion)} simbolo={simbolo} size="sm" fw={700} /></Group>}
                        {!esFactura && <Text size="xs" c="dimmed" mt="xs">Nota de entrega: sin IVA ni retención, no entra al libro de compras.</Text>}
                    </Card>

                    {!esVendedor && <PagoProveedorCard compra={c} onCambio={refrescar} />}

                    {esFactura && (
                        <Card withBorder radius="lg" p="md" bg="white">
                            <Group gap={6} mb="xs"><IconFileText size={18} color="var(--mantine-color-green-7)" /><Title order={5} c="navy.9">Retención de IVA</Title></Group>
                            {ret ? (
                                <>
                                    <Text size="xs" c="dimmed">Comprobante N°</Text>
                                    <Text fw={800} fz="lg" c="navy.9">{ret.comprobante}</Text>
                                    <Text size="sm" mt={4}>Retenido ({Number(ret.porcentajeRetencion)}%): <b>Bs {bs(ret.ivaRetenido)}</b></Text>
                                    <Text size="xs" c="dimmed">Emitido el {formatearFecha(ret.fecha)}</Text>
                                    <Button fullWidth mt="sm" color="green" onClick={() => router.push(`/superuser/compras/${c.id}/retencion`)}>Ver, imprimir o enviar al proveedor</Button>
                                </>
                            ) : <Text size="sm" c="dimmed">Esta factura no generó retención (no tiene IVA o se registró sin retener).</Text>}
                        </Card>
                    )}
                </Grid.Col>
            </Grid>
            <Box h={30} />
        </Container>
    );
}
