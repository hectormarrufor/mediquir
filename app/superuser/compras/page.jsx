'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
    ActionIcon, Box, Title, Paper, Table, Badge, Group, Text, TextInput, Button, SimpleGrid, Checkbox, Stack, SegmentedControl
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { IconSearch, IconArrowLeft, IconArrowRight, IconCalendarEvent, IconCash, IconReceiptTax, IconFileInvoice, IconFilePlus, IconCoins, IconBook2, IconReceiptOff, IconNotes } from '@tabler/icons-react';
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
    pendiente: { color: 'orange', label: 'Por retener' },
    sin_retener: { color: 'gray', label: 'Sin retener' },
    sin_iva: { color: 'gray', label: 'Sin IVA' },
    nota: { color: 'indigo', label: 'Nota de entrega' },
};
const VISTAS = {
    periodo: { titulo: 'Historial de compras y gastos', sub: 'Las facturas, notas de entrega y gastos registrados en el periodo.' },
    retenciones: { titulo: 'Retenciones de IVA', sub: 'Las facturas por retener y los comprobantes emitidos.' },
    por_pagar: { titulo: 'Cuentas por pagar', sub: 'Lo que se le debe a cada proveedor: pagar y retener en un paso.' },
};

async function pedir(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('No se pudo cargar');
    return res.json();
}

// Botón grande del inicio (como el modelo de «Registro de compras» que mandó administración)
function BotonModulo({ icono: Icono, titulo, sub, onClick, href, disabled }) {
    const contenido = (
        <Stack gap={6} align="center" justify="center" h="100%">
            <Icono size={28} />
            <Text fw={800} size="sm" ta="center" lh={1.2}>{titulo}</Text>
            {sub && <Text size="xs" ta="center" lh={1.2} c="teal.0">{sub}</Text>}
        </Stack>
    );
    const props = { color: 'teal', h: 112, radius: 'lg', fullWidth: true, disabled, styles: { label: { whiteSpace: 'normal', width: '100%' } } };
    return href ? <Button component={Link} href={href} {...props}>{contenido}</Button> : <Button onClick={onClick} {...props}>{contenido}</Button>;
}

