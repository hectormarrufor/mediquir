'use client';

import React, { useState, useEffect } from 'react';
import { 
    Modal, Button, Group, Title, TextInput, NumberInput, 
    Select, Paper, Stack, Grid, Table, ActionIcon,
    Text, Divider, Badge, Checkbox, Box, ScrollArea, Alert, SegmentedControl
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMediaQuery } from '@mantine/hooks';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
    IconTrash, IconPlus, IconMinus, IconCheck, IconShieldCheck, IconAlertTriangle 
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { CONFIG_FISCAL } from '@/app/constants/empresa';
import PrecioVisual from '../ui/PrecioVisual';
import { useAuth } from '@/hooks/useAuth';
import { buscarProductos } from '@/app/helpers/busquedaProductos';
import { fechaCaracas } from '@/app/constants/hora';
import { PreguntarNumero, useNumeracion } from '@/app/superuser/_components/NumeracionFiscal';

export default function CompraModal({ opened, onClose, tasaBcv = 1 }) {
    const { userId } = useAuth();
    const queryClient = useQueryClient();
    const isMobile = useMediaQuery('(max-width: 768px)');
    
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
    const { data: numeracion } = useNumeracion(opened); // el comprobante de retención sigue su propio correlativo

    const formCompra = useForm({
        initialValues: {
            proveedorId: null,
            tipoDocumento: 'FACTURA',
            numeroDocumento: '',
            fechaFactura: fechaCaracas(),
            condicionPago: 'Contado',
            diasCredito: 0,
            moneda: 'USD',
            metodoPago: 'Efectivo',
            referencia: '',
            aplicarRetencion: CONFIG_FISCAL.agenteRetencionIva,
            porcentajeRetencion: CONFIG_FISCAL.porcentajeRetencionCompras,
            numeroControl: ''
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

    // La retención de IVA la practica la EMPRESA (agente de retención) sobre toda factura con IVA, sea cual sea el proveedor;
    // el porcentaje sale de la ficha del proveedor (75 % por defecto). Se puede desmarcar para una compra puntual.
    useEffect(() => {
        formCompra.setFieldValue('aplicarRetencion', CONFIG_FISCAL.agenteRetencionIva);
        const prov = proveedores?.find(p => String(p.id) === String(formCompra.values.proveedorId));
        formCompra.setFieldValue('porcentajeRetencion', Number(prov?.retencionIvaPorDefecto) || CONFIG_FISCAL.porcentajeRetencionCompras);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [formCompra.values.proveedorId, proveedores]);

    // ---- Compra por BULTO, por CAJAS o por UNIDADES ----
    // El costo del producto es POR UNIDAD y el stock está en unidades. Lo que se recibe (un bulto, N cajas
    // o N unidades) y su precio (editable, por si el proveedor lo actualizó) se convierten aquí a
    // `cantidad` (unidades) y `precioCompraUnitario` (por unidad), que es lo que espera el servidor.
    const factorDe = (item) => (item.unidadCompra === 'bulto' ? item.undPorBulto : item.unidadCompra === 'caja' ? item.undPorCaja : 1) || 1;
    const recalcular = (item) => {
        const f = factorDe(item);
        return { ...item, cantidad: (Number(item.cantidadCompra) || 0) * f, precioCompraUnitario: (Number(item.precioCompra) || 0) / f };
    };

    // Un vendedor registra la compra pero no ve costos ni cambia precios: el servidor le devuelve la simulación sin esos datos
    const soloRegistro = Boolean(datosSimulacion?.[0]?.soloRegistro);

    const agregarAlCarritoCompra = (prod) => {
        const existe = carritoCompra.find(i => i.id === prod.id);
        if (existe) {
            setCarritoCompra(carritoCompra.map(i => i.id === prod.id ? recalcular({ ...i, cantidadCompra: i.cantidadCompra + 1 }) : i));
        } else {
            const costoUnidad = Number(prod.costoUsd) || 0;
            setCarritoCompra([...carritoCompra, recalcular({
                id: prod.id,
                codigo: prod.codigo,
                nombre: prod.nombre,
                costoAnterior: costoUnidad,
                undPorCaja: Number(prod.unidadesPorCaja) || 0,
                undPorBulto: Number(prod.unidadesPorBulto) || 0,
                unidadCompra: 'unidad',
                cantidadCompra: 1,
                precioCompra: costoUnidad,
                porcentajeIva: Number(prod.porcentajeIva) || 16,
                aceptarCambioPrecio: true
            })]);
        }
    };

    const cambiarCantidad = (id, delta) => {
        setCarritoCompra(carritoCompra.map(i => {
            if (i.id === id) {
                const nuevaCant = (Number(i.cantidadCompra) || 0) + delta;
                return nuevaCant > 0 ? recalcular({ ...i, cantidadCompra: nuevaCant }) : null;
            }
            return i;
        }).filter(Boolean));
    };

    const actualizarCantidadCompra = (id, valor) => {
        setCarritoCompra(carritoCompra.map(i => i.id === id ? recalcular({ ...i, cantidadCompra: Number(valor) || 0 }) : i));
    };

    // Al cambiar de unidad se conserva el costo por unidad y se recalcula el precio del bulto / la caja
    const cambiarUnidadCompra = (id, unidad) => {
        setCarritoCompra(carritoCompra.map(i => {
            if (i.id !== id) return i;
            const nuevo = { ...i, unidadCompra: unidad, cantidadCompra: 1 };
            return recalcular({ ...nuevo, precioCompra: i.precioCompraUnitario * factorDe(nuevo) });
        }));
    };

    const actualizarPrecioCompra = (id, nuevoPrecio) => {
        setCarritoCompra(carritoCompra.map(i => i.id === id ? recalcular({ ...i, precioCompra: Number(nuevoPrecio) || 0 }) : i));
    };

    const toggleAceptarCambioItem = (id) => {
        setCarritoCompra(carritoCompra.map(i => i.id === id ? { ...i, aceptarCambioPrecio: !i.aceptarCambioPrecio } : i));
    };

    const eliminarItem = (id) => setCarritoCompra(carritoCompra.filter(i => i.id !== id));

    const esFactura = formCompra.values.tipoDocumento === 'FACTURA';
    let subtotal = 0;
    let montoIva = 0;
    let montoExento = 0; // lo que no lleva IVA: va como exento en el libro de compras

    carritoCompra.forEach(item => {
        const itemSub = item.precioCompraUnitario * item.cantidad;
        subtotal += itemSub;
        if (esFactura && item.porcentajeIva > 0) {
            montoIva += itemSub * (item.porcentajeIva / 100);
        } else {
            montoExento += itemSub;
        }
    });

    let montoRetencion = 0;
    if (formCompra.values.aplicarRetencion && esFactura && montoIva > 0) {
        montoRetencion = montoIva * (formCompra.values.porcentajeRetencion / 100);
    }

    const totalFinal = subtotal + montoIva;

    // Comprobante de retención: si todavía no se dijo con qué número empieza la numeración, se pregunta antes de registrar
    const serieRet = numeracion?.series?.find((s) => s.clave === 'RET-COMPRA');
    const faltaNumeracionRet = montoRetencion > 0 && Boolean(serieRet) && !serieRet.configurado;
    const periodoRet = String(formCompra.values.fechaFactura || fechaCaracas()).slice(0, 7).replace('-', '');

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
                numeroControl: esFactura ? formCompra.values.numeroControl : null, montoExento: esFactura ? montoExento : 0, porcentajeRetencion: formCompra.values.porcentajeRetencion, aplicarRetencion: Boolean(formCompra.values.aplicarRetencion),
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
                numeroControl: esFactura ? formCompra.values.numeroControl : null, montoExento: esFactura ? montoExento : 0, porcentajeRetencion: formCompra.values.porcentajeRetencion, aplicarRetencion: Boolean(formCompra.values.aplicarRetencion),
                registradoPorId: userId,
                detalles: carritoCompra
            };

            const res = await fetch('/api/compras', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (!res.ok) {
                if (data.codigo) queryClient.invalidateQueries({ queryKey: ['numeracion'] }); // falta configurar la numeración de retenciones
                throw new Error(data.error || 'Error al registrar la compra');
            }

            notifications.show({ title: 'Éxito', message: `Factura registrada, inventario y costos actualizados.${data.comprobanteRetencion ? ` Comprobante de retención de IVA: ${data.comprobanteRetencion}` : ''}`, color: 'green', autoClose: 9000 });
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

    const productosFiltrados = buscarProductos(productos, busquedaProd);

    return (
        <>
            {/* 🔥 MODAL DE COMPRA AMPLIADO A FULLSCREEN 🔥 */}
            <Modal opened={opened} onClose={onClose} fullScreen title={<Title order={isMobile ? 5 : 2} c="blue.9" tt={isMobile ? 'none' : undefined}>{isMobile ? 'Registrar compra' : 'Registrar Factura / Nota de Compra (Proveedor)'}</Title>}
                styles={isMobile ? { content: { padding: 0 }, header: { padding: '8px 12px', minHeight: 44, background: '#fff', zIndex: 30 }, body: { padding: '0 4px' } } : undefined}>
                
                <Box p={isMobile ? 4 : 'md'} maw={1600} mx="auto">
                    <Alert icon={<IconShieldCheck size={isMobile ? 16 : 20} />} title="Declaración de Responsabilidad de Recepción" color="red" variant="light" mb={isMobile ? 6 : 'md'} p={isMobile ? 'xs' : undefined} styles={isMobile ? { title: { fontSize: 12, textTransform: 'none' }, message: { fontSize: 11, lineHeight: 1.3 } } : undefined}>
                        Al registrar y firmar esta factura, certifica bajo su estricta responsabilidad que la mercancía física ingresada al almacén ha sido contada y validada.
                    </Alert>

                    <Grid gutter="lg">
                        <Grid.Col span={{ base: 12, md: 5 }}>
                            <Paper withBorder p={isMobile ? 'xs' : 'md'} radius="md" h={isMobile ? 260 : '78vh'} style={{ display: 'flex', flexDirection: 'column' }}>
                                <TextInput size={isMobile ? 'sm' : 'md'} placeholder="Buscar producto por nombre o SKU..." mb={isMobile ? 6 : 'md'} value={busquedaProd} onChange={(e) => setBusquedaProd(e.currentTarget.value)} data-autofocus />
                                <ScrollArea style={{ flex: 1 }} type="auto">
                                    <Stack gap="xs">
                                        {productosFiltrados.map(prod => (
                                            <Paper key={prod.id} p="sm" withBorder radius="sm" style={{ cursor: 'pointer' }} onClick={() => agregarAlCarritoCompra(prod)}>
                                                <Group justify="space-between" wrap="nowrap">
                                                    <Box style={{ minWidth: 0, flex: 1 }}>
                                                        <Text fw={600} size={isMobile ? 'sm' : 'md'} lineClamp={isMobile ? 2 : 1}>{prod.nombre}</Text>
                                                        <Text size={isMobile ? 'xs' : 'sm'} c="dimmed">SKU: {prod.codigo} | Stock: {prod.stockAlmacen}</Text>
                                                    </Box>
                                                    {prod.costoUsd !== undefined && (
                                                        <Badge color="blue" size={isMobile ? 'md' : 'lg'} variant="light" tt="none" style={{ flexShrink: 0 }}>
                                                            {isMobile ? '' : 'Costo: '}<PrecioVisual valor={prod.costoUsd} simbolo="$" size="sm" />
                                                        </Badge>
                                                    )}
                                                </Group>
                                            </Paper>
                                        ))}
                                    </Stack>
                                </ScrollArea>
                            </Paper>
                        </Grid.Col>

                        <Grid.Col span={{ base: 12, md: 7 }}>
                            <Paper withBorder p={isMobile ? 'xs' : 'lg'} radius="md" h={isMobile ? 'auto' : '78vh'} style={{ display: 'flex', flexDirection: 'column' }}>
                                
                                <Group grow mb={isMobile ? 6 : 'md'} gap={isMobile ? 6 : 'md'} align="flex-start">
                                    <Select 
                                        size={isMobile ? 'sm' : 'md'}
                                        label="Proveedor" placeholder="Seleccione proveedor..." searchable
                                        data={proveedores?.map(p => ({ value: String(p.id), label: `${p.nombre} (RIF: ${p.identificacion})` })) || []}
                                        {...formCompra.getInputProps('proveedorId')}
                                    />
                                    <Button size={isMobile ? 'xs' : 'md'} variant="light" color="grape" mt={isMobile ? 26 : 24} style={{ flex: '0 0 auto' }} tt="none" onClick={() => setModalCrearProv(true)}>+ Nuevo Proveedor</Button>
                                </Group>

                                <Group grow mb={isMobile ? 6 : 'md'} gap={isMobile ? 6 : 'md'} align="flex-start">
                                    <Select 
                                        size={isMobile ? 'sm' : 'md'}
                                        label="Tipo de Documento"
                                        data={[{ value: 'FACTURA', label: 'Factura (Aplica IVA)' }, { value: 'NOTA_ENTREGA', label: 'Nota de Entrega' }]}
                                        {...formCompra.getInputProps('tipoDocumento')}
                                    />
                                    <TextInput size={isMobile ? 'sm' : 'md'} label="Nro. de Factura / Recibo" placeholder="Ej: F-98765" withAsterisk {...formCompra.getInputProps('numeroDocumento')} />
                                    {esFactura && !isMobile && <TextInput size="md" mt="xs" label="Nro. de control" placeholder="Ej: 00-009497" description="Para el libro de compras" {...formCompra.getInputProps('numeroControl')} />}
                                </Group>
                                {esFactura && isMobile && <TextInput size="sm" mb={6} label="Nro. de control" placeholder="Ej: 00-009497" {...formCompra.getInputProps('numeroControl')} />}

                                {!esFactura && <Alert color="gray" variant="light" mb="md" p="xs"><Text size="xs">La nota de entrega no es un documento fiscal: se registra sin IVA, sin retención y sin número de control, y no entra al libro de compras. El inventario y el costo se actualizan igual.</Text></Alert>}

                                <Group grow mb={isMobile ? 6 : 'md'} gap={isMobile ? 6 : 'md'} align="flex-start">
                                    <TextInput size="md" type="date" label="Fecha de Factura" withAsterisk {...formCompra.getInputProps('fechaFactura')} />
                                    <Select size={isMobile ? 'sm' : 'md'} label="Condición de Pago" data={[{ value: 'Contado', label: 'Contado' }, { value: 'Credito', label: 'Crédito' }]} {...formCompra.getInputProps('condicionPago')} />
                                    {formCompra.values.condicionPago === 'Credito' && (
                                        <NumberInput size={isMobile ? 'sm' : 'md'} label="Días de Crédito" min={1} withAsterisk {...formCompra.getInputProps('diasCredito')} />
                                    )}
                                </Group>

                                <Group mb={isMobile ? 6 : 'md'} justify="space-between" gap={isMobile ? 6 : 'md'}>
                                    <Select size={isMobile ? 'sm' : 'md'} label="Moneda" data={['USD', 'BS']} w={150} {...formCompra.getInputProps('moneda')} />
                                    {esFactura && (
                                        <Group>
                                            <Checkbox label={<Text fw={600} size="md">Retener IVA (agente de retención)</Text>} description="Se emite el comprobante con su correlativo" {...formCompra.getInputProps('aplicarRetencion', { type: 'checkbox' })} />
                                            {formCompra.values.aplicarRetencion && (
                                                <Select size="md" data={[{value: '75', label: '75%'}, {value: '100', label: '100%'}]} w={110} {...formCompra.getInputProps('porcentajeRetencion')} />
                                            )}
                                        </Group>
                                    )}
                                </Group>

                                {isMobile ? (
                                    <Stack gap={6} mb="sm">
                                        {carritoCompra.length === 0 && <Text size="sm" c="dimmed" ta="center" py="md">Toca un producto de la lista para agregarlo.</Text>}
                                        {carritoCompra.map(item => {
                                            const diferencia = item.precioCompraUnitario - item.costoAnterior;
                                            const variacionPorcentual = item.costoAnterior > 0 ? ((diferencia / item.costoAnterior) * 100).toFixed(1) : 100;
                                            return (
                                                <Paper key={item.id} withBorder p="xs" radius="md">
                                                    <Group justify="space-between" wrap="nowrap" align="flex-start" mb={4}>
                                                        <Box style={{ minWidth: 0, flex: 1 }}>
                                                            <Text fw={700} size="sm" lineClamp={2} lh={1.25}>{item.nombre}</Text>
                                                            <Text size="xs" c="dimmed">SKU: {item.codigo} · costo ant. <PrecioVisual valor={item.costoAnterior} simbolo="$" size="xs" c="dimmed" /></Text>
                                                        </Box>
                                                        <ActionIcon color="red" variant="subtle" size="md" onClick={() => eliminarItem(item.id)}><IconTrash size={18}/></ActionIcon>
                                                    </Group>
                                                    <SegmentedControl
                                                        fullWidth size="xs" mb={6} value={item.unidadCompra} onChange={(v) => cambiarUnidadCompra(item.id, v)}
                                                        data={[
                                                            { value: 'unidad', label: 'Unidades' },
                                                            ...(item.undPorCaja > 0 ? [{ value: 'caja', label: `Caja (${item.undPorCaja})` }] : []),
                                                            ...(item.undPorBulto > 1 ? [{ value: 'bulto', label: `Bulto (${item.undPorBulto})` }] : []),
                                                        ]}
                                                    />
                                                    <Group gap={8} wrap="nowrap" align="flex-start">
                                                        <Group gap={4} wrap="nowrap">
                                                            <ActionIcon size="lg" variant="light" onClick={() => cambiarCantidad(item.id, -1)}><IconMinus size={16}/></ActionIcon>
                                                            <NumberInput value={item.cantidadCompra} onChange={(v) => actualizarCantidadCompra(item.id, v)} min={1} allowDecimal={false} hideControls w={58} size="sm" styles={{ input: { textAlign: 'center', paddingInline: 4 } }} />
                                                            <ActionIcon size="lg" variant="light" onClick={() => cambiarCantidad(item.id, 1)}><IconPlus size={16}/></ActionIcon>
                                                        </Group>
                                                        <Box style={{ flex: 1, minWidth: 0 }}>
                                                            <NumberInput value={item.precioCompra} onChange={(val) => actualizarPrecioCompra(item.id, val)} decimalScale={4} size="sm" leftSection="$" />
                                                        </Box>
                                                    </Group>
                                                    <Text size="xs" c="dimmed" mt={4}>
                                                        por {item.unidadCompra}{item.unidadCompra !== 'unidad' ? ` = ${item.cantidad.toLocaleString('es-VE')} und · ${item.precioCompraUnitario.toFixed(4)} c/u` : ''}
                                                        {diferencia !== 0 && <Text span size="xs" fw={700} c={diferencia > 0 ? 'red' : 'teal'}> · {diferencia > 0 ? `▲ +${variacionPorcentual}%` : `▼ ${variacionPorcentual}%`}</Text>}
                                                    </Text>
                                                </Paper>
                                            );
                                        })}
                                    </Stack>
                                ) : (
                                <ScrollArea style={{ flex: 1 }} type="auto" mb="md">
                                    <Table striped highlightOnHover verticalSpacing="md">
                                        <Table.Thead>
                                            <Table.Tr>
                                                <Table.Th><Text size="sm">Producto</Text></Table.Th>
                                                <Table.Th ta="center"><Text size="sm">¿Qué recibes?</Text></Table.Th>
                                                <Table.Th><Text size="sm">Costo ant. / unidad</Text></Table.Th>
                                                <Table.Th><Text size="sm">Precio de compra</Text></Table.Th>
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
                                                            <Stack gap={6} align="center">
                                                                <SegmentedControl
                                                                    size="xs" value={item.unidadCompra} onChange={(v) => cambiarUnidadCompra(item.id, v)}
                                                                    data={[
                                                                        { value: 'unidad', label: 'Unidades' },
                                                                        ...(item.undPorCaja > 0 ? [{ value: 'caja', label: `Cajas (${item.undPorCaja} und)` }] : []),
                                                                        ...(item.undPorBulto > 1 ? [{ value: 'bulto', label: `Bulto (${item.undPorBulto} und)` }] : []),
                                                                    ]}
                                                                />
                                                                <Group gap={6} justify="center" wrap="nowrap">
                                                                    <ActionIcon size="sm" onClick={() => cambiarCantidad(item.id, -1)}><IconMinus size={14}/></ActionIcon>
                                                                    <NumberInput value={item.cantidadCompra} onChange={(v) => actualizarCantidadCompra(item.id, v)} min={1} allowDecimal={false} hideControls w={80} size="xs" ta="center" />
                                                                    <ActionIcon size="sm" onClick={() => cambiarCantidad(item.id, 1)}><IconPlus size={14}/></ActionIcon>
                                                                </Group>
                                                                {item.unidadCompra !== 'unidad' && <Text size="xs" c="dimmed">= {item.cantidad.toLocaleString('es-VE')} unidades</Text>}
                                                            </Stack>
                                                        </Table.Td>
                                                        <Table.Td><PrecioVisual valor={item.costoAnterior} simbolo="$" size="md" c="dimmed" /></Table.Td>
                                                        <Table.Td>
                                                            <NumberInput value={item.precioCompra} onChange={(val) => actualizarPrecioCompra(item.id, val)} decimalScale={4} w={130} size="sm" />
                                                            <Text size="xs" c="dimmed">
                                                                por {item.unidadCompra === 'bulto' ? 'bulto' : item.unidadCompra === 'caja' ? 'caja' : 'unidad'}{item.unidadCompra !== 'unidad' ? ` → ${item.precioCompraUnitario.toFixed(4)} c/u` : ''}
                                                            </Text>
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
                                )}

                                {!isMobile && <Divider mb="md" />}

                                {faltaNumeracionRet && (
                                    <Alert color="orange" variant="light" mb="md" title="Antes de retener: ¿con qué número empiezan tus comprobantes?">
                                        <Text size="xs" mb="xs">Esta factura lleva retención de IVA y el comprobante sigue su propia numeración. Como ya emitiste comprobantes antes del sistema, indica con cuál empieza el próximo (una sola vez).</Text>
                                        <PreguntarNumero serie={serieRet} puedeEditar={numeracion.puedeEditar} compacto />
                                    </Alert>
                                )}

                                {isMobile ? (
                                    <Box style={{ position: 'sticky', bottom: 0, zIndex: 15, background: '#fff', margin: '6px -8px -8px', padding: '8px 12px calc(8px + env(safe-area-inset-bottom))', boxShadow: '0 -6px 16px rgba(0,0,0,0.12)', borderTop: '1px solid var(--mantine-color-gray-3)' }}>
                                        <Group justify="space-between" mb={6} wrap="nowrap">
                                            <Text size="xs" c="dimmed">Subtotal <PrecioVisual valor={subtotal} simbolo={formCompra.values.moneda === 'BS' ? 'Bs' : '$'} size="xs" />{esFactura && <> · IVA <PrecioVisual valor={montoIva} simbolo={formCompra.values.moneda === 'BS' ? 'Bs' : '$'} size="xs" /></>}{montoRetencion > 0 && <Text span size="xs" c="red" fw={700}> · Ret. −<PrecioVisual valor={montoRetencion} simbolo={formCompra.values.moneda === 'BS' ? 'Bs' : '$'} size="xs" /></Text>}</Text>
                                            <Text fw={900} size="lg" c="blue.9" style={{ whiteSpace: 'nowrap' }}><PrecioVisual valor={totalFinal} simbolo={formCompra.values.moneda === 'BS' ? 'Bs' : '$'} size="lg" fw={900} c="blue.9" /></Text>
                                        </Group>
                                        <Button fullWidth size="md" color="green.8" tt="none" leftSection={<IconCheck size={20} />} onClick={handleLanzarSimulacion} loading={isSubmitting} disabled={carritoCompra.length === 0 || faltaNumeracionRet}>
                                            Analizar compra y costos
                                        </Button>
                                    </Box>
                                ) : (
                                <Group justify="space-between" align="flex-end">
                                    <Stack gap={4}>
                                        <Text size="sm" c="dimmed">Subtotal: <PrecioVisual valor={subtotal} simbolo={formCompra.values.moneda === 'BS' ? 'Bs' : '$'} size="sm" /></Text>
                                        {esFactura && <Text size="sm" c="dimmed">IVA (16%): <PrecioVisual valor={montoIva} simbolo={formCompra.values.moneda === 'BS' ? 'Bs' : '$'} size="sm" /></Text>}
                                        {montoRetencion > 0 && <Text size="sm" c="red" fw={700}>Retención (-): <PrecioVisual valor={montoRetencion} simbolo={formCompra.values.moneda === 'BS' ? 'Bs' : '$'} size="sm" /></Text>}
                                        {montoRetencion > 0 && serieRet?.configurado && <Text size="xs" c="dimmed">Comprobante de retención N° {periodoRet}{serieRet.siguiente}</Text>}
                                        <Text fw={900} size="xl" c="blue.9">Total: <PrecioVisual valor={totalFinal} simbolo={formCompra.values.moneda === 'BS' ? 'Bs' : '$'} size="xl" fw={900} c="blue.9" /></Text>
                                    </Stack>

                                    <Button size="lg" color="green.8" leftSection={<IconCheck size={22} />} onClick={handleLanzarSimulacion} loading={isSubmitting} disabled={carritoCompra.length === 0 || faltaNumeracionRet}>
                                        Analizar Compra y Costos
                                    </Button>
                                </Group>
                                )}
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
                            <TextInput size={isMobile ? 'sm' : 'md'} label="RIF" withAsterisk {...formNuevoProv.getInputProps('identificacion')} />
                            <TextInput size={isMobile ? 'sm' : 'md'} label="Razón Social" withAsterisk {...formNuevoProv.getInputProps('nombre')} />
                            <TextInput size={isMobile ? 'sm' : 'md'} label="Teléfono" {...formNuevoProv.getInputProps('telefono')} />
                            <TextInput size={isMobile ? 'sm' : 'md'} label="Email" {...formNuevoProv.getInputProps('email')} />
                            <TextInput size={isMobile ? 'sm' : 'md'} label="Dirección" {...formNuevoProv.getInputProps('direccion')} />
                            <Group grow>
                                <Checkbox label="Contribuyente Especial" size="md" mt={8} {...formNuevoProv.getInputProps('esContribuyenteEspecial', { type: 'checkbox' })} />
                                <Select size={isMobile ? 'sm' : 'md'} label="Retención Default" data={[{ value: '75', label: '75%' }, { value: '100', label: '100%' }]} {...formNuevoProv.getInputProps('retencionIvaPorDefecto', { transform: (v) => Number(v) })} />
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
                                        {!soloRegistro && <>
                                        <Table.Th ta="center"><Text size="sm">Costo Ponderado</Text></Table.Th>
                                        <Table.Th ta="center"><Text size="sm">Aumento</Text></Table.Th>
                                        <Table.Th><Text size="sm">Precio 6 (Actual ➔ Nuevo)</Text></Table.Th>
                                        <Table.Th><Text size="sm">Precio 7 (Actual ➔ Nuevo)</Text></Table.Th>
                                        <Table.Th ta="center"><Text size="sm">¿Modificar?</Text></Table.Th>
                                        </>}
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
                                                {!soloRegistro && <>
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
                                                </>}
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