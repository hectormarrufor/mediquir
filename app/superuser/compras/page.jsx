'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import {
    Box, Title, Paper, Table, Badge, Group, Text, TextInput, Button, SimpleGrid, UnstyledButton, Checkbox, Stack
} from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { IconSearch, IconReceipt2, IconCoins, IconArrowRight, IconCalendarEvent, IconPlus, IconCash, IconAlertTriangle, IconReceiptTax, IconFileInvoice } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import PrecioVisual from '@/app/components/ui/PrecioVisual';
import NotaCompraModal from './NotaCompraModal';
import PagarRetenerModal, { estadoRetencion, saldoDe } from './_components/PagarRetenerModal';
import { fechaCaracas, formatearFecha } from '@/app/constants/hora';
import { useTasaBcv } from '@/hooks/useTasaBcv';
import { useAuth } from '@/hooks/useAuth';

const CompraModal = dynamic(() => import('@/app/components/admin/CompraModal'), { ssr: false });

const fmt = (n) => Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const sim = (moneda) => (moneda === 'BS' ? 'Bs' : '$');
const RETENCION = {
    retenida: { color: 'teal', label: 'Retenida' },
    pendiente: { color: 'orange', label: 'Falta retener' },
    sin_retener: { color: 'gray', label: 'Sin retener' },
    sin_iva: { color: 'gray', label: 'Sin IVA' },
    nota: { color: 'indigo', label: 'Nota de entrega' },
};

async function pedir(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('No se pudo cargar');
    return res.json();
}

function Indicador({ icono: Icono, color, etiqueta, valor, sub, onClick, activo }) {
    return (
        <UnstyledButton onClick={onClick} style={{ width: '100%' }}>
            <Paper withBorder p="md" radius="lg" bg="white" style={{ borderColor: activo ? `var(--mantine-color-${color}-6)` : undefined, borderWidth: activo ? 2 : 1 }}>
                <Group justify="space-between" wrap="nowrap">
                    <div><Text size="xs" tt="uppercase" fw={800} c="dimmed">{etiqueta}</Text><Text fw={900} size="xl" c="dark">{valor}</Text>{sub && <Text size="xs" c="dimmed">{sub}</Text>}</div>
                    <Icono size={28} color={`var(--mantine-color-${color}-6)`} />
                </Group>
            </Paper>
        </UnstyledButton>
    );
}

