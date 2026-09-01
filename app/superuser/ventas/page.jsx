'use client';

import React, { useState, useEffect } from 'react';
import {
    Title, Paper, Tabs, Table, Badge, Button, Group,
    Text, ActionIcon, Modal, Stack, Divider, Box, ScrollArea, Avatar, Select, TextInput, SimpleGrid
} from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import {
    IconShoppingBag, IconBuildingStore, IconEye,
    IconArrowRight, IconReceiptTax, IconCash, IconPackage, IconCalendarEvent, IconCurrencyDollar,
    IconPrinter, IconTrash, IconWorld // 🔥 1. IMPORTAMOS EL ICONO PARA VENTAS ONLINE
} from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { notifications } from '@mantine/notifications';
import PrecioVisual from '@/app/components/ui/PrecioVisual';

export default function VentasDashboard() {
    const router = useRouter();
    const { isAdmin } = useAuth();

    const [modalDetalAbierto, setModalDetalAbierto] = useState(false);
    const [ventaSeleccionada, setVentaSeleccionada] = useState(null);
    const [activeTab, setActiveTab] = useState('detal');

    const getTodayYMD = () => {
        const d = new Date();
        return d.toISOString().split('T')[0];
    };

    const [tipoFiltro, setTipoFiltro] = useState('HOY');
    const [fechaInicio, setFechaInicio] = useState(getTodayYMD());
    const [fechaFin, setFechaFin] = useState(getTodayYMD());

    useEffect(() => {
        const hoy = new Date();
        if (tipoFiltro === 'HOY') {
            const hoyStr = hoy.toISOString().split('T')[0];
            setFechaInicio(hoyStr);
            setFechaFin(hoyStr);
        } else if (tipoFiltro === 'SEMANA') {
            const day = hoy.getDay();
            const diff = hoy.getDate() - day + (day === 0 ? -6 : 1);
            const start = new Date(hoy.setDate(diff));
            const end = new Date(start);
            end.setDate(end.getDate() + 6);
            setFechaInicio(start.toISOString().split('T')[0]);
            setFechaFin(end.toISOString().split('T')[0]);
        } else if (tipoFiltro === 'MES') {
            const start = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
            const end = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
            setFechaInicio(start.toISOString().split('T')[0]);
            setFechaFin(end.toISOString().split('T')[0]);
        }
    }, [tipoFiltro]);

    const { data: ventas, isLoading } = useQuery({
        queryKey: ['ventas-historial', fechaInicio, fechaFin],
        queryFn: async () => {
            const res = await fetch(`/api/ventas?fechaInicio=${fechaInicio}&fechaFin=${fechaFin}`);
            if (!res.ok) throw new Error('Error cargando ventas');
            return res.json();
        }
    });

    const ventasDetal = ventas?.filter(v => v.tipoVenta === 'DETAL') || [];
    const pedidosMayor = ventas?.filter(v => v.tipoVenta === 'MAYOR') || [];
    // 🔥 2. FILTRO PARA VENTAS ONLINE (Ajusta el campo según tu backend, ej: 'ONLINE' o 'WEB')
    const ventasOnline = ventas?.filter(v => v.tipoVenta === 'ONLINE' || v.origen === 'ONLINE') || [];

    const listaActual = activeTab === 'detal'
        ? ventasDetal
        : activeTab === 'mayor'
            ? pedidosMayor
            : ventasOnline;

    const getNombreTabLabel = () => {
        if (activeTab === 'detal') return 'Ventas Detal';
        if (activeTab === 'mayor') return 'Pedidos Mayor';
        return 'Ventas Online';
    };

    const totalesDinamicos = listaActual.reduce((acc, venta) => {
        const total = Number(venta.totalFinal) || 0;
        const tasa = Number(venta.tasaCambio) || 1;

        if (venta.moneda === 'BS') {
            acc.bs += total;
            acc.usd += tasa > 0 ? total / tasa : 0;
        } else {
            acc.usd += total;
            acc.bs += total * tasa;
        }
        return acc;
    }, { usd: 0, bs: 0 });

    const getImageUrl = (path) => {
        if (!path) return null;
        if (path.startsWith('http://') || path.startsWith('https://')) return path;
        const base = process.env.NEXT_PUBLIC_BLOB_BASE_URL || '';
        const cleanPath = path.replace(/^\/+/, '');
        const cleanBase = base.replace(/\/+$/, '');
        return `${cleanBase}/${cleanPath}`;
    };

    const formatearFechaHora = (fechaStr) => {
        if (!fechaStr) return '';
        return new Date(fechaStr).toLocaleString('es-VE', {
            timeZone: 'America/Caracas',
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: true
        });
    };

    const getStatusColor = (estado) => {
        switch (estado) {
            case 'CONFIRMADO': return 'green';
            case 'PENDIENTE': return 'yellow';
            case 'ANULADO': return 'red';
            case 'ENTREGADO': return 'blue';
            default: return 'gray';
        }
    };

    const getStatusPagoColor = (status) => {
        switch (status) {
            case 'PAGADO': return 'green';
            case 'PENDIENTE': return 'yellow';
            default: return 'gray';
        }
    };

    const getStatusDespachoColor = (status) => {
        switch (status) {
            case 'COMPLETADO': return 'blue';
            case 'PENDIENTE': return 'orange';
            default: return 'gray';
        }
    };

    const abrirModalDetal = (venta) => {
        setVentaSeleccionada(venta);
        setModalDetalAbierto(true);
    };

    const handleEliminarVenta = async (ventaId) => {
        if (!window.confirm("⚠️ ¿Estás seguro de eliminar esta venta? Se devolverá el stock, se borrarán los ingresos de la caja y se perderá el correlativo. Esta acción no se puede deshacer.")) {
            return;
        }

        try {
            const res = await fetch(`/api/ventas/${ventaId}`, {
                method: 'DELETE'
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Error al eliminar');

            notifications.show({
                title: 'Venta Eliminada',
                message: 'La venta ha sido borrada y el stock fue devuelto al inventario.',
                color: 'red',
                icon: <IconTrash size={16} />
            });

            window.location.reload();
        } catch (error) {
            notifications.show({ title: 'Error', message: error.message, color: 'red' });
        }
    };

    return (
        <Box p="md">
            <Group justify="space-between" mb="md">
                <Title order={2} c="blue.9">Gestión de Ventas y Pedidos</Title>
            </Group>

            <Paper p="sm" mb="md" withBorder radius="md" bg="blue.0">
                <Group justify="space-between" wrap="wrap">
                    <Group gap="sm" align="center">
                        <IconCalendarEvent size={20} color="#1971C2" />
                        <Text fw={600} c="blue.9">Periodo a Consultar:</Text>
                        <Select
                            data={[
                                { value: 'HOY', label: 'Día de Hoy' },
                                { value: 'SEMANA', label: 'Esta Semana' },
                                { value: 'MES', label: 'Este Mes' },
                                { value: 'RANGO', label: 'Rango Personalizado' }
                            ]}
                            value={tipoFiltro}
                            onChange={setTipoFiltro}
                            w={200}
                        />
                    </Group>

                    <Group gap="xs">
                        <TextInput
                            type="date" size="sm"
                            label="Desde:" labelProps={{ style: { display: 'inline', marginRight: 8 } }}
                            value={fechaInicio}
                            onChange={(e) => {
                                setFechaInicio(e.currentTarget.value);
                                setTipoFiltro('RANGO');
                            }}
                        />
                        <TextInput
                            type="date" size="sm"
                            label="Hasta:" labelProps={{ style: { display: 'inline', marginRight: 8 } }}
                            value={fechaFin}
                            onChange={(e) => {
                                setFechaFin(e.currentTarget.value);
                                setTipoFiltro('RANGO');
                            }}
                        />
                    </Group>
                </Group>
            </Paper>

            {isAdmin && (
                <SimpleGrid cols={{ base: 1, sm: 2 }} mb="md">
                    <Paper withBorder p="md" radius="md" bg="green.0">
                        <Group justify="space-between">
                            <Box>
                                <Text size="xs" c="dimmed" fw={700} tt="uppercase">
                                    Total Dinámico ({getNombreTabLabel()}) - USD
                                </Text>
                                <Text size="xl" fw={900} c="green.9" mt={4}>
                                    <PrecioVisual valor={totalesDinamicos.usd} simbolo="$" size="xl" fw={900} c="green.9" />
                                </Text>
                            </Box>
                            <IconCurrencyDollar size={32} color="#2b8a3e" />
                        </Group>
                    </Paper>

                    <Paper withBorder p="md" radius="md" bg="teal.0">
                        <Group justify="space-between">
                            <Box>
                                <Text size="xs" c="dimmed" fw={700} tt="uppercase">
                                    Total Dinámico ({getNombreTabLabel()}) - BS
                                </Text>
                                <Text size="xl" fw={900} c="teal.9" mt={4}>
                                    <PrecioVisual valor={totalesDinamicos.bs} simbolo="Bs" size="xl" fw={900} c="teal.9" />
                                </Text>
                            </Box>
                            <IconCurrencyDollar size={32} color="#0b7285" />
                        </Group>
                    </Paper>
                </SimpleGrid>
            )}

            <Paper withBorder radius="md" p="0" bg="white">
                <Tabs value={activeTab} onChange={setActiveTab} color="blue">
                    <Tabs.List px="md" pt="md">
                        <Tabs.Tab value="detal" leftSection={<IconBuildingStore size={18} />}>
                            Ventas al Detal (Mostrador)
                        </Tabs.Tab>
                        <Tabs.Tab value="mayor" leftSection={<IconShoppingBag size={18} />}>
                            Pedidos al Mayor
                        </Tabs.Tab>
                        {/* 🔥 3. NUEVO TAB DE VENTAS ONLINE */}
                        <Tabs.Tab value="online" leftSection={<IconWorld size={18} />}>
                            Ventas Online
                        </Tabs.Tab>
                    </Tabs.List>

                    {/* Panel Detal */}
                    <Tabs.Panel value="detal" p="md">
                        <ScrollArea>
                            <Table striped highlightOnHover verticalSpacing="sm">
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>Fecha y Hora</Table.Th>
                                        <Table.Th>Documento</Table.Th>
                                        <Table.Th>Vendedor</Table.Th>
                                        <Table.Th>Artículos</Table.Th>
                                        <Table.Th>Moneda</Table.Th>
                                        <Table.Th>Total</Table.Th>
                                        <Table.Th>Estado</Table.Th>
                                        <Table.Th align="center">Acción</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {isLoading ? (
                                        <Table.Tr><Table.Td colSpan={8} align="center" py="xl">Cargando datos del servidor...</Table.Td></Table.Tr>
                                    ) : ventasDetal.length === 0 ? (
                                        <Table.Tr><Table.Td colSpan={8} align="center" py="xl">No hay ventas al detal registradas en este periodo.</Table.Td></Table.Tr>
                                    ) : (
                                        ventasDetal.map((venta) => (
                                            <Table.Tr key={venta.id}>
                                                <Table.Td>{formatearFechaHora(venta.createdAt)}</Table.Td>
                                                <Table.Td fw={600}>{venta.numeroDocumento}</Table.Td>
                                                <Table.Td>
                                                    {venta.vendedor?.empleado
                                                        ? `${venta.vendedor.empleado.nombre} ${venta.vendedor.empleado.apellido}`
                                                        : venta.vendedor?.user || 'Sistema'}
                                                </Table.Td>
                                                <Table.Td>{venta.detalles?.reduce((acc, d) => acc + d.cantidad, 0)} items</Table.Td>
                                                <Table.Td><Badge variant="light" color={venta.moneda === 'BS' ? 'teal' : 'gray'}>{venta.moneda}</Badge></Table.Td>
                                                <Table.Td>
                                                    <PrecioVisual valor={venta.totalFinal} simbolo={venta.moneda === 'BS' ? 'Bs' : '$'} size="sm" fw={700} />
                                                </Table.Td>
                                                <Table.Td>
                                                    <Badge color={getStatusColor(venta.estado)}>{venta.estado}</Badge>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Group gap="xs" wrap="nowrap">
                                                        <Button size="xs" variant="light" rightSection={<IconEye size={14} />} onClick={() => abrirModalDetal(venta)}>
                                                            Ver Detalle
                                                        </Button>
                                                        <ActionIcon
                                                            size="md" variant="light" color="gray" title="Imprimir Recibo"
                                                            onClick={() => window.open(`/superuser/ventas/imprimir/${venta.numeroDocumento}`, '_blank')}
                                                        >
                                                            <IconPrinter size={16} />
                                                        </ActionIcon>
                                                        {isAdmin && (
                                                            <ActionIcon
                                                                size="md" variant="light" color="red" title="Eliminar Venta Absolutamente"
                                                                onClick={() => handleEliminarVenta(venta.id)}
                                                            >
                                                                <IconTrash size={16} />
                                                            </ActionIcon>
                                                        )}
                                                    </Group>
                                                </Table.Td>
                                            </Table.Tr>
                                        ))
                                    )}
                                </Table.Tbody>
                            </Table>
                        </ScrollArea>
                    </Tabs.Panel>

                    {/* Panel Mayor */}
                    <Tabs.Panel value="mayor" p="md">
                        <ScrollArea>
                            <Table striped highlightOnHover verticalSpacing="sm">
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>Fecha y Hora</Table.Th>
                                        <Table.Th>Documento</Table.Th>
                                        <Table.Th>Vendedor</Table.Th>
                                        <Table.Th>Cliente</Table.Th>
                                        <Table.Th>Pago</Table.Th>
                                        <Table.Th>Total</Table.Th>
                                        <Table.Th>Estado</Table.Th>
                                        <Table.Th align="center">Acción</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {isLoading ? (
                                        <Table.Tr><Table.Td colSpan={8} align="center" py="xl">Cargando pedidos del servidor...</Table.Td></Table.Tr>
                                    ) : pedidosMayor.length === 0 ? (
                                        <Table.Tr><Table.Td colSpan={8} align="center" py="xl">No hay pedidos al mayor en este periodo.</Table.Td></Table.Tr>
                                    ) : (
                                        pedidosMayor.map((pedido) => (
                                            <Table.Tr key={pedido.id}>
                                                <Table.Td>{formatearFechaHora(pedido.createdAt)}</Table.Td>
                                                <Table.Td fw={600}>{pedido.numeroDocumento}</Table.Td>
                                                <Table.Td>
                                                    {pedido.vendedor?.empleado
                                                        ? `${pedido.vendedor.empleado.nombre} ${pedido.vendedor.empleado.apellido}`
                                                        : pedido.vendedor?.user || 'Sistema'}
                                                </Table.Td>
                                                <Table.Td>{pedido.cliente?.nombre || 'Desconocido'}</Table.Td>
                                                <Table.Td>
                                                    <Badge variant="dot" color={pedido.condicionPago === 'Contado' ? 'green' : 'orange'}>
                                                        {pedido.condicionPago}
                                                    </Badge>
                                                </Table.Td>
                                                <Table.Td>
                                                    <PrecioVisual valor={pedido.totalFinal} simbolo={pedido.moneda === 'BS' ? 'Bs' : '$'} size="sm" fw={700} />
                                                </Table.Td>
                                                <Table.Td>
                                                    <Badge color={getStatusColor(pedido.estado)}>{pedido.estado}</Badge>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Group gap="xs" wrap="nowrap">
                                                        <Button
                                                            size="xs" color="grape"
                                                            rightSection={<IconArrowRight size={14} />}
                                                            onClick={() => router.push(`/superuser/ventas/${pedido.id}`)}
                                                        >
                                                            Gestionar
                                                        </Button>
                                                        <ActionIcon
                                                            size="md" variant="light" color="gray" title="Imprimir Nota/Factura"
                                                            onClick={() => window.open(`/superuser/ventas/imprimir/${pedido.id}`, '_blank')}
                                                        >
                                                            <IconPrinter size={16} />
                                                        </ActionIcon>
                                                    </Group>
                                                </Table.Td>
                                            </Table.Tr>
                                        ))
                                    )}
                                </Table.Tbody>
                            </Table>
                        </ScrollArea>
                    </Tabs.Panel>

                    {/* 🔥 NUEVO PANEL DE VENTAS ONLINE */}
                    <Tabs.Panel value="online" p="md">
                        <ScrollArea>
                            <Table striped highlightOnHover verticalSpacing="sm">
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>Fecha y Hora</Table.Th>
                                        <Table.Th>Documento</Table.Th>
                                        <Table.Th>Cliente Web</Table.Th>
                                        <Table.Th>Tipo de Entrega</Table.Th>
                                        <Table.Th>Pago</Table.Th>
                                        <Table.Th>Despacho</Table.Th>
                                        <Table.Th>Total</Table.Th>
                                        <Table.Th align="center">Acción</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {isLoading ? (
                                        <Table.Tr><Table.Td colSpan={8} align="center" py="xl">Cargando ventas online...</Table.Td></Table.Tr>
                                    ) : ventasOnline.length === 0 ? (
                                        <Table.Tr><Table.Td colSpan={8} align="center" py="xl">No hay ventas online registradas en este periodo.</Table.Td></Table.Tr>
                                    ) : (
                                        ventasOnline.map((venta) => {
                                            // Asumiendo que guardas el tipo como 'pickup' o 'DELIVERY' (o 'envio')
                                            const esPickup = venta.tipoEntrega === 'pickup' || venta.metodoEnvio === 'pickup';

                                            return (
                                                <Table.Tr key={venta.id}>
                                                    <Table.Td>{formatearFechaHora(venta.createdAt)}</Table.Td>
                                                    <Table.Td fw={600}>{venta.numeroDocumento}</Table.Td>
                                                    <Table.Td>{venta.cliente?.nombre || venta.clienteNombre || 'Cliente Web'}</Table.Td>
                                                    <Table.Td>
                                                        <Stack gap={2}>
                                                            <Badge variant="outline" color={esPickup ? 'grape' : 'cyan'}>
                                                                {esPickup ? '🏪 Pickup (Retiro en Tienda)' : '🚚 Delivery'}
                                                            </Badge>
                                                            {!esPickup && (
                                                                <Text size="xs" c="dimmed" fs="italic">
                                                                    ⚠️ Contactar a agencia de delivery
                                                                </Text>
                                                            )}
                                                        </Stack>
                                                    </Table.Td>
                                                    <Table.Td>
                                                        {/* statusPago: PAGADO o PENDIENTE */}
                                                        <Badge color={getStatusPagoColor(venta.statusPago)}>
                                                            {venta.statusPago || 'PENDIENTE'}
                                                        </Badge>
                                                    </Table.Td>
                                                    <Table.Td>
                                                        {/* statusDespacho: COMPLETADO o PENDIENTE */}
                                                        <Badge color={getStatusDespachoColor(venta.statusDespacho)}>
                                                            {venta.statusDespacho || 'PENDIENTE'}
                                                        </Badge>
                                                    </Table.Td>
                                                    <Table.Td>
                                                        <PrecioVisual valor={venta.totalFinal} simbolo={venta.moneda === 'BS' ? 'Bs' : '$'} size="sm" fw={700} />
                                                    </Table.Td>
                                                    <Table.Td>
                                                        <Group gap="xs" wrap="nowrap">
                                                            <Button
                                                                size="xs" color="cyan"
                                                                rightSection={<IconArrowRight size={14} />}
                                                                onClick={() => router.push(`/superuser/ventas/${venta.id}`)}
                                                            >
                                                                Gestionar
                                                            </Button>
                                                            <ActionIcon
                                                                size="md" variant="light" color="gray" title="Imprimir Comprobante Web"
                                                                onClick={() => window.open(`/superuser/ventas/imprimir/${venta.numeroDocumento}`, '_blank')}
                                                            >
                                                                <IconPrinter size={16} />
                                                            </ActionIcon>
                                                            {isAdmin && (
                                                                <ActionIcon
                                                                    size="md" variant="light" color="red" title="Eliminar Venta Absolutamente"
                                                                    onClick={() => handleEliminarVenta(venta.id)}
                                                                >
                                                                    <IconTrash size={16} />
                                                                </ActionIcon>
                                                            )}
                                                        </Group>
                                                    </Table.Td>
                                                </Table.Tr>
                                            );
                                        })
                                    )}
                                </Table.Tbody>
                            </Table>
                        </ScrollArea>
                    </Tabs.Panel>
                </Tabs>
            </Paper>

            <Modal
                opened={modalDetalAbierto}
                onClose={() => setModalDetalAbierto(false)}
                title={<Title order={4} component="div">Detalle de Venta</Title>}
                size="lg"
            >
                {ventaSeleccionada && (
                    <Stack gap="md">
                        <Group justify="space-between">
                            <Box>
                                <Text size="sm" c="dimmed">Documento / Fecha</Text>
                                <Text fw={700} size="lg">{ventaSeleccionada.numeroDocumento}</Text>
                                <Text size="xs" c="dimmed">{formatearFechaHora(ventaSeleccionada.createdAt)}</Text>
                            </Box>
                            <Badge size="lg" color={getStatusColor(ventaSeleccionada.estado)}>{ventaSeleccionada.estado}</Badge>
                        </Group>

                        <Divider />

                        <Text fw={600} size="sm" c="blue.9"><IconReceiptTax size={16} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Productos Vendidos</Text>
                        <Table striped>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Producto</Table.Th>
                                    <Table.Th>Cant.</Table.Th>
                                    <Table.Th>Precio</Table.Th>
                                    <Table.Th>Subtotal</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {ventaSeleccionada.detalles?.map(d => {
                                    const imgFinal = getImageUrl(d.producto?.imagen) || getImageUrl(d.producto?.marca?.imagen);

                                    const nombreConMarca = d.producto?.marca?.nombre
                                        ? `${d.producto.nombre} - ${d.producto.marca.nombre}`
                                        : d.producto?.nombre;

                                    return (
                                        <Table.Tr key={d.id}>
                                            <Table.Td>
                                                <Group gap="sm" wrap="nowrap">
                                                    <Avatar src={imgFinal} size="sm" radius="sm">
                                                        <IconPackage size={14} />
                                                    </Avatar>
                                                    <Box>
                                                        <Text fw={500} size="sm" lineClamp={1}>
                                                            {nombreConMarca}
                                                        </Text>
                                                        <Text size="xs" c="dimmed" lineClamp={1}>
                                                            SKU: {d.producto?.codigo}
                                                        </Text>
                                                    </Box>
                                                </Group>
                                            </Table.Td>
                                            <Table.Td>{d.cantidad}</Table.Td>
                                            <Table.Td><PrecioVisual valor={d.precioUnitario} simbolo={ventaSeleccionada.moneda === 'BS' ? 'Bs' : '$'} size="sm" /></Table.Td>
                                            <Table.Td><PrecioVisual valor={d.subtotal} simbolo={ventaSeleccionada.moneda === 'BS' ? 'Bs' : '$'} size="sm" fw={600} /></Table.Td>
                                        </Table.Tr>
                                    );
                                })}
                            </Table.Tbody>
                        </Table>

                        <Group justify="space-between" align="flex-end" mt="sm">
                            <Box>
                                <Text size="sm" c="dimmed">Tasa Aplicada: {ventaSeleccionada.tasaCambio} Bs/$</Text>
                            </Box>
                            <Stack gap={0} align="flex-end">
                                <Text size="sm" c="dimmed">Subtotal: <PrecioVisual valor={ventaSeleccionada.subtotal} simbolo={ventaSeleccionada.moneda === 'BS' ? 'Bs' : '$'} size="sm" /></Text>
                                <Text size="sm" c="dimmed">IVA: <PrecioVisual valor={ventaSeleccionada.montoIva} simbolo={ventaSeleccionada.moneda === 'BS' ? 'Bs' : '$'} size="sm" /></Text>
                                <Text size="lg" fw={800} c="blue.9">Total: <PrecioVisual valor={ventaSeleccionada.totalFinal} simbolo={ventaSeleccionada.moneda === 'BS' ? 'Bs' : '$'} size="lg" /></Text>
                            </Stack>
                        </Group>

                        <Divider />

                        <Text fw={600} size="sm" c="green.8"><IconCash size={16} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Movimientos Financieros Generados</Text>
                        {ventaSeleccionada.movimientos?.length === 0 ? (
                            <Text size="sm" c="dimmed" fs="italic">No hay movimientos registrados (Venta a Crédito o Anulada).</Text>
                        ) : (
                            <Stack gap="xs">
                                {ventaSeleccionada.movimientos?.map(mov => (
                                    <Paper key={mov.id} p="xs" withBorder bg="gray.0">
                                        <Group justify="space-between">
                                            <Box>
                                                <Text size="xs" fw={600}>{mov.descripcion}</Text>
                                                <Text size="xs" c="dimmed">{mov.metodoPago} {mov.referencia ? `(Ref: ${mov.referencia})` : ''}</Text>
                                            </Box>
                                            <Badge color="green" variant="light">
                                                + {ventaSeleccionada.moneda === 'BS' ? `${mov.montoVes} Bs` : `${mov.montoUsd} $`}
                                            </Badge>
                                        </Group>
                                    </Paper>
                                ))}
                            </Stack>
                        )}
                    </Stack>
                )}
            </Modal>
        </Box>
    );
}