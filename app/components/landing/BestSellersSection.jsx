'use client';

import React, { useState } from 'react';
import { Container, Title, Text, Group, Box, Center, Loader, SimpleGrid, Tabs, Paper, Stack } from '@mantine/core';
import { IconFlame, IconTag } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import ProductCard from './ProductCard'; // Asegúrate de que la ruta sea correcta

export default function BestSellersSection() {
    // 🔥 ESTADO DE LOS TABS: Alternar entre más vendidos y descuentos 🔥
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

    // --- 🔥 NUEVA LÓGICA DE FILTRADO CON porcentajeDescuento 🔥 ---
    const masVendidos = productos.slice(0, 10);
    const ofertas = productos.filter(p => Number(p.porcentajeDescuento) > 0).slice(0, 10);

    const productosMostrados = activeTab === 'mas_vendidos' ? masVendidos : ofertas;

    return (
        <Box py={{ base: 40, md: 80 }} bg="gray.0">
            <Container size="xl">
                
                {/* 🔥 CABECERA DINÁMICA CENTRADA 🔥 */}
                <Stack align="center" ta="center" mb="xl">
                    <Group gap="xs" justify="center">
                        {activeTab === 'mas_vendidos' ? <IconFlame color="#FF6B6B" size={32} /> : <IconTag color="#FF922B" size={32} />}
                        <Title order={2} c={activeTab === 'mas_vendidos' ? "blue.9" : "orange.9"} size="h2" fw={900}>
                            {activeTab === 'mas_vendidos' ? 'Productos Más Vendidos' : 'Ofertas Imperdibles'}
                        </Title>
                    </Group>
                    <Text c="dimmed" size="md" maw={500}>
                        {activeTab === 'mas_vendidos' 
                            ? 'Los insumos preferidos por nuestros clientes con la mejor calidad del mercado.' 
                            : 'Aprovecha estos descuentos por tiempo limitado antes de que se agoten.'}
                    </Text>
                </Stack>

                {/* 🔥 TABS ESTILO TOGGLE PREMIUM (Centro y expandidos) 🔥 */}
                <Box maw={{ base: '100%', sm: 600 }} mx="auto" mb={40}>
                    <Tabs value={activeTab} onChange={setActiveTab} variant="pills" radius="xl" color={activeTab === 'mas_vendidos' ? "blue" : "orange"}>
                        <Tabs.List 
                            grow // 🔥 Obliga a los tabs a ocupar todo el ancho disponible
                            bg="white" 
                            p={6} 
                            style={{ 
                                borderRadius: '50px', 
                                border: '1px solid #E9ECEF', 
                                boxShadow: '0 4px 20px rgba(0,0,0,0.05)' 
                            }}
                        >
                            <Tabs.Tab value="mas_vendidos" leftSection={<IconFlame size={18} />} fw={700} size="md" h={45}>
                                Más Vendidos
                            </Tabs.Tab>
                            {/* Solo mostramos el Tab de ofertas si realmente hay productos con descuento */}
                            {ofertas.length > 0 && (
                                <Tabs.Tab value="ofertas" leftSection={<IconTag size={18} />} fw={700} size="md" h={45}>
                                    Ofertas Especiales
                                </Tabs.Tab>
                            )}
                        </Tabs.List>
                    </Tabs>
                </Box>

                {/* 🔥 GRID RESPONSIVO: base 2 = 2 columnas en celulares 🔥 */}
                {productosMostrados.length > 0 ? (
                    <SimpleGrid cols={{ base: 2, xs: 2, sm: 3, md: 4, lg: 5 }} spacing={{ base: 8, sm: 'md', md: 'lg' }}>
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