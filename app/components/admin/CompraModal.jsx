'use client';

import React, { useState, useEffect } from 'react';
import { 
    Modal, Button, Group, Title, TextInput, NumberInput, 
    Select, Paper, Stack, Grid, Table, ActionIcon, 
    Text, Divider, Badge, Checkbox, Box, ScrollArea, Alert 
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
    IconTrash, IconPlus, IconMinus, IconCheck, IconShieldCheck, IconAlertTriangle 
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import PrecioVisual from '../ui/PrecioVisual';
import { useAuth } from '@/hooks/useAuth';

export default function CompraModal({ opened, onClose, tasaBcv = 1 }) {
    const { userId } = useAuth();
    const queryClient = useQueryClient();
    
    const [carritoCompra, setCarritoCompra] = useState([]);
    const [busquedaProd, setBusquedaProd] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [modoNuevoProveedor, setModoNuevoProveedor] = useState(false);

    // Estados para la Fase de Simulación y Prompt de Aceptación
    const [modalSimulacionAbierto, setModalSimulacionAbierto] = useState(false);
    const [datosSimulacion, setDatosSimulacion] = useState(null);
    const [promptTexto, setPromptTexto] = useState('');

    const fetchSelect = async (url) => {
        const res = await fetch(url);
        if (!res.ok) return [];
        return res.json();
    };

    const { data: productos } = useQuery({ queryKey: ['productos-compra'], queryFn: () => fetchSelect('/api/productos') });
    const { data: proveedores } = useQuery({ queryKey: ['proveedores-compra'], queryFn: () => fetchSelect('/api/proveedores') });

    const formCompra = useForm({
        initialValues: {
            proveedorId: null,
            tipoDocumento: 'FACTURA',
            numeroDocumento: '',
            fechaFactura: new Date().toISOString().split('T')[0],
            condicionPago: 'Contado',
            diasCredito: 0,
            moneda: 'USD',
            metodoPago: 'Efectivo',
            referencia: '',
            aplicarRetencion: false,
            porcentajeRetencion: 75
        }
    });

    const formNuevoProv = useForm({
        initialValues: {
            identificacion: '',
            nombre: '',
            telefono: '',
            email: '',
            direccion: '',
            esContribuyenteEspecial: false,
            retencionIvaPorDefecto: 75,
            notas: ''
        }
    });

    const [modalCrearProv, setModalCrearProv] = useState(false);

    // Autoconfigurar retención si el proveedor es contribuyente especial
    useEffect(() => {
        if (!formCompra.values.proveedorId || !proveedores) return;
        const provSeleccionado = proveedores.find(p => String(p.id) === String(formCompra.values.proveedorId));
        if (provSeleccionado) {
            if (provSeleccionado.esContribuyenteEspecial) {
                formCompra.setFieldValue('aplicarRetencion', true);
                formCompra.setFieldValue('porcentajeRetencion', provSeleccionado.retencionIvaPorDefecto || 75);
            } else {
                formCompra.setFieldValue('aplicarRetencion', false);
            }
        }
    }, [formCompra.values.proveedorId, proveedores]);

    const agregarAlCarritoCompra = (prod) => {
        const existe = carritoCompra.find(i => i.id === prod.id);
        if (existe) {
            setCarritoCompra(carritoCompra.map(i => i.id === prod.id ? { ...i, cantidad: i.cantidad + 1 } : i));
        } else {
            setCarritoCompra([...carritoCompra, {
                id: prod.id,
                codigo: prod.codigo,
                nombre: prod.nombre,
                costoAnterior: Number(prod.costoUsd) || 0,
                precioCompraUnitario: Number(prod.costoUsd) || 0,
                cantidad: 1,
                porcentajeIva: Number(prod.porcentajeIva) || 16,
                aceptarCambioPrecio: true
            }]);
        }
    };

    const cambiarCantidad = (id, delta) => {
        setCarritoCompra(carritoCompra.map(i => {
            if (i.id === id) {
                const nuevaCant = i.cantidad + delta;
                return nuevaCant > 0 ? { ...i, cantidad: nuevaCant } : null;
            }
            return i;
        }).filter(Boolean));
    };

    const actualizarPrecioCompra = (id, nuevoPrecio) => {
        setCarritoCompra(carritoCompra.map(i => i.id === id ? { ...i, precioCompraUnitario: Number(nuevoPrecio) || 0 } : i));
    };

    const toggleAceptarCambioItem = (id) => {
        setCarritoCompra(carritoCompra.map(i => i.id === id ? { ...i, aceptarCambioPrecio: !i.aceptarCambioPrecio } : i));
    };

    const eliminarItem = (id) => setCarritoCompra(carritoCompra.filter(i => i.id !== id));

    const esFactura = formCompra.values.tipoDocumento === 'FACTURA';
    let subtotal = 0;
    let montoIva = 0;

    carritoCompra.forEach(item => {
        const itemSub = item.precioCompraUnitario * item.cantidad;
        subtotal += itemSub;
        if (esFactura && item.porcentajeIva > 0) {
            montoIva += itemSub * (item.porcentajeIva / 100);
        }
    });

    let montoRetencion = 0;
    if (formCompra.values.aplicarRetencion && esFactura && montoIva > 0) {
        montoRetencion = montoIva * (formCompra.values.porcentajeRetencion / 100);
    }

    const totalFinal = subtotal + montoIva;

    const handleLanzarSimulacion = async () => {
        if (carritoCompra.length === 0) return notifications.show({ message: 'El carrito de compra está vacío', color: 'orange' });
        if (!formCompra.values.numeroDocumento) return notifications.show({ message: 'Indica el número de factura o recibo', color: 'red' });
        if (!formCompra.values.proveedorId && !modoNuevoProveedor) return notifications.show({ message: 'Selecciona o crea un proveedor', color: 'red' });

        setIsSubmitting(true);
        try {
            const payload = {
                simular: true,
                proveedorId: modoNuevoProveedor ? null : Number(formCompra.values.proveedorId),
                nuevoProveedor: modoNuevoProveedor ? formNuevoProv.values : null,
                tipoDocumento: formCompra.values.tipoDocumento,
                numeroDocumento: formCompra.values.numeroDocumento,
                fechaFactura: formCompra.values.fechaFactura,
                condicionPago: formCompra.values.condicionPago,
                diasCredito: formCompra.values.diasCredito,
                moneda: formCompra.values.moneda,
                tasaCambio: tasaBcv,
                subtotal, montoIva, montoRetencion, totalFinal,
                detalles: carritoCompra
            };

            const res = await fetch('/api/compras', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al simular la compra');

            setDatosSimulacion(data.detallesSimulacion);
            setPromptTexto(data.mensajePrompt);
            setModalSimulacionAbierto(true);

        } catch (error) {
            notifications.show({ title: 'Error', message: error.message, color: 'red' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEjecutarCompraFinal = async () => {
        setIsSubmitting(true);
        try {
            const payload = {
                simular: false,
                proveedorId: modoNuevoProveedor ? null : Number(formCompra.values.proveedorId),
                nuevoProveedor: modoNuevoProveedor ? formNuevoProv.values : null,
                tipoDocumento: formCompra.values.tipoDocumento,
                numeroDocumento: formCompra.values.numeroDocumento,
                fechaFactura: formCompra.values.fechaFactura,
                condicionPago: formCompra.values.condicionPago,
                diasCredito: formCompra.values.diasCredito,
                moneda: formCompra.values.moneda,
                tasaCambio: tasaBcv,
                metodoPago: formCompra.values.metodoPago,
                referencia: formCompra.values.referencia,
                subtotal, montoIva, montoRetencion, totalFinal,
                registradoPorId: userId,
                detalles: carritoCompra
            };

            const res = await fetch('/api/compras', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al registrar la compra');

            notifications.show({ title: 'Éxito', message: 'Factura registrada, inventario y costos actualizados.', color: 'green' });
            queryClient.invalidateQueries(['productos-compra']);
            setCarritoCompra([]);
            setModalSimulacionAbierto(false);
            onClose();

        } catch (error) {
            notifications.show({ title: 'Error', message: error.message, color: 'red' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const productosFiltrados = productos?.filter(p => p.nombre?.toLowerCase().includes(busquedaProd.toLowerCase()) || p.codigo?.toLowerCase().includes(busquedaProd.toLowerCase())) || [];

    return (
        <>
            {/* 🔥 MODAL DE COMPRA AMPLIADO A FULLSCREEN 🔥 */}
            <Modal opened={opened} onClose={onClose} fullScreen title={<Title order={2} c="blue.9">Registrar Factura / Nota de Compra (Proveedor)</Title>}>
                
                <Box p="md" maw={1600} mx="auto">
                    <Alert icon={<IconShieldCheck size={20} />} title="Declaración de Responsabilidad de Recepción" color="red" variant="light" mb="md">
                        Al registrar y firmar esta factura, certifica bajo su estricta responsabilidad que la mercancía física ingresada al almacén ha sido contada y validada.
                    </Alert>

                    <Grid gutter="lg">
                        <Grid.Col span={{ base: 12, md: 5 }}>
                            <Paper withBorder p="md" radius="md" h="78vh" style={{ display: 'flex', flexDirection: 'column' }}>
                                <TextInput size="md" placeholder="Buscar producto por nombre o SKU..." mb="md" value={busquedaProd} onChange={(e) => setBusquedaProd(e.currentTarget.value)} data-autofocus />
                                <ScrollArea style={{ flex: 1 }} type="auto">
                                    <Stack gap="xs">
                                        {productosFiltrados.map(prod => (
                                            <Paper key={prod.id} p="sm" withBorder radius="sm" style={{ cursor: 'pointer' }} onClick={() => agregarAlCarritoCompra(prod)}>
                                                <Group justify="space-between" wrap="nowrap">
                                                    <Box maw="75%">
                                                        <Text fw={600} size="md" lineClamp={1}>{prod.nombre}</Text>
                                                        <Text size="sm" c="dimmed">SKU: {prod.codigo} | Stock Actual: {prod.stockAlmacen}</Text>
                                                    </Box>
                                                    <Badge color="blue" size="lg" variant="light">
                                                        Costo: <PrecioVisual valor={prod.costoUsd} simbolo="$" size="sm" />
                                                    </Badge>
                                                </Group>
                                            </Paper>
                                        ))}
                                    </Stack>
                                </ScrollArea>
                            </Paper>
                        </Grid.Col>

                        <Grid.Col span={{ base: 12, md: 7 }}>
                            <Paper withBorder p="lg" radius="md" h="78vh" style={{ display: 'flex', flexDirection: 'column' }}>
                                
                                <Group grow mb="md">
                                    <Select 
                                        size="md"
                                        label="Proveedor" placeholder="Seleccione proveedor..." searchable
                                        data={proveedores?.map(p => ({ value: String(p.id), label: `${p.nombre} (RIF: ${p.identificacion})` })) || []}
                                        {...formCompra.getInputProps('proveedorId')}
                                    />
                                    <Button size="md" variant="light" color="grape" mt={24} onClick={() => setModalCrearProv(true)}>+ Nuevo Proveedor</Button>
                                </Group>

                                <Group grow mb="md">
                                    <Select 
                                        size="md"
                                        label="Tipo de Documento"
                                        data={[{ value: 'FACTURA', label: 'Factura (Aplica IVA)' }, { value: 'NOTA_ENTREGA', label: 'Nota de Entrega' }]}
                                        {...formCompra.getInputProps('tipoDocumento')}
                                    />
                                    <TextInput size="md" label="Nro. de Factura / Recibo" placeholder="Ej: F-98765" withAsterisk {...formCompra.getInputProps('numeroDocumento')} />
                                </Group>

                                <Group grow mb="md">
                                    <TextInput size="md" type="date" label="Fecha de Factura" withAsterisk {...formCompra.getInputProps('fechaFactura')} />
                                    <Select size="md" label="Condición de Pago" data={[{ value: 'Contado', label: 'Contado' }, { value: 'Credito', label: 'Crédito' }]} {...formCompra.getInputProps('condicionPago')} />
                                    {formCompra.values.condicionPago === 'Credito' && (
                                        <NumberInput size="md" label="Días de Crédito" min={1} withAsterisk {...formCompra.getInputProps('diasCredito')} />
                                    )}
                                </Group>

                                <Group mb="md" justify="space-between">
                                    <Select size="md" label="Moneda" data={['USD', 'BS']} w={150} {...formCompra.getInputProps('moneda')} />
                                    {esFactura && (
                                        <Group>
                                            <Checkbox label={<Text fw={600} size="md">Aplicar Retención IVA</Text>} {...formCompra.getInputProps('aplicarRetencion', { type: 'checkbox' })} />
                                            {formCompra.values.aplicarRetencion && (
                                                <Select size="md" data={[{value: '75', label: '75%'}, {value: '100', label: '100%'}]} w={110} {...formCompra.getInputProps('porcentajeRetencion')} />
                                            )}
                                        </Group>
                                    )}
                                </Group>

                                <ScrollArea style={{ flex: 1 }} type="auto" mb="md">
                                    <Table striped highlightOnHover verticalSpacing="md">
                                        <Table.Thead>
                                            <Table.Tr>
                                                <Table.Th><Text size="sm">Producto</Text></Table.Th>
                                                <Table.Th ta="center"><Text size="sm">Cant</Text></Table.Th>
                                                <Table.Th><Text size="sm">Costo Ant.</Text></Table.Th>
                                                <Table.Th><Text size="sm">Nuevo Precio Compra</Text></Table.Th>
                                                <Table.Th></Table.Th>
                                            </Table.Tr>
                                        </Table.Thead>
                                        <Table.Tbody>
                                            {carritoCompra.map(item => {
                                                const diferencia = item.precioCompraUnitario - item.costoAnterior;
                                                const variacionPorcentual = item.costoAnterior > 0 ? ((diferencia / item.costoAnterior) * 100).toFixed(1) : 100;
                                                
                                                return (
                                                    <Table.Tr key={item.id}>
                                                        <Table.Td>
                                                            <Text fw={600} size="md">{item.nombre}</Text>
                                                            <Text size="xs" c="dimmed">SKU: {item.codigo}</Text>
                                                        </Table.Td>
                                                        <Table.Td ta="center">
                                                            <Group gap={6} justify="center">
                                                                <ActionIcon size="sm" onClick={() => cambiarCantidad(item.id, -1)}><IconMinus size={14}/></ActionIcon>
                                                                <Text fw={700} size="md">{item.cantidad}</Text>
                                                                <ActionIcon size="sm" onClick={() => cambiarCantidad(item.id, 1)}><IconPlus size={14}/></ActionIcon>
                                                            </Group>
                                                        </Table.Td>
                                                        <Table.Td><PrecioVisual valor={item.costoAnterior} simbolo="$" size="md" c="dimmed" /></Table.Td>
                                                        <Table.Td>
                                                            <NumberInput value={item.precioCompraUnitario} onChange={(val) => actualizarPrecioCompra(item.id, val)} decimalScale={2} w={120} size="sm" />
                                                            {diferencia !== 0 && (
                                                                <Text size="xs" c={diferencia > 0 ? 'red' : 'teal'} fw={700}>
                                                                    {diferencia > 0 ? `▲ +${variacionPorcentual}%` : `▼ ${variacionPorcentual}%`} ponderado
                                                                </Text>
                                                            )}
                                                        </Table.Td>
                                                        <Table.Td>
                                                            <ActionIcon color="red" variant="subtle" size="lg" onClick={() => eliminarItem(item.id)}><IconTrash size={20}/></ActionIcon>
                                                        </Table.Td>
                                                    </Table.Tr>
                                                );
                                            })}
                                        </Table.Tbody>
                                    </Table>
                                </ScrollArea>

                                <Divider mb="md" />

                                <Group justify="space-between" align="flex-end">
                                    <Stack gap={4}>
                                        <Text size="sm" c="dimmed">Subtotal: <PrecioVisual valor={subtotal} simbolo={formCompra.values.moneda === 'BS' ? 'Bs' : '$'} size="sm" /></Text>
                                        {esFactura && <Text size="sm" c="dimmed">IVA (16%): <PrecioVisual valor={montoIva} simbolo={formCompra.values.moneda === 'BS' ? 'Bs' : '$'} size="sm" /></Text>}
                                        {montoRetencion > 0 && <Text size="sm" c="red" fw={700}>Retención (-): <PrecioVisual valor={montoRetencion} simbolo={formCompra.values.moneda === 'BS' ? 'Bs' : '$'} size="sm" /></Text>}
                                        <Text fw={900} size="xl" c="blue.9">Total: <PrecioVisual valor={totalFinal} simbolo={formCompra.values.moneda === 'BS' ? 'Bs' : '$'} size="xl" fw={900} c="blue.9" /></Text>
                                    </Stack>

                                    <Button size="lg" color="green.8" leftSection={<IconCheck size={22} />} onClick={handleLanzarSimulacion} loading={isSubmitting} disabled={carritoCompra.length === 0}>
                                        Analizar Compra y Costos
                                    </Button>
                                </Group>
                            </Paper>
                        </Grid.Col>
                    </Grid>
                </Box>

                {/* MODAL SECUNDARIO: CREAR PROVEEDOR EN CALIENTE */}
                <Modal opened={modalCrearProv} onClose={() => setModalCrearProv(false)} size="lg" title={<Title order={3} c="grape">Registrar Nuevo Proveedor</Title>} centered zIndex={2000}>
                    <form onSubmit={formNuevoProv.onSubmit(async (values) => {
                        try {
                            const res = await fetch('/api/proveedores', {
                                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values)
                            });
                            const data = await res.json();
                            if (!res.ok) throw new Error(data.error);

                            notifications.show({ title: 'Proveedor Creado', message: 'Guardado y seleccionado.', color: 'green' });
                            queryClient.invalidateQueries(['proveedores-compra']);
                            formCompra.setFieldValue('proveedorId', String(data.id));
                            setModalCrearProv(false);
                            formNuevoProv.reset();
                        } catch (err) {
                            notifications.show({ title: 'Error', message: err.message, color: 'red' });
                        }
                    })}>
                        <Stack gap="md">
                            <TextInput size="md" label="RIF" withAsterisk {...formNuevoProv.getInputProps('identificacion')} />
                            <TextInput size="md" label="Razón Social" withAsterisk {...formNuevoProv.getInputProps('nombre')} />
                            <TextInput size="md" label="Teléfono" {...formNuevoProv.getInputProps('telefono')} />
                            <TextInput size="md" label="Email" {...formNuevoProv.getInputProps('email')} />
                            <TextInput size="md" label="Dirección" {...formNuevoProv.getInputProps('direccion')} />
                            <Group grow>
                                <Checkbox label="Contribuyente Especial" size="md" mt={8} {...formNuevoProv.getInputProps('esContribuyenteEspecial', { type: 'checkbox' })} />
                                <Select size="md" label="Retención Default" data={[{ value: '75', label: '75%' }, { value: '100', label: '100%' }]} {...formNuevoProv.getInputProps('retencionIvaPorDefecto', { transform: (v) => Number(v) })} />
                            </Group>
                            <Button size="md" type="submit" color="grape" mt="md">Guardar Proveedor</Button>
                        </Stack>
                    </form>
                </Modal>
            </Modal>

            {/* 🔥 MODAL PROMPT DE DECISIÓN DE PRECIOS PONDERADOS AMPLIADO A FULLSCREEN 🔥 */}
            <Modal opened={modalSimulacionAbierto} onClose={() => setModalSimulacionAbierto(false)} fullScreen title={<Title order={2} c="orange.8"><IconAlertTriangle size={24} style={{verticalAlign: 'middle'}} /> Auditoría de Costos Ponderados y Stock</Title>} zIndex={3000}>
                <Box p="lg" maw={1500} mx="auto">
                    <Stack gap="lg">
                        <Alert color="orange" variant="light" p="md">
                            <Text fw={700} size="md">{promptTexto}</Text>
                        </Alert>

                        <ScrollArea h="55vh">
                            <Table striped highlightOnHover verticalSpacing="md">
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th><Text size="sm">Producto</Text></Table.Th>
                                        <Table.Th ta="center"><Text size="sm">Stock Previo / Compra</Text></Table.Th>
                                        <Table.Th ta="center"><Text size="sm">Costo Ponderado</Text></Table.Th>
                                        <Table.Th ta="center"><Text size="sm">Aumento</Text></Table.Th>
                                        <Table.Th><Text size="sm">Precio 6 (Actual ➔ Nuevo)</Text></Table.Th>
                                        <Table.Th><Text size="sm">Precio 7 (Actual ➔ Nuevo)</Text></Table.Th>
                                        <Table.Th ta="center"><Text size="sm">¿Modificar?</Text></Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {datosSimulacion?.map((sim) => {
                                        const itemCarrito = carritoCompra.find(i => i.id === sim.productoId);
                                        return (
                                            <Table.Tr key={sim.productoId}>
                                                <Table.Td>
                                                    <Text fw={700} size="md">{sim.nombre}</Text>
                                                    <Text size="sm" c="dimmed">SKU: {sim.codigo}</Text>
                                                </Table.Td>
                                                <Table.Td ta="center">
                                                    <Badge size="lg" variant="outline" color="blue">
                                                        Existía: {sim.stockActual} | Entran: +{sim.cantidadComprada}
                                                    </Badge>
                                                </Table.Td>
                                                <Table.Td ta="center">
                                                    <Text size="sm" c="dimmed">Ant: ${sim.costoActual}</Text>
                                                    <Text size="md" fw={700} c="teal">Nuevo: ${sim.nuevoCostoPonderado}</Text>
                                                </Table.Td>
                                                <Table.Td ta="center">
                                                    <Badge color={sim.porcentajeAumento >= 0 ? 'red' : 'teal'} size="lg" variant="filled">
                                                        {sim.porcentajeAumento >= 0 ? `+${sim.porcentajeAumento}%` : `${sim.porcentajeAumento}%`}
                                                    </Badge>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Text size="md">${sim.precio6.actual} ➔ <Text span fw={700} c="blue" size="lg">${sim.precio6.nuevo}</Text></Text>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Text size="md">${sim.precio7.actual} ➔ <Text span fw={700} c="blue" size="lg">${sim.precio7.nuevo}</Text></Text>
                                                </Table.Td>
                                                <Table.Td ta="center">
                                                    <Checkbox 
                                                        size="md"
                                                        checked={itemCarrito?.aceptarCambioPrecio ?? true}
                                                        onChange={() => toggleAceptarCambioItem(sim.productoId)}
                                                        label="Aceptar"
                                                    />
                                                </Table.Td>
                                            </Table.Tr>
                                        );
                                    })}
                                </Table.Tbody>
                            </Table>
                        </ScrollArea>

                        <Group justify="flex-end" mt="xl" gap="md">
                            <Button size="lg" variant="default" onClick={() => setModalSimulacionAbierto(false)}>Cancelar</Button>
                            <Button size="lg" color="green" onClick={handleEjecutarCompraFinal} loading={isSubmitting}>
                                Confirmar y Ejecutar Compra
                            </Button>
                        </Group>
                    </Stack>
                </Box>
            </Modal>
        </>
    );
}