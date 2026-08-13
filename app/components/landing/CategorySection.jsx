'use client';

import React from 'react';
import { 
    Container, Title, Group, Stack, Text, 
    Box, Skeleton, UnstyledButton 
} from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useMediaQuery } from '@mantine/hooks';
import { useRouter } from 'next/navigation';
import CategoryIcon from '../CategoryIcon'; // Asegúrate de que la ruta sea correcta

export default function CategorySection() {
    const router = useRouter();
    const isMobile = useMediaQuery('(max-width: 768px)');

    // Hacemos un fetch real a tu base de datos para traer las categorías que has creado
    const { data: categorias, isLoading } = useQuery({
        queryKey: ['categorias-landing'],
        queryFn: async () => {
            const res = await fetch('/api/categorias');
            if (!res.ok) throw new Error('Error al cargar categorías');
            return res.json();
        }
    });

    // Función para ir a la tienda filtrando por la categoría seleccionada
    const handleCategoryClick = (categoriaId) => {
        router.push(`/tienda?categoria=${categoriaId}`);
    };

    return (
        <Box py={50} bg="white">
            <Container size="xl">
                <Title order={3} mb="xl" c="gray.8" ta={isMobile ? "center" : "left"}>
                    Comprar por Categorías
                </Title>

                {isLoading ? (
                    // Skeletons de carga elegantes mientras responde la API
                    <Group justify={isMobile ? "center" : "space-between"} gap="xl">
                        {[1, 2, 3, 4, 5].map((i) => (
                            <Stack key={i} align="center" gap="xs">
                                <Skeleton height={isMobile ? 60 : 80} circle />
                                <Skeleton height={12} width={70} radius="xl" />
                            </Stack>
                        ))}
                    </Group>
                ) : (
                    // Renderizado de las categorías reales
                    <Group justify={isMobile ? "center" : "flex-start"} gap="xl">
                        {categorias?.map((cat) => (
                            <UnstyledButton 
                                key={cat.id} 
                                onClick={() => handleCategoryClick(cat.id)}
                                style={{
                                    transition: 'transform 0.2s ease',
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                            >
                                <Stack align="center" gap="xs">
                                    <Box 
                                        style={{ 
                                            borderRadius: '50%', 
                                            border: '2px solid #E3F2FD', 
                                            padding: '4px',
                                            boxShadow: '0 4px 10px rgba(0,0,0,0.05)',
                                            backgroundColor: 'white'
                                        }}
                                    >
                                        <CategoryIcon 
                                            categoryName={cat.nombre} 
                                            size={isMobile ? 60 : 80} 
                                            color="blue.9" 
                                            variant="light"
                                            radius="50%" // Lo forzamos a ser circular
                                        />
                                    </Box>
                                    <Text 
                                        size="sm" 
                                        fw={600} 
                                        c="gray.8" 
                                        ta="center" 
                                        maw={90} 
                                        lh={1.2}
                                    >
                                        {cat.nombre}
                                    </Text>
                                </Stack>
                            </UnstyledButton>
                        ))}
                        
                        {categorias?.length === 0 && (
                            <Text c="dimmed">No hay categorías registradas todavía.</Text>
                        )}
                    </Group>
                )}
            </Container>
        </Box>
    );
}