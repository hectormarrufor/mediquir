'use client';

import React from 'react';
import { Container, Title, Box, Tabs, SimpleGrid, Center, Loader, Text } from '@mantine/core';
import { IconFlame, IconDiscount2 } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import ProductCard from './ProductCard';

export default function BestSellersSection() {
    const { data, isLoading, isError } = useQuery({
        queryKey: ['productos-landing'],
        queryFn: async () => {
            const res = await fetch('/api/tienda/destacados');
            if (!res.ok) throw new Error('Error de red');
            return res.json();
        }
    });

    if (isLoading) return <Center py={100}><Loader color="blue" /></Center>;
    if (isError) return null;

    // 🔥 DEFENSA 1: Si no hay data, no renderizamos nada (o evitamos el crash)
    if (!data) return null; 

    // 🔥 DEFENSA 2: Extraemos con valores por defecto por si el backend falla
    const { masVendidos = [], ofertas = [] } = data;

    return (
        <Box py={60} bg="#F8F9FA">
            <Container size="xl">
                <Tabs defaultValue="mas-vendidos" color="blue" radius="md">
                    <Tabs.List justify="center" mb="xl">
                        <Tabs.Tab value="mas-vendidos" leftSection={<IconFlame size={18} color="orange" />} fz="md" fw={600}>
                            Más Vendidos
                        </Tabs.Tab>
                        <Tabs.Tab value="ofertas" leftSection={<IconDiscount2 size={18} color="red" />} fz="md" fw={600}>
                            Ofertas Imperdibles
                        </Tabs.Tab>
                    </Tabs.List>

                    <Tabs.Panel value="mas-vendidos">
                        {masVendidos?.length > 0 ? (
                            <SimpleGrid cols={{ base: 1, sm: 2, md: 4, lg: 5 }} spacing="lg">
                                {masVendidos.map((prod) => (
                                    <ProductCard key={prod.id} product={prod} />
                                ))}
                            </SimpleGrid>
                        ) : (
                            <Center py={50}><Text c="dimmed">Aún no hay productos registrados.</Text></Center>
                        )}
                    </Tabs.Panel>

                    <Tabs.Panel value="ofertas">
                        {ofertas?.length > 0 ? (
                            <SimpleGrid cols={{ base: 1, sm: 2, md: 4, lg: 5 }} spacing="lg">
                                {ofertas.map((prod) => (
                                    <ProductCard key={prod.id} product={prod} />
                                ))}
                            </SimpleGrid>
                        ) : (
                            <Center py={50}><Text c="dimmed">No hay ofertas activas en este momento.</Text></Center>
                        )}
                    </Tabs.Panel>
                </Tabs>
            </Container>
        </Box>
    );
}