'use client';

import React, { useState } from 'react';
import { Container, Title, Text, Group, Box, Center, Loader, SimpleGrid, Tabs, Paper, Stack, Button, Badge } from '@mantine/core';
import { IconFlame, IconTag, IconX, IconFilter } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import ProductCard from './ProductCard';

export default function BestSellersSection({ searchQuery, selectedCategory, onClearFilters }) {
    const [activeTab, setActiveTab] = useState('mas_vendidos');

    const { data: productos, isLoading } = useQuery({
        queryKey: ['productos-landing'],
        queryFn: async () => {
            const res = await fetch('/api/productos');
            if (!res.ok) throw new Error('Error al cargar productos');
            return res.json();
        }
    });

    if (isLoading) return <Center py={100}><Loader size="xl" color="#0B1B3D" /></Center>;
    if (!productos || productos.length === 0) return null;

    const hasActiveFilter = Boolean(searchQuery || selectedCategory);

    // --- LÓGICA DE FILTRADO DINÁMICO ---
    let productosFiltrados = productos;

    if (selectedCategory) {
        productosFiltrados = productosFiltrados.filter(p =>
            p.categoriaId === selectedCategory.id ||
            p.categoria?.id === selectedCategory.id ||
            p.categoria?.nombre?.toLowerCase() === selectedCategory.nombre?.toLowerCase()
        );
    }
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        productosFiltrados = productosFiltrados.filter(p =>
            p.nombre?.toLowerCase().includes(query) ||
            p.marca?.nombre?.toLowerCase().includes(query) ||
            p.presentacion?.toLowerCase().includes(query) ||
            // Buscamos dentro del array de la asociación 'tags'
            p.tags?.some(tag => tag.nombre?.toLowerCase().includes(query))
        );
    }

    // Si NO hay filtro activo, aplica la división normal de Tabs
    const masVendidos = productosFiltrados.slice(0, 10);
    const ofertas = productosFiltrados.filter(p => Number(p.porcentajeDescuento) > 0).slice(0, 10);
    const productosMostrados = hasActiveFilter
        ? productosFiltrados
        : (activeTab === 'mas_vendidos' ? masVendidos : ofertas);

    return (
        <Box py={{ base: 60, md: 100 }} style={{
            background: 'linear-gradient(135deg, rgba(7, 27, 44, 0.92) 0%, rgba(43, 115, 163, 0.67) 100%)',
        }}>
            <Container size="xl">

                <Stack align="center" ta="center" mb={40}>
                    <Title order={2} c="#0B1B3D" size="h1" fw={900}>
                        {hasActiveFilter
                            ? 'Resultados Encontrados'
                            : (activeTab === 'mas_vendidos' ? 'Selección Destacada' : 'Ofertas Exclusivas')}
                    </Title>

                    {!hasActiveFilter ? (
                        <Text c="dimmed" size="lg" maw={600}>
                            {activeTab === 'mas_vendidos'
                                ? 'Los insumos preferidos por nuestros clientes con la mejor calidad del mercado.'
                                : 'Aprovecha estos descuentos por tiempo limitado antes de que se agoten.'}
                        </Text>
                    ) : (
                        <Group gap="xs" justify="center" mt="xs">
                            <Text size="md" c="dimmed">Mostrando productos para:</Text>
                            {selectedCategory && (
                                <Badge size="lg" color="#0B1B3D" radius="xl" leftSection={<IconFilter size={14} />}>
                                    Categoría: {selectedCategory.nombre}
                                </Badge>
                            )}
                            {searchQuery && (
                                <Badge size="lg" color="#F93200" radius="xl">
                                    Búsqueda: "{searchQuery}"
                                </Badge>
                            )}
                            <Button
                                variant="subtle"
                                color="red"
                                size="xs"
                                radius="xl"
                                leftSection={<IconX size={14} />}
                                onClick={onClearFilters}
                            >
                                Limpiar filtro
                            </Button>
                        </Group>
                    )}
                </Stack>

                {/* TABS DE SELECCIÓN (Visibles únicamente cuando no hay filtro activo) */}
                {!hasActiveFilter && (
                    <Box maw={{ base: '100%', sm: 600 }} mx="auto" mb={60}>
                        <Tabs value={activeTab} onChange={setActiveTab} variant="pills" radius="xl" color={activeTab === 'mas_vendidos' ? "blue.9" : "red.7"}>
                            <Tabs.List grow bg="white" p={6} style={{ borderRadius: '50px', border: '1px solid #E9ECEF', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
                                <Tabs.Tab value="mas_vendidos" leftSection={<IconFlame size={18} />} fw={700} size="md" h={50}>
                                    Más Vendidos
                                </Tabs.Tab>
                                {ofertas.length > 0 && (
                                    <Tabs.Tab value="ofertas" leftSection={<IconTag size={18} />} fw={700} size="md" h={50}>
                                        Ofertas Especiales
                                    </Tabs.Tab>
                                )}
                            </Tabs.List>
                        </Tabs>
                    </Box>
                )}

                {/* GRID RESPONSIVO */}
                {productosMostrados.length > 0 ? (
                    <SimpleGrid cols={{ base: 1, xs: 2, sm: 3, md: 4, lg: 5 }} spacing={{ base: 'md', md: 'xl' }}>
                        {productosMostrados.map(prod => (
                            <ProductCard key={`prod-${prod.id}`} product={prod} />
                        ))}
                    </SimpleGrid>
                ) : (
                    <Paper p="xl" ta="center" radius="md" bg="white" withBorder style={{ maxWidth: 500, margin: '0 auto' }}>
                        <Text fw={600} c="#0B1B3D" size="lg" mb="xs">Sin resultados</Text>
                        <Text c="dimmed" size="sm" mb="md">
                            No encontramos insumos que coincidan con tus criterios de búsqueda.
                        </Text>
                        <Button color="#0B1B3D" radius="xl" onClick={onClearFilters}>
                            Ver todos los productos
                        </Button>
                    </Paper>
                )}

            </Container>
        </Box>
    );
}