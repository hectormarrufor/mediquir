'use client';

import React, { useState, useEffect } from 'react';
import {
    Box, Title, Paper, Group, Text, Badge, Grid, Stack, Divider,
    Table, Stepper, Button, Select, TextInput, NumberInput, Modal, Tabs, ScrollArea, ActionIcon
} from '@mantine/core';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useForm } from '@mantine/form';
import {
    IconArrowLeft, IconPackage, IconTruck, IconCheck,
    IconUser, IconCurrencyDollar, IconReceiptTax, IconCash, IconListDetails, IconReportMoney, IconUsers
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import PrecioVisual from '@/app/components/ui/PrecioVisual';
import { useAuth } from '@/hooks/useAuth';

export default function DetallePedidoMayorPage() {
    const params = useParams();
    const router = useRouter();
    const { userId } = useAuth();

    const [galeriaModal, setGaleriaModal] = useState({ imagenes: [], indice: 0 });
    const [modalEmpacar, setModalEmpacar] = useState(false);
    const [modalDespacho, setModalDespacho] = useState(false);
    const [modalAbono, setModalAbono] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [precioBCV, setPrecioBCV] = useState(1);

    // Obtener tasa BCV actual para los abonos
    useEffect(() => {
        fetch('/api/bcv').then(res => res.json()).then(data => {
            if (data?.precio) setPrecioBCV(data.precio);
        });
    }, []);

    // 1. Fetch del pedido con TODA la data relacional (CxC, Abonos, Movimientos, Usuarios)
    const { data: pedido, isLoading, refetch } = useQuery({
        queryKey: ['pedido-detalle', params.id],
        queryFn: async () => {
            const res = await fetch(`/api/ventas/${params.id}`);
            if (!res.ok) throw new Error('Error al cargar el pedido');
            return res.json();
        }
    });

    useEffect(() => {
        console.log('Pedido cargado:', pedido);
    }, [pedido]);

    const { data: empleados } = useQuery({
        queryKey: ['empleados-select'],
        queryFn: async () => {
            const res = await fetch(`/api/rrhh/empleados`);
            if (!res.ok) return [];
            return res.json();
        }
    });

    // --- FORMULARIOS ---
    const formEmpacar = useForm({ initialValues: { empacadorId: '', etiquetadorId: '' } });
    const formDespacho = useForm({ initialValues: { quienRetira: '', fechaHoraRetiro: new Date().toISOString().slice(0, 16), costoFlete: 0 } });
    const formAbono = useForm({ initialValues: { montoAbono: 0, metodoPago: 'Transferencia', referencia: '', monedaAbono: 'USD' } });

    if (isLoading) return <Box p="md"><Text>Cargando panel 360° del pedido...</Text></Box>;
    if (!pedido) return <Box p="md"><Text c="red">Pedido no encontrado</Text></Box>;

    let pasoActual = 0;
    if (pedido.statusDespacho === 'Empacado') pasoActual = 1;
    if (pedido.statusDespacho === 'Completado' || pedido.statusDespacho === 'Despachado') pasoActual = 2;

    const cuentaPorCobrar = pedido.cuentaPorCobrar; // Asumiendo que tu backend lo incluye
    const esCredito = pedido.condicionPago === 'Credito';

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
    const handleConfirmarDespacho = (values) => handleAction('DESPACHAR', values, setModalDespacho, 'Despacho registrado y flete asentado.');

    // 🔥 HANDLER DE ABONO A CUENTA POR COBRAR 🔥
    const handleRegistrarAbono = (values) => {
        if (values.montoAbono <= 0) return notifications.show({ message: 'El monto debe ser mayor a 0', color: 'red' });

        handleAction('ABONAR', {
            montoAbono: values.montoAbono,
            metodoPago: values.metodoPago,
            referencia: values.referencia,
            monedaAbono: values.monedaAbono,
            tasaCambioAbono: precioBCV
        }, setModalAbono, 'Abono registrado y saldo actualizado.');
    };

    const opcionesEmpleados = empleados?.map(e => ({ value: String(e.id), label: `${e.nombre} ${e.apellido}` })) || [];

    const obtenerTodasLasImagenes = (producto) => {
        if (!producto) return [];
        const lista = [];

        if (producto.imagen) {
            lista.push({ titulo: 'Imagen del Producto', url: `${process.env.NEXT_PUBLIC_BLOB_BASE_URL}/${producto.imagen}` });
        }
        if (producto.grupoEquivalencia?.imagen) {
            lista.push({ titulo: 'Grupo de Equivalencia', url: `${process.env.NEXT_PUBLIC_BLOB_BASE_URL}/${producto.grupoEquivalencia.imagen}` });
        }
        if (producto.marca?.imagen) {
            lista.push({ titulo: `Marca: ${producto.marca.nombre || 'N/A'}`, url: `${process.env.NEXT_PUBLIC_BLOB_BASE_URL}/${producto.marca.imagen}` });
        }

        return lista;
    };


    return (
        <Box p="md" maw={1400} mx="auto">
            {/* 👈 BLOQUE MODIFICADO EN LA CABECERA */}
            <Group>
                <Button variant="subtle" color="gray" leftSection={<IconArrowLeft size={16} />} onClick={() => router.push('/superuser/ventas')}>
                    Volver
                </Button>
                <Title order={2} c="blue.9">Pedido: {pedido.numeroDocumento}</Title>

                {/* Status de Pago */}
                <Badge size="lg" color={pedido.statusPago === 'PAGADO' ? 'green' : 'orange'}>
                    Pago: {pedido.statusPago || 'PENDIENTE'}
                </Badge>

                {/* Status de Despacho */}
                <Badge size="lg" color={pedido.statusDespacho === 'COMPLETADO' ? 'blue' : 'yellow'}>
                    Despacho: {pedido.statusDespacho || 'PENDIENTE'}
                </Badge>

                {/* Tipo de Entrega */}
                <Badge size="lg" variant="outline" color={pedido.tipoEntrega === 'pickup' ? 'grape' : 'cyan'}>
                    {pedido.tipoEntrega === 'pickup' ? '🏪 Pickup (Retiro)' : '🚚 Delivery'}
                </Badge>
            </Group>

            <Tabs defaultValue="logistica" color="blue">
                <Tabs.List mb="md">
                    <Tabs.Tab value="logistica" leftSection={<IconPackage size={16} />}>Logística y Resumen</Tabs.Tab>
                    {esCredito && <Tabs.Tab value="cxc" leftSection={<IconCash size={16} />}>Cuentas por Cobrar y Abonos</Tabs.Tab>}
                    <Tabs.Tab value="finanzas" leftSection={<IconReportMoney size={16} />}>Movimientos Financieros</Tabs.Tab>
                </Tabs.List>

                {/* ============================================================== */}
                {/* PESTAÑA 1: LOGÍSTICA, CONTENIDO, PERSONAL Y CLIENTE */}
                {/* ============================================================== */}
                <Tabs.Panel value="logistica">
                    <Grid gutter="md">
                        <Grid.Col span={{ base: 12, md: 8 }}>
                            <Paper withBorder p="xl" radius="md" bg="white" mb="md">
                                <Stepper active={pasoActual} color="blue" breakpoint="sm">
                                    <Stepper.Step label="Generado" description="Pedido facturado" icon={<IconReceiptTax size={18} />} />
                                    <Stepper.Step label="Empacado" description="Stock descontado" icon={<IconPackage size={18} />} />
                                    <Stepper.Step label="Despachado" description="Entregado al chofer" icon={<IconTruck size={18} />} />
                                </Stepper>

                                {pasoActual === 0 && (
                                    <Group mt="xl" justify="center">
                                        <Button size="md" color="blue" leftSection={<IconPackage size={18} />} onClick={() => setModalEmpacar(true)}>Asignar Personal y Armar Caja</Button>
                                    </Group>
                                )}
                                {pasoActual === 1 && (
                                    <Group mt="xl" justify="center">
                                        <Button size="md" color="grape" leftSection={<IconTruck size={18} />} onClick={() => setModalDespacho(true)}>Registrar Chofer y Flete</Button>
                                    </Group>
                                )}
                            </Paper>

                            <Paper withBorder p="md" radius="md" bg="white">
                                <Text fw={700} size="lg" mb="md">Contenido del Pedido</Text>
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
                                                    <Table.Td ta="center"><Text fw={900}>{d.cantidad}</Text></Table.Td>
                                                    <Table.Td ta="right"><PrecioVisual valor={d.precioUnitario} simbolo={pedido.moneda} size="sm" /></Table.Td>
                                                    <Table.Td ta="right"><PrecioVisual valor={d.precioUnitario * d.cantidad} simbolo={pedido.moneda} size="sm" fw={700} /></Table.Td>
                                                </Table.Tr>
                                            );
                                        })}
                                    </Table.Tbody>
                                </Table>
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

                                {/* 👈 BLOQUE MODIFICADO EN LA TARJETA LATERAL */}
                                <Paper withBorder p="md" radius="md" bg="gray.0">
                                    <Text fw={700} mb="xs" c="blue.9">Logística de Entrega</Text>

                                    {pedido.tipoEntrega === 'pickup' ? (
                                        <Box>
                                            <Badge color="grape" variant="light" mb="xs">Retiro en Tienda (Pickup)</Badge>
                                            <Text size="xs" c="dimmed">El cliente retira directamente en el establecimiento. No aplica costo de flete ni agencia de envíos.</Text>
                                        </Box>
                                    ) : (
                                        <Box>
                                            <Badge color="cyan" variant="light" mb="xs">Envío por Delivery / Agencia</Badge>
                                            <Text size="xs" c="dimmed">Quién retira / Agencia:</Text>
                                            <Text size="sm" fw={600} mb={6}>{pedido.quienRetira || 'Pendiente de asignar agencia'}</Text>

                                            <Text size="xs" c="dimmed">Costo de Flete (Gasto):</Text>
                                            <PrecioVisual valor={pedido.costoFlete || 0} simbolo={pedido.moneda} size="sm" fw={700} />

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
                {esCredito && (
                    <Tabs.Panel value="cxc">
                        <Grid gutter="md">
                            <Grid.Col span={{ base: 12, md: 4 }}>
                                <Paper withBorder p="md" radius="md" bg="green.0">
                                    <Text fw={700} size="lg" mb="sm" c="green.9">Estado de Cuenta</Text>
                                    <Group justify="space-between" mb={8}>
                                        <Text size="sm">Deuda Inicial:</Text>
                                        <PrecioVisual valor={cuentaPorCobrar?.montoTotal || pedido.totalFinal} simbolo={pedido.moneda} size="md" />
                                    </Group>
                                    <Group justify="space-between" mb={8}>
                                        <Text size="sm">Vencimiento:</Text>
                                        <Text size="sm" fw={600}>{cuentaPorCobrar?.fechaVencimiento || 'N/A'}</Text>
                                    </Group>
                                    <Divider my="sm" />
                                    <Group justify="space-between" mb="md">
                                        <Text size="md" fw={700}>Saldo Pendiente:</Text>
                                        <PrecioVisual valor={cuentaPorCobrar?.saldoPendiente || 0} simbolo={pedido.moneda} size="xl" fw={900} c="red.7" />
                                    </Group>
                                    <Button fullWidth color="green" disabled={cuentaPorCobrar?.saldoPendiente <= 0} onClick={() => setModalAbono(true)} leftSection={<IconCash size={18} />}>
                                        Registrar Nuevo Abono
                                    </Button>
                                </Paper>
                            </Grid.Col>
                            <Grid.Col span={{ base: 12, md: 8 }}>
                                <Paper withBorder p="md" radius="md">
                                    <Text fw={700} mb="md">Historial de Abonos (Pagos)</Text>
                                    <Table striped>
                                        <Table.Thead>
                                            <Table.Tr>
                                                <Table.Th>Fecha</Table.Th>
                                                <Table.Th>Método</Table.Th>
                                                <Table.Th>Referencia</Table.Th>
                                                <Table.Th ta="right">Monto Abonado</Table.Th>
                                            </Table.Tr>
                                        </Table.Thead>
                                        <Table.Tbody>
                                            {pedido.abonos?.length === 0 ? (
                                                <Table.Tr><Table.Td colSpan={4} ta="center">No hay abonos registrados.</Table.Td></Table.Tr>
                                            ) : (
                                                pedido.abonos?.map(abono => (
                                                    <Table.Tr key={abono.id}>
                                                        <Table.Td>{new Date(abono.fecha).toLocaleDateString()}</Table.Td>
                                                        <Table.Td>{abono.metodoPago}</Table.Td>
                                                        <Table.Td>{abono.referencia || 'S/N'}</Table.Td>
                                                        <Table.Td ta="right"><PrecioVisual valor={abono.monto} simbolo={abono.moneda} size="sm" fw={700} c="green.7" /></Table.Td>
                                                    </Table.Tr>
                                                ))
                                            )}
                                        </Table.Tbody>
                                    </Table>
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
                        <Text fw={700} mb="md">Libro Mayor Asociado a este Pedido</Text>
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
                                {pedido.movimientos?.length === 0 ? (
                                    <Table.Tr><Table.Td colSpan={6} ta="center">No hay movimientos financieros.</Table.Td></Table.Tr>
                                ) : (
                                    pedido.movimientos?.map(mov => (
                                        <Table.Tr key={mov.id}>
                                            <Table.Td>{new Date(mov.fecha).toLocaleDateString()}</Table.Td>
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
                    </Paper>
                </Tabs.Panel>

            </Tabs>

            {/* =================== MODALES =================== */}

            <Modal opened={modalEmpacar} onClose={() => setModalEmpacar(false)} title={<Title order={4} c="blue.9">Asignar Personal de Logística</Title>} centered>
                <form onSubmit={formEmpacar.onSubmit(handleConfirmarEmpaque)}>
                    <Stack gap="md">
                        <Select label="Empacador" data={opcionesEmpleados} withAsterisk {...formEmpacar.getInputProps('empacadorId')} />
                        <Select label="Etiquetador" data={opcionesEmpleados} withAsterisk {...formEmpacar.getInputProps('etiquetadorId')} />
                        <Button loading={isSubmitting} type="submit" fullWidth color="blue">Confirmar y Descontar Stock</Button>
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
                        : values;
                    handleConfirmarDespacho(body);
                })}>
                    <Stack gap="md">
                        {pedido.tipoEntrega === 'pickup' ? (
                            <Text size="sm">¿Confirmas que el cliente ha retirado su pedido en tienda? Esto cambiará el estado de despacho a <b>COMPLETADO</b>.</Text>
                        ) : (
                            <>
                                <TextInput label="Chofer / Agencia de Delivery" withAsterisk {...formDespacho.getInputProps('quienRetira')} />
                                <TextInput type="datetime-local" label="Fecha y Hora de Entrega a Agencia" withAsterisk {...formDespacho.getInputProps('fechaHoraRetiro')} />
                                <NumberInput label="Costo del Flete (Gasto)" decimalScale={2} withAsterisk {...formDespacho.getInputProps('costoFlete')} />
                                <Text size="xs" c="dimmed">ℹ️ Al registrar esto, recuerda contactar a la agencia de delivery para el despacho.</Text>
                            </>
                        )}
                        <Button loading={isSubmitting} type="submit" fullWidth color="grape">
                            {pedido.tipoEntrega === 'pickup' ? 'Marcar como Retirado' : 'Asentar Despacho y Gasto'}
                        </Button>
                    </Stack>
                </form>
            </Modal>

            {/* 🔥 MODAL DE ABONO 🔥 */}
            <Modal opened={modalAbono} onClose={() => setModalAbono(false)} title={<Title order={4} c="green.9">Registrar Pago / Abono</Title>} centered>
                <form onSubmit={formAbono.onSubmit(handleRegistrarAbono)}>
                    <Stack gap="md">
                        <Text size="sm" c="dimmed" mb="-sm">Saldo Pendiente actual: <PrecioVisual valor={cuentaPorCobrar?.saldoPendiente} simbolo={pedido.moneda} size="sm" fw={700} /></Text>

                        <Group grow>
                            <NumberInput label="Monto a Abonar" decimalScale={2} withAsterisk {...formAbono.getInputProps('montoAbono')} />
                            <Select label="Moneda de Pago" data={['USD', 'BS']} withAsterisk {...formAbono.getInputProps('monedaAbono')} />
                        </Group>
                        {formAbono.values.monedaAbono === 'BS' && pedido.moneda === 'USD' && (
                            <Text size="xs" c="orange">Se usará la tasa BCV actual de {precioBCV} Bs. para homologar el pago a USD.</Text>
                        )}
                        <Select label="Método de Pago" data={['Transferencia', 'Efectivo', 'Pago Móvil', 'Zelle']} withAsterisk {...formAbono.getInputProps('metodoPago')} />
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