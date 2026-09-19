'use client';

import React from 'react';
import { Container, Title, Text, Group, SimpleGrid, Stack, Box, Skeleton, UnstyledButton, Badge } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import CategoryIcon from '../CategoryIcon';
import classes from './landing.module.css';


export default function CategorySection({ selectedCategory, onSelectCategory }) {
    const isMobile = useMediaQuery('(max-width: 48em)', true);

    const { data: categorias, isLoading } = useQuery({
        queryKey: ['categorias-landing'],
        staleTime: 5 * 60_000,
        queryFn: async () => {
            const res = await fetch('/api/categorias');
            if (!res.ok) throw new Error('Error al cargar categorías');
            return res.json();
        }
    });

    // Reutiliza la misma petición del catálogo para mostrar cuántos productos tiene cada categoría
    const { data: productos } = useQuery({
        queryKey: ['productos-landing'],
        staleTime: 60_000,
        queryFn: async () => {
            const res = await fetch('/api/productos');
            if (!res.ok) throw new Error('Error al cargar productos');
            return res.json();
        }
    });

    const contar = (cat) => (productos || []).filter((p) => (p.categoriaId ?? p.categoria?.id) === cat.id).length;
    const toggle = (cat) => onSelectCategory(selectedCategory?.id === cat.id ? null : cat);

    return (
        <Box id="especialidades" py={{ base: 24, md: 56 }}>
            <Container fluid px={{ base: 6, sm: 10 }}>
                <Stack gap={4} mb={{ base: 'sm', md: 'xl' }} align={isMobile ? 'flex-start' : 'center'}>
                    <Text fz={11} fw={800} c="brand.6" tt="uppercase" lts={1.5}>Especialidades</Text>
                    <Title order={2} fz={{ base: 22, md: 32 }} fw={900} className={classes.gradientText} tt="none" display="block" pb={0}>
                        Encuentra lo que necesitas
                    </Title>
                </Stack>

                {isLoading ? (
                    <Group gap="xs" wrap="nowrap">
                        {[1, 2, 3, 4].map((i) => <Skeleton key={i} h={isMobile ? 38 : 84} w={isMobile ? 110 : 200} radius="xl" />)}
                    </Group>
                ) : isMobile ? (
                    // MÓVIL: chips compactos con scroll horizontal
                    <Box className={classes.scroller}>
                        <Badge
                            component="button" size="xl" radius="xl" h={38} px={16}
                            variant={selectedCategory ? 'default' : 'filled'} color="navy.9"
                            style={{ cursor: 'pointer', textTransform: 'none' }}
                            onClick={() => onSelectCategory(null)}
                        >
                            Todas
                        </Badge>
                        {categorias?.map((cat) => {
                            const isSelected = selectedCategory?.id === cat.id;
                            return (
                                <Badge
                                    key={cat.id} component="button" size="xl" radius="xl" h={38} px={14}
                                    variant={isSelected ? 'filled' : 'default'} color="navy.9"
                                    leftSection={<CategoryIcon categoryName={cat.nombre} size={24} color={isSelected ? 'white' : 'brand.6'} variant="transparent" />}
                                    style={{ cursor: 'pointer', textTransform: 'none' }}
                                    onClick={() => toggle(cat)}
                                >
                                    {cat.nombre}
                                </Badge>
                            );
                        })}
                    </Box>
                ) : (
                    // ESCRITORIO: tarjetas con icono y conteo
                    <SimpleGrid cols={{ base: 3, md: 3, lg: Math.min(Math.max(categorias?.length || 6, 1), 6) }} spacing="md" maw={1500} mx="auto">
                        {categorias?.map((cat) => {
                            const isSelected = selectedCategory?.id === cat.id;
                            const total = contar(cat);
                            return (
                                <UnstyledButton
                                    key={cat.id}
                                    className={classes.categoryCard}
                                    data-selected={isSelected || undefined}
                                    onClick={() => toggle(cat)}
                                >
                                    <Group gap="md" wrap="nowrap">
                                        <CategoryIcon
                                            categoryName={cat.nombre} size={48}
                                            color={isSelected ? 'accent.6' : 'brand.6'} variant="light"
                                        />
                                        <Box>
                                            <Text fw={800} c={isSelected ? 'accent.6' : 'navy.9'} lh={1.2}>{cat.nombre}</Text>
                                            {total > 0 && <Text size="xs" c="dimmed">{total} {total === 1 ? 'producto' : 'productos'}</Text>}
                                        </Box>
                                    </Group>
                                </UnstyledButton>
                            );
                        })}
                    </SimpleGrid>
                )}
            </Container>
        </Box>
    );
}
