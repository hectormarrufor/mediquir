'use client';

import React, { useState } from 'react';
import { Container, Title, Text, Group, Box, Center, Loader, SimpleGrid, Tabs, Paper, Stack } from '@mantine/core';
import { IconFlame, IconTag } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import ProductCard from './ProductCard'; // Ajusta la ruta

export default function BestSellersSection() {
    const [activeTab, setActiveTab] = useState('mas_vendidos');

    const { data: productos, isLoading } = useQuery({
        queryKey: ['productos-landing'],
        queryFn: async () => {
            const res = await fetch('/api/productos');
            if (!res.ok) throw new Error('Error al cargar productos');
            return res.json();
        }
    });

    if (isLoading) return <Center py={100}><Loader size="xl" color="blue" /></Center>;
    if (!productos || productos.length === 0) return null;

    const masVendidos = productos.slice(0, 10);
    const ofertas = productos.filter(p => Number(p.porcentajeDescuento) > 0).slice(0, 10);
    const productosMostrados = activeTab === 'mas_vendidos' ? masVendidos : ofertas;

    return (
        <Box py={{ base: 60, md: 100 }} bg="#F8F9FA">
            <Container size="xl">
                
                <Stack align="center" ta="center" mb={50}>
                    <Title order={2} c="#0B1B3D" size="h1" fw={900}>
                        {activeTab === 'mas_vendidos' ? 'Selección Destacada' : 'Ofertas Exclusivas'}
                    </Title>
                    <Text c="dimmed" size="lg" maw={600}>
                        {activeTab === 'mas_vendidos' 
                            ? 'Los insumos preferidos por nuestros clientes con la mejor calidad del mercado.' 
                            : 'Aprovecha estos descuentos por tiempo limitado antes de que se agoten.'}
                    </Text>
                </Stack>

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

                {productosMostrados.length > 0 ? (
                    <SimpleGrid cols={{ base: 1, xs: 2, sm: 3, md: 4, lg: 5 }} spacing={{ base: 'md', md: 'xl' }}>
                        {productosMostrados.map(prod => (
                            <ProductCard key={`prod-${prod.id}`} product={prod} />
                        ))}
                    </SimpleGrid>
                ) : (
                    <Paper p="xl" ta="center" radius="md" bg="white" withBorder>
                        <Text c="dimmed">No hay productos disponibles en esta sección por el momento.</Text>
                    </Paper>
                )}
                
            </Container>
        </Box>
    );
}