'use client';

import React, { useState, useEffect } from 'react';
import { 
    Modal, Button, Group, Title, TextInput, NumberInput, 
    Select, Paper, Stack, Grid, Table, ActionIcon, 
    Text, Divider, Badge, Checkbox, Box, ScrollArea, Avatar, ThemeIcon 
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useQuery, useQueryClient } from '@tanstack/react-query'; // 🔥 AÑADIDO useQueryClient
import { useMediaQuery } from '@mantine/hooks';
import { 
    IconTrash, IconPlus, IconMinus, IconExchange, 
    IconPackage, IconReceiptTax, IconCheck, IconTag,
    IconZoomIn, IconZoomOut, IconEdit
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import PrecioVisual from '../ui/PrecioVisual'; 
import { useAuth } from '@/hooks/useAuth';
import { MEMBRETE_MEDIQUIR } from '@/app/constants/empresa';
import { numeroALetras } from '@/app/utils/numeroALetras';

export default function PosModal({ opened, onClose, tasaBcv = 1 }) {
    const queryClient = useQueryClient(); // 🔥 INSTANCIADO PARA INVALIDAR QUERIES
    const [tipoVenta, setTipoVenta] = useState('DETAL'); 
    const [carrito, setCarrito] = useState([]);
    const [busquedaProducto, setBusquedaProducto] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false); 
    const [previewAbierto, setPreviewAbierto] = useState(false);
    
    const [modalFicticio, setModalFicticio] = useState(false);
    const formFicticio = useForm({
        initialValues: { nombre: 'Producto Genérico', precio: '', cantidad: 1, aplicaIva: true }
    });

    // 🔥 ESTADOS Y FORMULARIO PARA NUEVO CLIENTE EN CALIENTE 🔥
    const [modalCrearCliente, setModalCrearCliente] = useState(false);
    const formNuevoCliente = useForm({
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

    const [zoomPreview, setZoomPreview] = useState(true);

    const { userId } = useAuth();
    const isMobile = useMediaQuery('(max-width: 768px)');

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
            numeroDocumento: ''
        }
    });

    const tipoDocumentoActual = tipoVenta === 'DETAL'
        ? (formVenta.values.conIva ? 'FACTURA' : 'VENTA RAPIDA')
        : (formVenta.values.conIva ? 'FACTURA' : 'NOTA DE ENTREGA');

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
            formVenta.setFieldValue('numeroDocumento', `${prefijo}-00001`);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tipoDocumentoActual, correlativos]);

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

        switch(tarifa) {
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
            if (item.isFicticio) return { ...item, simbolo: esMonedaBs ? 'Bs' : '$' };

            const productoOriginal = productos.find(p => p.id === item.id);
            if (!productoOriginal) return item;
            const info = calcularPrecioInfo(productoOriginal, formVenta.values.tipoPrecio);
            return { 
                ...item, 
                precio: info.precio, 
                simbolo: info.simbolo, 
                tieneDescuento: info.tieneDescuento,
                porcentajeDescuento: info.porcentajeDescuento,
                porcentajeIva: Number(productoOriginal.porcentajeIva) || 0,
                imagen: getImageUrl(productoOriginal.imagen),
                marcaImagen: getImageUrl(productoOriginal.marca?.imagen),
                marcaNombre: productoOriginal.marca?.nombre
            };
        }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [formVenta.values.tipoPrecio, tasaBcv]);


    const agregarAlCarrito = (producto) => {
        const info = calcularPrecioInfo(producto, formVenta.values.tipoPrecio);
        const existe = carrito.find(item => item.id === producto.id && !item.isFicticio);
        const imgProducto = getImageUrl(producto.imagen);
        const imgMarca = getImageUrl(producto.marca?.imagen);

        if (existe) {
            setCarrito(carrito.map(item => item.id === producto.id && !item.isFicticio ? { 
                ...item, cantidad: item.cantidad + 1, precio: info.precio, simbolo: info.simbolo,
                tieneDescuento: info.tieneDescuento, porcentajeDescuento: info.porcentajeDescuento,
                porcentajeIva: Number(producto.porcentajeIva) || 0,
                imagen: imgProducto, marcaImagen: imgMarca, marcaNombre: producto.marca?.nombre
            } : item));
        } else {
            setCarrito([...carrito, { 
                id: producto.id, nombre: producto.nombre, codigo: producto.codigo, 
                precio: info.precio, simbolo: info.simbolo, 
                tieneDescuento: info.tieneDescuento, porcentajeDescuento: info.porcentajeDescuento,
                porcentajeIva: Number(producto.porcentajeIva) || 0, 
                cantidad: 1, imagen: imgProducto, marcaImagen: imgMarca, marcaNombre: producto.marca?.nombre,
                isFicticio: false,
                afectaInventario: true
            }]);
        }
    };

    const handleAgregarFicticio = (values) => {
        if (!values.precio || Number(values.precio) <= 0) {
            return notifications.show({ message: 'Indica un precio válido', color: 'red' });
        }
        
        setCarrito([...carrito, {
            id: `ficticio-${Date.now()}`,
            isFicticio: true,
            codigo: '1010',
            nombre: values.nombre || 'Producto Genérico',
            precio: Number(values.precio),
            simbolo: esMonedaBs ? 'Bs' : '$',
            cantidad: Number(values.cantidad),
            aplicaIva: values.aplicaIva,
            tieneDescuento: false,
            afectaInventario: false 
        }]);

        setModalFicticio(false);
        formFicticio.reset();
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

    const setCantidadAbsoluta = (id, cantidad) => {
        if (cantidad === undefined || cantidad === null || cantidad === '') return;
        const cant = Number(cantidad);
        if (cant <= 0) return eliminarItem(id);
        setCarrito(carrito.map(item => item.id === id ? { ...item, cantidad: cant } : item));
    };

    const toggleAfectaInventario = (id, value) => {
        setCarrito(carrito.map(item => item.id === id ? { ...item, afectaInventario: value } : item));
    };

    const eliminarItem = (id) => setCarrito(carrito.filter(item => item.id !== id));

    let subtotal = 0;
    let montoIva = 0;
    let totalExento = 0;
    let baseImponible = 0;

    carrito.forEach(item => {
        const itemSub = item.precio * item.cantidad;
        subtotal += itemSub;

        let llevaIva = false;
        
        if (formVenta.values.conIva) {
            if (item.isFicticio) {
                llevaIva = item.aplicaIva;
            } else {
                llevaIva = item.porcentajeIva > 0;
            }
        }

        if (llevaIva) {
            baseImponible += itemSub;
            montoIva += itemSub * 0.16; 
        } else {
            totalExento += itemSub;
        }
    });

    const costoFleteNum = Number(formVenta.values.costoFlete) || 0;
    const totalFinal = subtotal + montoIva + costoFleteNum;
    const simboloMoneda = esMonedaBs ? 'Bs' : '$';

    const handleRevisarVenta = () => {
        if (carrito.length === 0) return notifications.show({ message: 'El carrito está vacío', color: 'orange' });
        if (tipoVenta === 'MAYOR' && !formVenta.values.clienteId) return notifications.show({ message: 'Debe seleccionar un cliente mayorista', color: 'red' });
        if (!formVenta.values.numeroDocumento) return notifications.show({ message: 'El número de documento es obligatorio', color: 'red' });
        
        setZoomPreview(true);
        setPreviewAbierto(true);
    };

    const handleProcesarVenta = async () => {
        setIsSubmitting(true);
        try {
            const payload = {
                vendedorId: userId,
                tipoVenta,
                tipoDocumento: tipoDocumentoActual === 'VENTA RAPIDA' ? 'VENTA_RAPIDA' : (tipoDocumentoActual === 'NOTA DE ENTREGA' ? 'NOTA_ENTREGA' : 'FACTURA'),
                numeroDocumentoManual: formVenta.values.numeroDocumento, 
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
                    productoId: item.isFicticio ? null : item.id, 
                    isFicticio: item.isFicticio || false,
                    nombreFicticio: item.isFicticio ? item.nombre : null,
                    cantidad: item.cantidad, 
                    precioUnitario: item.precio, 
                    subtotal: item.precio * item.cantidad,
                    aplicaIva: formVenta.values.conIva ? (item.isFicticio ? item.aplicaIva : item.porcentajeIva > 0) : false,
                    afectaInventario: item.afectaInventario 
                }))
            };

            const res = await fetch('/api/ventas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al procesar la venta');

            notifications.show({ title: 'Éxito', message: `Venta registrada: ${data.numeroDocumento}`, color: 'green' });
            
            setCarrito([]);
            formVenta.reset();
            setPreviewAbierto(false);
            onClose();

        } catch (error) {
            notifications.show({ title: 'Error', message: error.message, color: 'red' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const productosFiltrados = productos?.filter(p => p.nombre?.toLowerCase().includes(busquedaProducto.toLowerCase()) || p.codigo?.toLowerCase().includes(busquedaProducto.toLowerCase())) || [];

    const tituloDocumento = tipoDocumentoActual === 'FACTURA' ? 'Factura' : (tipoDocumentoActual === 'NOTA DE ENTREGA' ? 'Nota de Entrega' : 'Recibo de Venta');
    
    const prevTotalBs = esMonedaBs ? totalFinal : totalFinal * tasaBcv;
    const prevTotalUsd = esMonedaBs ? totalFinal / tasaBcv : totalFinal;
    const prevIvaBs = esMonedaBs ? montoIva : montoIva * tasaBcv;
    const prevIvaUsd = esMonedaBs ? montoIva / tasaBcv : montoIva;
    const prevExentoBs = esMonedaBs ? totalExento : totalExento * tasaBcv;
    const prevExentoUsd = esMonedaBs ? totalExento / tasaBcv : totalExento;
    const prevBaseBs = esMonedaBs ? baseImponible : baseImponible * tasaBcv;
    const prevBaseUsd = esMonedaBs ? baseImponible / tasaBcv : baseImponible;
    
    const clienteSeleccionado = clientes?.find(c => c.id.toString() === formVenta.values.clienteId?.toString());
    const formatoNumero = (num) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num || 0);
    const fechaEmision = new Date().toLocaleDateString('es-VE');

    const limiteMediaCarta = 8;
    const cantidadArticulos = carrito.length || 0;
    const altoPapel = cantidadArticulos <= limiteMediaCarta ? '5.5in' : '10.5in';

    return (
        <>
            <Modal 
                opened={opened} onClose={onClose} size="95%" fullScreen={isMobile} 
                title={<Title order={3} c="blue.9" component="div">Terminal POS - Nueva Venta</Title>} 
                centered
                styles={{
                    inner: { padding: isMobile ? 0 : '16px' }, content: { borderRadius: isMobile ? 0 : '8px' },
                    body: { padding: isMobile ? '4px' : '20px' }, header: { padding: isMobile ? '10px 8px' : '20px' }
                }}
            >
                <Paper p={{ base: 6, md: 'xs' }} mb="sm" bg="blue.0" radius={{ base: 4, md: 'md' }}>
                    <Group justify="space-between">
                        <Group>
                            <IconExchange size={20} color="#1971C2" />
                            <Text fw={600} size={isMobile ? "sm" : "md"} c="blue.9">Tasa BCV:</Text>
                            <Badge size={isMobile ? "md" : "lg"} color="blue" variant="filled">{tasaBcv} Bs/$</Badge>
                        </Group>
                    </Group>
                </Paper>

                <Grid gutter={{ base: 4, md: 'md' }} m={0}>
                    <Grid.Col span={{ base: 12, md: 5 }} p={0} pr={{ md: 'md' }}>
                        <Paper withBorder p={{ base: 6, md: 'md' }} radius={{ base: 4, md: 'md' }} h={isMobile ? 'auto' : '75vh'} style={{ display: 'flex', flexDirection: 'column' }}>
                            <Button.Group mb="sm">
                                <Button fullWidth variant={tipoVenta === 'DETAL' ? 'filled' : 'light'} onClick={() => setTipoVenta('DETAL')}>Detal</Button>
                                <Button fullWidth variant={tipoVenta === 'MAYOR' ? 'filled' : 'light'} color="grape" onClick={() => setTipoVenta('MAYOR')}>Mayor</Button>
                            </Button.Group>

                            <Group wrap="nowrap" mb="sm" gap="xs">
                                <TextInput style={{ flex: 1 }} placeholder="Buscar producto..." value={busquedaProducto} onChange={(e) => setBusquedaProducto(e.currentTarget.value)} data-autofocus />
                                <Button color="grape" variant="light" px="sm" onClick={() => setModalFicticio(true)} title="Agregar Ítem Ficticio (1010)">
                                    + Ficticio
                                </Button>
                            </Group>

                            <ScrollArea style={{ flex: 1, maxHeight: isMobile ? 350 : 'none' }} type="auto">
                                <Stack gap={isMobile ? 4 : 'xs'}>
                                    {productosFiltrados.slice(0, 20).map(prod => {
                                        const infoPreview = calcularPrecioInfo(prod, formVenta.values.tipoPrecio);
                                        const imgFinal = getImageUrl(prod.imagen) || getImageUrl(prod.marca?.imagen);

                                        return (
                                            <Paper key={prod.id} p={isMobile ? 6 : 'sm'} withBorder radius="sm" style={{ cursor: 'pointer' }} onClick={() => agregarAlCarrito(prod)}>
                                                <Group wrap="nowrap" justify="space-between">
                                                    
                                                    <Group wrap="nowrap" maw="75%" gap="sm">
                                                        <Avatar src={imgFinal} size="md" radius="sm" color="blue">
                                                            <IconPackage size={16} />
                                                        </Avatar>
                                                        <Box>
                                                            <Group gap={4}>
                                                                <Text fw={600} size="sm" lineClamp={1}>{prod.nombre}</Text>
                                                                {infoPreview.tieneDescuento && (
                                                                    <IconTag size={14} color="#FF6B6B" />
                                                                )}
                                                            </Group>
                                                            <Text size="xs" c="dimmed" lineClamp={1}>
                                                                SKU: {prod.codigo} {prod.marca?.nombre ? `| ${prod.marca.nombre}` : ''}
                                                            </Text>
                                                        </Box>
                                                    </Group>

                                                    <Badge color={infoPreview.simbolo === 'Bs' ? 'teal' : 'blue'} variant="light" size="lg" px={isMobile ? 4 : 8}>
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

                    <Grid.Col span={{ base: 12, md: 7 }} p={0}>
                        <Paper withBorder p={{ base: 6, md: 'md' }} radius={{ base: 4, md: 'md' }} h={isMobile ? 'auto' : '75vh'} style={{ display: 'flex', flexDirection: 'column' }}>
                            
                            <Paper p={{ base: 8, md: 'sm' }} mb="sm" bg={tipoDocumentoActual === 'FACTURA' ? 'red.0' : 'gray.1'} radius="md" withBorder>
                                <Group justify="space-between" align="center">
                                    <Group gap="xs">
                                        <ThemeIcon size={isMobile ? "md" : "lg"} variant="light" color={tipoDocumentoActual === 'FACTURA' ? 'red' : 'blue'}>
                                            <IconReceiptTax size={isMobile ? 16 : 20} />
                                        </ThemeIcon>
                                        <Box>
                                            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Emitir:</Text>
                                            <Text size={isMobile ? "md" : "lg"} fw={800} c={tipoDocumentoActual === 'FACTURA' ? 'red.9' : 'blue.9'}>
                                                {tipoDocumentoActual}
                                            </Text>
                                        </Box>
                                    </Group>

                                    <TextInput
                                        label="Correlativo"
                                        size={isMobile ? "xs" : "sm"}
                                        w={isMobile ? 100 : 150}
                                        fw={700}
                                        {...formVenta.getInputProps('numeroDocumento')}
                                    />
                                </Group>
                            </Paper>

                            <Group grow mb="sm" align="flex-end">
                                {/* 🔥 SECCIÓN CLIENTE MODIFICADA CON BOTÓN DE AGREGAR 🔥 */}
                                {tipoVenta === 'MAYOR' && (
                                    <Group wrap="nowrap" gap="xs">
                                        <Select 
                                            style={{ flex: 1 }}
                                            label="Cliente Mayorista" 
                                            placeholder="Seleccione..." 
                                            searchable 
                                            data={clientes?.map(c => ({ value: c.id.toString(), label: `${c.nombre} (RIF: ${c.identificacion})` })) || []} 
                                            {...formVenta.getInputProps('clienteId')} 
                                        />
                                        <Button variant="light" color="grape" onClick={() => setModalCrearCliente(true)} px="xs" title="Crear Cliente Nuevo">
                                            <IconPlus size={18} />
                                        </Button>
                                    </Group>
                                )}
                                <Select 
                                    label="Tarifa" 
                                    data={[
                                        { value: 'precio7', label: 'P7 (Detal USD)' },
                                        { value: 'precio6', label: 'P6 (Mayor USD)' },
                                        { value: 'precio1', label: 'P1 (35% en Bs)' },
                                        { value: 'precio4', label: 'P4 (P7 en Bs)' },
                                        { value: 'precio5', label: 'P5 (P6 en Bs)' }
                                    ]}
                                    {...formVenta.getInputProps('tipoPrecio')}
                                />
                            </Group>

                            <Group mb="sm" justify="space-between">
                                <Checkbox label={<Text fw={600} size="sm">IVA (16%)</Text>} {...formVenta.getInputProps('conIva', { type: 'checkbox' })} />
                                {tipoVenta === 'MAYOR' && <Select size="xs" w={120} data={['Contado', 'Credito']} {...formVenta.getInputProps('condicionPago')} />}
                            </Group>

                            {formVenta.values.condicionPago === 'Contado' && (
                                <Group mb="sm" grow>
                                    <Select 
                                        label="Método" 
                                        data={opcionesMetodoPago} 
                                        {...formVenta.getInputProps('metodoPago')} 
                                    />
                                    {formVenta.values.metodoPago !== 'Efectivo ($)' && formVenta.values.metodoPago !== 'Efectivo (Bs)' ? (
                                        <TextInput label="Referencia" placeholder="Últimos 6 dígitos" {...formVenta.getInputProps('referencia')} />
                                    ) : (<Box />)}
                                </Group>
                            )}

                            <ScrollArea style={{ flex: isMobile ? 'none' : 1 }} offsetScrollbars type="auto" mb="sm">
                                <Table striped highlightOnHover verticalSpacing="xs" style={{ minWidth: isMobile ? 550 : '100%' }}>
                                    <Table.Thead>
                                        <Table.Tr>
                                            <Table.Th style={{ width: '40%' }}>Producto</Table.Th>
                                            <Table.Th style={{ width: '30%', textAlign: 'center' }}>Cantidad</Table.Th>
                                            <Table.Th style={{ width: '12%', textAlign: 'right' }}>Unit.</Table.Th>
                                            <Table.Th style={{ width: '13%', textAlign: 'right' }}>Total</Table.Th>
                                            <Table.Th style={{ width: '5%' }}></Table.Th>
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {carrito.map(item => (
                                            <Table.Tr key={item.id}>
                                                <Table.Td>
                                                    <Group gap="xs" wrap="nowrap">
                                                        {item.isFicticio ? (
                                                            <Avatar color="grape" size="sm" radius="sm"><IconEdit size={14} /></Avatar>
                                                        ) : (
                                                            <Avatar src={item.imagen || item.marcaImagen} size="sm" radius="sm"><IconPackage size={14} /></Avatar>
                                                        )}
                                                        <Box>
                                                            <Group gap={4}>
                                                                <Text fw={600} size="sm" lineClamp={2}>{item.nombre}</Text>
                                                                {item.tieneDescuento && (
                                                                    <Badge size="xs" color="red" variant="filled">-{item.porcentajeDescuento}%</Badge>
                                                                )}
                                                                {((item.isFicticio && !item.aplicaIva) || (!item.isFicticio && item.porcentajeIva === 0)) && formVenta.values.conIva && (
                                                                    <Badge size="xs" color="gray" variant="light">EXENTO</Badge>
                                                                )}
                                                            </Group>
                                                            {!item.isFicticio && item.marcaNombre && <Text size="xs" c="dimmed">{item.marcaNombre}</Text>}
                                                            {item.isFicticio && <Text size="xs" c="dimmed">Código: 1010</Text>}
                                                            
                                                            {!item.isFicticio && (
                                                                <Checkbox
                                                                    size="xs"
                                                                    mt={4}
                                                                    color="teal"
                                                                    label="Afectar inventario"
                                                                    checked={item.afectaInventario}
                                                                    onChange={(e) => toggleAfectaInventario(item.id, e.currentTarget.checked)}
                                                                />
                                                            )}
                                                        </Box>
                                                    </Group>
                                                </Table.Td>
                                                
                                                <Table.Td>
                                                    <Group gap="xs" wrap="nowrap" justify="center">
                                                        <ActionIcon size="md" color="gray" variant="light" onClick={() => cambiarCantidad(item.id, -1)}>
                                                            <IconMinus size={16} />
                                                        </ActionIcon>
                                                        
                                                        <NumberInput
                                                            value={item.cantidad}
                                                            onChange={(val) => setCantidadAbsoluta(item.id, val)}
                                                            min={1} size="sm" w={75} hideControls
                                                            styles={{ input: { textAlign: 'center', fontWeight: 900, fontSize: '1rem', color: '#1971c2', backgroundColor: '#f8f9fa' } }}
                                                        />
                                                        
                                                        <ActionIcon size="md" color="blue" variant="light" onClick={() => cambiarCantidad(item.id, 1)}>
                                                            <IconPlus size={16} />
                                                        </ActionIcon>
                                                    </Group>
                                                </Table.Td>

                                                <Table.Td style={{ textAlign: 'right' }}>
                                                    <PrecioVisual valor={item.precio} simbolo={item.simbolo} size="sm" fw={500} />
                                                </Table.Td>
                                                <Table.Td style={{ textAlign: 'right' }}>
                                                    <PrecioVisual valor={item.precio * item.cantidad} simbolo={item.simbolo} size="sm" fw={800} />
                                                </Table.Td>
                                                <Table.Td style={{ textAlign: 'right' }}>
                                                    <ActionIcon color="red" variant="subtle" onClick={() => eliminarItem(item.id)}>
                                                        <IconTrash size={18} />
                                                    </ActionIcon>
                                                </Table.Td>
                                            </Table.Tr>
                                        ))}
                                    </Table.Tbody>
                                </Table>
                            </ScrollArea>

                            {tipoVenta === 'MAYOR' && (
                                <Group mb="sm" grow>
                                    <TextInput placeholder="(Opcional)" label="¿Chofer que retira?" {...formVenta.getInputProps('quienRetira')} />
                                    <NumberInput placeholder="(Opcional)" label={`Flete (${simboloMoneda})`} decimalScale={2} {...formVenta.getInputProps('costoFlete')} />
                                </Group>
                            )}

                            <Divider mb="xs" />

                            <Group justify="space-between" align="flex-end">
                                <Stack gap={2}>
                                    <Group gap="xs">
                                        <Text size="xs" c="dimmed">Subtotal:</Text>
                                        <PrecioVisual valor={subtotal} simbolo={simboloMoneda} size="xs" c="dimmed" />
                                    </Group>
                                    <Group gap="xs">
                                        <Text size="xs" c="dimmed">IVA (16%):</Text>
                                        <PrecioVisual valor={montoIva} simbolo={simboloMoneda} size="xs" c="dimmed" />
                                    </Group>
                                    {costoFleteNum > 0 && (
                                        <Group gap="xs">
                                            <Text size="xs" c="dimmed">Flete:</Text>
                                            <PrecioVisual valor={costoFleteNum} simbolo={simboloMoneda} size="xs" c="dimmed" />
                                        </Group>
                                    )}
                                    <Group gap="xs" mt={2}>
                                        <Text fw={900} size="md" c="blue.9">Total a Pagar:</Text>
                                        <PrecioVisual valor={totalFinal} simbolo={simboloMoneda} size="lg" fw={900} c="blue.9" />
                                    </Group>
                                </Stack>

                                <Button size="md" color="blue.8" leftSection={<IconReceiptTax size={20} />} onClick={handleRevisarVenta} disabled={carrito.length === 0}>
                                    Revisar
                                </Button>
                            </Group>
                        </Paper>
                    </Grid.Col>
                </Grid>
            </Modal>

            {/* 🔥 MODAL SECUNDARIO: CREAR CLIENTE EN CALIENTE 🔥 */}
            <Modal opened={modalCrearCliente} onClose={() => setModalCrearCliente(false)} size="lg" title={<Title order={4} c="grape">Registrar Nuevo Cliente</Title>} centered zIndex={2000}>
                <form onSubmit={formNuevoCliente.onSubmit(async (values) => {
                    try {
                        const res = await fetch('/api/clientes', {
                            method: 'POST', 
                            headers: { 'Content-Type': 'application/json' }, 
                            body: JSON.stringify(values)
                        });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error);

                        notifications.show({ title: 'Cliente Creado', message: 'El cliente ha sido guardado y seleccionado exitosamente.', color: 'green' });
                        queryClient.invalidateQueries(['clientes-pos']);
                        formVenta.setFieldValue('clienteId', String(data.id));
                        setModalCrearCliente(false);
                        formNuevoCliente.reset();
                    } catch (err) {
                        notifications.show({ title: 'Error', message: err.message, color: 'red' });
                    }
                })}>
                    <Stack gap="sm">
                        <TextInput size="md" label="RIF / Cédula" placeholder="Ej: J-12345678-9 o V-12345678" withAsterisk {...formNuevoCliente.getInputProps('identificacion')} />
                        <TextInput size="md" label="Razón Social / Nombre" placeholder="Ej: Farmacia San Pedro" withAsterisk {...formNuevoCliente.getInputProps('nombre')} />
                        <TextInput size="md" label="Teléfono" placeholder="Ej: 0414-1234567" {...formNuevoCliente.getInputProps('telefono')} />
                        <TextInput size="md" label="Correo Electrónico" placeholder="contacto@cliente.com" {...formNuevoCliente.getInputProps('email')} />
                        <TextInput size="md" label="Dirección Fiscal" placeholder="Ej: Av. Principal, Local 4..." {...formNuevoCliente.getInputProps('direccion')} />
                        
                        <Group grow>
                            <Checkbox label="Contribuyente Especial" size="md" mt={8} {...formNuevoCliente.getInputProps('esContribuyenteEspecial', { type: 'checkbox' })} />
                            <Select size="md" label="Retención Default" data={[{ value: '75', label: '75%' }, { value: '100', label: '100%' }]} {...formNuevoCliente.getInputProps('retencionIvaPorDefecto', { transform: (v) => Number(v) })} />
                        </Group>
                        
                        <TextInput size="md" label="Notas Adicionales" placeholder="(Opcional)" {...formNuevoCliente.getInputProps('notas')} />
                        <Button size="md" type="submit" color="grape" mt="md">Guardar y Seleccionar Cliente</Button>
                    </Stack>
                </form>
            </Modal>

            {/* MODALES EXTRA Y VISTA PREVIA (FICTICIO) */}
            <Modal opened={modalFicticio} onClose={() => setModalFicticio(false)} title={<Title order={4} c="grape">Agregar Ítem Ficticio (1010)</Title>} centered>
                <form onSubmit={formFicticio.onSubmit(handleAgregarFicticio)}>
                    <Stack gap="md">
                        <TextInput label="Descripción del artículo" withAsterisk {...formFicticio.getInputProps('nombre')} />
                        <NumberInput 
                            label={`Precio Unitario (${esMonedaBs ? 'Bs' : 'USD'})`} 
                            withAsterisk decimalScale={2} 
                            description="Ingresa el precio en la moneda seleccionada."
                            {...formFicticio.getInputProps('precio')} 
                        />
                        <NumberInput label="Cantidad" withAsterisk min={1} {...formFicticio.getInputProps('cantidad')} />
                        <Checkbox 
                            label={<Text fw={600}>Lleva IVA (16%)</Text>} 
                            description="Si desmarcas, será EXENTO."
                            color="grape"
                            {...formFicticio.getInputProps('aplicaIva', { type: 'checkbox' })}
                        />
                        <Button type="submit" fullWidth color="grape" mt="sm">Agregar al carrito</Button>
                    </Stack>
                </form>
            </Modal>

            {/* MODAL DE VISTA PREVIA */}
            <Modal
                opened={previewAbierto} onClose={() => setPreviewAbierto(false)} size="1000px" fullScreen={isMobile} 
                title={<Title order={4} c="blue.9" component="div">Confirme el Documento</Title>}
                centered zIndex={2000}
                styles={{
                    inner: { padding: isMobile ? 0 : '16px' }, content: { borderRadius: isMobile ? 0 : '8px', margin: 0 },
                    body: { padding: 0, display: 'flex', flexDirection: 'column', height: isMobile ? 'calc(100vh - 60px)' : 'auto' },
                    header: { padding: isMobile ? '12px 8px' : '20px' }
                }}
            >
                {isMobile && (
                    <Box p="xs" bg="#f1f3f5" style={{ borderBottom: '1px solid #ddd' }}>
                        <Button 
                            variant="light" color={zoomPreview ? "blue" : "gray"} fullWidth size="sm"
                            leftSection={zoomPreview ? <IconZoomOut size={18}/> : <IconZoomIn size={18}/>}
                            onClick={() => setZoomPreview(!zoomPreview)}
                        >
                            {zoomPreview ? 'Alejar (Ver hoja completa)' : 'Acercar Factura (Ver Detalles)'}
                        </Button>
                    </Box>
                )}

                <Box className={`preview-scale-wrapper ${zoomPreview ? 'is-zoomed' : ''}`} bg={isMobile ? "white" : "#525659"} style={{ flex: 1, overflow: 'auto', padding: isMobile ? '0' : '20px' }}>
                    <div className="print-preview-container">
                        
                        <img src={MEMBRETE_MEDIQUIR?.logo || "/tenants/mediquir/logo.png"} alt="Fondo Mediquir" className="watermark" />

                        <header className="header-grid">
                            <div className="logo-section"><img src={MEMBRETE_MEDIQUIR?.logo || "/tenants/mediquir/logo.png"} alt="Logo" className="logo" /></div>
                            <div className="membrete-section">
                                <h3>{MEMBRETE_MEDIQUIR?.nombre}</h3>
                                <p className="rif">RIF.: {MEMBRETE_MEDIQUIR?.rif}</p>
                                <p className="direccion">{MEMBRETE_MEDIQUIR?.direccion}</p>
                                <p className="telefonos">TELF.: {MEMBRETE_MEDIQUIR?.telefonos}, E-mail: {MEMBRETE_MEDIQUIR?.email}</p>
                            </div>
                        </header>

                        <section className="info-grid">
                            <div className="cliente-box">
                                <div className="line-item"><span className="label-red">CLIENTE:</span><span className="value-line">{clienteSeleccionado?.nombre || 'Cliente Genérico (Detal)'}</span></div>
                                <div className="line-item"><span className="label-red">RIF:</span><span className="value-line">{clienteSeleccionado?.identificacion || 'N/A'}</span></div>
                                <div className="line-item"><span className="label-red">DOMICILIO FISCAL:</span><span className="value-line">{clienteSeleccionado?.direccion || 'N/A'}</span></div>
                            </div>
                            <div className="doc-box">
                                <h2 className="doc-title">{tituloDocumento}</h2>
                                <h1 className="doc-number">{formVenta.values.numeroDocumento}</h1>
                                <table className="doc-meta">
                                    <tbody>
                                        <tr><td className="text-right fw-bold" style={{ width: '60%' }}>ORDEN DE COMPRA</td><td>Emisión: {fechaEmision}</td></tr>
                                        <tr><td className="text-right">Condiciones de la Transacción<br/><strong>{formVenta.values.condicionPago}</strong></td><td className="valign-bottom">Vence: {fechaEmision}</td></tr>
                                    </tbody>
                                </table>
                            </div>
                        </section>

                        <table className="items-table">
                            <thead>
                                <tr>
                                    <th style={{width: '10%'}}>CÓDIGO</th>
                                    <th style={{width: '50%', textAlign: 'left'}}>NOMBRE DEL ARTÍCULO</th>
                                    <th style={{width: '15%', textAlign: 'right'}}>PRECIO UNIT ({simboloMoneda})</th>
                                    <th style={{width: '10%', textAlign: 'center'}}>CANTIDAD</th>
                                    <th style={{width: '15%', textAlign: 'right'}}>TOTAL NETO ({simboloMoneda})</th>
                                </tr>
                            </thead>
                            <tbody>
                                {carrito.map((d, index) => (
                                    <tr key={index}>
                                        <td>{d.codigo || 'S/C'}</td>
                                        <td style={{textAlign: 'left'}}>
                                            {d.nombre} 
                                            {((d.isFicticio && !d.aplicaIva) || (!d.isFicticio && d.porcentajeIva === 0)) && formVenta.values.conIva && (
                                                <span style={{fontSize: '8px', color: '#666', marginLeft: 4}}>(E)</span>
                                            )}
                                        </td>
                                        <td style={{textAlign: 'right'}}>{formatoNumero(d.precio)}</td>
                                        <td style={{textAlign: 'center'}}>{formatoNumero(d.cantidad)}</td>
                                        <td style={{textAlign: 'right'}}>{formatoNumero(d.precio * d.cantidad)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <footer className="footer-section">
                            <table className="totals-table">
                                <tbody>
                                    <tr>
                                        <td className="total-cell border-right text-center">
                                            {formVenta.values.conIva ? (
                                                <>
                                                    <span className="label-red">TOTAL IMPUESTO: 16%</span><br/>
                                                    <div className="monto-split">
                                                        <strong>{formatoNumero(prevIvaBs)} <span className="label-red">Bs.</span></strong>
                                                        <strong>{formatoNumero(prevIvaUsd)} <span className="label-red">USD</span></strong>
                                                    </div>
                                                </>
                                            ) : (
                                                <span className="label-red">OPERACIÓN NO GRAVADA (SIN IVA)</span>
                                            )}
                                        </td>
                                        <td className="total-cell border-right text-center">
                                            <span className="label-red">TOTAL EXENTO:</span><br/>
                                            <div className="monto-split">
                                                <strong>{formatoNumero(prevExentoBs)} <span className="label-red">Bs.</span></strong>
                                                <strong>{formatoNumero(prevExentoUsd)} <span className="label-red">USD</span></strong>
                                            </div>
                                        </td>
                                        <td className="total-cell text-center" style={{ backgroundColor: '#f9f9f9' }}>
                                            <span className="label-red">TOTAL GENERAL Bs.</span><br/>
                                            <strong style={{fontSize: '1.1rem'}}>{formatoNumero(prevTotalBs)}</strong>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="total-cell border-right text-center">
                                            {formVenta.values.conIva ? (
                                                <>
                                                    <span className="label-red">BASE IMPONIBLE:</span><br/>
                                                    <div className="monto-split">
                                                        <strong>{formatoNumero(prevBaseBs)} <span className="label-red">Bs.</span></strong>
                                                        <strong>{formatoNumero(prevBaseUsd)} <span className="label-red">USD</span></strong>
                                                    </div>
                                                </>
                                            ) : (
                                                <span>-</span>
                                            )}
                                        </td>
                                        <td className="total-cell border-right text-center">
                                            <span className="text-black">Monto Operación segun Tasa BCV</span><br/>
                                            <strong>{formatoNumero(tasaBcv)} <span className="label-red">Bs.</span></strong>
                                        </td>
                                        <td className="total-cell text-center" style={{ backgroundColor: '#f9f9f9' }}>
                                            <span className="label-red">TOTAL GENERAL USD$</span><br/>
                                            <strong style={{fontSize: '1.1rem'}}>{formatoNumero(prevTotalUsd)}</strong>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>

                            <div className="monto-letras"><span className="label-blue">Son: Bs. </span><span className="text-black">{numeroALetras(prevTotalBs)}</span></div>
                            <div className="original-label label-red text-center">VISTA PREVIA DE CONFIRMACIÓN</div>
                        </footer>
                    </div>
                </Box>

                <Group justify="flex-end" p="md" bg="gray.1" style={{ borderTop: '1px solid #ddd' }}>
                    <Button variant="outline" color="gray" onClick={() => setPreviewAbierto(false)}>Volver a Editar</Button>
                    <Button size="md" color="green.8" leftSection={<IconCheck size={20} />} onClick={handleProcesarVenta} loading={isSubmitting}>Asentar Venta</Button>
                </Group>

                <style dangerouslySetInnerHTML={{ __html: `
                    .preview-scale-wrapper { display: flex; justify-content: center; align-items: flex-start; width: 100%; }
                    .preview-scale-wrapper.is-zoomed { justify-content: flex-start; }
                    .print-preview-container * { box-sizing: border-box; }
                    .print-preview-container { background: white; color: black; width: 8.5in; min-height: ${altoPapel}; height: max-content; padding: 0.2in 0.3in; position: relative; font-family: Arial, Helvetica, sans-serif; font-size: 11px; display: flex; flex-direction: column; transform-origin: top left; }
                    @media (max-width: 850px) {
                        .preview-scale-wrapper.is-zoomed .print-preview-container { transform: scale(1); margin-bottom: 0; }
                        .preview-scale-wrapper:not(.is-zoomed) .print-preview-container { transform: scale(0.42); margin-bottom: -50%; }
                        .preview-scale-wrapper:not(.is-zoomed) { overflow: hidden !important; }
                    }
                    .label-red { color: #d32f2f !important; font-weight: bold; }
                    .label-blue { color: #1976d2 !important; font-weight: bold; }
                    .text-black { color: #000 !important; }
                    .text-right { text-align: right; }
                    .text-center { text-align: center; }
                    .fw-bold { font-weight: bold; }
                    .valign-bottom { vertical-align: bottom; }
                    .watermark { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 50%; opacity: 0.08; z-index: 0; pointer-events: none; }
                    .header-grid, .info-grid, .items-table, .footer-section { position: relative; z-index: 1; }
                    .header-grid { display: grid; grid-template-columns: 25% 75%; align-items: center; border-bottom: 2px solid #ccc; padding-bottom: 2px; margin-bottom: 2px; }
                    .logo { padding: 0; margin-left: 15px; max-width: 100%; max-height: 100px; object-fit: contain; }
                    .membrete-section { text-align: left; padding-left: 0px; margin-left: 0px; }
                    .membrete-section h3 { color: #1976d2 !important; margin: 0 0 2px 0; font-size: 13px; }
                    .membrete-section p { margin: 0; font-size: 8.5px; font-weight: bold; }
                    .info-grid { display: grid; grid-template-columns: 60% 40%; margin-bottom: 5px; }
                    .cliente-box { padding-right: 15px; }
                    .line-item { margin-bottom: 2px; display: flex; align-items: flex-end; border-bottom: 1px solid #000; padding-bottom: 2px; }
                    .line-item .label-red { width: 120px; flex-shrink: 0; }
                    .value-line { flex-grow: 1; font-weight: bold; font-size: 11px; }
                    .doc-box { text-align: right; }
                    .doc-title { font-size: 16px; margin: 0; font-weight: 900; color: #222; text-transform: uppercase; }
                    .doc-number { color: #d32f2f !important; font-size: 14px; margin: 0 0 2px 0; letter-spacing: 1px; }
                    .doc-meta { width: 100%; font-size: 9.5px; }
                    .doc-meta td { padding: 1px 4px; }
                    .items-table { width: 100%; border-collapse: collapse; margin-bottom: 5px; }
                    .items-table th { border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 3px 2px; font-size: 9.5px; }
                    .items-table td { padding: 3px 2px; font-size: 9.5px; vertical-align: top; border-bottom: 1px dashed #eee; }
                    .footer-section { margin-top: auto; position: relative; }
                    .totals-table { width: 100%; border-collapse: collapse; border: 1.5px solid #000; margin-bottom: 5px; }
                    .totals-table td { padding: 2px; border-bottom: 1px solid #000; font-size: 9.5px; }
                    .border-right { border-right: 1px solid #000; }
                    .monto-split { display: flex; justify-content: space-around; margin-top: 2px; font-size: 10px; }
                    .monto-letras { font-size: 9px; margin-bottom: 4px; padding-left: 5px; }
                    .original-label { font-size: 10px; margin-bottom: 2px; font-weight: bold;}
                `}} />
            </Modal>
        </>
    );
}