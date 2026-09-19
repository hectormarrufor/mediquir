'use client';

import React, { useState } from 'react';
import { ActionIcon, Alert, Box, Button, Divider, Grid, Group, Image, Modal, NumberInput, Paper, SegmentedControl, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { IconAlertTriangle, IconBuildingStore, IconCheck, IconTrash } from '@tabler/icons-react';
import { useTasaBcv } from '@/hooks/useTasaBcv';
import { aBolivares, montoRenglon } from '@/app/constants/facturacion';
import { getMainImage, PLACEHOLDER_IMG } from '@/app/components/landing/productUtils';
import { useB2BCart } from '../_lib/B2BCartContext';
import { fmtBs, fmtPrecio, fmtUsd, pedirJson } from '../_lib/formato';

function Fila({ item, tasa }) {
    const { fijarCantidad, quitar } = useB2BCart();
    const { producto, cantidad } = item;
    return (
        <Table.Tr>
            <Table.Td>
                <Group gap="sm" wrap="nowrap">
                    <Image src={getMainImage(producto)} w={48} h={48} fit="contain" radius="sm" bg="gray.0" fallbackSrc={PLACEHOLDER_IMG} alt="" />
                    <Box style={{ minWidth: 0 }}>
                        <Text size="sm" fw={600} lineClamp={2}>{producto.nombre}</Text>
                        <Text size="xs" c="dimmed">{producto.porcentajeIva > 0 ? `IVA ${producto.porcentajeIva}%` : 'Exento'}</Text>
                    </Box>
                </Group>
            </Table.Td>
            <Table.Td ta="right"><Text size="sm">{fmtPrecio(producto.precio)}</Text></Table.Td>
            <Table.Td>
                <NumberInput value={cantidad} onChange={(v) => fijarCantidad(producto, v)} min={1} max={producto.disponible || undefined} allowDecimal={false} allowNegative={false} clampBehavior="strict" w={90} size="xs" ml="auto" aria-label="Cantidad" />
            </Table.Td>
            <Table.Td ta="right">
                <Text size="sm" fw={700}>{fmtUsd(montoRenglon(producto.precio, cantidad))}</Text>
                {tasa && <Text size="xs" c="dimmed">{fmtBs(aBolivares(montoRenglon(producto.precio, cantidad), tasa))}</Text>}
            </Table.Td>
            <Table.Td w={40}><ActionIcon variant="subtle" color="red" onClick={() => quitar(producto.id)} aria-label="Quitar"><IconTrash size={16} /></ActionIcon></Table.Td>
        </Table.Tr>
    );
}

export default function B2BCarrito() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { items, listo, factura: facturaConIva, facturaSinIva, vaciar } = useB2BCart();
    const { tasa } = useTasaBcv();
    const [tipoEntrega, setTipoEntrega] = useState('pickup');
    const [transporte, setTransporte] = useState('');
    const [formaPago, setFormaPago] = useState('Contado');
    // Factura: con IVA · Nota de entrega: sin IVA. Sirven tanto para pagar de contado como a crédito
    const [documento, setDocumento] = useState('NOTA_ENTREGA');
    const factura = documento === 'FACTURA' ? facturaConIva : facturaSinIva;
    const { data: credito } = useQuery({ queryKey: ['b2b', 'credito'], queryFn: () => pedirJson('/api/b2b/credito'), staleTime: 30000 });
    const puedeCredito = Boolean(credito?.habilitado && credito.disponibles > 0);
    // Si el cupo se agota mientras arma el pedido, vuelve a contado
    const pago = formaPago === 'Credito' && puedeCredito ? 'Credito' : 'Contado';
    const [enviando, setEnviando] = useState(false);
    const [error, setError] = useState('');
    const [confirmando, { open: abrirConfirmacion, close: cerrarConfirmacion }] = useDisclosure(false);

    const confirmar = async () => {
        setEnviando(true);
        setError('');
        cerrarConfirmacion();
        try {
            const r = await pedirJson('/api/b2b/pedidos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tipoEntrega, transporte: tipoEntrega === 'flete' ? transporte : '', condicionPago: pago, tipoDocumento: documento, items: items.map((i) => ({ productoId: i.producto.id, cantidad: i.cantidad })) }),
            });
            vaciar();
            queryClient.invalidateQueries({ queryKey: ['b2b'] });
            notifications.show({ color: 'teal', icon: <IconCheck size={16} />, title: 'Pedido enviado', message: r.aCredito ? `Recibimos tu pedido ${r.numero} a crédito. Tienes ${credito?.diasCredito} días para pagarlo.` : `Recibimos tu pedido ${r.numero}. Te avisaremos cuando esté listo.` });
            router.push(`/b2b/pedidos/${r.id}`);
        } catch (e) {
            setError(e.message);
        } finally {
            setEnviando(false);
        }
    };

    if (!listo) return null;

    if (!items.length) {
        return (
            <Stack align="center" py={70} gap="sm">
                <Title order={3} c="navy.9">Tu pedido está vacío</Title>
                <Text c="dimmed">Agrega productos desde el catálogo para armarlo.</Text>
                <Button leftSection={<IconBuildingStore size={18} />} color="navy.9" onClick={() => router.push('/b2b/catalogo')}>Ir al catálogo</Button>
            </Stack>
        );
    }

    return (
        <Stack gap="md">
            <Title order={2} c="navy.9">Mi pedido</Title>
            <Grid gutter="lg">
                <Grid.Col span={{ base: 12, md: 8 }}>
                <Paper withBorder radius="lg" p="md" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
                    <Table.ScrollContainer minWidth={520}>
                        <Table verticalSpacing="xs">
                            <Table.Thead><Table.Tr><Table.Th>Producto</Table.Th><Table.Th ta="right">Precio</Table.Th><Table.Th ta="right">Cantidad</Table.Th><Table.Th ta="right">Monto</Table.Th><Table.Th /></Table.Tr></Table.Thead>
                            <Table.Tbody>{items.map((i) => <Fila key={i.producto.id} item={i} tasa={tasa} />)}</Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>
                    <Button variant="subtle" color="red" size="xs" mt="sm" onClick={vaciar}>Vaciar pedido</Button>
                </Paper>
                </Grid.Col>

                <Grid.Col span={{ base: 12, md: 4 }}>
                <Paper withBorder radius="lg" p="md" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
                    <Stack gap="sm">
                        <Title order={4} c="navy.9">Resumen</Title>
                        <Box>
                            <Text size="sm" fw={600} mb={4}>Entrega</Text>
                            <SegmentedControl fullWidth color="navy.9" value={tipoEntrega} onChange={setTipoEntrega} data={[{ value: 'pickup', label: 'Retiro en tienda' }, { value: 'flete', label: 'Envío (flete)' }]} />
                            {tipoEntrega === 'flete' && (
                                <>
                                    <TextInput size="xs" mt="xs" label="Empresa de transporte que retira tu pedido" placeholder="Ej: MRW, Zoom, o tu propio chofer" maxLength={120} value={transporte} onChange={(e) => setTransporte(e.currentTarget.value)} />
                                    <Text size="xs" c="dimmed" mt={4}>El costo del flete lo coordinamos contigo al preparar el pedido y se suma a tu total.</Text>
                                </>
                            )}
                        </Box>
                        <Box>
                            <Text size="sm" fw={600} mb={4}>Documento</Text>
                            <SegmentedControl
                                fullWidth color="navy.9" value={documento} onChange={setDocumento}
                                data={[{ value: 'NOTA_ENTREGA', label: 'Nota de entrega' }, { value: 'FACTURA', label: 'Factura' }]}
                            />
                            <Text size="xs" c="dimmed" mt={4}>{documento === 'FACTURA' ? 'La factura incluye el IVA.' : 'La nota de entrega no lleva IVA.'}</Text>
                        </Box>
                        <Box>
                            <Text size="sm" fw={600} mb={4}>Forma de pago</Text>
                            <SegmentedControl
                                fullWidth color="navy.9" value={pago} onChange={setFormaPago}
                                data={[{ value: 'Contado', label: 'De contado' }, { value: 'Credito', label: `A crédito${credito?.habilitado ? ` (${credito.diasCredito} días)` : ''}`, disabled: !puedeCredito }]}
                            />
                            {credito?.habilitado ? (
                                <Text size="xs" c="dimmed" mt={4}>
                                    {puedeCredito
                                        ? `Pagas dentro de ${credito.diasCredito} días. Pedidos a crédito activos: ${credito.activos} de ${credito.maxPedidos}.`
                                        : `Ya usas tus ${credito.maxPedidos} pedidos a crédito permitidos. Paga alguno para pedir otro a crédito.`}
                                </Text>
                            ) : credito ? <Text size="xs" c="dimmed" mt={4}>Tu cuenta no tiene crédito habilitado. Consulta con administración.</Text> : null}
                        </Box>
                        <Divider />
                        <Group justify="space-between"><Text size="sm">Subtotal</Text><Text size="sm">{fmtUsd(factura.subtotal)}</Text></Group>
                        {factura.exento > 0 && <Group justify="space-between"><Text size="xs" c="dimmed">De los cuales exentos</Text><Text size="xs" c="dimmed">{fmtUsd(factura.exento)}</Text></Group>}
                        {factura.ivaDetalle.map((d) => (
                            <Group key={d.alicuota} justify="space-between"><Text size="sm">IVA {d.alicuota}% <Text span size="xs" c="dimmed">(base {fmtUsd(d.base)})</Text></Text><Text size="sm">{fmtUsd(d.iva)}</Text></Group>
                        ))}
                        <Divider />
                        <Group justify="space-between" align="flex-start">
                            <Text fw={800}>Total</Text>
                            <Box ta="right">
                                <Text fz={22} fw={900} c="navy.9" lh={1.1}>{fmtUsd(factura.totalFinal)}</Text>
                                {tasa && <Text size="sm" c="dimmed" fw={600}>{fmtBs(aBolivares(factura.totalFinal, tasa))}</Text>}
                            </Box>
                        </Group>
                        {tasa && <Text size="xs" c="dimmed">Tasa BCV {tasa} Bs/$. El monto en bolívares se fija con la tasa vigente al enviar el pedido.</Text>}
                        {error && <Alert color="red" icon={<IconAlertTriangle size={16} />} p="xs">{error}</Alert>}
                        <Button size="md" color="navy.9" loading={enviando} onClick={abrirConfirmacion} leftSection={<IconCheck size={18} />}>Enviar pedido</Button>
                    </Stack>
                </Paper>
                </Grid.Col>
            </Grid>

            <Modal opened={confirmando} onClose={cerrarConfirmacion} title="Confirmar pedido" centered>
                <Stack gap="md">
                    <Text size="sm">Vas a enviar un pedido por <b>{fmtUsd(factura.totalFinal)}</b>{tasa ? <> ({fmtBs(aBolivares(factura.totalFinal, tasa))})</> : null}. Los precios y existencias se verifican al enviarlo.</Text>
                    {pago === 'Credito' && <Alert color="blue" variant="light">Es un pedido <b>a crédito</b> ({documento === 'FACTURA' ? 'factura' : 'nota de entrega'}): tienes <b>{credito.diasCredito} días</b> para pagarlo, completo o en abonos por Pago Móvil desde tu portal.</Alert>}
                    <Group justify="flex-end">
                        <Button variant="default" onClick={cerrarConfirmacion}>Revisar</Button>
                        <Button color="navy.9" onClick={confirmar} loading={enviando}>Enviar pedido</Button>
                    </Group>
                </Stack>
            </Modal>
        </Stack>
    );
}
