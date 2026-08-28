'use client';

import React from 'react';
import { 
    Container, Title, Group, Stack, Text, 
    Box, Skeleton, UnstyledButton 
} from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useMediaQuery } from '@mantine/hooks';
import CategoryIcon from '../CategoryIcon';

export default function CategorySection() {
    const isMobile = useMediaQuery('(max-width: 768px)');

    const { data: categorias, isLoading } = useQuery({
        queryKey: ['categorias-landing'],
        queryFn: async () => {
            const res = await fetch('/api/categorias');
            if (!res.ok) throw new Error('Error al cargar categorías');
            return res.json();
        }
    });

    const handleCategoryClick = (categoriaId) => {
        // En lugar de redirigir, hacemos un scroll suave a la sección de productos
        const section = document.getElementById('productos-section');
        if (section) {
            section.scrollIntoView({ behavior: 'smooth' });
        }
    };

    return (
        <Box py={80} bg="white">
            <Container size="xl">
                <Title order={2} mb={50} c="#0B1B3D" ta="center" fw={900} size="h1">
                    Nuestras Especialidades
                </Title>

                {isLoading ? (
                    <Group justify="center" gap="xl">
                        {[1, 2, 3, 4, 5].map((i) => (
                            <Stack key={i} align="center" gap="xs">
                                <Skeleton height={isMobile ? 80 : 100} circle />
                                <Skeleton height={12} width={70} radius="xl" />
                            </Stack>
                        ))}
                    </Group>
                ) : (
                    <Group justify="center" gap={{ base: 'xl', md: 50 }}>
                        {categorias?.map((cat) => (
                            <UnstyledButton 
                                key={cat.id} 
                                onClick={() => handleCategoryClick(cat.id)}
                                style={{ transition: 'transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)' }}
                                onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-10px)'}
                                onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                            >
                                <Stack align="center" gap="md">
                                    <Box 
                                        style={{ 
                                            borderRadius: '50%', 
                                            border: '1px solid #E9ECEF', 
                                            padding: isMobile ? '15px' : '20px',
                                            boxShadow: '0 10px 30px rgba(0,0,0,0.05)',
                                            backgroundColor: '#F8F9FA'
                                        }}
                                    >
                                        <CategoryIcon
                                            categoryName={cat.nombre} 
                                            size={isMobile ? 50 : 60} 
                                            color="#005AAA" 
                                            variant="transparent"
                                        />
                                    </Box>
                                    <Text size="sm" fw={700} c="#0B1B3D" ta="center" maw={120} lh={1.2}>
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