// Compras y gastos: qué se le debe a cada proveedor, qué falta por retener y los comprobantes emitidos.
// Lo de todos los días: marcar las facturas de un proveedor y «Pagar y retener» en un solo paso.
export default function ComprasDashboardPage() {
    const router = useRouter();
    const { esVendedor } = useAuth();
    const queryClient = useQueryClient();

    const [vista, setVista] = useState('periodo'); // periodo | por_pagar | falta_retener | retenciones
    // Por defecto, el mes en curso (antes solo hoy: la lista casi siempre salía vacía)
    const [fechaInicio, setFechaInicio] = useState(`${fechaCaracas().slice(0, 8)}01`);
    const [fechaFin, setFechaFin] = useState(fechaCaracas());
    const [search, setSearch] = useState('');
    const [notaDe, setNotaDe] = useState(null); // factura de compra a la que se le registra una nota del proveedor
    const [gastoAbierto, setGastoAbierto] = useState(false); // registrar un gasto (no afecta el inventario)
    const [compraAbierta, setCompraAbierta] = useState(false); // registrar una compra de mercancía
    const [seleccion, setSeleccion] = useState([]); // facturas de UN proveedor para pagar o retener juntas
    const [accion, setAccion] = useState(null); // { modo: 'pagar' | 'retener', facturas }

    // Tasa BCV vigente (antes se descargaba el histórico completo solo para leer la última)
    const { tasa: tasaBcv } = useTasaBcv();
    const alCerrar = () => {
        queryClient.invalidateQueries({ queryKey: ['historial-compras'] });
        queryClient.invalidateQueries({ queryKey: ['compras-pendientes'] });
        queryClient.invalidateQueries({ queryKey: ['cuentas'] });
    };

    const { data: compras, isLoading } = useQuery({
        queryKey: ['historial-compras', fechaInicio, fechaFin],
        queryFn: () => pedir(`/api/compras?fechaInicio=${fechaInicio}&fechaFin=${fechaFin}`),
    });
    // Lo pendiente (por pagar o por retener) de cualquier fecha
    const { data: pendientes } = useQuery({ queryKey: ['compras-pendientes'], enabled: !esVendedor, queryFn: () => pedir('/api/compras?pendientes=1') });
    const { data: ret } = useQuery({
        queryKey: ['retenciones-compras', fechaInicio, fechaFin], enabled: !esVendedor,
        queryFn: () => pedir(`/api/compras/retenciones?desde=${fechaInicio}&hasta=${fechaFin}`),
    });

    const porPagar = (pendientes || []).filter((c) => saldoDe(c) > 0.005)
        .sort((a, b) => String(a.proveedor?.nombre).localeCompare(String(b.proveedor?.nombre)) || String(a.fechaFactura).localeCompare(String(b.fechaFactura)));
    const faltaRetener = (pendientes || []).filter((c) => estadoRetencion(c) === 'pendiente')
        .sort((a, b) => String(a.proveedor?.nombre).localeCompare(String(b.proveedor?.nombre)) || String(a.fechaFactura).localeCompare(String(b.fechaFactura)));
    const deudaPor = (m) => porPagar.filter((c) => (c.cuentaPorPagar?.moneda || c.moneda) === m).reduce((a, c) => a + saldoDe(c), 0);
    const comprobantes = ret?.comprobantes || [];

    const q = search.trim().toLowerCase();
    const coincide = (...campos) => !q || campos.some((x) => String(x || '').toLowerCase().includes(q));
    const base = vista === 'por_pagar' ? porPagar : vista === 'falta_retener' ? faltaRetener : (compras || []);
    const lista = base.filter((c) => coincide(c.numeroDocumento, c.proveedor?.nombre, c.proveedor?.identificacion, c.descripcionGasto));
    const comprobantesFiltrados = comprobantes.filter((c) => coincide(c.comprobante, c.proveedor, c.rif, c.facturas.join(' ')));

    const conCasillas = !esVendedor && (vista === 'por_pagar' || vista === 'falta_retener');
    const proveedorSel = seleccion[0]?.proveedorId ?? null;
    const alternar = (c) => setSeleccion((prev) => (prev.some((x) => x.id === c.id) ? prev.filter((x) => x.id !== c.id) : [...prev, c]));
    const cambiarVista = (v) => { setVista(v); setSeleccion([]); };
    const selConSaldo = seleccion.some((c) => saldoDe(c) > 0.005);
    const selPorRetener = seleccion.some((c) => ['pendiente', 'sin_retener'].includes(estadoRetencion(c)));

    const formatearFechaHora = (fechaStr) => (fechaStr ? new Date(fechaStr).toLocaleString('es-VE', { timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : '');

    const filaCompra = (compra) => {
        const est = estadoRetencion(compra);
        const saldo = saldoDe(compra);
        const monedaCxp = compra.cuentaPorPagar?.moneda || compra.moneda;
        const vencida = saldo > 0 && compra.cuentaPorPagar?.fechaVencimiento && String(compra.cuentaPorPagar.fechaVencimiento).slice(0, 10) < fechaCaracas();
        const comprobante = (compra.retenciones || []).find((r) => r.comprobante)?.comprobante;
        const bloqueada = proveedorSel != null && compra.proveedorId !== proveedorSel;
        return (
            <Table.Tr key={compra.id} bg={seleccion.some((x) => x.id === compra.id) ? 'orange.0' : undefined}>
                {conCasillas && (
                    <Table.Td w={36}>
                        <Checkbox color="orange" checked={seleccion.some((x) => x.id === compra.id)} disabled={bloqueada} onChange={() => alternar(compra)}
                            title={bloqueada ? 'Se pagan juntas solo facturas de un mismo proveedor' : 'Elegir para pagar o retener juntas'} aria-label={`Elegir ${compra.numeroDocumento}`} />
                    </Table.Td>
                )}
                <Table.Td>
                    <Text size="sm" fw={600}>{formatearFecha(compra.fechaFactura)}</Text>
                    {vista === 'periodo' && <Text size="xs" c="dimmed">Reg. {formatearFechaHora(compra.createdAt)}</Text>}
                </Table.Td>
                <Table.Td fw={700}>
                    {compra.tipoDocumento === 'FACTURA' ? 'Factura ' : 'Nota '}{compra.numeroDocumento}
                    {compra.esGasto && <Badge ml={6} size="xs" color="teal" variant="light">Gasto</Badge>}
                    {compra.esGasto && compra.descripcionGasto && <Text size="xs" c="dimmed" fw={400} lineClamp={1}>{compra.descripcionGasto}</Text>}
                </Table.Td>
                <Table.Td>
                    <Text fw={600} size="sm">{compra.proveedor?.nombre}</Text>
                    <Text size="xs" c="dimmed">RIF: {compra.proveedor?.identificacion}</Text>
                </Table.Td>
                <Table.Td>
                    {compra.condicionPago === 'Contado'
                        ? <Badge color="green" variant="light">Contado</Badge>
                        : saldo > 0.005
                            ? <><Badge color={vencida ? 'red' : 'orange'} variant="filled">{vencida ? 'Vencida' : 'Por pagar'}</Badge><Text size="xs" fw={700} mt={2}>{sim(monedaCxp)} {fmt(saldo)}</Text>{compra.cuentaPorPagar?.fechaVencimiento && <Text size="xs" c="dimmed">vence {formatearFecha(compra.cuentaPorPagar.fechaVencimiento)}</Text>}</>
                            : <Badge color="teal" variant="light">Pagada</Badge>}
                </Table.Td>
                <Table.Td>
                    <Badge color={RETENCION[est].color} variant={est === 'pendiente' ? 'filled' : 'light'}>{RETENCION[est].label}</Badge>
                    {comprobante && <Text size="xs" c="dimmed" mt={2}>{comprobante}</Text>}
                </Table.Td>
                <Table.Td><PrecioVisual valor={compra.totalFinal} simbolo={sim(compra.moneda)} size="sm" fw={700} /></Table.Td>
                <Table.Td>
                    <Group gap={6} justify="flex-end" wrap="nowrap">
                        {!esVendedor && saldo > 0.005 && <Button size="xs" color="teal" leftSection={<IconCash size={14} />} onClick={() => setAccion({ modo: 'pagar', facturas: [compra] })}>Pagar</Button>}
                        {!esVendedor && ['pendiente', 'sin_retener'].includes(est) && <Button size="xs" color="orange" variant={est === 'pendiente' ? 'filled' : 'light'} onClick={() => setAccion({ modo: 'retener', facturas: [compra] })}>Retener</Button>}
                        {est === 'retenida' && <Button size="xs" variant="light" color="green" onClick={() => router.push(`/superuser/compras/${compra.id}/retencion`)}>Comprobante</Button>}
                        {compra.tipoDocumento === 'FACTURA' && vista === 'periodo' && <Button size="xs" variant="subtle" color="grape" onClick={() => setNotaDe(compra)}>Nota del proveedor</Button>}
                        <Button size="xs" variant="light" color="blue" rightSection={<IconArrowRight size={14} />} onClick={() => router.push(`/superuser/compras/${compra.id}`)}>Ver</Button>
                    </Group>
                </Table.Td>
            </Table.Tr>
        );
    };

    return (
        <Box p="md" maw={1400} mx="auto" pb={seleccion.length ? 110 : 'md'}>
            <Group justify="space-between" mb="lg" wrap="wrap" gap="sm">
                <Group gap="sm">
                    <IconReceipt2 size={28} color="#74c0fc" />
                    <Title order={2} c="white">Compras y gastos</Title>
                </Group>
                <Group gap="xs" wrap="wrap">
                    <Button color="accent.6" leftSection={<IconPlus size={18} />} onClick={() => setCompraAbierta(true)} disabled={!tasaBcv}>Registrar compra</Button>
                    <Button color="teal" leftSection={<IconCoins size={18} />} onClick={() => setGastoAbierto(true)} disabled={!tasaBcv}>Registrar gasto</Button>
                    {!esVendedor && <Button variant="light" color="orange" onClick={() => router.push('/superuser/cxp')}>Cuentas por pagar</Button>}
                </Group>
            </Group>

            {!esVendedor && (
                // Una sola forma de cambiar de vista: estas tarjetas (antes una barra de filtros repetía lo mismo)
                <SimpleGrid cols={{ base: 2, md: 4 }} mb="md">
                    <Indicador icono={IconCash} color="red" etiqueta="Por pagar" valor={porPagar.length} activo={vista === 'por_pagar'} onClick={() => cambiarVista('por_pagar')}
                        sub={porPagar.length ? [deudaPor('USD') > 0 && `$ ${fmt(deudaPor('USD'))}`, deudaPor('BS') > 0 && `Bs ${fmt(deudaPor('BS'))}`].filter(Boolean).join(' + ') : 'Nada pendiente'} />
                    <Indicador icono={IconAlertTriangle} color="orange" etiqueta="Falta retener" valor={faltaRetener.length} activo={vista === 'falta_retener'} onClick={() => cambiarVista('falta_retener')}
                        sub={faltaRetener.length ? 'Se retienen al pagarlas' : 'Todo al día'} />
                    <Indicador icono={IconReceipt2} color="blue" etiqueta="Todas" valor={(compras || []).length} activo={vista === 'periodo'} onClick={() => cambiarVista('periodo')} sub="Las del periodo" />
                    <Indicador icono={IconReceiptTax} color="teal" etiqueta="Comprobantes" valor={comprobantes.length} activo={vista === 'retenciones'} onClick={() => cambiarVista('retenciones')}
                        sub={`Bs ${fmt(comprobantes.reduce((a, c) => a + c.retenidoBs, 0))} retenido`} />
                </SimpleGrid>
            )}

            {/* FILTROS */}
            <Paper p="sm" mb="md" withBorder radius="md" bg="blue.0">
                <Stack gap="xs">
                    <Group justify="space-between" wrap="wrap" align="flex-end" gap="sm">
                        <Group gap="sm" align="center" style={{ flex: '1 1 260px' }}>
                            <IconCalendarEvent size={20} color="#1971C2" />
                            <TextInput placeholder={vista === 'retenciones' ? 'Buscar por comprobante, proveedor o factura…' : 'Buscar por número o proveedor…'} style={{ flex: 1 }} size="sm"
                                leftSection={<IconSearch size={16} />} value={search} onChange={(e) => setSearch(e.currentTarget.value)} />
                        </Group>
                        {(vista === 'periodo' || vista === 'retenciones') && (
                            <Group gap="xs" wrap="nowrap">
                                <TextInput type="date" size="sm" label="Desde" value={fechaInicio} max={fechaFin} onChange={(e) => setFechaInicio(e.currentTarget.value)} />
                                <TextInput type="date" size="sm" label="Hasta" value={fechaFin} min={fechaInicio} onChange={(e) => setFechaFin(e.currentTarget.value)} />
                            </Group>
                        )}
                    </Group>
                </Stack>
            </Paper>

            {conCasillas && lista.length > 0 && (
                <Text size="sm" c="gray.3" mb="sm">Toca <b>Pagar</b> o <b>Retener</b> en una factura, o marca varias de un proveedor para hacerlas juntas (un solo comprobante y un solo pago).</Text>
            )}

            {vista === 'retenciones' ? (
                <Paper withBorder radius="md" bg="white">
                    <Table.ScrollContainer minWidth={760}>
                        <Table striped highlightOnHover verticalSpacing="sm">
                            <Table.Thead bg="gray.0">
                                <Table.Tr><Table.Th>Comprobante</Table.Th><Table.Th>Fecha</Table.Th><Table.Th>Proveedor</Table.Th><Table.Th>Factura(s)</Table.Th><Table.Th ta="right">Retenido</Table.Th><Table.Th /></Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {comprobantesFiltrados.length === 0 && <Table.Tr><Table.Td colSpan={6} align="center" py="xl">No hay comprobantes de retención en este periodo.</Table.Td></Table.Tr>}
                                {comprobantesFiltrados.map((c) => (
                                    <Table.Tr key={c.comprobante}>
                                        <Table.Td fw={700}>{c.comprobante}</Table.Td>
                                        <Table.Td>{formatearFecha(c.fecha)}</Table.Td>
                                        <Table.Td><Text size="sm" fw={600}>{c.proveedor}</Text><Text size="xs" c="dimmed">{c.rif}</Text></Table.Td>
                                        <Table.Td>{c.facturas.join(', ')}</Table.Td>
                                        <Table.Td ta="right"><Text size="sm" fw={700}>Bs {fmt(c.retenidoBs)}</Text><Text size="xs" c="dimmed">{c.porcentaje}%</Text></Table.Td>
                                        <Table.Td ta="right">
                                            {c.facturaIds[0] && <Button size="xs" color="green" variant="light" leftSection={<IconFileInvoice size={14} />} onClick={() => router.push(`/superuser/compras/${c.facturaIds[0]}/retencion`)}>Ver, imprimir o enviar</Button>}
                                        </Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>
                </Paper>
            ) : (
                <Paper withBorder radius="md" bg="white">
                    <Table.ScrollContainer minWidth={1040}>
                        <Table striped highlightOnHover verticalSpacing="sm">
                            <Table.Thead bg="gray.0">
                                <Table.Tr>
                                    {conCasillas && <Table.Th />}
                                    <Table.Th>Fecha</Table.Th>
                                    <Table.Th>Documento</Table.Th>
                                    <Table.Th>Proveedor</Table.Th>
                                    <Table.Th>Pago</Table.Th>
                                    <Table.Th>Retención</Table.Th>
                                    <Table.Th>Total</Table.Th>
                                    <Table.Th />
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {vista === 'periodo' && isLoading ? (
                                    <Table.Tr><Table.Td colSpan={8} align="center" py="xl">Cargando facturas de compra...</Table.Td></Table.Tr>
                                ) : lista.length === 0 ? (
                                    <Table.Tr><Table.Td colSpan={8} align="center" py="xl">{vista === 'por_pagar' ? 'No se le debe nada a ningún proveedor.' : vista === 'falta_retener' ? 'No hay facturas por retener.' : 'No hay compras registradas en este periodo.'}</Table.Td></Table.Tr>
                                ) : lista.map(filaCompra)}
                            </Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>
                </Paper>
            )}

            {seleccion.length > 0 && (
                <Paper withBorder radius="lg" p="md" shadow="lg" bg="white" style={{ position: 'fixed', left: 16, right: 16, bottom: 16, zIndex: 150, maxWidth: 1100, margin: '0 auto', borderColor: 'var(--mantine-color-orange-6)', borderWidth: 2 }}>
                    <Group justify="space-between" wrap="wrap" gap="sm">
                        <div>
                            <Text fw={800}>{seleccion.length} factura(s) de {seleccion[0].proveedor?.nombre}</Text>
                            <Text size="sm" c="dimmed">Un solo comprobante de retención y un solo pago.</Text>
                        </div>
                        <Group gap="xs">
                            <Button variant="default" onClick={() => setSeleccion([])}>Quitar selección</Button>
                            {selPorRetener && <Button color="orange" variant="light" onClick={() => setAccion({ modo: 'retener', facturas: seleccion })}>Solo retener</Button>}
                            {selConSaldo && <Button color="teal" leftSection={<IconCash size={16} />} onClick={() => setAccion({ modo: 'pagar', facturas: seleccion })}>{selPorRetener ? 'Pagar y retener' : 'Pagar'}</Button>}
                        </Group>
                    </Group>
                </Paper>
            )}

            {accion && <PagarRetenerModal facturas={accion.facturas} modo={accion.modo} onClose={() => setAccion(null)} onListo={() => setSeleccion([])} />}
            {gastoAbierto && <CompraModal opened={gastoAbierto} iniciarComoGasto onClose={() => { setGastoAbierto(false); alCerrar(); }} tasaBcv={tasaBcv || 0} />}
            {compraAbierta && <CompraModal opened={compraAbierta} onClose={() => { setCompraAbierta(false); alCerrar(); }} tasaBcv={tasaBcv || 0} />}
            {notaDe && <NotaCompraModal opened onClose={() => setNotaDe(null)} compra={notaDe} />}
        </Box>
    );
}
