'use client';

import React, { useMemo, useState } from 'react';
import { Accordion, ActionIcon, Alert, Badge, Box, Button, Center, Checkbox, Group, Loader, Modal, NumberInput, Paper, ScrollArea, SegmentedControl, Select, SimpleGrid, Stack, Table, Text, TextInput, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { IconPlus, IconTrash, IconUserPlus } from '@tabler/icons-react';
import CeldaEditable from './CeldaEditable';

const nf = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = (v) => (v === null || v === undefined ? '' : nf.format(Number(v) || 0));
const fmtFecha = (v) => (v ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(2, 4)}` : '');
const ESTATUS = [{ value: 'PENDIENTE', label: 'PENDIENTE' }, { value: 'PAGADA', label: 'PAGADA' }];
// Porcentaje de comisión por venta: de 2 % a 10 % (de medio en medio)
const PCT_MIN = 2;
const PCT_MAX = 10;
const PORCENTAJES = Array.from({ length: (PCT_MAX - PCT_MIN) * 2 + 1 }, (_, i) => PCT_MIN + i / 2);
const opcionesPct = (actual) => {
    const lista = [...PORCENTAJES];
    if (actual !== null && actual !== undefined && Number.isFinite(Number(actual)) && !lista.includes(Number(actual))) lista.push(Number(actual)); // una comisión vieja fuera de la lista se muestra igual
    return lista.sort((a, b) => a - b).map((n) => ({ value: String(n), label: `${n}%` }));
};
// Segmentos con fondo claro: sobre el fondo oscuro del panel las pestañas transparentes no se distinguían
const ESTILO_SEGMENTOS = { root: { background: '#fff', border: '1px solid #ced4da' } }; // la letra la maneja Mantine: oscura en las pestañas sin elegir y blanca sobre la elegida
const normCliente = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\bFCIA\b/g, 'FARMACIA').replace(/[^A-Z0-9]+/g, ' ').trim();
const claveCliente = (l) => (l.clienteIdVenta ? `c${l.clienteIdVenta}` : `t${normCliente(l.clienteTexto)}`);
const porCliente = (lineas) => { const m = new Map(); for (const l of lineas) { const k = claveCliente(l); if (!m.has(k)) m.set(k, []); m.get(k).push(l); } return m; };
// Lo que debe un cliente: el saldo de cada factura enlazada (una sola vez aunque tenga varias líneas)
const deudaDe = (lineas) => { const vistas = new Set(); let t = 0; for (const l of lineas) { if (!l.ventaId || vistas.has(l.ventaId)) continue; vistas.add(l.ventaId); t += Number(l.saldoCxc) > 0.005 ? Number(l.saldoCxc) : 0; } return Math.round(t * 100) / 100; };
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const sumar = (filas, campo) => r2(filas.reduce((t, x) => t + (Number(x[campo]) || 0), 0));
// Una factura con sus renglones de pago: al vendedor se le paga la comisión a medida que el cliente abona (cada abono genera la suya).
const esPago = (l) => l.concepto === 'ABONO' || l.concepto === 'NOTA' || Number(l.montoUsd) < 0;
const claveDoc = (l) => (l.ventaId ? `v${l.ventaId}` : `d${claveCliente(l)}|${String(l.documentoTexto || '').trim().toUpperCase()}`);
function agruparFacturas(filas) {
    const m = new Map();
    for (const l of filas) { const k = claveDoc(l); if (!m.has(k)) m.set(k, { k, padre: null, pagos: [], todas: [] }); m.get(k).todas.push(l); }
    for (const d of m.values()) {
        const orden = [...d.todas].sort((a, b) => String(a.fecha || '').localeCompare(String(b.fecha || '')) || a.id - b.id);
        d.padre = orden.find((l) => !esPago(l)) || null;
        d.pagos = orden.filter((l) => l !== d.padre);
    }
    const fechaDe = (d) => String((d.padre || d.pagos[0])?.fecha || '');
    return [...m.values()].sort((a, b) => fechaDe(a).localeCompare(fechaDe(b)));
}
const totales = (filas) => {
    // comisión POR GENERAR: la que dejarán las facturas aún sin cobrar del todo (lo que ya generaron sus abonos no se cuenta dos veces)
    let futura = 0;
    for (const d of agruparFacturas(filas)) {
        const pa = d.padre;
        if (!pa || pa.estatusComision === 'PAGADA' || porPagar(pa)) continue;
        futura += Math.max(0, (Number(pa.comisionUsd) || 0) - d.pagos.reduce((t, x) => t + (Number(x.comisionUsd) || 0), 0));
    }
    return {
        monto: sumar(filas, 'montoUsd'), // la columna tal cual (las facturas suman, los abonos y notas de crédito restan)
        abonos: r2(filas.filter((x) => esPago(x) && x.concepto !== 'NOTA').reduce((t, x) => t + Math.abs(Number(x.montoUsd) || 0), 0)), // lo abonado, en positivo
        facturas: sumar(filas.filter((x) => x.concepto === 'FACTURA' && !esPago(x)), 'montoUsd'), // total de las facturas, con IVA, tal como se facturaron
        base: sumar(filas, 'baseUsd'), // SIN IVA: sobre esto se calcula la comisión
        comision: sumar(filas, 'comisionUsd'),
        pendiente: sumar(filas.filter((x) => x.estatusComision !== 'PAGADA'), 'comisionUsd'),
        porPagar: sumar(filas.filter((x) => porPagar(x)), 'comisionUsd'), // la que ya se puede pagar: el cliente ya cobró
        futura: r2(futura),
    };
};
// Una cifra con su título, para el encabezado de cada cliente y el total general
function Cifra({ titulo, valor, color = '#1a1b1e', tasa = null }) {
    return (
        <Box ta="right" miw={96}>
            <Text fz={10} c="dimmed" fw={700} tt="uppercase" lh={1.2}>{titulo}</Text>
            <Text size="sm" fw={800} c={color} lh={1.3}>${usd(valor)}</Text>
            {tasa > 0 && <Text fz={11} c="dimmed" fw={600} lh={1.2}>Bs {usd((Number(valor) || 0) * tasa)}</Text>}
        </Box>
    );
}
const ESTILO_ACORDEON = { item: { background: '#fff', border: '1px solid #ced4da' }, control: { color: '#1a1b1e' }, chevron: { color: '#1a1b1e' } };
// Comisión POR PAGAR (el renglón amarillo del Excel): el cliente ya pagó y al vendedor todavía no se le pagó la comisión.
//   · un ABONO / pago parcial: genera su comisión sobre lo abonado
//   · una factura pagada completa y sin abonos aparte: queda por pagar la comisión completa de esa factura
// Si la factura tiene abonos, su comisión vive en ellos: el renglón de la factura no se pinta ni se suma como deuda.
// Se calcula en vivo con el estado del cobro: en cuanto se registra el pago, el renglón se pone amarillo solo.
const cobradaCompleta = (l) => (l.ventaId ? l.pagoVenta === 'Pagado' : /PAGAD|COMPLETO/i.test(l.estatusCliente || ''));
// una nota de crédito no es un cobro del cliente: no vuelve amarillo su renglón
const porPagar = (l) => l.estatusComision !== 'PAGADA' && (esPago(l) ? l.concepto !== 'NOTA' : !l.tienePagos && cobradaCompleta(l));
const COLOR_POR_PAGAR = '#fff59d';
const CONCEPTOS = [{ value: 'FACTURA', label: 'FACTURA' }, { value: 'ABONO', label: 'ABONO' }, { value: 'NOTA', label: 'N/C' }];

async function pedir(url, opciones) {
    const res = await fetch(url, opciones);
    const cuerpo = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(cuerpo.error || 'No se pudo completar');
    return cuerpo;
}
const enviar = (url, metodo, body) => pedir(url, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });

// La hoja de cada vendedor a comisión, como la lleva la administradora: sus facturas con el monto a comisionar sin IVA, el %, la comisión,
// cómo va el cobro del cliente y si la comisión ya se pagó. Todo se edita en la celda; la comisión se recalcula con la base y el %.
export default function HojasVendedores() {
    const queryClient = useQueryClient();
    const { data, isLoading, error } = useQuery({ queryKey: ['comisiones'], queryFn: () => pedir('/api/comisiones'), refetchOnWindowFocus: true });
    const [elegido, setElegido] = useState(null);
    const [filtro, setFiltro] = useState('porpagar');
    const [sel, setSel] = useState(() => new Set());
    const [abiertos, setAbiertos] = useState([]); // clientes desplegados
    const [modalVendedor, setModalVendedor] = useState(false);
    const [nuevo, setNuevo] = useState({ nombre: '', porcentaje: 5 });
    const [linea, setLinea] = useState({ documento: '', cliente: '', montoUsd: '', baseUsd: '', concepto: 'FACTURA', porcentaje: '' });

    const refrescar = () => queryClient.invalidateQueries({ queryKey: ['comisiones'] });
    const avisar = (e) => { notifications.show({ color: 'red', title: 'No se guardó', message: e.message }); throw e; };
    const vendedores = data?.vendedores || [];
    const actual = vendedores.find((v) => v.id === elegido) || vendedores[0] || null;

    // las facturas que tienen abonos se marcan: su comisión está en los abonos
    const lineasActual = useMemo(() => {
        const todas = actual?.lineas || [];
        const conPagos = new Set();
        for (const d of agruparFacturas(todas)) if (d.padre && d.pagos.length) conPagos.add(d.padre.id);
        // un abono sin comisión calculada la genera sobre la parte sin IVA de lo abonado (proporción de su factura) y el % de la línea
        const calculada = new Map();
        for (const d of agruparFacturas(todas)) {
            const pa = d.padre;
            const razon = pa && Number(pa.montoUsd) > 0 && pa.baseUsd !== null ? Math.min(1, Number(pa.baseUsd) / Number(pa.montoUsd)) : 1;
            for (const x of d.pagos) {
                if (x.concepto !== 'ABONO' || x.comisionUsd !== null) continue;
                const base = x.baseUsd !== null ? Number(x.baseUsd) : r2(Math.abs(Number(x.montoUsd) || 0) * razon);
                const pct = x.porcentaje !== null && x.porcentaje !== undefined ? Number(x.porcentaje) : Number(actual?.porcentaje) || 0;
                calculada.set(x.id, { baseUsd: base, comisionUsd: r2((base * pct) / 100), calculada: true });
            }
        }
        return todas.map((l) => ({ ...l, ...(calculada.get(l.id) || {}), ...(conPagos.has(l.id) ? { tienePagos: true } : {}) }));
    }, [actual]);
    // con el filtro se ven las facturas que tengan algún renglón que lo cumpla, completas (la factura y todos sus pagos)
    const lineas = useMemo(() => {
        const cumple = (l) => filtro === 'todas' || (filtro === 'porpagar' ? porPagar(l) : filtro === 'pendientes' ? l.estatusComision !== 'PAGADA' : l.estatusComision === 'PAGADA');
        const claves = new Set(lineasActual.filter(cumple).map(claveDoc));
        return lineasActual.filter((l) => claves.has(claveDoc(l)));
    }, [lineasActual, filtro]);
    // Líneas de la hoja agrupadas por cliente, con lo que debe cada uno (sobre TODAS sus líneas, no solo las que deja ver el filtro)
    const todasPorCliente = useMemo(() => porCliente(lineasActual), [lineasActual]);
    const grupos = useMemo(() => {
        const m = new Map();
        for (const l of lineas) {
            const k = claveCliente(l);
            if (!m.has(k)) m.set(k, { k, nombre: l.clienteNombre || l.clienteTexto || 'Sin cliente', filas: [], deuda: deudaDe(todasPorCliente.get(k) || []), t: null, items: [] });
            m.get(k).filas.push(l);
        }
        for (const g of m.values()) { g.t = totales(g.filas); g.items = agruparFacturas(g.filas); }
        return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
    }, [lineas, todasPorCliente]);
    const tasa = Number(data?.tasaBcv) > 0 ? Number(data.tasaBcv) : null; // BCV del día: la comisión se paga en bolívares
    const totalVendedor = useMemo(() => totales(lineasActual), [lineasActual]);
    const totalVisible = useMemo(() => totales(lineas), [lineas]);
    const deudaTotal = useMemo(() => Math.round([...todasPorCliente.values()].reduce((t, ls) => t + deudaDe(ls), 0) * 100) / 100, [todasPorCliente]);
    const editar = (l, campos) => enviar(`/api/comisiones/${l.id}`, 'PATCH', campos).then(refrescar).catch(avisar);

    const marcar = async (estatus) => {
        try { await Promise.all([...sel].map((id) => enviar(`/api/comisiones/${id}`, 'PATCH', { estatusComision: estatus }))); setSel(new Set()); refrescar(); notifications.show({ color: 'teal', message: `${sel.size} comisión(es) marcadas ${estatus === 'PAGADA' ? 'pagadas' : 'pendientes'}` }); }
        catch (e) { notifications.show({ color: 'red', message: e.message }); }
    };
    const agregar = async () => {
        try {
            const r = await enviar('/api/comisiones', 'POST', { vendedorId: actual.id, ...linea, porcentaje: linea.porcentaje === '' ? actual.porcentaje : Number(linea.porcentaje), montoUsd: linea.montoUsd === '' ? null : linea.montoUsd, baseUsd: linea.baseUsd === '' ? null : linea.baseUsd, fecha: new Date().toISOString().slice(0, 10) });
            setLinea({ documento: '', cliente: '', montoUsd: '', baseUsd: '', concepto: 'FACTURA', porcentaje: '' }); refrescar();
            notifications.show({ color: r.enlazada ? 'teal' : 'yellow', message: r.enlazada ? 'Línea agregada y enlazada con su factura' : 'Línea agregada (no se encontró esa factura en el sistema: queda sin enlazar)' });
        } catch (e) { notifications.show({ color: 'red', message: e.message }); }
    };
    const crearVendedor = async () => {
        try { const r = await enviar('/api/comisiones/vendedores', 'POST', nuevo); setModalVendedor(false); setNuevo({ nombre: '', porcentaje: 5 }); setElegido(r.vendedor.id); refrescar(); }
        catch (e) { notifications.show({ color: 'red', message: e.message }); }
    };

    // Una fila de la hoja: la factura (d.padre) o uno de sus pagos (hijo), con el color de su comisión: amarillo por pagar, gris pagada, blanco aún sin cobrar
    const fila = (l, hijo, d) => (
        <Table.Tr key={l.id} style={{ background: porPagar(l) ? COLOR_POR_PAGAR : l.estatusComision === 'PAGADA' ? '#e9ecef' : '#fff', borderLeft: hijo ? '5px solid #868e96' : undefined }}>
            <Table.Td ta="center"><Checkbox size="xs" checked={sel.has(l.id)} onChange={(e) => setSel((st) => { const n = new Set(st); if (e.currentTarget.checked) n.add(l.id); else n.delete(l.id); return n; })} aria-label="Seleccionar" /></Table.Td>
            <Table.Td><CeldaEditable tipo="opciones" opciones={CONCEPTOS} valor={l.concepto} formato={(v) => (v === 'NOTA' ? 'N/C' : v)} onGuardar={(v) => editar(l, { concepto: v })} /></Table.Td>
            <Table.Td><CeldaEditable tipo="fecha" valor={l.fecha} formato={fmtFecha} onGuardar={(v) => editar(l, { fecha: v })} /></Table.Td>
            <Table.Td><CeldaEditable tipo="fecha" valor={l.vencimiento} formato={fmtFecha} onGuardar={(v) => editar(l, { vencimiento: v })} /></Table.Td>
            <Table.Td>
                <CeldaEditable valor={l.documentoTexto} onGuardar={(v) => editar(l, { documentoTexto: v })} formato={(v) => (
                    <>
                        {hijo && <Text span c="dimmed" mr={4}>↳</Text>}{v}
                        {!l.ventaId && <Tooltip label="No está enlazada con una factura del sistema"><Badge ml={4} size="xs" color="yellow" variant="light">sin enlazar</Badge></Tooltip>}
                        {!hijo && d.pagos.length > 0 && <Badge ml={4} size="xs" color="gray" variant="light">{d.pagos.length} pago(s)</Badge>}
                        {!hijo && l.ventaId && l.saldoCxc !== null && l.saldoCxc !== undefined && (Number(l.saldoCxc) > 0.005 ? <Badge ml={4} size="xs" color="red" variant="light">Debe ${usd(l.saldoCxc)}</Badge> : <Badge ml={4} size="xs" color="teal" variant="light">Pagada</Badge>)}
                    </>
                )} />
            </Table.Td>
            <Table.Td>{!esPago(l) && <CeldaEditable tipo="numero" valor={l.montoUsd} align="right" formato={usd} onGuardar={(v) => editar(l, { montoUsd: v })} />}</Table.Td>
            <Table.Td>{esPago(l) && <CeldaEditable tipo="numero" valor={l.montoUsd === null ? null : Math.abs(Number(l.montoUsd))} align="right" formato={(v) => usd(v)} negrita color={l.concepto === 'NOTA' ? '#e8590c' : '#1971c2'} onGuardar={(v) => editar(l, { montoUsd: v === null ? null : -Math.abs(v) })} />}</Table.Td>
            <Table.Td><CeldaEditable tipo="numero" valor={l.baseUsd} align="right" formato={usd} onGuardar={(v) => editar(l, { baseUsd: v })} /></Table.Td>
            <Table.Td><CeldaEditable tipo="opciones" opciones={opcionesPct(l.porcentaje)} valor={l.porcentaje === null || l.porcentaje === undefined ? '' : String(Number(l.porcentaje))} align="right" formato={(v) => (v === null || v === undefined || v === '' ? '' : `${Number(v)}%`)} onGuardar={(v) => editar(l, { porcentaje: Number(v) })} /></Table.Td>
            <Table.Td><CeldaEditable tipo="numero" valor={l.comisionUsd} align="right" formato={usd} negrita onGuardar={(v) => editar(l, { comisionUsd: v })} /></Table.Td>
            <Table.Td><Text size="sm" ta="right" px={6} c={l.estatusComision === 'PAGADA' ? 'dimmed' : '#1a1b1e'}>{tasa > 0 && l.comisionUsd !== null && l.comisionUsd !== undefined ? usd(Number(l.comisionUsd) * tasa) : ''}</Text></Table.Td>
            <Table.Td><CeldaEditable valor={l.estatusCliente} placeholder="Estatus del cliente" onGuardar={(v) => editar(l, { estatusCliente: v })} /></Table.Td>
            <Table.Td><CeldaEditable tipo="opciones" opciones={ESTATUS} valor={l.estatusComision} negrita color={l.estatusComision === 'PAGADA' ? '#2b8a3e' : '#e8590c'} onGuardar={(v) => editar(l, { estatusComision: v })} /></Table.Td>
            <Table.Td><CeldaEditable tipo="fecha" valor={l.fechaPagoComision} formato={fmtFecha} onGuardar={(v) => editar(l, { fechaPagoComision: v })} /></Table.Td>
            <Table.Td><CeldaEditable valor={l.observacion} placeholder="Observación" onGuardar={(v) => editar(l, { observacion: v })} /></Table.Td>
            <Table.Td ta="center"><ActionIcon variant="subtle" color="red" size="sm" aria-label="Borrar línea" onClick={() => { if (window.confirm('¿Borrar esta línea de la hoja del vendedor?')) enviar(`/api/comisiones/${l.id}`, 'DELETE').then(refrescar).catch((e) => notifications.show({ color: 'red', message: e.message })); }}><IconTrash size={14} /></ActionIcon></Table.Td>
        </Table.Tr>
    );

    if (isLoading) return <Center py={60}><Loader /></Center>;
    if (error) return <Alert color="red">{error.message}</Alert>;
    return (
        <Stack gap="md">
            <Group justify="space-between" wrap="wrap">
                <SegmentedControl color="navy.9" styles={ESTILO_SEGMENTOS} value={String(actual?.id ?? '')} onChange={(v) => { setElegido(Number(v)); setSel(new Set()); }} data={vendedores.map((v) => ({ value: String(v.id), label: v.nombre }))} />
                <Button size="sm" variant="light" leftSection={<IconUserPlus size={16} />} onClick={() => setModalVendedor(true)}>Nuevo vendedor</Button>
            </Group>
            {!actual ? <Alert color="blue">Todavía no hay vendedores a comisión. Crea el primero con «Nuevo vendedor».</Alert> : (
                <>
                    <SimpleGrid cols={{ base: 2, md: 3, lg: 6 }} spacing="sm">
                        <Paper withBorder p="sm" radius="md"><Text size="xs" c="dimmed" fw={700} tt="uppercase">Los clientes deben</Text><Text fz={22} fw={800} c="red.7">${usd(deudaTotal)}</Text></Paper>
                        <Paper withBorder p="sm" radius="md"><Text size="xs" c="dimmed" fw={700} tt="uppercase">A comisionar sin IVA</Text><Text fz={22} fw={800} c="navy.9">${usd(totalVendedor.base)}</Text><Text size="xs" c="dimmed">Facturas con IVA ${usd(totalVendedor.facturas)}</Text></Paper>
                        <Paper withBorder p="sm" radius="md"><Text size="xs" c="dimmed" fw={700} tt="uppercase">Por generar (sin cobrar)</Text><Text fz={22} fw={800} c="gray.7">${usd(totalVendedor.futura)}</Text>{tasa && <Text size="xs" c="dimmed" fw={600}>Bs {usd(totalVendedor.futura * tasa)}</Text>}</Paper>
                        <Paper withBorder p="sm" radius="md"><Text size="xs" c="dimmed" fw={700} tt="uppercase">Comisión pagada</Text><Text fz={22} fw={800} c="teal.7">${usd(actual.resumen.comisionPagada)}</Text>{tasa && <Text size="xs" c="dimmed" fw={600}>Bs {usd(actual.resumen.comisionPagada * tasa)}</Text>}</Paper>
                        <Paper withBorder p="sm" radius="md"><Text size="xs" c="dimmed" fw={700} tt="uppercase">% por defecto</Text>
                            <CeldaEditable tipo="numero" valor={actual.porcentaje} formato={(v) => `${v}%`} negrita onGuardar={(v) => enviar('/api/comisiones/vendedores', 'PATCH', { id: actual.id, porcentaje: v }).then(refrescar).catch(avisar)} /></Paper>
                        <Paper withBorder p="sm" radius="md"><Text size="xs" c="dimmed" fw={700} tt="uppercase">Comisión por pagar</Text><Text fz={22} fw={800} c="orange.8">${usd(totalVendedor.porPagar)}</Text>{tasa && <Text size="xs" c="dimmed" fw={600}>Bs {usd(totalVendedor.porPagar * tasa)}</Text>}</Paper>
                    </SimpleGrid>

                    {tasa ? <Alert color="blue" py={6}>Comisiones en bolívares a la <b>tasa BCV del día: Bs {usd(tasa)}</b> por dólar. Se recalculan solas cuando cambia la tasa.</Alert> : <Alert color="yellow" py={6}>No hay una tasa BCV vigente registrada: las comisiones se ven solo en dólares.</Alert>}

                    <Group gap="md" wrap="wrap" align="center">
                        <Group gap={6} wrap="nowrap"><Box w={16} h={16} style={{ background: COLOR_POR_PAGAR, border: '1px solid #c9b900', borderRadius: 3 }} /><Text size="xs" c="gray.2">Amarillo: el cliente ya pagó y la comisión está <b>por pagar</b></Text></Group>
                        <Group gap={6} wrap="nowrap"><Box w={16} h={16} style={{ background: '#e9ecef', border: '1px solid #adb5bd', borderRadius: 3 }} /><Text size="xs" c="gray.2">Gris: comisión ya <b>pagada</b></Text></Group>
                        <Group gap={6} wrap="nowrap"><Box w={16} h={16} style={{ background: '#fff', border: '1px solid #adb5bd', borderRadius: 3 }} /><Text size="xs" c="gray.2">Sin color: factura aún sin cobrar (se debe la factura y la comisión)</Text></Group>
                        <Text size="xs" c="gray.4">Los pagos parciales (↳) van debajo de su factura: cada abono genera su comisión.</Text>
                    </Group>

                    <Group gap="sm" wrap="wrap" justify="space-between">
                        <SegmentedControl size="xs" color="navy.9" styles={ESTILO_SEGMENTOS} value={filtro} onChange={setFiltro} data={[{ value: 'porpagar', label: 'Por pagar (amarillas)' }, { value: 'pendientes', label: 'Comisión pendiente' }, { value: 'pagadas', label: 'Pagadas' }, { value: 'todas', label: 'Todas' }]} />
                        <Group gap="xs">
                            <Text size="xs" c="dimmed">{sel.size} seleccionada(s)</Text>
                            <Button size="compact-sm" color="teal" disabled={!sel.size} onClick={() => marcar('PAGADA')}>Marcar pagadas</Button>
                            <Button size="compact-sm" variant="default" disabled={!sel.size} onClick={() => marcar('PENDIENTE')}>Marcar pendientes</Button>
                        </Group>
                    </Group>

                    <Group justify="space-between" wrap="wrap" gap="xs">
                        <Text size="sm" c="gray.3">{grupos.length} cliente(s) · {lineas.length} línea(s)</Text>
                        <Group gap="xs">
                            <Button size="compact-xs" variant="white" color="navy.9" onClick={() => setAbiertos(grupos.map((g) => g.k))}>Expandir todo</Button>
                            <Button size="compact-xs" variant="white" color="navy.9" onClick={() => setAbiertos([])}>Contraer todo</Button>
                        </Group>
                    </Group>

                    {!grupos.length ? <Paper withBorder radius="md" p="lg"><Text ta="center" c="dimmed">No hay líneas con ese filtro.</Text></Paper> : (
                        <Accordion multiple variant="separated" radius="md" value={abiertos} onChange={setAbiertos} styles={ESTILO_ACORDEON}>
                            {grupos.map((g) => (
                                <Accordion.Item key={g.k} value={g.k}>
                                    <Accordion.Control>
                                        <Group justify="space-between" wrap="wrap" gap="xs" pr="xs">
                                            <Text fw={800} size="sm" c="#1a1b1e">{g.nombre} <Text span size="xs" c="dimmed" fw={500}>· {g.filas.length} línea(s)</Text></Text>
                                            <Group gap="lg" wrap="wrap">
                                                <Cifra titulo="Debe" valor={g.deuda} color={g.deuda > 0 ? '#c92a2a' : '#2b8a3e'} />
                                                <Cifra titulo="Facturas (con IVA)" valor={g.t.facturas} />
                                                <Cifra titulo="Abonado" valor={g.t.abonos} color="#1971c2" />
                                                <Cifra titulo="A comisionar sin IVA" valor={g.t.base} />
                                                <Cifra titulo="Comisión" valor={g.t.comision} tasa={tasa} />
                                                <Cifra titulo="Por pagar" valor={g.t.porPagar} color={g.t.porPagar > 0 ? '#e8590c' : '#2b8a3e'} tasa={tasa} />
                                                <Cifra titulo="Por generar (sin cobrar)" valor={g.t.futura} color="#868e96" tasa={tasa} />
                                            </Group>
                                        </Group>
                                    </Accordion.Control>
                                    <Accordion.Panel>
                                        <ScrollArea type="auto" offsetScrollbars>
                                            <Table withColumnBorders withTableBorder verticalSpacing={0} horizontalSpacing={4} fz="sm" miw={1260} style={{ background: '#fff', color: '#1a1b1e' }}>
                                                <Table.Thead style={{ background: '#e9ecef' }}>
                                                    <Table.Tr>
                                                        <Table.Th w={30} /><Table.Th w={70}>Concepto</Table.Th><Table.Th w={100}>Fecha</Table.Th><Table.Th w={100}>Vence</Table.Th><Table.Th w={120}>Factura</Table.Th>
                                                        <Table.Th ta="right" w={110}>Factura USD (con IVA)</Table.Th><Table.Th ta="right" w={110}>Abono / pago USD</Table.Th><Table.Th ta="right" w={105}>A comisionar sin IVA</Table.Th><Table.Th ta="right" w={70}>%</Table.Th><Table.Th ta="right" w={90}>Comisión</Table.Th><Table.Th ta="right" w={115}>Comisión Bs</Table.Th>
                                                        <Table.Th w={150}>Estatus cliente</Table.Th><Table.Th w={110}>Comisión</Table.Th><Table.Th w={100}>Pagada el</Table.Th><Table.Th>Observación</Table.Th><Table.Th w={34} />
                                                    </Table.Tr>
                                                </Table.Thead>
                                                <Table.Tbody>
                                                    {g.items.map((d) => (
                                                        <React.Fragment key={d.k}>
                                                            {d.padre && fila(d.padre, false, d)}
                                                            {d.pagos.map((pg) => fila(pg, true, d))}
                                                        </React.Fragment>
                                                    ))}
                                                </Table.Tbody>
                                                <Table.Tfoot style={{ background: '#e9ecef' }}>
                                                    <Table.Tr>
                                                        <Table.Td colSpan={5}><Text fw={800} size="sm" pl={6} c="#1a1b1e">Total de {g.nombre}</Text></Table.Td>
                                                        <Table.Td ta="right"><Text fw={800} size="sm" pr={6} c="#1a1b1e">{usd(g.t.facturas)}</Text></Table.Td>
                                                        <Table.Td ta="right"><Text fw={800} size="sm" pr={6} c="#1971c2">{usd(g.t.abonos)}</Text></Table.Td>
                                                        <Table.Td ta="right"><Text fw={800} size="sm" pr={6} c="#1a1b1e">{usd(g.t.base)}</Text></Table.Td>
                                                        <Table.Td />
                                                        <Table.Td ta="right"><Text fw={800} size="sm" pr={6} c="#1a1b1e">{usd(g.t.comision)}</Text></Table.Td>
                                                        <Table.Td ta="right"><Text fw={800} size="sm" pr={6} c="#1a1b1e">{tasa > 0 ? usd(g.t.comision * tasa) : ''}</Text></Table.Td>
                                                        <Table.Td colSpan={2} ta="right"><Text size="xs" fw={700} pr={6} c={g.t.porPagar > 0 ? 'orange.8' : 'teal.8'}>{g.t.porPagar > 0 ? `Por pagar $${usd(g.t.porPagar)}` : 'Al día'}</Text></Table.Td>
                                                        <Table.Td colSpan={3} />
                                                    </Table.Tr>
                                                </Table.Tfoot>
                                            </Table>
                                        </ScrollArea>
                                    </Accordion.Panel>
                                </Accordion.Item>
                            ))}
                        </Accordion>
                    )}

                    {grupos.length > 0 && (
                        <Paper withBorder radius="md" p="sm">
                            <Group justify="space-between" wrap="wrap" gap="md">
                                <Text fw={800} size="sm" c="#1a1b1e">TOTAL GENERAL <Text span size="xs" c="dimmed" fw={500}>· {grupos.length} cliente(s) · {lineas.length} línea(s)</Text></Text>
                                <Group gap="lg" wrap="wrap">
                                    <Cifra titulo="Deben" valor={grupos.reduce((t, g) => t + g.deuda, 0)} color="#c92a2a" />
                                    <Cifra titulo="Facturas (con IVA)" valor={totalVisible.facturas} />
                                    <Cifra titulo="Abonado" valor={totalVisible.abonos} color="#1971c2" />
                                    <Cifra titulo="A comisionar sin IVA" valor={totalVisible.base} />
                                    <Cifra titulo="Comisión total" valor={totalVisible.comision} tasa={tasa} />
                                    <Cifra titulo="Por pagar" valor={totalVisible.porPagar} color="#e8590c" tasa={tasa} />
                                    <Cifra titulo="Por generar (sin cobrar)" valor={totalVisible.futura} color="#868e96" tasa={tasa} />
                                </Group>
                            </Group>
                        </Paper>
                    )}

                    <Paper withBorder radius="md" p="sm">
                        <Text size="xs" fw={700} c="dimmed" mb={6}>Agregar una línea a la hoja de {actual.nombre}</Text>
                        <Group gap="xs" align="flex-end" wrap="wrap">
                            <TextInput size="xs" label="Factura / nota" placeholder="146870 o 0000-6611" w={150} value={linea.documento} onChange={(e) => setLinea({ ...linea, documento: e.currentTarget.value })} />
                            <TextInput size="xs" label="Cliente" w={220} value={linea.cliente} onChange={(e) => setLinea({ ...linea, cliente: e.currentTarget.value })} />
                            <NumberInput size="xs" label={linea.concepto === 'ABONO' ? 'Monto abonado USD' : 'Monto USD'} w={130} decimalScale={2} value={linea.montoUsd} onChange={(v) => setLinea({ ...linea, montoUsd: v })} />
                            <NumberInput size="xs" label="A comisionar sin IVA (opcional en un abono)" w={190} decimalScale={2} value={linea.baseUsd} onChange={(v) => setLinea({ ...linea, baseUsd: v })} />
                            <Select size="xs" label="Tipo" w={110} allowDeselect={false} data={[{ value: 'FACTURA', label: 'Factura' }, { value: 'ABONO', label: 'Abono / pago' }]} value={linea.concepto} onChange={(v) => setLinea({ ...linea, concepto: v })} />
                            <Select size="xs" label="% comisión" w={100} allowDeselect={false} data={opcionesPct(actual.porcentaje)} value={linea.porcentaje === '' ? String(actual.porcentaje) : String(linea.porcentaje)} onChange={(v) => setLinea({ ...linea, porcentaje: v })} />
                            <Button size="xs" leftSection={<IconPlus size={14} />} disabled={!linea.documento.trim() && !linea.cliente.trim()} onClick={agregar}>Agregar</Button>
                        </Group>
                    </Paper>
                </>
            )}

            <Modal opened={modalVendedor} onClose={() => setModalVendedor(false)} centered title={<Text fw={800}>Nuevo vendedor a comisión</Text>}>
                <Stack gap="sm">
                    <Text size="xs" c="dimmed">No forma parte de la nómina ni tiene acceso al sistema: solo se le lleva su hoja de comisiones.</Text>
                    <TextInput label="Nombre" value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.currentTarget.value })} data-autofocus />
                    <NumberInput label="% de comisión por defecto" min={0} max={100} decimalScale={2} value={nuevo.porcentaje} onChange={(v) => setNuevo({ ...nuevo, porcentaje: v })} />
                    <Group justify="flex-end"><Button variant="default" onClick={() => setModalVendedor(false)}>Cancelar</Button><Button disabled={nuevo.nombre.trim().length < 2} onClick={crearVendedor}>Crear vendedor</Button></Group>
                </Stack>
            </Modal>
        </Stack>
    );
}
