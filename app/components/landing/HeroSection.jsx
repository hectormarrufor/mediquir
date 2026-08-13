'use client';

import React, { useState, useEffect } from 'react';
import { 
    Container, Title, Text, Button, Group, 
    TextInput, Badge, Box, ThemeIcon, ActionIcon,
    Paper, Stack, Loader, Flex, Grid
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { 
    IconSearch, IconTruckDelivery, IconShieldCheck, 
    IconHeadset, IconStethoscope, IconChevronLeft, IconChevronRight,
    IconHeartHandshake
} from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';

const HERO_IMAGES = [
    '/tenants/mediquir/hero-1.jpg',
    '/tenants/mediquir/hero-2.jpg',
    '/tenants/mediquir/hero-3.jpg',
    '/tenants/mediquir/hero-4.jpg',
    '/tenants/mediquir/hero-5.jpg'
];

export default function HeroSection() {
    const router = useRouter();
    // 🔥 RESTAURADO: El hook más útil para layouts dinámicos
    const isMobile = useMediaQuery('(max-width: 768px)');
    
    const [searchQuery, setSearchQuery] = useState('');
    const [currentSlide, setCurrentSlide] = useState(0);

    const { data: productos } = useQuery({
        queryKey: ['productos-count'],
        queryFn: async () => {
            const res = await fetch('/api/productos');
            if (!res.ok) return [];
            return res.json();
        }
    });
    
    const totalProductos = productos?.length || 0;
    const prefijoConteo = totalProductos > 100 ? '+' : '';

    const handleSearch = (e) => {
        e.preventDefault();
        if (searchQuery.trim().length > 0) {
            router.push(`/tienda?q=${encodeURIComponent(searchQuery)}`);
        }
    };

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentSlide((prev) => (prev + 1) % HERO_IMAGES.length);
        }, 6000);
        return () => clearInterval(timer);
    }, []);

    const nextSlide = () => setCurrentSlide((prev) => (prev + 1) % HERO_IMAGES.length);
    const prevSlide = () => setCurrentSlide((prev) => (prev - 1 + HERO_IMAGES.length) % HERO_IMAGES.length);

    // Módulo de estadísticas encapsulado para insertarlo donde queramos
    const ControlesYEstadisticas = (
        <>
            <Group gap="sm">
                <ActionIcon 
                    variant="white" radius="xl" size="lg" 
                    style={{ backgroundColor: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)', color: 'white', border: '1px solid rgba(255,255,255,0.4)' }}
                    onClick={prevSlide}
                >
                    <IconChevronLeft size={20} />
                </ActionIcon>
                <ActionIcon 
                    variant="white" radius="xl" size="lg" 
                    style={{ backgroundColor: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)', color: 'white', border: '1px solid rgba(255,255,255,0.4)' }}
                    onClick={nextSlide}
                >
                    <IconChevronRight size={20} />
                </ActionIcon>
            </Group>

            <Paper p="md" radius="md" shadow="2xl" style={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.5)' }}>
                <Group gap="sm">
                    <ThemeIcon color="blue.9" variant="filled" size="xl" radius="md">
                        <IconStethoscope size={24} />
                    </ThemeIcon>
                    <Stack gap={0}>
                        <Group gap={4} align="flex-end">
                            <Text fw={900} size="xl" c="blue.9" lh={1}>
                                {totalProductos === 0 ? <Loader size="xs" color="blue" /> : `${prefijoConteo}${totalProductos}`}
                            </Text>
                        </Group>
                        <Text size="xs" c="dimmed" fw={700} tt="uppercase">Insumos Disponibles</Text>
                    </Stack>
                </Group>
            </Paper>
        </>
    );

    return (
        <Box 
            pos="relative" 
            mih={{ base: '100svh', md: 700 }} 
            style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        >
            
            {/* CARRUSEL DE FONDO */}
            <Box pos="absolute" inset={0} style={{ zIndex: 0 }}>
                <Box 
                    style={{
                        display: 'flex',
                        width: '100%',
                        height: '100%',
                        transform: `translateX(-${currentSlide * 100}%)`,
                        transition: 'transform 0.8s cubic-bezier(0.25, 1, 0.5, 1)'
                    }}
                >
                    {HERO_IMAGES.map((src, idx) => (
                        <Box key={idx} style={{ flexShrink: 0, width: '100%', height: '100%' }}>
                            <img 
                                src={src} 
                                alt={`Banner Mediquir ${idx + 1}`} 
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement.style.backgroundColor = '#002244'; }}
                            />
                        </Box>
                    ))}
                </Box>
            </Box>

            {/* 🔥 GRADIENTE INTELIGENTE CON isMobile 🔥 */}
            <Box 
                pos="absolute" 
                inset={0} 
                bg={isMobile 
                    ? "linear-gradient(180deg, rgba(0, 15, 36, 0.9) 0%, rgba(0, 26, 60, 0.85) 60%, rgba(0, 0, 0, 0.4) 100%)"
                    : "linear-gradient(90deg, rgba(0, 15, 36, 0.95) 0%, rgba(0, 26, 60, 0.7) 40%, rgba(0, 0, 0, 0.1) 100%)"
                } 
                style={{ zIndex: 1 }} 
            />

            <Container size="xl" w="100%" pos="relative" style={{ zIndex: 2, flex: 1, display: 'flex', flexDirection: 'column' }}>
                
                <Grid style={{ flex: 1, margin: 0 }} align="center">
                    <Grid.Col span={{ base: 12, md: 7 }} py={{ base: 60, md: 0 }}>
                        <Box pr={{ base: 0, md: 'xl' }}>
                            <Badge 
                                variant="filled" color="teal.6" size={isMobile ? "md" : "lg"} radius="xl" 
                                leftSection={<IconHeartHandshake size={14} />} mb="lg"
                                style={{ boxShadow: '0 4px 15px rgba(0,0,0,0.3)' }}
                                mt={isMobile ? 0 : 40}
                            >
                                Para clínicas, consultorios y tu hogar
                            </Badge>
                            
                            <Title 
                                order={1} c="white" fz={{ base: 32, sm: 36, md: 54 }} fw={900} lh={1.1} mb="md"
                                style={{ textShadow: '2px 4px 12px rgba(0,0,0,0.6)' }}
                            >
                                Salud y bienestar a tu alcance, de forma <Text component="span" c="teal.4" inherit>rápida y segura.</Text>
                            </Title>
                            
                            <Text 
                                c="gray.3" fz={{ base: 'sm', sm: 'md', md: 'xl' }} mb="xl" maw={550} fw={500}
                                style={{ textShadow: '1px 2px 6px rgba(0,0,0,0.8)' }}
                            >
                                Ya sea que busques abastecer tu inventario médico al mayor o necesites insumos al detal, aquí encuentras calidad y los mejores precios.
                            </Text>

                            <Paper withBorder={false} p="xs" radius="md" shadow="xl" mb="xl" maw={500} bg="rgba(255, 255, 255, 0.95)">
                                <form onSubmit={handleSearch}>
                                    <Flex direction={{ base: 'column', sm: 'row' }} gap="xs">
                                        <TextInput 
                                            placeholder="Ej: Inyectadoras, Tensiómetro..." 
                                            size="md" radius="md" variant="unstyled"
                                            style={{ flex: 1, paddingLeft: 8 }}
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.currentTarget.value)}
                                        />
                                        <Button 
                                            type="submit" color="blue.9" size="md" radius="md" 
                                            leftSection={<IconSearch size={16} />}
                                            fullWidth={isMobile}
                                        >
                                            Buscar
                                        </Button>
                                    </Flex>
                                </form>
                            </Paper>

                            <Group gap={{ base: 'sm', md: 'lg' }}>
                                <Group gap="xs">
                                    <ThemeIcon color="teal.5" variant="filled" size="sm" radius="xl"><IconTruckDelivery size={14} /></ThemeIcon>
                                    <Text size="xs" fw={600} c="white">Envíos a todo el país</Text>
                                </Group>
                                <Group gap="xs">
                                    <ThemeIcon color="teal.5" variant="filled" size="sm" radius="xl"><IconShieldCheck size={14} /></ThemeIcon>
                                    <Text size="xs" fw={600} c="white">Compras Seguras</Text>
                                </Group>
                                <Group gap="xs">
                                    <ThemeIcon color="teal.5" variant="filled" size="sm" radius="xl"><IconHeadset size={14} /></ThemeIcon>
                                    <Text size="xs" fw={600} c="white">Ventas Mayor y Detal</Text>
                                </Group>
                            </Group>
                        </Box>

                        {/* 🔥 RENDERIZADO CONDICIONAL EN MÓVIL 🔥 */}
                        {isMobile && (
                            <Box mt={60} w="100%">
                                <Stack align="center" gap="xl">
                                    {ControlesYEstadisticas}
                                </Stack>
                            </Box>
                        )}
                    </Grid.Col>
                </Grid>

                {/* 🔥 RENDERIZADO CONDICIONAL EN DESKTOP 🔥 */}
                {!isMobile && (
                    <Box pos="absolute" bottom={40} right={20} style={{ zIndex: 3 }}>
                        <Stack align="flex-end" gap="xl">
                            {ControlesYEstadisticas}
                        </Stack>
                    </Box>
                )}
                
            </Container>
        </Box>
    );
}