'use client';

import React, { useState, useEffect } from 'react';
import {
    Container, Title, Text, Button, Group, TextInput, Badge, Box,
    ThemeIcon, Paper, Stack, Loader, Flex
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
    IconSearch, IconTruckDelivery, IconShieldCheck, IconStethoscope,
    IconHeartHandshake, IconChevronDown
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import classes from './landing.module.css';

// Versiones optimizadas (~50–200 KB) de las fotos originales de 7–9 MB
const HERO_IMAGES = [1, 2, 4, 5].map((n) => ({
    lg: `/tenants/mediquir/hero-${n}-lg.jpg`,
    sm: `/tenants/mediquir/hero-${n}-sm.jpg`,
}));


export default function HeroSection({ searchQuery, onSearch }) {
    // Se asume móvil hasta comprobar lo contrario: así el móvil nunca descarga el video
    const isMobile = useMediaQuery('(max-width: 48em)', true);
    const [localQuery, setLocalQuery] = useState(searchQuery || '');
    const [currentSlide, setCurrentSlide] = useState(0);
    const [videoError, setVideoError] = useState(false);

    useEffect(() => { setLocalQuery(searchQuery || ''); }, [searchQuery]);

    // Misma queryKey que el catálogo: no genera una petición extra
    const { data: productos } = useQuery({
        queryKey: ['productos-landing'],
        staleTime: 60_000,
        queryFn: async () => {
            const res = await fetch('/api/productos');
            if (!res.ok) throw new Error('Error al cargar productos');
            return res.json();
        }
    });

    const totalProductos = productos?.length || 0;
    // El video se ve igual en móvil y escritorio (silenciado y en línea, como exigen los navegadores móviles para reproducirse solo);
    // si el video falla se cae al fundido de fotos.
    const usaVideo = !videoError;

    // Sin video (móvil o error): fundido lento entre fotos
    useEffect(() => {
        if (usaVideo) return;
        const timer = setInterval(() => setCurrentSlide((prev) => (prev + 1) % HERO_IMAGES.length), 6000);
        return () => clearInterval(timer);
    }, [usaVideo]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (localQuery.trim().length > 0) onSearch(localQuery.trim());
    };

    const scrollToCatalog = () => document.getElementById('productos-section')?.scrollIntoView({ behavior: 'smooth' });

    return (
        <Box className={classes.hero} pos="relative" mih={{ base: 440, sm: 616, md: 704 }} style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {/* FONDO */}
            <Box pos="absolute" inset={0} style={{ zIndex: 0, backgroundColor: 'var(--mantine-color-navy-9)' }}>
                {usaVideo ? (
                    <video
                        src="/tenants/mediquir/hero-video.mp4"
                        poster={isMobile ? HERO_IMAGES[0].sm : HERO_IMAGES[0].lg}
                        autoPlay loop muted playsInline preload="metadata"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={() => setVideoError(true)}
                    />
                ) : (
                    HERO_IMAGES.map((img, idx) => (
                        <Box key={idx} className={classes.heroSlide} data-active={idx === currentSlide || undefined}>
                            <img
                                src={isMobile ? img.sm : img.lg}
                                alt=""
                                loading={idx === 0 ? 'eager' : 'lazy'}
                                fetchPriority={idx === 0 ? 'high' : 'auto'}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                        </Box>
                    ))
                )}
            </Box>

            <Box
                pos="absolute" inset={0} style={{ zIndex: 2 }}
                bg={isMobile
                    ? 'linear-gradient(180deg, rgba(11,27,61,0.88) 0%, rgba(11,27,61,0.72) 55%, rgba(11,27,61,0.9) 100%)'
                    : 'linear-gradient(90deg, rgba(11,27,61,0.95) 0%, rgba(11,27,61,0.65) 50%, rgba(0,0,0,0.2) 100%)'}
            />

            <Box className={classes.heroGlow} />

            <Container
                fluid w="100%" pos="relative" px={{ base: 18, sm: 36, lg: 72 }} py={{ base: 32, md: 80 }}
                style={{ zIndex: 3, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
            >
                <Box maw={640}>
                    <Badge
                        variant="outline" color="white" size={isMobile ? 'md' : 'lg'} radius="xl" mb="sm"
                        leftSection={<IconHeartHandshake size={14} />} tt="none"
                        style={{ backdropFilter: 'blur(5px)', borderWidth: 1.5 }}
                    >
                        Clínicas, consultorios y hogar
                    </Badge>

                    <Title order={1} c="white" fz={{ base: 30, sm: 44, md: 56 }} fw={900} lh={1.1} mb="sm" tt="none" display="block" pb={0} style={{ letterSpacing: '-0.5px' }}>
                        Salud integral a tu alcance, de forma{' '}
                        <Text component="span" c="sky.3" inherit>inteligente.</Text>
                    </Title>

                    <Text c="gray.3" fz={{ base: 'sm', md: 'lg' }} mb={{ base: 'md', md: 30 }} maw={540}>
                        <Text component="span" visibleFrom="sm" inherit>
                            Ya sea que busques abastecer tu inventario médico al mayor o necesites insumos al detal, garantizamos calidad, rapidez y los mejores precios.
                        </Text>
                        <Text component="span" hiddenFrom="sm" inherit>
                            Insumos médicos al mayor y al detal. Calidad, rapidez y los mejores precios.
                        </Text>
                    </Text>

                    <Paper p={4} radius="xl" shadow="xl" mb="md" maw={520} bg="white" withBorder={false}>
                        <form onSubmit={handleSubmit}>
                            <Flex gap="xs" align="center" pl="md">
                                <TextInput
                                    placeholder="Busca: tensiómetro, guantes, jeringas…"
                                    size="md" radius="xl" variant="unstyled" style={{ flex: 1 }}
                                    value={localQuery}
                                    onChange={(e) => setLocalQuery(e.currentTarget.value)}
                                    aria-label="Buscar insumos"
                                />
                                <Button type="submit" color="navy.9" size="md" radius="xl" px={18} aria-label="Buscar">
                                    <IconSearch size={20} />
                                </Button>
                            </Flex>
                        </form>
                    </Paper>

                    {/* Confianza en una sola fila (con scroll si no cabe) */}
                    <Group gap={{ base: 'md', md: 'xl' }} wrap="nowrap" style={{ overflowX: 'auto', scrollbarWidth: 'none' }}>
                        <Group gap={6} wrap="nowrap">
                            <ThemeIcon color="rgba(255,255,255,0.12)" c="white" size="md" radius="xl"><IconTruckDelivery size={16} /></ThemeIcon>
                            <Text size="xs" fw={600} c="white" style={{ whiteSpace: 'nowrap' }}>Envíos nacionales</Text>
                        </Group>
                        <Group gap={6} wrap="nowrap">
                            <ThemeIcon color="rgba(255,255,255,0.12)" c="white" size="md" radius="xl"><IconShieldCheck size={16} /></ThemeIcon>
                            <Text size="xs" fw={600} c="white" style={{ whiteSpace: 'nowrap' }}>Calidad certificada</Text>
                        </Group>
                        <Group gap={6} wrap="nowrap">
                            <ThemeIcon color="rgba(255,255,255,0.12)" c="white" size="md" radius="xl"><IconStethoscope size={16} /></ThemeIcon>
                            <Text size="xs" fw={600} c="white" style={{ whiteSpace: 'nowrap' }}>
                                {totalProductos === 0 ? <Loader size={10} color="white" /> : `${totalProductos > 100 ? '+' : ''}${totalProductos} insumos`}
                            </Text>
                        </Group>
                    </Group>
                </Box>

                <Box visibleFrom="md" pos="absolute" bottom={28} left="50%" style={{ transform: 'translateX(-50%)' }}>
                    <Button
                        variant="subtle" color="white" radius="xl" onClick={scrollToCatalog} tt="none"
                        rightSection={<IconChevronDown size={18} />}
                    >
                        Ver catálogo
                    </Button>
                </Box>
            </Container>
        </Box>
    );
}
