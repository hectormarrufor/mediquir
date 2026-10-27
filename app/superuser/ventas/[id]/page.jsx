'use client';

import React, { useState } from 'react';
import {
    Box, Title, Paper, Group, Text, Badge, Grid, Stack, Divider,
    Table, Stepper, Button, Select, TextInput, NumberInput, Modal, Tabs
} from '@mantine/core';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useForm } from '@mantine/form';
import { useMediaQuery } from '@mantine/hooks';
import { aBolivares, aDolares } from '@/app/constants/facturacion';
import { useTasaBcv } from '@/hooks/useTasaBcv';
import {
    IconArrowLeft, IconPackage, IconTruck, IconCheck,
    IconUser, IconCurrencyDollar, IconReceiptTax, IconCash, IconListDetails, IconReportMoney, IconUsers
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import PrecioVisual from '@/app/components/ui/PrecioVisual';
import RetencionIvaCard from '../_components/RetencionIvaCard';
import EvidenciaEmpaque from '../_components/EvidenciaEmpaque';
import RevisionExistencias from '../_components/RevisionExistencias';
import EnvioCard from '../_components/EnvioCard';
import PagoPorVerificarCard from '../_components/PagoPorVerificarCard';
import { aInputFechaHora, formatearFecha, formatearFechaHora } from '@/app/constants/hora';
import NotasFacturaCard from '../_components/NotasFacturaCard';
import ConvertirNotaEntregaModal from '../_components/ConvertirNotaEntregaModal';
import { useAuth } from '@/hooks/useAuth';

export default function DetallePedidoMayorPage() {
    const params = useParams();
    const router = useRouter();
    const { userId, esVendedor, rolUsuario } = useAuth();

    const [galeriaModal, setGaleriaModal] = useState({ imagenes: [], indice: 0 });
    const [modalEmpacar, setModalEmpacar] = useState(false);
    const [modalDespacho, setModalDespacho] = useState(false);
    const [modalAbono, setModalAbono] = useState(false);
    const [modalFactura, setModalFactura] = useState(false);
    const [modalNotaAFactura, setModalNotaAFactura] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const isMobile = useMediaQuery('(max-width: 48em)');
    // Tasa BCV de hoy: con ella se convierte un abono hecho en otra moneda que la de la cuenta
    const { tasa: precioBCV } = useTasaBcv();

    // 1. Fetch del pedido con TODA la data relacional (CxC, Abonos, Movimientos, Usuarios)
    const { data: pedido, isLoading, refetch } = useQuery({
        queryKey: ['pedido-detalle', params.id],
        queryFn: async () => {
            const res = await fetch(`/api/ventas/${params.id}`);
            if (!res.ok) throw new Error('Error al cargar el pedido');
            return res.json();
        }
    });

    const { data: empleados } = useQuery({
        queryKey: ['personal-asignable'],
        enabled: !esVendedor,
        queryFn: async () => {
            const res = await fetch(`/api/logistica/asignables`);
            if (!res.ok) return [];
            return res.json();
        }
    });

    // --- FORMULARIOS ---
    const formEmpacar = useForm({ initialValues: { empacadorId: '', etiquetadorId: '' } });
    const formDespacho = useForm({ initialValues: { quienRetira: '', fechaHoraRetiro: aInputFechaHora(), costoFlete: 0 } });
    const formAbono = useForm({ initialValues: { montoAbono: 0, metodoPago: 'Transferencia', referencia: '', monedaAbono: 'USD' } });

    if (isLoading) return <Box p="md"><Text>Cargando panel 360° del pedido...</Text></Box>;
    if (!pedido) return <Box p="md"><Text c="red">Pedido no encontrado</Text></Box>;

    const cancelado = pedido.statusDespacho === 'Cancelado';
    let pasoActual = 0;
    if (pedido.statusDespacho === 'Empacado' || pedido.statusDespacho === 'Parcial') pasoActual = 1;
    if (pedido.statusDespacho === 'Completado') pasoActual = 3; // los tres pasos quedan hechos

    // Compra de la tienda fuera de la zona de delivery: envío nacional por Zoom con cobro a destino (la tesorería no interviene)
    const esNacional = pedido.tipoVenta === 'ONLINE' && pedido.tipoEntrega === 'flete';
    // La cuenta por cobrar llega como arreglo (asociación hasMany): antes se leía como objeto y el saldo salía siempre en 0
    const cuentaPorCobrar = Array.isArray(pedido.cuentaPorCobrar) ? (pedido.cuentaPorCobrar[0] || null) : (pedido.cuentaPorCobrar || null);
    const esCredito = pedido.condicionPago === 'Credito';
    const monedaCuenta = cuentaPorCobrar?.moneda || pedido.moneda;
    const saldoCuenta = Number(cuentaPorCobrar?.saldoPendiente) || 0;
    const pagado = pedido.statusPago === 'Pagado';
    // Montos del documento en su moneda y su equivalente (con la tasa del documento)
    const tasaDoc = Number(pedido.tasaCambio) || 1;
    const equivalente = (v) => (pedido.moneda === 'BS' ? `$${aDolares(Number(v) || 0, tasaDoc).toFixed(2)}` : `Bs ${aBolivares(Number(v) || 0, tasaDoc).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

    // --- HANDLERS ---
    const handleAction = async (accion, bodyData, modalSetter, successMsg) => {
        setIsSubmitting(true);
        try {
            const res = await fetch(`/api/ventas/${params.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accion, ...bodyData })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `Error en ${accion}`);

            notifications.show({ title: 'Éxito', message: successMsg, color: 'green' });
            if (modalSetter) modalSetter(false);
            refetch();
        } catch (error) {
            notifications.show({ title: 'Error', message: error.message, color: 'red' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleConfirmarEmpaque = (values) => handleAction('EMPACAR', { ...values, vendedorId: userId }, setModalEmpacar, 'Caja armada y stock descontado.');
    const handleAsignar = (values) => handleAction('ASIGNAR', values, setModalEmpacar, 'Personal asignado. Les avisamos para que preparen el pedido.');
    const handleConvertirFactura = () => handleAction('CONVERTIR_A_FACTURA', {}, setModalFactura, 'Convertido en factura. Ahora aparece en el libro de ventas con la fecha de hoy.');
    const handleFirmar = (accion, mensaje) => handleAction(accion, {}, null, mensaje);
    const handleConfirmarDespacho = (values) => handleAction('DESPACHAR', values, setModalDespacho, 'Despacho registrado y flete asentado.');

    // 🔥 HANDLER DE ABONO A CUENTA POR COBRAR 🔥
    const handleRegistrarAbono = (values) => {
        if (!(Number(values.montoAbono) > 0)) return notifications.show({ message: 'El monto debe ser mayor a 0', color: 'red' });
        if (values.monedaAbono !== monedaCuenta && !(precioBCV > 0)) return notifications.show({ message: 'Todavía no hay tasa BCV para convertir el pago: espera un momento e intenta de nuevo', color: 'red' });

        handleAction('ABONAR', {
            montoAbono: values.montoAbono,
            metodoPago: values.metodoPago,
            referencia: values.referencia,
            monedaAbono: values.monedaAbono,
            tasaCambioAbono: precioBCV
        }, setModalAbono, 'Abono registrado y saldo actualizado.');
    };

    const abrirAbono = () => {
        // Por defecto se propone pagar todo el saldo, en la moneda de la cuenta
        formAbono.setValues({ montoAbono: saldoCuenta, metodoPago: 'Transferencia', referencia: '', monedaAbono: monedaCuenta });
        setModalAbono(true);
    };

    const opcionesEmpleados = empleados?.map(e => ({ value: String(e.id), label: e.nombre })) || [];

    const obtenerTodasLasImagenes = (producto) => {
        if (!producto) return [];
        const lista = [];

        if (producto.imagen) {
            lista.push({ titulo: 'Imagen del Producto', url: `${process.env.NEXT_PUBLIC_IMG_BASE}/${producto.imagen}` });
        }
        if (producto.grupoEquivalencia?.imagen) {
            lista.push({ titulo: 'Grupo de Equivalencia', url: `${process.env.NEXT_PUBLIC_IMG_BASE}/${producto.grupoEquivalencia.imagen}` });
        }
        if (producto.marca?.imagen) {
            lista.push({ titulo: `Marca: ${producto.marca.nombre || 'N/A'}`, url: `${process.env.NEXT_PUBLIC_IMG_BASE}/${producto.marca.imagen}` });
        }

        return lista;
    };


    return (
        <Box p="md" maw={1400} mx="auto">
            {/* 👈 BLOQUE MODIFICADO EN LA CABECERA */}
            <Group mb="md" gap="sm">
                <Button variant="subtle" color="gray.3" leftSection={<IconArrowLeft size={16} />} onClick={() => router.push('/superuser/ventas')}>
                    Volver
                </Button>
                <Title order={isMobile ? 3 : 2} c="white">{pedido.tipoDocumento === 'FACTURA' ? 'Factura' : pedido.tipoDocumento === 'NOTA_ENTREGA' ? 'Nota de entrega' : 'Recibo'} {pedido.numeroDocumento}</Title>
                {pedido.numeroDocumentoAnterior && <Badge size="lg" variant="outline" color="gray">Antes: {pedido.numeroDocumentoAnterior}</Badge>}
                {rolUsuario === 'admin' && pedido.tipoDocumento === 'NOTA_ENTREGA' && pedido.condicionPago === 'Credito' && pedido.clienteId && pedido.statusDespacho !== 'Cancelado' && pedido.revisionStock !== 'PENDIENTE' && (
                    <Button size="xs" variant="light" color="indigo" leftSection={<IconReceiptTax size={16} />} onClick={() => setModalNotaAFactura(true)}>Pasar a factura</Button>
                )}
                {rolUsuario === 'admin' && pedido.tipoDocumento === 'VENTA_RAPIDA' && pedido.clienteId && pedido.statusDespacho !== 'Cancelado' && (
                    <Button size="xs" variant="light" color="indigo" leftSection={<IconReceiptTax size={16} />} onClick={() => setModalFactura(true)}>Convertir en factura</Button>
                )}

                {/* Estado de pago (los valores vienen como 'Pagado' / 'Pendiente': antes se comparaba en mayúsculas y siempre salía naranja) */}
                <Badge size="lg" color={cancelado ? 'gray' : pagado ? 'green' : 'orange'}>
                    Pago: {cancelado ? 'Anulado' : (pedido.statusPago || 'Pendiente')}
                </Badge>

                {/* Estado de despacho */}
                <Badge size="lg" color={cancelado ? 'red' : pedido.statusDespacho === 'Completado' ? 'blue' : 'yellow'}>
                    Despacho: {pedido.statusDespacho || 'Pendiente'}
                </Badge>

                {/* Tipo de Entrega */}
                <Badge size="lg" variant="outline" color={pedido.tipoEntrega === 'pickup' ? 'grape' : 'cyan'}>
                    {pedido.tipoEntrega === 'pickup' ? '🏪 Pickup (Retiro)' : (esNacional ? '📦 Envío nacional (Zoom)' : '🚚 Delivery')}
                </Badge>
            </Group>

            <Tabs defaultValue="logistica" color="blue" variant="pills" radius="xl">
                <Paper radius="xl" p={4} mb="md" w="fit-content" maw="100%" style={{ overflowX: 'auto' }}>
                <Tabs.List style={{ flexWrap: 'nowrap' }}>
                    <Tabs.Tab value="logistica" leftSection={<IconPackage size={16} />}>Logística y resumen</Tabs.Tab>
                    {(esCredito || cuentaPorCobrar) && !esVendedor && <Tabs.Tab value="cxc" leftSection={<IconCash size={16} />}>Estado de cuenta</Tabs.Tab>}
                    {!esVendedor && <Tabs.Tab value="finanzas" leftSection={<IconReportMoney size={16} />}>Movimientos</Tabs.Tab>}
                </Tabs.List>
                </Paper>

                {/* ============================================================== */}
                {/* PESTAÑA 1: LOGÍSTICA, CONTENIDO, PERSONAL Y CLIENTE */}
                {/* ============================================================== */}
                <Tabs.Panel value="logistica">
                    <Grid gutter="md">
                        <Grid.Col span={{ base: 12, md: 8 }}>
                            <Paper withBorder p={{ base: 'md', sm: 'xl' }} radius="md" bg="white" mb="md">
                                {cancelado ? (
                                    <Text ta="center" fw={700} c="red.7">Este pedido está cancelado: no se empaca ni se despacha.</Text>
                                ) : (
                                    <Stepper active={pasoActual} color="blue" size={isMobile ? 'sm' : 'md'} orientation={isMobile ? 'vertical' : 'horizontal'}>
                                        <Stepper.Step label="Generado" description="Documento emitido" icon={<IconReceiptTax size={18} />} />
                                        <Stepper.Step label="Empacado" description="Caja armada" icon={<IconPackage size={18} />} />
                                        <Stepper.Step label={pedido.tipoEntrega === 'pickup' ? 'Retirado' : 'Despachado'} description={pedido.tipoEntrega === 'pickup' ? 'Entregado en tienda' : 'Entregado al transporte'} icon={<IconTruck size={18} />} />
                                    </Stepper>
                                )}

                                {/* Firmas del personal asignado (el vendedor solo ve y firma lo suyo) */}
                                {pedido.empacadorId && (
                                    <Group mt="lg" gap="sm" justify="center">
                                        <Badge size="lg" variant={pedido.empacadoAt ? 'filled' : 'light'} color={pedido.empacadoAt ? 'teal' : 'gray'}>
                                            {pedido.empacadoAt ? `Empaque firmado · ${formatearFechaHora(pedido.empacadoAt)}` : 'Empaque pendiente de firma'}
                                        </Badge>
                                        <Badge size="lg" variant={pedido.etiquetadoAt ? 'filled' : 'light'} color={pedido.etiquetadoAt ? 'teal' : 'gray'}>
                                            {pedido.etiquetadoAt ? `Etiquetado firmado · ${formatearFechaHora(pedido.etiquetadoAt)}` : 'Etiquetado pendiente de firma'}
                                        </Badge>
                                    </Group>
                                )}
                                <Group mt="xl" justify="center" gap="sm">
                                    {Number(pedido.empacadorId) === Number(userId) && !pedido.empacadoAt && pedido.statusDespacho !== 'Cancelado' && (
                                        <Button size="md" color="blue" loading={isSubmitting} leftSection={<IconPackage size={18} />} onClick={() => router.push(`/superuser/ventas/${params.id}/empacar`)}>Empacar paso a paso</Button>
                                    )}
                                    {Number(pedido.etiquetadorId) === Number(userId) && !pedido.etiquetadoAt && pedido.statusDespacho !== 'Cancelado' && (
                                        <Button size="md" color="grape" loading={isSubmitting} disabled={!pedido.empacadoAt} leftSection={<IconPackage size={18} />} onClick={() => handleFirmar('FIRMAR_ETIQUETADO', 'Etiquetado firmado.')}>
                                            {pedido.empacadoAt ? 'Firmar etiquetado' : 'Etiquetado (esperando empaque)'}
                                        </Button>
                                    )}
                                    {!esVendedor && !pedido.empacadoAt && !['Completado', 'Cancelado'].includes(pedido.statusDespacho) && (
                                        <Button size="md" color="blue" variant={pedido.empacadorId ? 'light' : 'filled'} leftSection={<IconPackage size={18} />}
                                            onClick={() => { formEmpacar.setValues({ empacadorId: pedido.empacadorId ? String(pedido.empacadorId) : '', etiquetadorId: pedido.etiquetadorId ? String(pedido.etiquetadorId) : '' }); setModalEmpacar(true); }}>
                                            {pedido.empacadorId ? 'Cambiar personal asignado' : 'Asignar personal'}
                                        </Button>
                                    )}
                                    {!esVendedor && pasoActual === 1 && (
                                        <Button size="md" color="grape" leftSection={<IconTruck size={18} />} onClick={() => { formDespacho.setFieldValue('quienRetira', pedido.quienRetira || ''); setModalDespacho(true); }}>Registrar Chofer y Flete</Button>
                                    )}
                                </Group>
                            </Paper>

                            {!esVendedor && <RevisionExistencias pedido={pedido} onCambio={() => refetch()} />}

                            <EvidenciaEmpaque ventaId={pedido.id} puedeLiberar={!esVendedor} />

                            <Paper withBorder p="md" radius="md" bg="white">
                                <Text fw={700} size="lg" mb="md">Contenido del pedido</Text>
                                <Table.ScrollContainer minWidth={620}>
                                <Table striped highlightOnHover verticalSpacing="sm">
                                    <Table.Thead>
                                        <Table.Tr>
                                            <Table.Th>Imagen</Table.Th>
                                            <Table.Th>Código</Table.Th>
                                            <Table.Th>Producto / Marca</Table.Th>
                                            <Table.Th ta="center">Cant</Table.Th>
                                            <Table.Th ta="right">Precio Unit.</Table.Th>
                                            <Table.Th ta="right">Subtotal</Table.Th>
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {pedido.detalles?.map(d => {
                                            const imagenesDisponibles = obtenerTodasLasImagenes(d.producto);
                                            const imgPrincipal = imagenesDisponibles[0]?.url;
                                            const nombreMarca = d.producto?.marca?.nombre || 'Genérica';

                                            return (
                                                <Table.Tr key={d.id}>
                                                    <Table.Td>
                                                        {(() => {
                                                            const imagenesDisponibles = obtenerTodasLasImagenes(d.producto);
                                                            const imgPrincipal = imagenesDisponibles[0]?.url;

                                                            return imgPrincipal ? (
                                                                <Box pos="relative" display="inline-block">
                                                                    <Box
                                                                        component="img"
                                                                        src={imgPrincipal}
                                                                        alt="Producto"
                                                                        w={40}
                                                                        h={40}
                                                                        style={{ objectFit: 'cover', borderRadius: '4px', cursor: 'pointer' }}
                                                                        onClick={() => setGaleriaModal({ imagenes: imagenesDisponibles, indice: 0 })}
                                                                        title="Haz clic para ver galería de imágenes"
                                                                    />
                                                                    {imagenesDisponibles.length > 1 && (
                                                                        <Badge
                                                                            size="xs"
                                                                            variant="filled"
                                                                            color="dark"
                                                                            style={{ position: 'absolute', bottom: -4, right: -4, fontSize: '9px', padding: '0 4px' }}
                                                                        >
                                                                            {imagenesDisponibles.length}
                                                                        </Badge>
                                                                    )}
                                                                </Box>
                                                            ) : (
                                                                <Box w={40} h={40} bg="gray.2" style={{ borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                    <Text size="xs" c="dimmed">S/I</Text>
                                                                </Box>
                                                            );
                                                        })()}
                                                    </Table.Td>
                                                    <Table.Td>{d.producto?.codigo || 'N/A'}</Table.Td>
                                                    <Table.Td>
                                                        <Stack gap={0}>
                                                            <Text size="sm" fw={600}>{d.isFicticio ? d.nombreFicticio : d.producto?.nombre}</Text>
                                                            <Badge size="xs" variant="light" color="blue" w="fit-content" mt={2}>
                                                                {nombreMarca}
                                                            </Badge>
                                                        </Stack>
                                                    </Table.Td>
                                                    <Table.Td ta="center"><Text fw={900}>{d.cantidad}</Text>{d.presentacionPedida && d.presentacionPedida !== 'UNIDAD' && d.cantidadPresentacion && <Text size="xs" c="dimmed">{d.cantidadPresentacion} × {d.presentacionPedida === 'CAJA' ? 'Caja' : 'Bulto'} x{d.unidadesPorPresentacion}</Text>}</Table.Td>
                                                    <Table.Td ta="right"><PrecioVisual valor={d.precioUnitario} simbolo={pedido.moneda} size="sm" /></Table.Td>
                                                    <Table.Td ta="right"><PrecioVisual valor={d.subtotal ?? d.precioUnitario * d.cantidad} simbolo={pedido.moneda} size="sm" fw={700} />{!d.aplicaIva && pedido.tipoDocumento === 'FACTURA' && <Text size="xs" c="dimmed">(E)</Text>}</Table.Td>
                                                </Table.Tr>
                                            );
                                        })}
                                    </Table.Tbody>
                                </Table>
                                </Table.ScrollContainer>

                                {/* Totales del documento: lo que se cobra (y su equivalente con la tasa del documento) */}
                                <Stack gap={4} mt="md" ml="auto" maw={360}>
                                    <Group justify="space-between"><Text size="sm" c="dimmed">Subtotal</Text><PrecioVisual valor={pedido.subtotal} simbolo={pedido.moneda} size="sm" fw={600} /></Group>
                                    {Number(pedido.montoIva) > 0 && <Group justify="space-between"><Text size="sm" c="dimmed">IVA</Text><PrecioVisual valor={pedido.montoIva} simbolo={pedido.moneda} size="sm" fw={600} /></Group>}
                                    {Number(pedido.costoFlete) > 0 && <Group justify="space-between"><Text size="sm" c="dimmed">{pedido.tipoVenta === 'ONLINE' ? 'Delivery' : 'Flete'}</Text><PrecioVisual valor={pedido.costoFlete} simbolo={pedido.moneda} size="sm" fw={600} /></Group>}
                                    <Divider />
                                    <Group justify="space-between"><Text fw={800}>Total</Text><PrecioVisual valor={pedido.totalFinal} simbolo={pedido.moneda} size="lg" fw={900} c="blue.9" /></Group>
                                    <Text size="xs" c="dimmed" ta="right">≈ {equivalente(pedido.totalFinal)} · tasa {tasaDoc} Bs/$</Text>
                                </Stack>
                            </Paper>
                        </Grid.Col>

                        <Grid.Col span={{ base: 12, md: 4 }}>
                            <Stack gap="md">
                                <Paper withBorder p="md" radius="md" bg="gray.0">
                                    <Text fw={700} mb="xs" c="blue.9">Datos del Cliente</Text>
                                    <Text size="sm" fw={600}><IconUser size={14} style={{ verticalAlign: 'middle' }} /> {pedido.cliente?.nombre}</Text>
                                    <Text size="xs" c="dimmed">RIF: {pedido.cliente?.identificacion}</Text>
                                    <Text size="xs" c="dimmed" mt={4}>{pedido.cliente?.direccion}</Text>
                                </Paper>

                                <Paper withBorder p="md" radius="md" bg="gray.0">
                                    <Text fw={700} mb="xs" c="blue.9"><IconUsers size={16} style={{ verticalAlign: 'middle' }} /> Personal Involucrado</Text>
                                    <Text size="xs" c="dimmed">Vendedor / Registrador:</Text>
                                    <Text size="sm" fw={600} mb={6}>{pedido.vendedor?.empleado ? `${pedido.vendedor.empleado.nombre} ${pedido.vendedor.empleado.apellido}` : 'Sistema'}</Text>

                                    <Text size="xs" c="dimmed">Empacador:</Text>
                                    <Text size="sm" fw={600} mb={6}>{pedido.empacador?.empleado ? `${pedido.empacador.empleado.nombre} ${pedido.empacador.empleado.apellido}` : 'Pendiente'}</Text>

                                    <Text size="xs" c="dimmed">Etiquetador:</Text>
                                    <Text size="sm" fw={600}>{pedido.etiquetador?.empleado ? `${pedido.etiquetador.empleado.nombre} ${pedido.etiquetador.empleado.apellido}` : 'Pendiente'}</Text>
                                </Paper>

                                {!esVendedor && <PagoPorVerificarCard pedido={pedido} esAdmin={rolUsuario === 'admin'} onCambio={refetch} />}
                                {!esVendedor && !esNacional && <EnvioCard pedido={pedido} onCambio={refetch} />}

                                {!esVendedor && <RetencionIvaCard pedido={pedido} onCambio={refetch} />}

                                {!esVendedor && <NotasFacturaCard pedido={pedido} onCambio={refetch} />}

                                {/* 👈 BLOQUE MODIFICADO EN LA TARJETA LATERAL */}
                                <Paper withBorder p="md" radius="md" bg="gray.0">
                                    <Text fw={700} mb="xs" c="blue.9">Logística de Entrega</Text>

                                    {pedido.tipoEntrega === 'pickup' ? (
                                        <Box>
                                            <Badge color="grape" variant="light" mb="xs">Retiro en Tienda (Pickup)</Badge>
                                            <Text size="xs" c="dimmed">El cliente retira directamente en el establecimiento. No aplica costo de flete ni agencia de envíos.</Text>
                                        </Box>
                                    ) : esNacional ? (
                                        <Box>
                                            <Badge color="indigo" variant="light" mb="xs">Envío nacional por Zoom</Badge>
                                            <Text size="xs" c="dimmed">Cobro a destino: el cliente paga el flete a Zoom al recibir. No hay flete en esta venta ni movimiento de tesorería.</Text>
                                            {pedido.direccionEntrega && <Text size="sm" fw={600} mt={6}>{pedido.direccionEntrega}</Text>}
                                            {pedido.quienRetira && <Text size="sm" fw={600} mt={6}>{pedido.quienRetira}</Text>}
                                        </Box>
                                    ) : (
                                        <Box>
                                            <Badge color="cyan" variant="light" mb="xs">Envío por Delivery / Agencia</Badge>
                                            <Text size="xs" c="dimmed">Quién retira / Agencia:</Text>
                                            <Text size="sm" fw={600} mb={6}>{pedido.quienRetira || 'Pendiente de asignar agencia'}</Text>

                                            {pedido.direccionEntrega && (() => {
                                                const g = /GPS: (-?[0-9.]+), (-?[0-9.]+)/.exec(pedido.direccionEntrega);
                                                return (
                                                    <Box mb={6}>
                                                        <Text size="xs" c="dimmed">Dirección de entrega (marcada por el cliente):</Text>
                                                        <Text size="sm" fw={600}>{pedido.direccionEntrega}</Text>
                                                        {g && <Button component="a" href={`https://www.google.com/maps?q=${g[1]},${g[2]}`} target="_blank" rel="noreferrer" size="compact-xs" variant="light" mt={4}>Ver en Google Maps</Button>}
                                                    </Box>
                                                );
                                            })()}
                                            <Text size="xs" c="dimmed">{pedido.tipoVenta === 'ONLINE' ? 'Delivery cobrado al cliente (va a la empresa de transporte):' : 'Costo de Flete (Gasto):'}</Text>
                                            <PrecioVisual valor={pedido.costoFlete || 0} simbolo={pedido.moneda} size="sm" fw={700} />
                                            {pedido.tipoVenta === 'ONLINE' && pedido.costoFleteReal !== null && pedido.costoFleteReal !== undefined && (() => {
                                                const dif = Math.round((Number(pedido.costoFlete) - Number(pedido.costoFleteReal)) * 100) / 100;
                                                return (
                                                    <Box mt={6}>
                                                        <Text size="xs" c="dimmed">Lo que cobró el delivery:</Text>
                                                        <PrecioVisual valor={pedido.costoFleteReal} simbolo={pedido.moneda} size="sm" fw={700} />
                                                        <Badge mt={4} size="sm" variant="light" color={dif === 0 ? 'teal' : (dif > 0 ? 'blue' : 'red')}>
                                                            {dif === 0 ? 'El cálculo fue exacto' : (dif > 0 ? `Se cobró de más al cliente: ${dif.toFixed(2)}` : `Se cobró de menos al cliente: ${Math.abs(dif).toFixed(2)}`)}
                                                        </Badge>
                                                    </Box>
                                                );
                                            })()}

                                            <Text size="xs" c="red.7" mt={6} fs="italic">
                                                ⚠️ Recuerda contactar a la agencia de delivery para gestionar la salida.
                                            </Text>
                                        </Box>
                                    )}
                                </Paper>
                            </Stack>
                        </Grid.Col>
                    </Grid>
                </Tabs.Panel>

                {/* ============================================================== */}
                {/* PESTAÑA 2: CUENTAS POR COBRAR Y ABONOS */}
                {/* ============================================================== */}
                {(esCredito || cuentaPorCobrar) && (
                    <Tabs.Panel value="cxc">
                        <Grid gutter="md">
                            <Grid.Col span={{ base: 12, md: 4 }}>
                                <Paper withBorder p="md" radius="md" bg={saldoCuenta > 0 ? 'orange.0' : 'green.0'}>
                                    <Text fw={700} size="lg" mb="sm" c="navy.9">Estado de cuenta</Text>
                                    {!cuentaPorCobrar ? (
                                        <Text size="sm" c="dimmed">Este pedido no tiene una cuenta por cobrar (por ejemplo, porque está en revisión de existencias o fue cancelado).</Text>
                                    ) : (
                                        <>
                                            <Group justify="space-between" mb={8}>
                                                <Text size="sm">Monto de la deuda:</Text>
                                                <PrecioVisual valor={cuentaPorCobrar.montoTotal} simbolo={monedaCuenta} size="md" />
                                            </Group>
                                            <Group justify="space-between" mb={8}>
                                                <Text size="sm">Abonado (incluye retención):</Text>
                                                <PrecioVisual valor={Math.max(0, Number(cuentaPorCobrar.montoTotal) - saldoCuenta)} simbolo={monedaCuenta} size="md" c="green.8" />
                                            </Group>
                                            <Group justify="space-between" mb={8}>
                                                <Text size="sm">Vencimiento:</Text>
                                                <Text size="sm" fw={600}>{formatearFecha(cuentaPorCobrar.fechaVencimiento) || '—'}</Text>
                                            </Group>
                                            <Divider my="sm" />
                                            <Group justify="space-between" mb="md">
                                                <Text size="md" fw={700}>Saldo pendiente:</Text>
                                                <PrecioVisual valor={saldoCuenta} simbolo={monedaCuenta} size="xl" fw={900} c={saldoCuenta > 0 ? 'red.7' : 'green.8'} />
                                            </Group>
                                            {saldoCuenta > 0 && precioBCV > 0 && <Text size="xs" c="dimmed" ta="right" mt={-10} mb="sm">≈ {monedaCuenta === 'USD' ? `Bs ${aBolivares(saldoCuenta, precioBCV).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `$${aDolares(saldoCuenta, precioBCV).toFixed(2)}`} a la tasa de hoy</Text>}
                                            <Button fullWidth color="green" disabled={saldoCuenta <= 0 || cancelado} onClick={abrirAbono} leftSection={<IconCash size={18} />}>
                                                {saldoCuenta > 0 ? 'Registrar abono' : 'Cuenta pagada'}
                                            </Button>
                                        </>
                                    )}
                                </Paper>
                            </Grid.Col>
                            <Grid.Col span={{ base: 12, md: 8 }}>
                                <Paper withBorder p="md" radius="md">
                                    <Text fw={700} mb="md">Historial de abonos (pagos)</Text>
                                    <Table.ScrollContainer minWidth={560}>
                                    <Table striped>
                                        <Table.Thead>
                                            <Table.Tr>
                                                <Table.Th>Fecha</Table.Th>
                                                <Table.Th>Método</Table.Th>
                                                <Table.Th>Referencia</Table.Th>
                                                <Table.Th ta="right">Monto ($)</Table.Th>
                                                <Table.Th ta="right">Monto (Bs)</Table.Th>
                                            </Table.Tr>
                                        </Table.Thead>
                                        <Table.Tbody>
                                            {!pedido.abonos?.length ? (
                                                <Table.Tr><Table.Td colSpan={5} ta="center">No hay abonos registrados.</Table.Td></Table.Tr>
                                            ) : (
                                                [...pedido.abonos].sort((a, b) => String(a.fechaPago).localeCompare(String(b.fechaPago)) || a.id - b.id).map(abono => (
                                                    <Table.Tr key={abono.id}>
                                                        <Table.Td>{formatearFecha(abono.fechaPago)}</Table.Td>
                                                        <Table.Td>{abono.metodoPago === 'Retención IVA' ? <Badge size="sm" variant="light" color="grape">Retención IVA</Badge> : abono.metodoPago}</Table.Td>
                                                        <Table.Td>{abono.referencia || 'S/N'}</Table.Td>
                                                        <Table.Td ta="right"><PrecioVisual valor={abono.montoUsd} simbolo="$" size="sm" fw={700} c="green.7" /></Table.Td>
                                                        <Table.Td ta="right"><PrecioVisual valor={abono.montoVes} simbolo="Bs" size="sm" fw={600} c="dimmed" /></Table.Td>
                                                    </Table.Tr>
                                                ))
                                            )}
                                        </Table.Tbody>
                                    </Table>
                                    </Table.ScrollContainer>
                                </Paper>
                            </Grid.Col>
                        </Grid>
                    </Tabs.Panel>
                )}

                {/* ============================================================== */}
                {/* PESTAÑA 3: MOVIMIENTOS FINANCIEROS (INGRESOS Y GASTOS) */}
                {/* ============================================================== */}
                <Tabs.Panel value="finanzas">
                    <Paper withBorder p="md" radius="md">
                        <Text fw={700} mb="md">Movimientos de caja de este pedido</Text>
                        <Table.ScrollContainer minWidth={720}>
                        <Table striped highlightOnHover>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Fecha</Table.Th>
                                    <Table.Th>Tipo</Table.Th>
                                    <Table.Th>Descripción</Table.Th>
                                    <Table.Th>Método</Table.Th>
                                    <Table.Th ta="right">Monto (USD)</Table.Th>
                                    <Table.Th ta="right">Monto (BS)</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {!pedido.movimientos?.length ? (
                                    <Table.Tr><Table.Td colSpan={6} ta="center">No hay movimientos financieros.</Table.Td></Table.Tr>
                                ) : (
                                    pedido.movimientos?.map(mov => (
                                        <Table.Tr key={mov.id}>
                                            <Table.Td>{formatearFecha(mov.fecha)}</Table.Td>
                                            <Table.Td>
                                                <Badge color={mov.tipo === 'INGRESO' ? 'green' : 'red'} variant="light">{mov.tipo}</Badge>
                                            </Table.Td>
                                            <Table.Td>{mov.descripcion}</Table.Td>
                                            <Table.Td>{mov.metodoPago}</Table.Td>
                                            <Table.Td ta="right"><PrecioVisual valor={mov.montoUsd} simbolo="$" size="sm" c={mov.tipo === 'INGRESO' ? 'green.7' : 'red.7'} fw={700} /></Table.Td>
                                            <Table.Td ta="right"><PrecioVisual valor={mov.montoVes} simbolo="Bs" size="sm" c={mov.tipo === 'INGRESO' ? 'green.7' : 'red.7'} fw={700} /></Table.Td>
                                        </Table.Tr>
                                    ))
                                )}
                            </Table.Tbody>
                        </Table>
                        </Table.ScrollContainer>
                    </Paper>
                </Tabs.Panel>

            </Tabs>

            {/* =================== MODALES =================== */}

            <Modal opened={modalEmpacar} onClose={() => setModalEmpacar(false)} title={<Title order={4} c="blue.9">Asignar personal de logística</Title>} centered>
                <form onSubmit={formEmpacar.onSubmit(handleConfirmarEmpaque)}>
                    <Stack gap="md">
                        <Select label="Empacador" data={opcionesEmpleados} withAsterisk {...formEmpacar.getInputProps('empacadorId')} />
                        <Select label="Etiquetador" data={opcionesEmpleados} withAsterisk {...formEmpacar.getInputProps('etiquetadorId')} />
                        <Button loading={isSubmitting} fullWidth color="blue"
                            onClick={() => {
                                const v = formEmpacar.values;
                                if (!v.empacadorId || !v.etiquetadorId) return notifications.show({ message: 'Elige quién empaca y quién etiqueta', color: 'orange' });
                                handleAsignar(v);
                            }}>
                            Asignar (cada quien firma su parte)
                        </Button>
                        <Button loading={isSubmitting} type="submit" fullWidth variant="light" color="blue">Empacar ya sin verificación (atajo de administración)</Button>
                    </Stack>
                </form>
            </Modal>

            {/* 👈 MODAL DE DESPACHO / ENTREGA CONDICIONAL */}
            <Modal
                opened={modalDespacho}
                onClose={() => setModalDespacho(false)}
                title={<Title order={4} c="grape">{pedido.tipoEntrega === 'pickup' ? 'Confirmar Retiro en Tienda' : 'Gestión de Despacho y Agencia'}</Title>}
                centered
            >
                <form onSubmit={formDespacho.onSubmit((values) => {
                    const body = pedido.tipoEntrega === 'pickup'
                        ? { quienRetira: 'Cliente en Tienda (Pickup)', costoFlete: 0, fechaHoraRetiro: new Date().toISOString() }
                        : (esNacional ? { ...values, costoFlete: 0 } : values);
                    handleConfirmarDespacho(body);
                })}>
                    <Stack gap="md">
                        {pedido.tipoEntrega === 'pickup' ? (
                            <Text size="sm">¿Confirmas que el cliente ha retirado su pedido en tienda? Esto cambiará el estado de despacho a <b>COMPLETADO</b>.</Text>
                        ) : (
                            <>
                                <TextInput label={esNacional ? 'Zoom: número de guía' : 'Chofer / Agencia de Delivery'} withAsterisk {...formDespacho.getInputProps('quienRetira')} />
                                <TextInput type="datetime-local" label="Fecha y Hora de Entrega a Agencia" withAsterisk {...formDespacho.getInputProps('fechaHoraRetiro')} />
                                {!esNacional && <NumberInput label={pedido.tipoVenta === 'ONLINE' ? 'Lo que cobró el delivery' : 'Lo que pagó la empresa por el flete (gasto)'} description={pedido.tipoVenta === 'ONLINE' ? `Se compara con lo que se le cobró al cliente (${Number(pedido.costoFlete || 0).toFixed(2)}); genera un ajuste en tesorería` : 'El flete que se le cobra al cliente se fija en «Envío y transporte»'} decimalScale={2} withAsterisk {...formDespacho.getInputProps('costoFlete')} />}
                                <Text size="xs" c="dimmed">{esNacional ? 'ℹ️ Envío por Zoom con cobro a destino: el cliente paga el flete al recibir.' : 'ℹ️ Al registrar esto, recuerda contactar a la agencia de delivery para el despacho.'}</Text>
                            </>
                        )}
                        <Button loading={isSubmitting} type="submit" fullWidth color="grape">
                            {pedido.tipoEntrega === 'pickup' ? 'Marcar como Retirado' : (pedido.tipoVenta === 'ONLINE' ? 'Asentar Despacho' : 'Asentar Despacho y Gasto')}
                        </Button>
                    </Stack>
                </form>
            </Modal>

            {modalNotaAFactura && <ConvertirNotaEntregaModal opened onClose={() => setModalNotaAFactura(false)} pedido={pedido} onListo={refetch} />}

            <Modal opened={modalFactura} onClose={() => setModalFactura(false)} title={<Title order={4}>Convertir en factura</Title>} centered>
                <Stack gap="md">
                    <Text size="sm">El recibo <b>{pedido.numeroDocumento}</b> pasará a ser una <b>factura</b> con un número F- nuevo y fecha de emisión <b>de hoy</b>, y entrará al libro de ventas de este periodo.</Text>
                    <Text size="sm">El IVA ya cobrado dejará de contar como ingreso de la tienda y quedará reservado para pagar al SENIAT. Esta acción no se puede deshacer.</Text>
                    <Button loading={isSubmitting} fullWidth color="indigo" onClick={handleConvertirFactura}>Sí, convertir en factura</Button>
                </Stack>
            </Modal>

            {/* 🔥 MODAL DE ABONO 🔥 */}
            <Modal opened={modalAbono} onClose={() => setModalAbono(false)} title={<Title order={4} c="green.9">Registrar Pago / Abono</Title>} centered>
                <form onSubmit={formAbono.onSubmit(handleRegistrarAbono)}>
                    <Stack gap="md">
                        <Text size="sm" c="dimmed" mb="-sm">Saldo pendiente actual: <PrecioVisual valor={saldoCuenta} simbolo={monedaCuenta} size="sm" fw={700} /></Text>

                        <Group grow>
                            <NumberInput label="Monto a abonar" decimalScale={2} min={0} withAsterisk {...formAbono.getInputProps('montoAbono')} />
                            <Select label="Moneda del pago" data={['USD', 'BS']} allowDeselect={false} withAsterisk {...formAbono.getInputProps('monedaAbono')} />
                        </Group>
                        {formAbono.values.monedaAbono !== monedaCuenta && (
                            <Text size="xs" c="orange.8">Se convierte con la tasa BCV de hoy ({precioBCV || '…'} Bs/$){precioBCV > 0 && Number(formAbono.values.montoAbono) > 0 ? `: equivale a ${monedaCuenta === 'USD' ? `$${aDolares(Number(formAbono.values.montoAbono), precioBCV).toFixed(2)}` : `Bs ${aBolivares(Number(formAbono.values.montoAbono), precioBCV).toFixed(2)}`}` : ''}.</Text>
                        )}
                        <Select label="Método de pago" data={['Transferencia', 'Pago Móvil', 'Efectivo', 'Zelle', 'Punto de Venta']} allowDeselect={false} withAsterisk {...formAbono.getInputProps('metodoPago')} />
                        <TextInput label="Referencia (Opcional)" placeholder="Nro de recibo o transferencia" {...formAbono.getInputProps('referencia')} />

                        <Button loading={isSubmitting} type="submit" fullWidth color="green" mt="md" leftSection={<IconCash size={18} />}>
                            Procesar Abono
                        </Button>
                    </Stack>
                </form>
            </Modal>
            {/* MODAL DE GALERÍA CON CARRUSEL MANUAL */}
            <Modal
                opened={galeriaModal.imagenes.length > 0}
                onClose={() => setGaleriaModal({ imagenes: [], indice: 0 })}
                title={
                    <Group gap="xs">
                        <Text fw={700}>Galería del Producto</Text>
                        {galeriaModal.imagenes.length > 0 && (
                            <Badge color="blue" variant="light">
                                {galeriaModal.imagenes[galeriaModal.indice]?.titulo} ({galeriaModal.indice + 1} de {galeriaModal.imagenes.length})
                            </Badge>
                        )}
                    </Group>
                }
                centered
                size="lg"
            >
                {galeriaModal.imagenes.length > 0 && (
                    <Stack align="center" gap="md">
                        {/* Contenedor de la Imagen */}
                        <Box ta="center" pos="relative" w="100%">
                            <Box
                                component="img"
                                src={galeriaModal.imagenes[galeriaModal.indice]?.url}
                                alt="Imagen ampliada"
                                style={{ maxWidth: '100%', maxHeight: '65vh', objectFit: 'contain', borderRadius: '8px' }}
                            />
                        </Box>

                        {/* Controles de Navegación del Carrusel (Solo si hay más de 1 imagen) */}
                        {galeriaModal.imagenes.length > 1 && (
                            <Group justify="center" gap="xl" mt="xs">
                                <Button
                                    variant="default"
                                    disabled={galeriaModal.indice === 0}
                                    onClick={() => setGaleriaModal(prev => ({ ...prev, indice: prev.indice - 1 }))}
                                >
                                    Anterior
                                </Button>
                                <Text size="sm" c="dimmed">
                                    {galeriaModal.indice + 1} / {galeriaModal.imagenes.length}
                                </Text>
                                <Button
                                    color="blue"
                                    disabled={galeriaModal.indice === galeriaModal.imagenes.length - 1}
                                    onClick={() => setGaleriaModal(prev => ({ ...prev, indice: prev.indice + 1 }))}
                                >
                                    Siguiente
                                </Button>
                            </Group>
                        )}
                    </Stack>
                )}
            </Modal>
        </Box>
    );
}