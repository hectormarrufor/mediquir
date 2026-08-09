'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { MantineReactTable, useMantineReactTable } from 'mantine-react-table';
import {
    Button, Box, Flex, ActionIcon, Text, Menu, Modal,
    MantineProvider, Badge, Card, Group, Stack, TextInput,
    Select, Collapse
} from '@mantine/core';
import {
    IconEdit, IconTrash, IconEye, IconPlus, IconRefresh,
    IconSearch, IconFilter, IconFileInvoice, IconTruckDelivery
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';

const STATUS_COLORS = {
    'Pendiente': 'yellow',
    'Parcial': 'blue',
    'Completado': 'green',
    'Cancelado': 'red'
};

// --- MENÚ DE ACCIONES ---
const PedidoActionsMenu = ({ pedido, router, openDeleteModal, setSelectedPedido }) => (
    <Box onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
        <Menu position="bottom-end" shadow="md" width={200}>
            <Menu.Target>
                <ActionIcon variant="light" size="md" aria-label="Acciones">
                    <IconEye size={18} />
                </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
                <Menu.Label>Operaciones</Menu.Label>
                <Menu.Item
                    leftSection={<IconTruckDelivery size={16} />}
                    color="blue"
                    onClick={() => router.push(`/superuser/pedidos/${pedido.id}/despachar`)}
                >
                    Gestionar Despacho
                </Menu.Item>
                <Menu.Item
                    leftSection={<IconEdit size={16} />}
                    onClick={() => router.push(`/superuser/pedidos/${pedido.id}/editar`)}
                >
                    Modificar Cabecera
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item
                    leftSection={<IconTrash size={16} />}
                    color="red"
                    onClick={() => { setSelectedPedido(pedido); openDeleteModal(); }}
                >
                    Anular Pedido
                </Menu.Item>
            </Menu.Dropdown>
        </Menu>
    </Box>
);

// --- TARJETA MÓVIL ---
const MobilePedidoCard = ({ pedido, actions, onClick }) => {
    return (
        <Card
            shadow="sm" padding="lg" radius="md" withBorder mb="sm"
            onClick={onClick}
            style={{ cursor: 'pointer', transition: 'background-color 0.2s ease' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
        >
            <Card.Section withBorder inheritPadding py="xs">
                <Group justify="space-between" wrap="nowrap">
                    <Group gap="xs">
                        <IconFileInvoice size={24} color="gray" />
                        <div>
                            <Text fw={700} size="sm" lineClamp={1}>Pedido #{String(pedido.id).padStart(5, '0')}</Text>
                            <Badge size="xs" color={STATUS_COLORS[pedido.statusDespacho]} variant="light">
                                {pedido.statusDespacho}
                            </Badge>
                        </div>
                    </Group>
                    <div onClick={(e) => e.stopPropagation()}>{actions}</div>
                </Group>
            </Card.Section>

            <Stack mt="md" gap="xs">
                <Text size="sm" fw={600} c="blue.9">{pedido.cliente?.nombre || pedido.cliente?.razonSocial}</Text>
                <Group justify="space-between">
                    <Text size="sm" c="dimmed">Retira: {pedido.quienRetira}</Text>
                    <Text size="sm" fw={700}>${Number(pedido.total).toFixed(2)}</Text>
                </Group>
                <Text size="xs" c="dimmed">
                    Fecha Retiro: {dayjs(pedido.fechaHoraRetiro).format('D MMM YY hh:mm a')}
                </Text>
            </Stack>
        </Card>
    );
};

export default function PedidosTable() {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    // Estados Responsivos y Filtros
    const isMobile = useMediaQuery('(max-width: 768px)');
    const [mobileSearch, setMobileSearch] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [filterStatus, setFilterStatus] = useState(null);

    // Modales
    const [deleteModalOpened, { open: openDeleteModal, close: closeDeleteModal }] = useDisclosure(false);
    const [selectedPedido, setSelectedPedido] = useState(null);

    const statusOptions = ['Pendiente', 'Parcial', 'Completado', 'Cancelado'];

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/pedidos');
            if (!response.ok) throw new Error('Error fetching data');
            const result = await response.json();
            setData(result);
        } catch (err) {
            notifications.show({ title: 'Error', message: 'No se pudieron cargar los pedidos.', color: 'red' });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const columns = useMemo(() => [
        {
            accessorKey: 'id', header: 'Nro Pedido', size: 100,
            Cell: ({ cell, row }) => {
                // Evaluamos si requiere atención
                const requiereAtencion = row.original.renglones?.some(r => {
                    const pendiente = r.cantidadSolicitada - r.cantidadDespachada;
                    return pendiente > 0 && r.producto && pendiente > Number(r.producto.stockAlmacen);
                });

                return (
                    <Group gap={4} wrap="nowrap">
                        <Text fw={700}>#{String(cell.getValue()).padStart(5, '0')}</Text>
                        {requiereAtencion && (
                            <Tooltip label="Requiere atención: Stock insuficiente para cubrir lo solicitado">
                                <IconAlertTriangle size={16} color="red" />
                            </Tooltip>
                        )}
                    </Group>
                );
            }
        },
        {
            accessorKey: 'cliente', header: 'Cliente', size: 250,
            accessorFn: (row) => row.cliente?.nombre || row.cliente?.razonSocial || 'Cliente Eliminado',
            Cell: ({ cell, row }) => (
                <Box>
                    <Text fw={600} size="sm">{cell.getValue()}</Text>
                    <Text size="xs" c="dimmed">{row.original.cliente?.identificacion}</Text>
                </Box>
            )
        },
        {
            accessorKey: 'fechaHoraRetiro', header: 'Fecha de Retiro', size: 180,
            Cell: ({ cell }) => <Text size="sm">{dayjs(cell.getValue()).format('DD/MM/YYYY hh:mm A')}</Text>
        },
        {
            accessorKey: 'total', header: 'Total (Ref)', size: 120,
            Cell: ({ cell }) => <Text fw={600} c="green.7">${Number(cell.getValue()).toFixed(2)}</Text>
        },
        {
            accessorKey: 'statusDespacho', header: 'Estatus', size: 130,
            filterVariant: 'select',
            filterSelectOptions: statusOptions,
            Cell: ({ cell }) => (
                <Badge color={STATUS_COLORS[cell.getValue()]} variant="light">{cell.getValue()}</Badge>
            )
        },
    ], []);

    const table = useMantineReactTable({
        columns,
        data,
        state: { isLoading: loading },
        enableRowActions: true,
        renderRowActions: ({ row }) => (
            <PedidoActionsMenu
                pedido={row.original} router={router} openDeleteModal={openDeleteModal}
                setSelectedPedido={setSelectedPedido}
            />
        ),
        mantineTableBodyRowProps: ({ row }) => {
            // Lógica para detectar si hay déficit de stock
            const requiereAtencion = row.original.renglones?.some(r => {
                const pendiente = r.cantidadSolicitada - r.cantidadDespachada;
                return pendiente > 0 && r.producto && pendiente > Number(r.producto.stockAlmacen);
            });

            return {
                onClick: () => router.push(`/superuser/pedidos/${row.original.id}`),
                style: {
                    cursor: 'pointer',
                    // Fondo rojo muy sutil si requiere atención y no está completado/cancelado
                    backgroundColor: requiereAtencion && row.original.statusDespacho !== 'Completado' && row.original.statusDespacho !== 'Cancelado'
                        ? '#fff5f5' // Rojo clarito de Mantine (red.0)
                        : undefined
                },
            };
        },
    });
    // Filtrado Móvil
    const filteredDataMobile = useMemo(() => {
        let result = data;
        if (mobileSearch) {
            const lowerSearch = mobileSearch.toLowerCase();
            result = result.filter(p =>
                String(p.id).includes(lowerSearch) ||
                (p.cliente?.nombre && p.cliente.nombre.toLowerCase().includes(lowerSearch))
            );
        }
        if (filterStatus) {
            result = result.filter(p => p.statusDespacho === filterStatus);
        }
        return result;
    }, [data, mobileSearch, filterStatus]);

    const handleDelete = async () => {
        try {
            const res = await fetch(`/api/pedidos/${selectedPedido.id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Error al anular');
            notifications.show({ title: 'Éxito', message: 'Pedido anulado correctamente', color: 'green' });
            fetchData();
        } catch (error) {
            notifications.show({ title: 'Error', message: 'No se pudo anular el pedido', color: 'red' });
        } finally {
            closeDeleteModal();
        }
    };

    return (
        <>
            <MantineProvider>
                <Flex justify="space-between" mb="md" align="center" direction={isMobile ? 'column' : 'row'} gap="sm">
                    <Button
                        leftSection={<IconPlus size={20} />} fullWidth={isMobile} color="blue.9"
                        onClick={() => router.push('/superuser/pedidos/nuevo')}
                    >
                        {isMobile ? 'Nuevo Pedido' : 'Crear Nuevo Pedido'}
                    </Button>

                    <Flex gap="xs" w={isMobile ? '100%' : 'auto'} align="center">
                        {isMobile && (
                            <>
                                <TextInput
                                    placeholder="Buscar por Nro o Cliente..." leftSection={<IconSearch size={16} />}
                                    value={mobileSearch} onChange={(e) => setMobileSearch(e.currentTarget.value)} style={{ flex: 1 }}
                                />
                                <ActionIcon variant={showFilters ? "filled" : "light"} color="blue" size="lg" onClick={() => setShowFilters(!showFilters)}>
                                    <IconFilter size={20} />
                                </ActionIcon>
                            </>
                        )}
                        <ActionIcon onClick={fetchData} variant="light" size="lg">
                            <IconRefresh size={24} />
                        </ActionIcon>
                    </Flex>
                </Flex>

                {isMobile && (
                    <Collapse in={showFilters}>
                        <Card withBorder shadow="sm" radius="md" mb="md" p="sm">
                            <Select
                                label="Estatus de Despacho" placeholder="Todos" data={statusOptions}
                                value={filterStatus} onChange={setFilterStatus} clearable
                            />
                        </Card>
                    </Collapse>
                )}

                {isMobile ? (
                    <Box pb="xl">
                        {loading && <Text align="center">Cargando...</Text>}
                        {!loading && filteredDataMobile.length === 0 && (
                            <Text align="center" c="dimmed" mt="xl">No se encontraron pedidos.</Text>
                        )}
                        {filteredDataMobile.map((pedido) => (
                            <MobilePedidoCard
                                key={pedido.id} pedido={pedido}
                                onClick={() => router.push(`/superuser/pedidos/${pedido.id}`)}
                                actions={
                                    <PedidoActionsMenu
                                        pedido={pedido} router={router} openDeleteModal={openDeleteModal}
                                        setSelectedPedido={setSelectedPedido}
                                    />
                                }
                            />
                        ))}
                    </Box>
                ) : (
                    <MantineReactTable table={table} />
                )}
            </MantineProvider>

            <Modal opened={deleteModalOpened} onClose={closeDeleteModal} title="Confirmar Anulación" centered>
                <Text>¿Estás seguro de anular el Pedido <Text span fw={700} c="red">#{String(selectedPedido?.id).padStart(5, '0')}</Text>?</Text>
                <Text size="sm" c="dimmed" mt="sm">Esta acción devolverá los renglones asociados y no se puede deshacer.</Text>
                <Flex justify="flex-end" gap="md" mt="md">
                    <Button variant="default" onClick={closeDeleteModal}>Cancelar</Button>
                    <Button color="red" onClick={handleDelete}>Anular Pedido</Button>
                </Flex>
            </Modal>
        </>
    );
}