// Registro de compras: al entrar, botones para cada cosa y un resumen de documentos; cada botón abre SOLO lo suyo
// (historial, retenciones de IVA o cuentas por pagar). Los gastos se registran aparte de las compras de mercancía.
export default function ComprasDashboardPage() {
    const router = useRouter();
    const { esVendedor } = useAuth();
    const queryClient = useQueryClient();

    const [vista, setVista] = useState(null); // null = inicio · periodo | retenciones | por_pagar
    const [subRet, setSubRet] = useState('pendientes'); // dentro de Retenciones: pendientes | emitidos
    // Por defecto, el mes en curso (antes solo hoy: la lista casi siempre salía vacía)
    const [fechaInicio, setFechaInicio] = useState(`${fechaCaracas().slice(0, 8)}01`);
    const [fechaFin, setFechaFin] = useState(fechaCaracas());
    const [search, setSearch] = useState('');
    const [notaDe, setNotaDe] = useState(null); // factura de compra a la que se le registra una nota del proveedor
    const [gastoAbierto, setGastoAbierto] = useState(false); // registrar un gasto (no afecta el inventario)
    const [compraAbierta, setCompraAbierta] = useState(false); // registrar una compra de mercancía
    const [seleccion, setSeleccion] = useState([]); // facturas de UN proveedor para pagar o retener juntas
    const [accion, setAccion] = useState(null); // { modo: 'pagar' | 'retener', facturas }

    // Enlaces de afuera: ?vista=periodo|retenciones|por_pagar
    useEffect(() => {
        const v = new URLSearchParams(window.location.search).get('vista');
        if (v === 'falta_retener') setVista('retenciones');
        else if (VISTAS[v]) setVista(v);
    }, []);

    // Tasa BCV vigente (antes se descargaba el histórico completo solo para leer la última)
    const { tasa: tasaBcv } = useTasaBcv();
    const alCerrar = () => {
        queryClient.invalidateQueries({ queryKey: ['historial-compras'] });
        queryClient.invalidateQueries({ queryKey: ['compras-pendientes'] });
        queryClient.invalidateQueries({ queryKey: ['retenciones-compras'] });
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
    const deudaTexto = [deudaPor('USD') > 0 && `$ ${fmt(deudaPor('USD'))}`, deudaPor('BS') > 0 && `Bs ${fmt(deudaPor('BS'))}`].filter(Boolean).join(' + ');
    const comprobantes = ret?.comprobantes || [];
    const delPeriodo = compras || [];

    const q = search.trim().toLowerCase();
    const coincide = (...campos) => !q || campos.some((x) => String(x || '').toLowerCase().includes(q));
    const base = vista === 'por_pagar' ? porPagar : vista === 'retenciones' ? faltaRetener : delPeriodo;
    const lista = base.filter((c) => coincide(c.numeroDocumento, c.proveedor?.nombre, c.proveedor?.identificacion, c.descripcionGasto));
    const comprobantesFiltrados = comprobantes.filter((c) => coincide(c.comprobante, c.proveedor, c.rif, c.facturas.join(' ')));

    const conCasillas = !esVendedor && (vista === 'por_pagar' || (vista === 'retenciones' && subRet === 'pendientes'));
    const proveedorSel = seleccion[0]?.proveedorId ?? null;
    const alternar = (c) => setSeleccion((prev) => (prev.some((x) => x.id === c.id) ? prev.filter((x) => x.id !== c.id) : [...prev, c]));
    const abrir = (v) => { setVista(v); setSeleccion([]); setSearch(''); };
    const selConSaldo = seleccion.some((c) => saldoDe(c) > 0.005);
    const selPorRetener = seleccion.some((c) => ['pendiente', 'sin_retener'].includes(estadoRetencion(c)));

    // «No aplica retención»: la factura deja de estar por retener (por ejemplo, se pagó con la tarjeta de la empresa)
    const noAplica = async (compra) => {
        if (!window.confirm(`¿A la factura ${compra.numeroDocumento} de ${compra.proveedor?.nombre || 'este proveedor'} no se le hará retención de IVA? Dejará de salir en «Por retener».`)) return;
        try {
            const res = await fetch('/api/compras/retenciones', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ facturaId: compra.id }) });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'No se pudo cambiar');
            notifications.show({ color: 'green', message: `Factura ${compra.numeroDocumento}: no aplica retención.` });
            setSeleccion((s) => s.filter((x) => x.id !== compra.id));
            alCerrar();
        } catch (e) {
            notifications.show({ color: 'red', title: 'No se pudo cambiar', message: e.message });
        }
    };

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
                            title={bloqueada ? 'Se juntan solo facturas de un mismo proveedor' : 'Elegir junto con otras facturas del proveedor'} aria-label={`Elegir ${compra.numeroDocumento}`} />
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
                            ? <><Badge color={vencida ? 'red' : 'orange'} variant="light">{vencida ? 'Vencida' : 'Por pagar'}</Badge><Text size="xs" fw={700} mt={2}>{sim(monedaCxp)} {fmt(saldo)}</Text>{compra.cuentaPorPagar?.fechaVencimiento && <Text size="xs" c="dimmed">vence {formatearFecha(compra.cuentaPorPagar.fechaVencimiento)}</Text>}</>
                            : <Badge color="teal" variant="light">Pagada</Badge>}
                </Table.Td>
                <Table.Td>
                    <Badge color={RETENCION[est].color} variant="light">{RETENCION[est].label}</Badge>
                    {comprobante && <Text size="xs" c="dimmed" mt={2}>{comprobante}</Text>}
                </Table.Td>
                <Table.Td><PrecioVisual valor={compra.totalFinal} simbolo={sim(compra.moneda)} size="sm" fw={700} /></Table.Td>
                <Table.Td>
                    <Group gap={6} justify="flex-end" wrap="nowrap">
                        {!esVendedor && vista === 'por_pagar' && saldo > 0.005 && <Button size="xs" color="teal" leftSection={<IconCash size={14} />} onClick={() => setAccion({ modo: 'pagar', facturas: [compra] })}>{['pendiente', 'sin_retener'].includes(est) ? 'Pagar y retener' : 'Pagar'}</Button>}
                        {!esVendedor && vista !== 'por_pagar' && ['pendiente', 'sin_retener'].includes(est) && <Button size="xs" color="orange" variant={est === 'pendiente' ? 'filled' : 'light'} onClick={() => setAccion({ modo: 'retener', facturas: [compra] })}>Retener</Button>}
                        {/* Pedido de administración: un botón aparte para las facturas a las que nunca se les hará retención */}
                        {!esVendedor && vista === 'retenciones' && est === 'pendiente' && <Button size="xs" variant="default" leftSection={<IconReceiptOff size={14} />} onClick={() => noAplica(compra)}>No aplica retención</Button>}
                        {est === 'retenida' && vista !== 'por_pagar' && <Button size="xs" variant="light" color="green" onClick={() => router.push(`/superuser/compras/${compra.id}/retencion`)}>Comprobante</Button>}
                        {compra.tipoDocumento === 'FACTURA' && vista === 'periodo' && <Button size="xs" variant="subtle" color="grape" onClick={() => setNotaDe(compra)}>Nota del proveedor</Button>}
                        <Button size="xs" variant="light" color="blue" rightSection={<IconArrowRight size={14} />} onClick={() => router.push(`/superuser/compras/${compra.id}`)}>Ver</Button>
                    </Group>
                </Table.Td>
            </Table.Tr>
        );
    };

    const fechas = (
        <Group gap="xs" wrap="nowrap">
            <TextInput type="date" size="sm" label="Desde" value={fechaInicio} max={fechaFin} onChange={(e) => setFechaInicio(e.currentTarget.value)} />
            <TextInput type="date" size="sm" label="Hasta" value={fechaFin} min={fechaInicio} onChange={(e) => setFechaFin(e.currentTarget.value)} />
        </Group>
    );
    const buscador = (conFechas) => (
        <Paper p="sm" mb="md" withBorder radius="md" bg="blue.0">
            <Group justify="space-between" wrap="wrap" align="flex-end" gap="sm">
                <Group gap="sm" align="center" style={{ flex: '1 1 260px' }}>
                    <IconCalendarEvent size={20} color="#1971C2" />
                    <TextInput placeholder={vista === 'retenciones' && subRet === 'emitidos' ? 'Buscar por comprobante, proveedor o factura…' : 'Buscar por número o proveedor…'} style={{ flex: 1 }} size="sm"
                        leftSection={<IconSearch size={16} />} value={search} onChange={(e) => setSearch(e.currentTarget.value)} />
                </Group>
                {conFechas && fechas}
            </Group>
        </Paper>
    );
    const tablaCompras = (vacio) => (
        <Paper withBorder radius="md" bg="white">
            <Table.ScrollContainer minWidth={1040}>
                <Table striped highlightOnHover verticalSpacing="sm">
                    <Table.Thead bg="gray.0">
                        <Table.Tr>
                            {conCasillas && <Table.Th />}
                            <Table.Th>Fecha</Table.Th><Table.Th>Documento</Table.Th><Table.Th>Proveedor</Table.Th><Table.Th>Pago</Table.Th><Table.Th>Retención</Table.Th><Table.Th>Total</Table.Th><Table.Th />
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {vista === 'periodo' && isLoading
                            ? <Table.Tr><Table.Td colSpan={8} align="center" py="xl">Cargando…</Table.Td></Table.Tr>
                            : lista.length === 0 ? <Table.Tr><Table.Td colSpan={8} align="center" py="xl">{vacio}</Table.Td></Table.Tr> : lista.map(filaCompra)}
                    </Table.Tbody>
                </Table>
            </Table.ScrollContainer>
        </Paper>
    );

    // Resumen del periodo (sin alarmas: cuántos hay y un botón para verlos)
    const facturasMes = delPeriodo.filter((c) => !c.esGasto && c.tipoDocumento === 'FACTURA').length;
    const notasMes = delPeriodo.filter((c) => !c.esGasto && c.tipoDocumento !== 'FACTURA').length;
    const gastosMes = delPeriodo.filter((c) => c.esGasto).length;
    const resumen = [
        { doc: 'Facturas de mercancía', valor: facturasMes, ver: () => abrir('periodo') },
        { doc: 'Notas de entrega', valor: notasMes, ver: () => abrir('periodo') },
        { doc: 'Gastos', valor: gastosMes, ver: () => abrir('periodo') },
        ...(esVendedor ? [] : [
            { doc: 'Comprobantes de retención de IVA', valor: comprobantes.length, ver: () => { abrir('retenciones'); setSubRet('emitidos'); } },
            { doc: 'Facturas por retener (todas)', valor: faltaRetener.length, ver: () => { abrir('retenciones'); setSubRet('pendientes'); } },
            { doc: 'Cuentas por pagar (todas)', valor: porPagar.length, extra: deudaTexto, ver: () => abrir('por_pagar') },
        ]),
    ];
    const ultimas = [...delPeriodo].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 5);

    return (
        <Box p="md" maw={1400} mx="auto" pb={seleccion.length ? 110 : 'md'}>
            <Group justify="space-between" mb="lg" wrap="wrap" gap="sm">
                <Group gap="sm">
                    {vista && <ActionIcon variant="subtle" color="gray" size="lg" onClick={() => abrir(null)} aria-label="Volver a Registro de compras"><IconArrowLeft size={20} /></ActionIcon>}
                    <Box>
                        <Title order={2} c="white">{vista ? VISTAS[vista].titulo : 'Registro de compras'}</Title>
                        <Text size="sm" c="gray.4">{vista ? VISTAS[vista].sub : 'Facturas de proveedores, gastos, retenciones de IVA y cuentas por pagar.'}</Text>
                    </Box>
                </Group>
                {vista === 'periodo' && (
                    <Group gap="xs">
                        <Button color="accent.6" leftSection={<IconFilePlus size={18} />} onClick={() => setCompraAbierta(true)} disabled={!tasaBcv}>Registrar factura</Button>
                        <Button color="teal" leftSection={<IconCoins size={18} />} onClick={() => setGastoAbierto(true)} disabled={!tasaBcv}>Registrar gasto</Button>
                    </Group>
                )}
            </Group>

            {/* ---------- Inicio: botones y resumen ---------- */}
            {!vista && (
                <>
                    <SimpleGrid cols={{ base: 2, sm: 3, md: esVendedor ? 3 : 7 }} mb="xl">
                        <BotonModulo icono={IconFilePlus} titulo="Registrar factura de proveedor" sub="Foto o PDF: la IA la lee" onClick={() => setCompraAbierta(true)} disabled={!tasaBcv} />
                        <BotonModulo icono={IconCoins} titulo="Registrar gasto" sub="Servicios, comida, equipos" onClick={() => setGastoAbierto(true)} disabled={!tasaBcv} />
                        <BotonModulo icono={IconFileInvoice} titulo="Historial de compras y gastos" onClick={() => abrir('periodo')} />
                        {!esVendedor && <BotonModulo icono={IconReceiptTax} titulo="Retenciones de IVA" onClick={() => abrir('retenciones')} />}
                        {!esVendedor && <BotonModulo icono={IconCash} titulo="Cuentas por pagar" onClick={() => abrir('por_pagar')} />}
                        {!esVendedor && <BotonModulo icono={IconNotes} titulo="Notas de crédito y débito" href="/superuser/notas" />}
                        {!esVendedor && <BotonModulo icono={IconBook2} titulo="Libros de compras y ventas" href="/superuser/finanzas?tab=cierre" />}
                    </SimpleGrid>

                    <Text fw={800} c="white" mb="xs" tt="uppercase" size="sm">Resumen de documentos · {formatearFecha(fechaInicio)} al {formatearFecha(fechaFin)}</Text>
                    <Paper withBorder radius="lg" mb="xl" bg="white">
                        <Table verticalSpacing="sm">
                            <Table.Thead><Table.Tr><Table.Th>Documento</Table.Th><Table.Th ta="center">Cantidad</Table.Th><Table.Th /></Table.Tr></Table.Thead>
                            <Table.Tbody>
                                {resumen.map((r) => (
                                    <Table.Tr key={r.doc}>
                                        <Table.Td fw={600}>{r.doc}{r.extra ? <Text span size="xs" c="dimmed"> · {r.extra}</Text> : null}</Table.Td>
                                        <Table.Td ta="center" fw={700}>{r.valor}</Table.Td>
                                        <Table.Td ta="right"><Button size="xs" variant="light" onClick={r.ver}>Ver</Button></Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Paper>

                    <Text fw={800} c="white" mb="xs" tt="uppercase" size="sm">Últimos documentos registrados</Text>
                    <Paper withBorder radius="lg" bg="white">
                        {ultimas.length === 0 ? <Text c="dimmed" p="md">Todavía no hay compras registradas en este periodo.</Text> : (
                            <Table verticalSpacing="xs" highlightOnHover>
                                <Table.Tbody>
                                    {ultimas.map((c) => (
                                        <Table.Tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/superuser/compras/${c.id}`)}>
                                            <Table.Td><Text size="sm" fw={600}>{c.esGasto ? 'Gasto' : c.tipoDocumento === 'FACTURA' ? 'Factura' : 'Nota'} {c.numeroDocumento}</Text><Text size="xs" c="dimmed">{formatearFecha(c.fechaFactura)}</Text></Table.Td>
                                            <Table.Td><Text size="sm" lineClamp={1}>{c.proveedor?.nombre}</Text></Table.Td>
                                            <Table.Td ta="right"><PrecioVisual valor={c.totalFinal} simbolo={sim(c.moneda)} size="sm" fw={700} /></Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>
                        )}
                    </Paper>
                </>
            )}

            {/* ---------- Historial ---------- */}
            {vista === 'periodo' && <>{buscador(true)}{tablaCompras('No hay compras registradas en este periodo.')}</>}

            {/* ---------- Retenciones de IVA ---------- */}
            {vista === 'retenciones' && (
                <>
                    <SegmentedControl mb="md" value={subRet} onChange={(v) => { setSubRet(v); setSeleccion([]); }} data={[
                        { value: 'pendientes', label: `Por retener (${faltaRetener.length})` },
                        { value: 'emitidos', label: `Comprobantes emitidos (${comprobantes.length})` },
                    ]} />
                    {buscador(subRet === 'emitidos')}
                    {subRet === 'pendientes' && faltaRetener.length > 0 && <Text size="sm" c="gray.3" mb="sm"><b>Retener</b> genera el comprobante con el siguiente número (marca varias de un proveedor para uno solo). Si a una factura nunca se le hará retención, toca <b>No aplica retención</b>.</Text>}
                    {subRet === 'pendientes' && tablaCompras('No hay facturas por retener.')}
                    {subRet === 'emitidos' && (
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
                    )}
                </>
            )}

            {/* ---------- Cuentas por pagar ---------- */}
            {vista === 'por_pagar' && (
                <>
                    {buscador(false)}
                    {porPagar.length > 0 && <Text size="sm" c="gray.3" mb="sm">Total por pagar: <b>{deudaTexto}</b>. Marca varias facturas de un proveedor para pagarlas y retenerlas juntas. Si quien pagó no te pasó el comprobante, igual puedes marcarlo como pagado.</Text>}
                    {tablaCompras('No se le debe nada a ningún proveedor.')}
                </>
            )}

            {seleccion.length > 0 && (
                <Paper withBorder radius="lg" p="md" shadow="lg" bg="white" style={{ position: 'fixed', left: 16, right: 16, bottom: 16, zIndex: 150, maxWidth: 1100, margin: '0 auto', borderColor: 'var(--mantine-color-orange-6)', borderWidth: 2 }}>
                    <Group justify="space-between" wrap="wrap" gap="sm">
                        <div>
                            <Text fw={800}>{seleccion.length} factura(s) de {seleccion[0].proveedor?.nombre}</Text>
                            <Text size="sm" c="dimmed">Un solo comprobante de retención{vista === 'por_pagar' ? ' y un solo pago' : ''}.</Text>
                        </div>
                        <Group gap="xs">
                            <Button variant="default" onClick={() => setSeleccion([])}>Quitar selección</Button>
                            {vista === 'retenciones' && selPorRetener && <Button color="orange" onClick={() => setAccion({ modo: 'retener', facturas: seleccion })}>Generar un solo comprobante</Button>}
                            {vista === 'por_pagar' && selConSaldo && <Button color="teal" leftSection={<IconCash size={16} />} onClick={() => setAccion({ modo: 'pagar', facturas: seleccion })}>{selPorRetener ? 'Pagar y retener' : 'Pagar'}</Button>}
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
