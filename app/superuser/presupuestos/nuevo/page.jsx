'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ActionIcon, Alert, Box, Button, Checkbox, Container, Group, NumberInput, Paper, ScrollArea, SegmentedControl, SimpleGrid, Stack, Text, Textarea, TextInput, Title, Select } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconChevronLeft, IconSearch, IconTrash } from '@tabler/icons-react';
import { calcularFactura, alicuotaDe, precioParaCliente } from '@/app/constants/facturacion';
import { useTasaBcv } from '@/hooks/useTasaBcv';
import { buscarProductos } from '@/app/helpers/busquedaProductos';
import PresupuestoImprimible from '../_components/PresupuestoImprimible';

const fetchJson = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error('No se pudo cargar'); return r.json(); };

export default function NuevoPresupuesto() {
    const router = useRouter();
    const { tasa: tasaBcv } = useTasaBcv();
    const { data: clientes } = useQuery({ queryKey: ['clientes-presupuesto'], queryFn: () => fetchJson('/api/clientes') });
    const { data: productos } = useQuery({ queryKey: ['productos-presupuesto'], queryFn: () => fetchJson('/api/productos') });

    const [clienteId, setClienteId] = useState(null);
    const [clienteNombre, setClienteNombre] = useState('');
    const [clienteIdentificacion, setClienteIdentificacion] = useState('');
    const [clienteDireccion, setClienteDireccion] = useState('');
    const [tarifa, setTarifa] = useState('precio6');
    const [tasaCambio, setTasaCambio] = useState(1);
    const [validoDias, setValidoDias] = useState(15);
    const [notas, setNotas] = useState('');
    const [renglones, setRenglones] = useState([]);
    const [busqueda, setBusqueda] = useState('');
    const [guardando, setGuardando] = useState(false);

    React.useEffect(() => { if (tasaBcv > 0 && tasaCambio === 1) setTasaCambio(tasaBcv); }, [tasaBcv]); // eslint-disable-line react-hooks/exhaustive-deps

    const elegirCliente = (id) => {
        setClienteId(id);
        const c = clientes?.find((x) => x.id.toString() === id);
        if (c) { setClienteNombre(c.nombre || ''); setClienteIdentificacion(c.identificacion || ''); setClienteDireccion(c.direccion || ''); }
    };

    const agregarProducto = (producto) => {
        setRenglones((r) => {
            const existe = r.findIndex((x) => x.productoId === producto.id);
            if (existe >= 0) return r.map((x, i) => (i === existe ? { ...x, cantidad: x.cantidad + 1 } : x));
            return [...r, {
                productoId: producto.id, codigo: producto.codigo, nombre: producto.nombre, cantidad: 1,
                precioUnitario: Number(precioParaCliente(producto, tarifa)) || 0, aplicaIva: alicuotaDe(producto) > 0, porcentajeIva: alicuotaDe(producto),
            }];
        });
        setBusqueda('');
    };
    const cambiarRenglon = (i, campo, valor) => setRenglones((r) => r.map((x, j) => (j === i ? { ...x, [campo]: valor } : x)));
    const quitarRenglon = (i) => setRenglones((r) => r.filter((_, j) => j !== i));

    const aplicarTarifaATodos = (nuevaTarifa) => {
        setTarifa(nuevaTarifa);
        setRenglones((r) => r.map((x) => {
            const producto = productos?.find((p) => p.id === x.productoId);
            if (!producto) return x;
            return { ...x, precioUnitario: Number(precioParaCliente(producto, nuevaTarifa)) || x.precioUnitario };
        }));
    };

    const encontrados = useMemo(() => (busqueda.trim() ? buscarProductos(productos, busqueda).slice(0, 8) : []), [productos, busqueda]);

    const documento = useMemo(() => {
        const validos = renglones.filter((r) => r.nombre && Number(r.precioUnitario) >= 0 && Number(r.cantidad) >= 1);
        if (!validos.length) return null;
        try {
            const calc = calcularFactura({ renglones: validos.map((r) => ({ precioUnitario: r.precioUnitario, cantidad: r.cantidad, aplicaIva: r.aplicaIva, porcentajeIva: r.porcentajeIva })) });
            return {
                numero: 'Sin guardar', createdAt: new Date().toISOString(), validoDias, tasaCambio, subtotal: calc.subtotal, montoIva: calc.montoIva, totalFinal: calc.totalFinal, notas,
                cliente: { nombre: clienteNombre || 'Cliente', identificacion: clienteIdentificacion, direccion: clienteDireccion },
                renglones: validos.map((r, i) => ({ codigo: r.codigo, nombre: r.nombre, cantidad: calc.renglones[i].cantidad, precioUnitario: calc.renglones[i].precioUnitario, subtotal: calc.renglones[i].monto, aplicaIva: calc.renglones[i].aplicaIva })),
            };
        } catch { return null; }
    }, [renglones, tasaCambio, validoDias, notas, clienteNombre, clienteIdentificacion, clienteDireccion]);

    const guardar = async () => {
        if (!clienteNombre.trim()) return notifications.show({ color: 'red', message: 'Escribe o selecciona el cliente' });
        if (!renglones.length) return notifications.show({ color: 'red', message: 'Agrega al menos un producto' });
        setGuardando(true);
        try {
            const res = await fetch('/api/presupuestos', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clienteId, clienteNombre, clienteIdentificacion, clienteDireccion, tarifa, tasaCambio, validoDias, notas, renglones }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'No se pudo guardar');
            notifications.show({ color: 'teal', message: 'Presupuesto guardado' });
            router.push(`/superuser/presupuestos/${data.id}`);
        } catch (e) { notifications.show({ color: 'red', title: 'No se guardó', message: e.message }); } finally { setGuardando(false); }
    };

    return (
        <Container size="lg" py="md">
            <Button variant="subtle" color="gray.3" size="compact-sm" leftSection={<IconChevronLeft size={16} />} onClick={() => router.push('/superuser/presupuestos')} mb="xs">Presupuestos</Button>
            <Title order={2} c="white" mb="xs">Nuevo presupuesto</Title>

            <Paper withBorder p="md" radius="md" bg="white" mb="md">
                <Stack gap="sm">
                    <Text fw={700} size="sm">Cliente</Text>
                    <SimpleGrid cols={{ base: 1, sm: 2 }}>
                        <Select label="Buscar en mis clientes" placeholder="Selecciona…" searchable clearable
                            data={clientes?.map((c) => ({ value: c.id.toString(), label: `${c.nombre} (${c.identificacion})` })) || []}
                            value={clienteId} onChange={elegirCliente} />
                        <TextInput label="Nombre" value={clienteNombre} onChange={(e) => setClienteNombre(e.currentTarget.value)} />
                        <TextInput label="RIF / Cédula" value={clienteIdentificacion} onChange={(e) => setClienteIdentificacion(e.currentTarget.value)} />
                        <TextInput label="Dirección" value={clienteDireccion} onChange={(e) => setClienteDireccion(e.currentTarget.value)} />
                    </SimpleGrid>

                    <Group grow>
                        <Box>
                            <Text size="sm" fw={500} mb={4}>Tarifa de este presupuesto</Text>
                            <SegmentedControl fullWidth value={tarifa} onChange={aplicarTarifaATodos} data={[{ value: 'precio6', label: 'Precio 6 (mayor)' }, { value: 'precio7', label: 'Precio 7 (detal)' }]} />
                        </Box>
                        <NumberInput label="Tasa de cambio (Bs por $)" value={tasaCambio} onChange={setTasaCambio} min={0} decimalScale={2} />
                        <NumberInput label="Válido por (días)" value={validoDias} onChange={setValidoDias} min={1} max={365} allowDecimal={false} />
                    </Group>

                    <Text fw={700} size="sm" mt="xs">Productos</Text>
                    <TextInput placeholder="Buscar producto por nombre o código…" leftSection={<IconSearch size={16} />} value={busqueda} onChange={(e) => setBusqueda(e.currentTarget.value)} />
                    {encontrados.length > 0 && (
                        <ScrollArea.Autosize mah={220} type="auto">
                            <Stack gap={2}>
                                {encontrados.map((p) => (
                                    <Paper key={p.id} withBorder p={6} radius="sm" style={{ cursor: 'pointer' }} onClick={() => agregarProducto(p)}>
                                        <Group justify="space-between" wrap="nowrap">
                                            <Text size="sm" lineClamp={1}>{p.codigo} · {p.nombre}</Text>
                                            <Text size="xs" c="dimmed">P6 ${Number(p.precio6 || 0).toFixed(2)} · P7 ${Number(p.precio7 || 0).toFixed(2)}</Text>
                                        </Group>
                                    </Paper>
                                ))}
                            </Stack>
                        </ScrollArea.Autosize>
                    )}

                    {renglones.length > 0 && (
                        <Stack gap="xs" mt="xs">
                            {renglones.map((r, i) => (
                                <Group key={i} gap="xs" align="flex-end" wrap="wrap">
                                    <Text size="sm" style={{ flex: '1 1 220px' }} lineClamp={1}>{r.codigo} · {r.nombre}</Text>
                                    <NumberInput label={i === 0 ? 'Cant.' : undefined} value={r.cantidad} onChange={(v) => cambiarRenglon(i, 'cantidad', Number(v) || 1)} min={1} allowDecimal={false} w={80} hideControls />
                                    <NumberInput label={i === 0 ? 'Precio unit. $' : undefined} value={r.precioUnitario} onChange={(v) => cambiarRenglon(i, 'precioUnitario', Number(v) || 0)} min={0} decimalScale={3} w={120} hideControls />
                                    <Checkbox label="IVA" checked={r.aplicaIva} onChange={(e) => cambiarRenglon(i, 'aplicaIva', e.currentTarget.checked)} mb={8} />
                                    <ActionIcon color="red" variant="subtle" mb={4} onClick={() => quitarRenglon(i)}><IconTrash size={18} /></ActionIcon>
                                </Group>
                            ))}
                        </Stack>
                    )}

                    <Textarea label="Observaciones (opcional, sale en el presupuesto)" value={notas} onChange={(e) => setNotas(e.currentTarget.value)} autosize minRows={2} />

                    <Button size="md" color="teal" loading={guardando} onClick={guardar} disabled={!renglones.length}>Guardar e imprimir presupuesto</Button>
                </Stack>
            </Paper>

            {documento ? <PresupuestoImprimible presupuesto={documento} vistaPrevia /> : <Alert color="orange">Agrega al menos un producto para ver el presupuesto.</Alert>}
        </Container>
    );
}
