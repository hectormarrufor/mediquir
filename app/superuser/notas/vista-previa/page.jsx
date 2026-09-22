'use client';

import React, { useMemo, useState } from 'react';
import { ActionIcon, Alert, Box, Button, Checkbox, Container, Group, NumberInput, Paper, SegmentedControl, Select, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import FacturaFormaLibre from '@/app/superuser/ventas/imprimir/[id]/FacturaFormaLibre';
import { calcularFactura, REGLAS } from '@/app/constants/facturacion';
import { fechaCaracas } from '@/app/constants/hora';

const fetchJson = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error('No se pudo cargar'); return r.json(); };

const fmtFecha = (v) => (v ? `${String(v).slice(8, 10)}/${String(v).slice(5, 7)}/${String(v).slice(0, 4)}` : '');
const renglonNuevo = () => ({ descripcion: '', cantidad: 1, precio: 0, iva: true });

// VISTA PREVIA de una nota de crédito o de débito sobre la forma libre. Es solo una pantalla: no guarda nada, no toma ningún correlativo
// (ni de nota ni de control), no toca la contabilidad ni los libros, y la hoja lleva la marca "VISTA PREVIA" aunque se imprima.
// Sirve para revisar cómo quedará la nota antes de emitirla de verdad (desde el detalle de la factura).
export default function VistaPreviaNota() {
    const tasaInicial = typeof window !== 'undefined' ? Number(new URLSearchParams(window.location.search).get('tasa')) || 1 : 1;
    const [guia, setGuia] = useState(false); // muestra la forma libre preimpresa debajo para ver cómo cae la nota
    const [tipo, setTipo] = useState('DEBITO');
    const [moneda, setMoneda] = useState('BS');
    const [tasa, setTasa] = useState(tasaInicial);
    const [clienteId, setClienteId] = useState(null);
    const [cliente, setCliente] = useState({ nombre: '', identificacion: '', direccion: '' });
    const [numeroNota, setNumeroNota] = useState('');
    const [facturaAfectada, setFacturaAfectada] = useState('');
    const { data: clientes } = useQuery({ queryKey: ['clientes-vista-previa-nota'], queryFn: () => fetchJson('/api/clientes') });
    const elegirCliente = (id) => {
        setClienteId(id);
        const c = clientes?.find((x) => x.id.toString() === id);
        if (c) setCliente({ nombre: c.nombre || '', identificacion: c.identificacion || '', direccion: c.direccion || '' });
    };
    const [fechaFactura, setFechaFactura] = useState('');
    const [motivo, setMotivo] = useState('');
    const [renglones, setRenglones] = useState([{ descripcion: 'Nota de débito correspondiente a diferencial cambiario', cantidad: 1, precio: 1000, iva: true }]);

    const cambiar = (i, campo, valor) => setRenglones((r) => r.map((x, j) => (j === i ? { ...x, [campo]: valor } : x)));

    const documento = useMemo(() => {
        const validos = renglones.filter((r) => String(r.descripcion).trim() && Number(r.precio) > 0 && Number(r.cantidad) >= 1);
        if (!validos.length) return null;
        try {
            const calc = calcularFactura({ renglones: validos.map((r) => ({ precioUnitario: Number(r.precio), cantidad: Math.floor(Number(r.cantidad)), aplicaIva: r.iva, porcentajeIva: r.iva ? REGLAS.alicuotaGeneral : 0 })) });
            return {
                numeroDocumento: numeroNota || '—', numeroControl: '', moneda, tasaCambio: Number(tasa) || 1, montoIva: calc.montoIva, totalFinal: calc.totalFinal,
                condicionPago: 'Contado', fechaVencimiento: null, createdAt: `${fechaCaracas()}T16:00:00Z`, cliente,
                detalles: validos.map((r, i) => ({ producto: { codigo: '', nombre: String(r.descripcion).slice(0, 200) }, precioUnitario: Number(r.precio), cantidad: Math.floor(Number(r.cantidad)), subtotal: calc.renglones[i].monto, aplicaIva: r.iva })),
            };
        } catch { return null; }
    }, [renglones, moneda, tasa, cliente, numeroNota]);

    return (
        <Container size="lg" py="md">
            <Title order={2} c="white" mb="xs">Vista previa de nota de crédito o débito</Title>
            <Alert color="blue" variant="light" mb="md">
                Esto es solo una vista previa: <b>no se guarda</b>, no consume ningún número de nota ni de control y no afecta los libros. El número que escribas abajo es solo para verlo en la hoja; el de verdad se asigna al emitirla desde la factura.
            </Alert>

            <Paper withBorder p="md" radius="md" bg="white" mb="md">
                <Stack gap="sm">
                    <Group grow>
                        <SegmentedControl value={tipo} onChange={setTipo} data={[{ value: 'DEBITO', label: 'Nota de débito' }, { value: 'CREDITO', label: 'Nota de crédito' }]} />
                        <SegmentedControl value={moneda} onChange={setMoneda} data={[{ value: 'BS', label: 'Bolívares' }, { value: 'USD', label: 'Dólares' }]} />
                    </Group>
                    <Select label="Cliente registrado (opcional: rellena los campos de abajo)" placeholder="Buscar…" searchable clearable
                        data={clientes?.map((c) => ({ value: c.id.toString(), label: `${c.nombre} (${c.identificacion})` })) || []}
                        value={clienteId} onChange={elegirCliente} />
                    <SimpleGrid cols={{ base: 1, sm: 3 }}>
                        <TextInput label="Cliente" value={cliente.nombre} onChange={(e) => setCliente({ ...cliente, nombre: e.currentTarget.value })} />
                        <TextInput label="RIF / Cédula" value={cliente.identificacion} onChange={(e) => setCliente({ ...cliente, identificacion: e.currentTarget.value })} />
                        <TextInput label="Domicilio fiscal" value={cliente.direccion} onChange={(e) => setCliente({ ...cliente, direccion: e.currentTarget.value })} />
                        <TextInput label="N° de esta nota" placeholder="NC-00001 / ND-00001" value={numeroNota} onChange={(e) => setNumeroNota(e.currentTarget.value)} />
                        <TextInput label="Factura que afecta (número)" placeholder="F-00012" value={facturaAfectada} onChange={(e) => setFacturaAfectada(e.currentTarget.value)} />
                        <TextInput label="Fecha de esa factura" type="date" value={fechaFactura} onChange={(e) => setFechaFactura(e.currentTarget.value)} />
                        {moneda === 'USD' && <NumberInput label="Tasa (Bs por dólar)" value={tasa} onChange={setTasa} min={0} decimalScale={2} />}
                    </SimpleGrid>
                    <TextInput label="Motivo (sale en la casilla de condiciones)" value={motivo} onChange={(e) => setMotivo(e.currentTarget.value)} />

                    <Text fw={700} size="sm">Renglones</Text>
                    {renglones.map((r, i) => (
                        <Group key={i} gap="xs" align="flex-end" wrap="wrap">
                            <TextInput label={i === 0 ? 'Descripción' : undefined} value={r.descripcion} onChange={(e) => cambiar(i, 'descripcion', e.currentTarget.value)} style={{ flex: '1 1 260px' }} />
                            <NumberInput label={i === 0 ? 'Cant.' : undefined} value={r.cantidad} onChange={(v) => cambiar(i, 'cantidad', v)} min={1} allowDecimal={false} w={80} hideControls />
                            <NumberInput label={i === 0 ? 'Monto unitario' : undefined} value={r.precio} onChange={(v) => cambiar(i, 'precio', v)} min={0} decimalScale={3} w={130} hideControls />
                            <Checkbox label="IVA" checked={r.iva} onChange={(e) => cambiar(i, 'iva', e.currentTarget.checked)} mb={8} />
                            <ActionIcon color="red" variant="subtle" mb={4} onClick={() => setRenglones((x) => x.filter((_, j) => j !== i))} disabled={renglones.length === 1}><IconTrash size={18} /></ActionIcon>
                        </Group>
                    ))}
                    <Box><Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={() => setRenglones((r) => [...r, renglonNuevo()])}>Agregar renglón</Button></Box>
                </Stack>
            </Paper>

            {documento ? (
                <FacturaFormaLibre
                    venta={documento}
                    titulo={tipo === 'CREDITO' ? 'Nota de Crédito' : 'Nota de Débito'}
                    referencia={`AFECTA FACTURA ${facturaAfectada || '________'} DEL ${fmtFecha(fechaFactura) || '__/__/____'}`}
                    etiquetaCondicion="Motivo"
                    condicionTexto={String(motivo || '').slice(0, 38)}
                    sinVence
                    vistaPrevia
                    guia={guia}
                    onToggleGuia={() => setGuia((g) => !g)}
                />
            ) : <Alert color="orange">Completa al menos un renglón con descripción y monto para ver la nota.</Alert>}
        </Container>
    );
}
