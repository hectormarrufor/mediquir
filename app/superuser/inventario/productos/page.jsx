'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
    Box, Button, Group, Title, Table, Badge, ActionIcon, 
    Loader, Center, Text, Paper, Avatar, TextInput, Select, 
    ScrollArea, Stack, Flex 
} from '@mantine/core';
import { IconPlus, IconEdit, IconTrash, IconSearch, IconFilter, IconPackageOff } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';

export default function ListaProductos() {
    const router = useRouter();

    // Estados para el motor de búsqueda y filtros
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('');

    // 1. Fetch de productos
    const { data: productos, isLoading, isError } = useQuery({
        queryKey: ['productos'],
        queryFn: async () => {
            const res = await fetch('/api/productos');
            if (!res.ok) throw new Error('Error al cargar los productos');
            return res.json();
        }
    });

    // 2. Extraer categorías únicas para el Select de filtros
    // Se usa Set para no tener duplicados en la lista desplegable
    const categoriasDisponibles = Array.from(
        new Set(productos?.map(p => p.categoria?.nombre || 'Sin Categoría'))
    ).map(cat => ({ value: cat, label: cat }));

    // 3. Aplicar Filtros (Búsqueda por texto y Categoría)
    const productosFiltrados = productos?.filter(producto => {
        const matchesSearch = 
            producto.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
            (producto.codigo && producto.codigo.toLowerCase().includes(searchTerm.toLowerCase()));
        
        const catNombre = producto.categoria?.nombre || 'Sin Categoría';
        const matchesCategory = selectedCategory ? catNombre === selectedCategory : true;

        return matchesSearch && matchesCategory;
    });

    // 4. Agrupar los productos ya filtrados
    const productosAgrupados = productosFiltrados?.reduce((acc, producto) => {
        const catNombre = producto.categoria?.nombre || 'Sin Categoría';
        if (!acc[catNombre]) acc[catNombre] = [];
        acc[catNombre].push(producto);
        return acc;
    }, {});

    if (isLoading) return <Center h="50vh"><Loader size="lg" /></Center>;
    if (isError) return <Center h="50vh"><Text c="red">Ocurrió un error al cargar el inventario.</Text></Center>;

    return (
        <Box p={{ base: 'xs', sm: 'md' }}>
            {/* ENCABEZADO */}
            <Flex 
                direction={{ base: 'column', sm: 'row' }} 
                justify="space-between" 
                align={{ base: 'stretch', sm: 'center' }} 
                gap="md" 
                mb="xl"
            >
                <Title order={2} c="blue.9">Inventario de Productos</Title>
                <Button
                    leftSection={<IconPlus size={16} />}
                    onClick={() => router.push('/superuser/inventario/productos/nuevo')}
                    color="blue"
                    fullWidth={{ base: true, sm: false }}
                >
                    Nuevo Producto
                </Button>
            </Flex>

            {/* MOTOR DE BÚSQUEDA Y FILTROS */}
            <Paper p="md" withBorder shadow="sm" radius="md" mb="xl" bg="white">
                <Flex direction={{ base: 'column', sm: 'row' }} gap="md">
                    <TextInput
                        placeholder="Buscar por nombre o código..."
                        leftSection={<IconSearch size={16} />}
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.currentTarget.value)}
                        style={{ flex: 1 }}
                        clearable
                    />
                    <Select
                        placeholder="Filtrar por categoría"
                        leftSection={<IconFilter size={16} />}
                        data={categoriasDisponibles}
                        value={selectedCategory}
                        onChange={setSelectedCategory}
                        clearable
                        searchable
                        style={{ minWidth: '250px' }}
                    />
                </Flex>
            </Paper>

            {/* LISTADO AGRUPADO */}
            {Object.keys(productosAgrupados || {}).length === 0 ? (
                <Paper p="xl" withBorder ta="center" radius="md" bg="gray.0">
                    <Stack align="center" gap="xs">
                        <IconPackageOff size={48} color="gray" />
                        <Text c="dimmed" size="lg" fw={500}>No se encontraron productos.</Text>
                        <Text c="dimmed" size="sm">Intenta ajustar los filtros de búsqueda.</Text>
                    </Stack>
                </Paper>
            ) : (
                Object.entries(productosAgrupados).map(([categoria, items]) => (
                    <Box key={categoria} mb="xl">
                        {/* Título de Categoría Estilizado */}
                        <Group mb="sm" gap="xs">
                            <Box w={8} h={24} bg="blue.6" style={{ borderRadius: '4px' }} />
                            <Title order={4} c="gray.8">
                                {categoria} <Text span c="dimmed" size="sm" fw={400}>({items.length})</Text>
                            </Title>
                        </Group>

                        {/* Contenedor scrolleable para móviles */}
                        <ScrollArea offsetScrollbars>
                            <Paper withBorder radius="md" overflow="hidden">
                                <Table striped highlightOnHover verticalSpacing="sm" minWidth={800} bg="white">
                                    <Table.Thead bg="gray.0">
                                        <Table.Tr>
                                            <Table.Th w={60}>Img</Table.Th>
                                            <Table.Th>Nombre / SKU</Table.Th>
                                            <Table.Th>Precio (Ref)</Table.Th>
                                            <Table.Th>Stock Almacén</Table.Th>
                                            <Table.Th>Status</Table.Th>
                                            <Table.Th>Registrado el</Table.Th>
                                            <Table.Th ta="center">Acciones</Table.Th>
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {items.map((prod) => (
                                            <Table.Tr key={prod.id}>
                                                {/* 1. CAMBIO A AVATAR */}
                                                <Table.Td>
                                                    <Avatar 
                                                        src={prod.imagen ? `${process.env.NEXT_PUBLIC_BLOB_BASE_URL}/${prod.imagen}` : null}
                                                        alt={prod.nombre}
                                                        size="md"
                                                        radius="sm"
                                                        color="blue"
                                                    >
                                                        {prod.nombre.charAt(0).toUpperCase()}
                                                    </Avatar>
                                                </Table.Td>
                                                
                                                {/* Nombre y SKU Apilados */}
                                                <Table.Td>
                                                    <Text fw={600} size="sm">{prod.nombre}</Text>
                                                    {prod.codigo && <Text size="xs" c="dimmed">SKU: {prod.codigo}</Text>}
                                                </Table.Td>
                                                
                                                <Table.Td fw={500} c="green.7">
                                                    ${Number(prod.precio).toFixed(2)}
                                                </Table.Td>
                                                
                                                <Table.Td>
                                                    <Text fw={500}>{prod.stockAlmacen}</Text>
                                                </Table.Td>
                                                
                                                <Table.Td>
                                                    {prod.stockAlmacen <= prod.stockMinimo ? (
                                                        <Badge color="red" variant="light" size="sm">Stock Crítico</Badge>
                                                    ) : (
                                                        <Badge color="green" variant="light" size="sm">Óptimo</Badge>
                                                    )}
                                                </Table.Td>
                                                
                                                <Table.Td>
                                                    <Text size="xs" c="dimmed">
                                                        {dayjs(prod.createdAt).format('D MMM YY hh:mm a')}
                                                    </Text>
                                                </Table.Td>
                                                
                                                <Table.Td ta="center">
                                                    <Group gap="xs" justify="center" wrap="nowrap">
                                                        <ActionIcon 
                                                            variant="light" 
                                                            color="blue" 
                                                            title="Editar"
                                                            onClick={() => router.push(`/superuser/inventario/productos/${prod.id}/editar`)}
                                                        >
                                                            <IconEdit size={16} />
                                                        </ActionIcon>
                                                        <ActionIcon 
                                                            variant="light" 
                                                            color="red" 
                                                            title="Eliminar" 
                                                            onClick={() => {
                                                                if (confirm(`¿Estás seguro de eliminar el producto "${prod.nombre}"? Esta acción no se puede deshacer.`)) {
                                                                    fetch(`/api/productos/${prod.id}`, { method: 'DELETE' })
                                                                        .then(res => {
                                                                            if (!res.ok) throw new Error('Error al eliminar el producto');
                                                                            window.location.reload(); // Recarga simple para refrescar la lista
                                                                        })
                                                                        .catch(err => alert(`Error: ${err.message}`));
                                                                }
                                                            }}
                                                        >
                                                            <IconTrash size={16} />
                                                        </ActionIcon>
                                                    </Group>
                                                </Table.Td>
                                            </Table.Tr>
                                        ))}
                                    </Table.Tbody>
                                </Table>
                            </Paper>
                        </ScrollArea>
                    </Box>
                ))
            )}
        </Box>
    );
}