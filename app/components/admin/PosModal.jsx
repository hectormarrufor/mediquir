'use client';

import React, { useState, useEffect } from 'react';
import {
    Modal, Button, Group, Title, TextInput, NumberInput,
    Select, Paper, Stack, Grid, Table, ActionIcon,
    Text, Divider, Badge, Checkbox, Box, ScrollArea, Avatar, ThemeIcon
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useQuery } from '@tanstack/react-query';
import {
    IconTrash, IconPlus, IconMinus, IconCash,
    IconExchange, IconTag, IconPackage, IconReceiptTax
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import PrecioVisual from '../ui/PrecioVisual';
import { useAuth } from '@/hooks/useAuth';

export default function PosModal({ opened, onClose, tasaBcv }) {
    const [tipoVenta, setTipoVenta] = useState('DETAL');
    const [carrito, setCarrito] = useState([]);
    const [busquedaProducto, setBusquedaProducto] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { userId } = useAuth();

    const getImageUrl = (path) => {
        if (!path) return null;
        if (path.startsWith('http://') || path.startsWith('https://')) return path;
        const base = process.env.NEXT_PUBLIC_BLOB_BASE_URL || '';
        const cleanPath = path.replace(/^\/+/, '');
        const cleanBase = base.replace(/\/+$/, '');
        return `${cleanBase}/${cleanPath}`;
    };

    const fetchSelect = async (url) => {
        const res = await fetch(url);
        if (!res.ok) return [];
        return res.json();
    };

    const { data: productos } = useQuery({ queryKey: ['productos-pos'], queryFn: () => fetchSelect('/api/productos') });
    const { data: clientes } = useQuery({ queryKey: ['clientes-pos'], queryFn: () => fetchSelect('/api/clientes') });

    // 🔥 CONSULTAMOS LOS CORRELATIVOS ACTUALES PARA PREDECIR EL NÚMERO 🔥
    const { data: correlativos } = useQuery({ queryKey: ['correlativos-pos'], queryFn: () => fetchSelect('/api/correlativos') });

    const formVenta = useForm({
        initialValues: {
            clienteId: null,
            tipoPrecio: 'precio7',
            conIva: true,
            condicionPago: 'Contado',
            metodoPago: 'Efectivo ($)',
            referencia: '',
            quienRetira: '',
            costoFlete: '',
            numeroDocumento: '' // 🔥 NUEVO: Campo para controlar el correlativo en vivo
        }
    });

    // --- LÓGICA DE DOCUMENTO EN VIVO ---
    const tipoDocumentoActual = tipoVenta === 'DETAL'
        ? (formVenta.values.conIva ? 'FACTURA' : 'VENTA RAPIDA')
        : (formVenta.values.conIva ? 'FACTURA' : 'NOTA DE ENTREGA');

    // Efecto para auto-llenar el correlativo cuando cambia el tipo de documento
    useEffect(() => {
        let prefijo = 'V';
        if (tipoDocumentoActual === 'FACTURA') prefijo = 'F';
        if (tipoDocumentoActual === 'NOTA DE ENTREGA') prefijo = 'NE';

        if (correlativos) {
            const corr = correlativos.find(c => c.prefijo === prefijo);
            const num = corr ? corr.siguienteNumero : 1;
            const ceros = corr ? corr.cerosRelleno : 5;
            formVenta.setFieldValue('numeroDocumento', `${prefijo}-${String(num).padStart(ceros, '0')}`);
        } else {
            // Predeterminado si no han cargado de la API
            formVenta.setFieldValue('numeroDocumento', `${prefijo}-00001`);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tipoDocumentoActual, correlativos]);


    // --- MÉTODOS DE PAGO DINÁMICOS SEGÚN TARIFA ---
    const esMonedaBs = ['precio1', 'precio4', 'precio5'].includes(formVenta.values.tipoPrecio);
    const opcionesMetodoPago = esMonedaBs
        ? ['Efectivo (Bs)', 'Transferencia', 'Pago Móvil', 'Punto de Venta']
        : ['Efectivo ($)', 'Zelle'];

    useEffect(() => {
        const metodoActual = formVenta.values.metodoPago;
        if (esMonedaBs && !opcionesMetodoPago.includes(metodoActual)) {
            formVenta.setFieldValue('metodoPago', 'Efectivo (Bs)');
        } else if (!esMonedaBs && !opcionesMetodoPago.includes(metodoActual)) {
            formVenta.setFieldValue('metodoPago', 'Efectivo ($)');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [formVenta.values.tipoPrecio]);

    useEffect(() => {
        if (tipoVenta === 'DETAL') {
            formVenta.setFieldValue('condicionPago', 'Contado');
            formVenta.setFieldValue('clienteId', null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tipoVenta]);

    const calcularPrecioInfo = (producto, tarifa) => {
        const costo = Number(producto.costoUsd) || 0;
        const p6 = Number(producto.precio6) || costo;
        let p7 = Number(producto.precio7) || (costo * 1.5);
        let tieneDescuento = false;

        const descuento = Number(producto.porcentajeDescuento) || 0;
        if (descuento > 0) {
            p7 = p7 - (p7 * (descuento / 100));
            tieneDescuento = true;
        }

        let precioFinal = 0;
        let monedaSimbolo = 'USD';

        switch (tarifa) {
            case 'precio7': precioFinal = p7; monedaSimbolo = '$'; break;
            case 'precio6': precioFinal = p6; monedaSimbolo = '$'; break;
            case 'precio1': precioFinal = costo * 1.35 * tasaBcv; monedaSimbolo = 'Bs'; break;
            case 'precio4': precioFinal = p7 * tasaBcv; monedaSimbolo = 'Bs'; break;
            case 'precio5': precioFinal = p6 * tasaBcv; monedaSimbolo = 'Bs'; break;
            default: precioFinal = p7; monedaSimbolo = '$';
        }

        const aplicaDescuento = tieneDescuento && (tarifa === 'precio7' || tarifa === 'precio4');

        return {
            precio: precioFinal,
            simbolo: monedaSimbolo,
            tieneDescuento: aplicaDescuento,
            porcentajeDescuento: aplicaDescuento ? descuento : 0
        };
    };

    useEffect(() => {
        if (!productos || carrito.length === 0) return;
        setCarrito(prevCarrito => prevCarrito.map(item => {
            const productoOriginal = productos.find(p => p.id === item.id);
            if (!productoOriginal) return item;
            const info = calcularPrecioInfo(productoOriginal, formVenta.values.tipoPrecio);
            return {
                ...item,
                precio: info.precio,
                simbolo: info.simbolo,
                tieneDescuento: info.tieneDescuento,
                porcentajeDescuento: info.porcentajeDescuento,
                imagen: getImageUrl(productoOriginal.imagen),
                marcaImagen: getImageUrl(productoOriginal.marca?.imagen),
                marcaNombre: productoOriginal.marca?.nombre
            };
        }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [formVenta.values.tipoPrecio, tasaBcv]);


    const agregarAlCarrito = (producto) => {
        const info = calcularPrecioInfo(producto, formVenta.values.tipoPrecio);
        const existe = carrito.find(item => item.id === producto.id);

        const imgProducto = getImageUrl(producto.imagen);
        const imgMarca = getImageUrl(producto.marca?.imagen);

        if (existe) {
            setCarrito(carrito.map(item => item.id === producto.id ? {
                ...item,
                cantidad: item.cantidad + 1,
                precio: info.precio,
                simbolo: info.simbolo,
                tieneDescuento: info.tieneDescuento,
                porcentajeDescuento: info.porcentajeDescuento,
                imagen: imgProducto,
                marcaImagen: imgMarca,
                marcaNombre: producto.marca?.nombre
            } : item));
        } else {
            setCarrito([...carrito, {
                id: producto.id,
                nombre: producto.nombre,
                codigo: producto.codigo,
                precio: info.precio,
                simbolo: info.simbolo,
                tieneDescuento: info.tieneDescuento,
                porcentajeDescuento: info.porcentajeDescuento,
                cantidad: 1,
                imagen: imgProducto,
                marcaImagen: imgMarca,
                marcaNombre: producto.marca?.nombre
            }]);
        }
    };

    const cambiarCantidad = (id, delta) => {
        setCarrito(carrito.map(item => {
            if (item.id === id) {
                const nuevaCantidad = item.cantidad + delta;
                return nuevaCantidad > 0 ? { ...item, cantidad: nuevaCantidad } : null;
            }
            return item;
        }).filter(Boolean));
    };

    const eliminarItem = (id) => setCarrito(carrito.filter(item => item.id !== id));

    const subtotal = carrito.reduce((acc, item) => acc + (item.precio * item.cantidad), 0);
    const montoIva = formVenta.values.conIva ? subtotal * 0.16 : 0;
    const costoFleteNum = Number(formVenta.values.costoFlete) || 0;
    const totalFinal = subtotal + montoIva + costoFleteNum;
    const simboloMoneda = esMonedaBs ? 'Bs' : '$';

    const handleProcesarVenta = async () => {
        if (carrito.length === 0) return notifications.show({ message: 'El carrito está vacío', color: 'orange' });
        if (tipoVenta === 'MAYOR' && !formVenta.values.clienteId) return notifications.show({ message: 'Debe seleccionar un cliente mayorista', color: 'red' });
        if (!formVenta.values.numeroDocumento) return notifications.show({ message: 'El número de documento es obligatorio', color: 'red' });

        setIsSubmitting(true);

        try {
            const payload = {
                vendedorId: userId,
                tipoVenta,
                tipoDocumento: tipoDocumentoActual === 'VENTA RAPIDA' ? 'VENTA_RAPIDA' : (tipoDocumentoActual === 'NOTA DE ENTREGA' ? 'NOTA_ENTREGA' : 'FACTURA'),
                numeroDocumentoManual: formVenta.values.numeroDocumento, // 🔥 ENVIAMOS EL NÚMERO QUE ESTÁ EN PANTALLA
                clienteId: formVenta.values.clienteId ? Number(formVenta.values.clienteId) : null,
                moneda: simboloMoneda === 'Bs' ? 'BS' : 'USD',
                tasaCambio: tasaBcv,
                condicionPago: formVenta.values.condicionPago,
                metodoPago: formVenta.values.condicionPago === 'Contado' ? formVenta.values.metodoPago : null,
                referencia: formVenta.values.condicionPago === 'Contado' ? (formVenta.values.referencia || null) : null,
                quienRetira: formVenta.values.quienRetira || null,
                costoFlete: costoFleteNum,
                subtotal, montoIva, totalFinal,
                detalles: carrito.map(item => ({
                    productoId: item.id, cantidad: item.cantidad,
                    precioUnitario: item.precio, subtotal: item.precio * item.cantidad
                }))
            };

            const res = await fetch('/api/ventas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Error al procesar la venta');

            notifications.show({ title: 'Éxito', message: `Documento registrado: ${data.numeroDocumento}`, color: 'green' });

            setCarrito([]);
            formVenta.reset();
            onClose();

        } catch (error) {
            notifications.show({ title: 'Error', message: error.message, color: 'red' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const productosFiltrados = productos?.filter(p => p.nombre?.toLowerCase().includes(busquedaProducto.toLowerCase()) || p.codigo?.toLowerCase().includes(busquedaProducto.toLowerCase())) || [];

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            size="95%"
            title={<Title order={3} c="blue.9" component="div">Terminal POS - Nueva Venta</Title>}
            centered
        >
            <Paper p="xs" mb="md" bg="blue.0" radius="md">
                <Group justify="space-between">
                    <Group>
                        <IconExchange size={20} color="#1971C2" />
                        <Text fw={600} c="blue.9">Tasa BCV Activa del Día:</Text>
                        <Badge size="lg" color="blue" variant="filled">{tasaBcv} Bs/$</Badge>
                    </Group>
                    <Text size="xs" c="dimmed">Los precios en Bs se calculan automáticamente con esta tasa.</Text>
                </Group>
            </Paper>

            <Grid gutter="md">
                {/* COLUMNA IZQUIERDA: BUSCADOR */}
                <Grid.Col span={{ base: 12, md: 5 }}>
                    <Paper withBorder p="md" radius="md" h="70vh" style={{ display: 'flex', flexDirection: 'column' }}>
                        <Button.Group mb="md">
                            <Button fullWidth variant={tipoVenta === 'DETAL' ? 'filled' : 'light'} onClick={() => setTipoVenta('DETAL')}>Venta Detal</Button>
                            <Button fullWidth variant={tipoVenta === 'MAYOR' ? 'filled' : 'light'} color="grape" onClick={() => setTipoVenta('MAYOR')}>Venta Mayor</Button>
                        </Button.Group>

                        <TextInput placeholder="Buscar producto..." mb="md" value={busquedaProducto} onChange={(e) => setBusquedaProducto(e.currentTarget.value)} data-autofocus />

                        <ScrollArea style={{ flex: 1 }} type="auto">
                            <Stack gap="xs">
                                {productosFiltrados.slice(0, 20).map(prod => {
                                    const infoPreview = calcularPrecioInfo(prod, formVenta.values.tipoPrecio);
                                    const imgFinal = getImageUrl(prod.imagen) || getImageUrl(prod.marca?.imagen);

                                    return (
                                        <Paper key={prod.id} p="sm" withBorder radius="sm" style={{ cursor: 'pointer' }} onClick={() => agregarAlCarrito(prod)}>
                                            <Group wrap="nowrap" justify="space-between">

                                                <Group wrap="nowrap" maw="75%" gap="sm">
                                                    <Avatar src={imgFinal} size="md" radius="sm" color="blue">
                                                        <IconPackage size={16} />
                                                    </Avatar>
                                                    <Box>
                                                        <Group gap={4}>
                                                            <Text fw={600} size="sm" lineClamp={1}>{prod.nombre}</Text>
                                                            {infoPreview.tieneDescuento && (
                                                                <Badge size="xs" color="red" variant="filled">
                                                                    -{infoPreview.porcentajeDescuento}%
                                                                </Badge>
                                                            )}
                                                        </Group>
                                                        <Group gap={6} mt={2}>
                                                            <Text size="xs" c="dimmed" lineClamp={1}>
                                                                SKU: {prod.codigo} {prod.marca?.nombre ? `| ${prod.marca.nombre}` : ''}
                                                            </Text>
                                                            {/* 🔥 INDICADOR DE STOCK EN VIVO 🔥 */}
                                                            <Badge size="xs" color={prod.stockAlmacen > 0 ? "teal" : "red"} variant="light">
                                                                Stock: {prod.stockAlmacen || 0}
                                                            </Badge>
                                                        </Group>
                                                    </Box>
                                                </Group>

                                                <Badge color={infoPreview.simbolo === 'Bs' ? 'teal' : 'blue'} variant="light" size="lg" px={8}>
                                                    <PrecioVisual valor={infoPreview.precio} simbolo={infoPreview.simbolo} size="sm" fw={700} />
                                                </Badge>
                                            </Group>
                                        </Paper>
                                    );
                                })}
                            </Stack>
                        </ScrollArea>
                    </Paper>
                </Grid.Col>

                {/* COLUMNA DERECHA: CARRITO Y CONFIG */}
                <Grid.Col span={{ base: 12, md: 7 }}>
                    <Paper withBorder p="md" radius="md" h="70vh" style={{ display: 'flex', flexDirection: 'column' }}>

                        {/* 🔥 CABECERA DE RECIBO (CORRELATIVO EN VIVO) 🔥 */}
                        <Paper p="sm" mb="md" bg={tipoDocumentoActual === 'FACTURA' ? 'red.0' : 'gray.1'} radius="md" withBorder>
                            <Group justify="space-between" align="center">
                                <Group gap="sm">
                                    <ThemeIcon size="lg" variant="light" color={tipoDocumentoActual === 'FACTURA' ? 'red' : 'blue'}>
                                        <IconReceiptTax size={20} />
                                    </ThemeIcon>
                                    <Box>
                                        <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Documento a Emitir</Text>
                                        <Text size="lg" fw={800} c={tipoDocumentoActual === 'FACTURA' ? 'red.9' : 'blue.9'}>
                                            {tipoDocumentoActual}
                                        </Text>
                                    </Box>
                                </Group>

                                <TextInput
                                    label="Nro. Correlativo"
                                    size="sm"
                                    w={150}
                                    fw={700}
                                    {...formVenta.getInputProps('numeroDocumento')}
                                    description="Puedes editarlo"
                                />
                            </Group>
                        </Paper>

                        <Group grow mb="md">
                            {tipoVenta === 'MAYOR' && (
                                <Select label="Cliente Mayorista" placeholder="Seleccione..." searchable data={clientes?.map(c => ({ value: c.id.toString(), label: c.nombre || c.identificacion })) || []} {...formVenta.getInputProps('clienteId')} />
                            )}
                            <Select
                                label="Tarifa Aplicada"
                                data={[
                                    { value: 'precio7', label: 'Precio 7 (Detal USD)' },
                                    { value: 'precio6', label: 'Precio 6 (Mayor USD)' },
                                    { value: 'precio1', label: 'Precio 1 (35% Costo en Bs)' },
                                    { value: 'precio4', label: 'Precio 4 (Precio 7 en Bs)' },
                                    { value: 'precio5', label: 'Precio 5 (Precio 6 en Bs)' }
                                ]}
                                {...formVenta.getInputProps('tipoPrecio')}
                            />
                        </Group>

                        <Group mb="md" justify="space-between">
                            <Checkbox label={<Text fw={600} size="sm">Generar con IVA (16%)</Text>} {...formVenta.getInputProps('conIva', { type: 'checkbox' })} />
                            {tipoVenta === 'MAYOR' && <Select size="xs" w={150} data={['Contado', 'Credito']} {...formVenta.getInputProps('condicionPago')} />}
                        </Group>

                        {formVenta.values.condicionPago === 'Contado' && (
                            <Group mb="md" grow>
                                <Select
                                    label="Método de Pago"
                                    data={opcionesMetodoPago}
                                    {...formVenta.getInputProps('metodoPago')}
                                />
                                {formVenta.values.metodoPago === 'Pago Móvil' ? (
                                    <TextInput
                                        label="Nro. de Referencia"
                                        placeholder="Últimos 4 dígitos"
                                        maxLength={4}
                                        {...formVenta.getInputProps('referencia')}
                                    />
                                ) : formVenta.values.metodoPago === 'Transferencia' || formVenta.values.metodoPago === 'Zelle' ? (
                                    <TextInput
                                        label="Nro. de Referencia"
                                        placeholder="Número de confirmación"
                                        {...formVenta.getInputProps('referencia')}
                                    />
                                ) : (
                                    <Box />
                                )}
                            </Group>
                        )}

                        <ScrollArea style={{ flex: 1 }} type="auto" mb="md">
                            <Table striped highlightOnHover>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>Producto</Table.Th>
                                        <Table.Th>Cant</Table.Th>
                                        <Table.Th>Unit.</Table.Th>
                                        <Table.Th>Total</Table.Th>
                                        <Table.Th></Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {carrito.map(item => (
                                        <Table.Tr key={item.id}>
                                            <Table.Td>
                                                <Group gap="sm" wrap="nowrap">
                                                    <Avatar src={item.imagen || item.marcaImagen} size="sm" radius="sm">
                                                        <IconPackage size={14} />
                                                    </Avatar>
                                                    <Box>
                                                        <Group gap={4}>
                                                            <Text fw={500} size="sm" lineClamp={1}>{item.nombre}</Text>
                                                            {item.tieneDescuento && (
                                                                <Badge size="xs" color="red" variant="filled">
                                                                    -{item.porcentajeDescuento}%
                                                                </Badge>
                                                            )}
                                                        </Group>
                                                        {item.marcaNombre && <Text size="xs" c="dimmed">{item.marcaNombre}</Text>}
                                                    </Box>
                                                </Group>
                                            </Table.Td>
                                            <Table.Td>
                                                <Group gap={4} wrap="nowrap">
                                                    <ActionIcon size="xs" color="gray" onClick={() => cambiarCantidad(item.id, -1)}><IconMinus size={12} /></ActionIcon>
                                                    <Text size="sm" fw={600} px={4}>{item.cantidad}</Text>
                                                    <ActionIcon size="xs" color="gray" onClick={() => cambiarCantidad(item.id, 1)}><IconPlus size={12} /></ActionIcon>
                                                </Group>
                                            </Table.Td>
                                            <Table.Td>
                                                <PrecioVisual valor={item.precio} simbolo={item.simbolo} size="sm" fw={400} />
                                            </Table.Td>
                                            <Table.Td>
                                                <PrecioVisual valor={item.precio * item.cantidad} simbolo={item.simbolo} size="sm" fw={700} />
                                            </Table.Td>
                                            <Table.Td><ActionIcon color="red" variant="subtle" onClick={() => eliminarItem(item.id)}><IconTrash size={16} /></ActionIcon></Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>
                        </ScrollArea>

                        {tipoVenta === 'MAYOR' && (
                            <Group mb="md" grow>
                                <TextInput placeholder="(Opcional)" label="¿Chofer que retira?" {...formVenta.getInputProps('quienRetira')} />
                                <NumberInput placeholder="(Opcional)" label={`Flete (${simboloMoneda})`} decimalScale={2} {...formVenta.getInputProps('costoFlete')} />
                            </Group>
                        )}

                        <Divider mb="sm" />

                        <Group justify="space-between" align="flex-end">
                            <Stack gap={4}>
                                <Group gap="xs">
                                    <Text size="sm" c="dimmed">Subtotal:</Text>
                                    <PrecioVisual valor={subtotal} simbolo={simboloMoneda} size="sm" c="dimmed" />
                                </Group>
                                <Group gap="xs">
                                    <Text size="sm" c="dimmed">IVA (16%):</Text>
                                    <PrecioVisual valor={montoIva} simbolo={simboloMoneda} size="sm" c="dimmed" />
                                </Group>
                                {costoFleteNum > 0 && (
                                    <Group gap="xs">
                                        <Text size="sm" c="dimmed">Flete:</Text>
                                        <PrecioVisual valor={costoFleteNum} simbolo={simboloMoneda} size="sm" c="dimmed" />
                                    </Group>
                                )}
                                <Group gap="xs" mt={4}>
                                    <Text fw={900} size="xl" c="blue.9">Total a Pagar:</Text>
                                    <PrecioVisual valor={totalFinal} simbolo={simboloMoneda} size="xl" fw={900} c="blue.9" />
                                </Group>
                            </Stack>

                            <Button
                                size="lg"
                                color="green.8"
                                leftSection={<IconCash size={20} />}
                                onClick={handleProcesarVenta}
                                disabled={carrito.length === 0}
                                loading={isSubmitting}
                            >
                                Procesar Venta
                            </Button>
                        </Group>

                    </Paper>
                </Grid.Col>
            </Grid>
        </Modal>
    );
}