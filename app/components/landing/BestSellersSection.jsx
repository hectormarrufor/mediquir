'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
    Container, Title, Text, Group, Box, SimpleGrid, SegmentedControl,
    Paper, Stack, Button, Badge, Center, Skeleton, AspectRatio
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconFlame, IconTag, IconLayoutGrid, IconX, IconFilter, IconChevronDown } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import ProductCard from './ProductCard';
import { buscarProductos } from '@/app/helpers/busquedaProductos';
import classes from './landing.module.css';

const PAGE_SIZE = 12;

const enStock = (p) => (Number(p.stockAlmacen) > 0 ? 1 : 0);

export default function BestSellersSection({ searchQuery, selectedCategory, onClearFilters }) {
    const isMobile = useMediaQuery('(max-width: 48em)', true);
    const [activeTab, setActiveTab] = useState('mas_vendidos');
    const [visible, setVisible] = useState(PAGE_SIZE);

    // Misma queryKey que Hero y CategorySection: una sola petición para toda la landing
    const { data: productos, isLoading } = useQuery({
        queryKey: ['productos-landing'],
        staleTime: 60_000,
        queryFn: async () => {
            const res = await fetch('/api/productos');
            if (!res.ok) throw new Error('Error al cargar productos');
            return res.json();
        }
    });

    const hasActiveFilter = Boolean(searchQuery || selectedCategory);

    const filtrados = useMemo(() => {
        let lista = productos || [];
        if (selectedCategory) {
            lista = lista.filter((p) =>
                p.categoriaId === selectedCategory.id ||
                p.categoria?.id === selectedCategory.id ||
                p.categoria?.nombre?.toLowerCase() === selectedCategory.nombre?.toLowerCase()
            );
        }
        // Búsqueda por palabras sueltas (nombre, etiquetas, marca...), tolerante a tildes, plurales y errores de tipeo.
        // Devuelve primero lo que coincide con todo lo escrito y después opciones parciales, con los disponibles primero.
        if (searchQuery) lista = buscarProductos(lista, searchQuery, { desempate: enStock });
        return lista;
    }, [productos, selectedCategory, searchQuery]);

    // Los disponibles primero; el orden estable conserva el criterio del API dentro de cada grupo
    // Con una búsqueda activa se respeta el orden de relevancia (que ya prefiere los disponibles)
    const disponiblesPrimero = useMemo(
        () => (searchQuery ? filtrados : [...filtrados].sort((a, b) => enStock(b) - enStock(a))),
        [filtrados, searchQuery]
    );
    const masVendidos = useMemo(
        () => [...filtrados]
            .sort((a, b) => (enStock(b) - enStock(a)) || ((b.nroVentas || 0) - (a.nroVentas || 0)))
            .slice(0, 12),
        [filtrados]
    );
    const ofertas = useMemo(
        () => disponiblesPrimero.filter((p) => Number(p.porcentajeDescuento) > 0),
        [disponiblesPrimero]
    );

    const lista = hasActiveFilter || activeTab === 'todos'
        ? disponiblesPrimero
        : activeTab === 'ofertas' ? ofertas : masVendidos;

    // Al cambiar de pestaña o filtro se vuelve a la primera página
    useEffect(() => { setVisible(PAGE_SIZE); }, [activeTab, searchQuery, selectedCategory]);

    // Si la pestaña activa quedó sin ofertas, regresa a "más vendidos"
    useEffect(() => {
        if (activeTab === 'ofertas' && !isLoading && ofertas.length === 0) setActiveTab('mas_vendidos');
    }, [activeTab, ofertas.length, isLoading]);

    if (isLoading) {
        return (
            <Box py={40}>
                <Container fluid px={{ base: 6, sm: 10 }}>
                    <SimpleGrid cols={{ base: 3, xs: 4, md: 5, lg: 6, xl: 7 }} spacing={{ base: 6, sm: 'sm' }}>
                        {Array.from({ length: 6 }).map((_, i) => (
                            <AspectRatio key={i} ratio={3 / 4}><Skeleton radius="lg" /></AspectRatio>
                        ))}
                    </SimpleGrid>
                </Container>
            </Box>
        );
    }
    if (!productos || productos.length === 0) return null;

    const tabs = [
        { value: 'mas_vendidos', label: isMobile ? 'Populares' : 'Más vendidos', icon: IconFlame },
        ...(ofertas.length > 0 || activeTab === 'ofertas' ? [{ value: 'ofertas', label: 'Ofertas', icon: IconTag }] : []),
        { value: 'todos', label: 'Todo', icon: IconLayoutGrid },
    ];

    const mostrados = lista.slice(0, visible);
    const hayMas = lista.length > visible;

    return (
        <Box py={{ base: 28, md: 64 }}>
            <Container fluid px={{ base: 6, sm: 10 }}>
                <Stack gap={6} mb={{ base: 'md', md: 'xl' }} align={isMobile ? 'flex-start' : 'center'} ta={isMobile ? 'left' : 'center'}>
                    <Text fz={11} fw={800} c="brand.6" tt="uppercase" lts={1.5}>Catálogo</Text>
                    <Title order={2} fz={{ base: 24, md: 34 }} fw={900} className={classes.gradientText} tt="none" display="block" pb={0}>
                        {hasActiveFilter ? 'Resultados' : 'Insumos para tu clínica y tu hogar'}
                    </Title>

                    {hasActiveFilter && (
                        <Group gap="xs" mt={4}>
                            {selectedCategory && (
                                <Badge size="lg" color="navy.9" radius="xl" leftSection={<IconFilter size={12} />} tt="none">
                                    {selectedCategory.nombre}
                                </Badge>
                            )}
                            {searchQuery && (
                                <Badge size="lg" color="accent.6" radius="xl" tt="none">
                                    “{searchQuery}”
                                </Badge>
                            )}
                            <Text size="sm" c="dimmed">{lista.length} {lista.length === 1 ? 'producto' : 'productos'}</Text>
                            <Button
                                variant="subtle" color="red" size="compact-sm" radius="xl"
                                leftSection={<IconX size={14} />} onClick={onClearFilters} tt="none"
                            >
                                Limpiar
                            </Button>
                        </Group>
                    )}
                </Stack>

                {!hasActiveFilter && (
                    <Center mb={{ base: 'md', md: 'xl' }}>
                        <SegmentedControl
                            fullWidth={isMobile}
                            value={activeTab}
                            onChange={setActiveTab}
                            radius="xl"
                            size={isMobile ? 'sm' : 'md'}
                            color={activeTab === 'ofertas' ? 'red.7' : 'navy.9'}
                            data={tabs.map(({ value, label, icon: Icon }) => ({
                                value,
                                label: (
                                    <Center style={{ gap: 6 }}>
                                        <Icon size={16} />
                                        <span>{label}</span>
                                    </Center>
                                ),
                            }))}
                            styles={{ root: { background: '#fff', border: '1px solid #E6EAF0' } }}
                        />
                    </Center>
                )}

                {mostrados.length > 0 ? (
                    <>
                        <SimpleGrid cols={{ base: 3, xs: 4, md: 5, lg: 6, xl: 7 }} spacing={{ base: 6, sm: 'sm' }} verticalSpacing={{ base: 6, sm: 'sm' }}>
                            {mostrados.map((prod) => (
                                <ProductCard key={`prod-${prod.id}`} product={prod} isMobile={isMobile} />
                            ))}
                        </SimpleGrid>

                        {hayMas && (
                            <Center mt="xl">
                                <Button
                                    variant="default" size="md" radius="xl" tt="none"
                                    rightSection={<IconChevronDown size={16} />}
                                    onClick={() => setVisible((v) => v + PAGE_SIZE)}
                                >
                                    Mostrar más ({lista.length - visible} restantes)
                                </Button>
                            </Center>
                        )}
                    </>
                ) : (
                    <Paper p="xl" ta="center" radius="lg" withBorder maw={500} mx="auto">
                        <Text fw={700} c="navy.9" size="lg" mb="xs">Sin resultados</Text>
                        <Text c="dimmed" size="sm" mb="md">
                            No encontramos insumos que coincidan con tu búsqueda.
                        </Text>
                        <Button color="navy.9" onClick={onClearFilters} tt="none">
                            Ver todos los productos
                        </Button>
                    </Paper>
                )}
            </Container>
        </Box>
    );
}
