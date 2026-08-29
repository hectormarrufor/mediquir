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
    IconStethoscope, IconChevronLeft, IconChevronRight,
    IconHeartHandshake
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';

const HERO_IMAGES = [
    '/tenants/mediquir/hero-1.jpg',
    '/tenants/mediquir/hero-2.jpg',
    '/tenants/mediquir/hero-3.jpg',
    '/tenants/mediquir/hero-4.jpg',
    '/tenants/mediquir/hero-5.jpg'
];

export default function HeroSection({ searchQuery, onSearch }) {
    const isMobile = useMediaQuery('(max-width: 768px)');
    const [localQuery, setLocalQuery] = useState(searchQuery || '');
    const [currentSlide, setCurrentSlide] = useState(0);
    const [videoError, setVideoError] = useState(false);

    useEffect(() => {
        setLocalQuery(searchQuery);
    }, [searchQuery]);

    useEffect(() => {
        const videoPath = '/tenants/mediquir/hero-video.mp4';
        fetch(videoPath, { method: 'HEAD' })
            .then((res) => { if (!res.ok) setVideoError(true); })
            .catch(() => setVideoError(true));
    }, []);

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

    const handleSubmit = (e) => {
        e.preventDefault();
        if (localQuery.trim().length > 0) {
            onSearch(localQuery.trim());
        }
    };

    useEffect(() => {
        if (videoError) {
            const timer = setInterval(() => {
                setCurrentSlide((prev) => (prev + 1) % HERO_IMAGES.length);
            }, 7000);
            return () => clearInterval(timer);
        }
    }, [videoError]);

    const nextSlide = () => setCurrentSlide((prev) => (prev + 1) % HERO_IMAGES.length);
    const prevSlide = () => setCurrentSlide((prev) => (prev - 1 + HERO_IMAGES.length) % HERO_IMAGES.length);

    const ControlesYEstadisticas = (
        <>
            {videoError && HERO_IMAGES.length > 1 && (
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
            )}

            <Paper p="md" radius="md" shadow="xl" style={{ backgroundColor: 'rgba(255, 255, 255, 0.15)', backdropFilter: 'blur(15px)', border: '1px solid rgba(255,255,255,0.25)' }}>
                <Group gap="sm">
                    <ThemeIcon color="white" variant="light" size="xl" radius="md">
                        <IconStethoscope size={24} color="#005AAA" />
                    </ThemeIcon>
                    <Stack gap={0}>
                        <Group gap={4} align="flex-end">
                            <Text fw={900} size="xl" c="white" lh={1}>
                                {totalProductos === 0 ? <Loader size="xs" color="white" /> : `${prefijoConteo}${totalProductos}`}
                            </Text>
                        </Group>
                        <Text size="xs" c="gray.3" fw={700} tt="uppercase">Insumos Disponibles</Text>
                    </Stack>
                </Group>
            </Paper>
        </>
    );

    return (
        <Box pos="relative" mih={{ base: '85vh', md: 720 }} style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {/* FONDO MULTIMEDIA: VIDEO CON OPTIMIZACIÓN Y FALLBACK A FOTOS FADE (4s) */}
            <Box pos="absolute" inset={0} style={{ zIndex: 0, backgroundColor: '#0B1B3D' }}>
                {!videoError ? (
                    <video 
                        src="/tenants/mediquir/hero-video.mp4"
                        poster="/tenants/mediquir/hero-1.jpg"
                        autoPlay 
                        loop 
                        muted 
                        playsInline 
                        preload="auto"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={() => setVideoError(true)}
                    />
                ) : (
                    <Box pos="relative" w="100%" h="100%">
                        {HERO_IMAGES.map((src, idx) => (
                            <Box 
                                key={idx} pos="absolute" inset={0} 
                                style={{ 
                                    opacity: idx === currentSlide ? 1 : 0,
                                    transition: 'opacity 4s ease-in-out',
                                    zIndex: idx === currentSlide ? 1 : 0
                                }}
                            >
                                <img src={src} alt={`Banner ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            </Box>
                        ))}
                    </Box>
                )}
            </Box>

            <Box 
                pos="absolute" inset={0} 
                bg={isMobile 
                    ? "linear-gradient(180deg, rgba(11, 27, 61, 0.92) 0%, rgba(11, 27, 61, 0.75) 60%, rgba(0, 0, 0, 0.5) 100%)"
                    : "linear-gradient(90deg, rgba(11, 27, 61, 0.95) 0%, rgba(11, 27, 61, 0.65) 50%, rgba(0, 0, 0, 0.2) 100%)"
                } 
                style={{ zIndex: 2 }} 
            />

            <Container size="xl" w="100%" h="100%" pos="relative" py={{ base: 50, md: 80 }} style={{ zIndex: 3, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <Grid style={{ margin: 0 }} align="center">
                    <Grid.Col span={{ base: 12, md: 8, lg: 7 }}>
                        <Box pr={{ base: 0, md: 'xl' }}>
                            <Badge variant="outline" color="white" size={isMobile ? "md" : "lg"} radius="xl" leftSection={<IconHeartHandshake size={14} />} mb="md" style={{ backdropFilter: 'blur(5px)', borderWidth: 1.5 }}>
                                Para clínicas, consultorios y tu hogar
                            </Badge>
                            
                            <Title order={1} c="white" fz={{ base: 34, sm: 46, md: 58 }} fw={900} lh={1.15} mb="md" style={{ letterSpacing: '-0.5px' }}>
                                Salud integral a tu alcance, de forma <Text component="span" c="#005AAA" inherit>inteligente.</Text>
                            </Title>
                            
                            <Text c="gray.3" fz={{ base: 'sm', md: 'lg' }} mb={35} maw={550} fw={400}>
                                Ya sea que busques abastecer tu inventario médico al mayor o necesites insumos al detal, garantizamos calidad, rapidez y los mejores precios.
                            </Text>

                            <Paper withBorder={false} p="xs" radius="xl" shadow="xl" mb="lg" maw={500} bg="rgba(255, 255, 255, 1)">
                                <form onSubmit={handleSubmit}>
                                    <Flex direction="row" gap="xs" align="center" pl="md">
                                        <TextInput 
                                            placeholder="Ej: Tensiómetro, Inyectadoras..." 
                                            size="md" radius="xl" variant="unstyled"
                                            style={{ flex: 1 }}
                                            value={localQuery}
                                            onChange={(e) => setLocalQuery(e.currentTarget.value)}
                                        />
                                        <Button type="submit" color="#0B1B3D" size="md" radius="xl">
                                            <IconSearch size={20} />
                                        </Button>
                                    </Flex>
                                </form>
                            </Paper>

                            <Group gap={{ base: 'md', md: 'xl' }}>
                                <Group gap="xs">
                                    <ThemeIcon color="rgba(255,255,255,0.1)" c="white" size="md" radius="xl"><IconTruckDelivery size={16} /></ThemeIcon>
                                    <Text size="xs" fw={500} c="white">Envíos Nacionales</Text>
                                </Group>
                                <Group gap="xs">
                                    <ThemeIcon color="rgba(255,255,255,0.1)" c="white" size="md" radius="xl"><IconShieldCheck size={16} /></ThemeIcon>
                                    <Text size="xs" fw={500} c="white">Calidad Certificada</Text>
                                </Group>
                            </Group>
                        </Box>

                        {isMobile && (
                            <Box mt={40} w="100%">
                                <Stack align="center" gap="md">
                                    {ControlesYEstadisticas}
                                </Stack>
                            </Box>
                        )}
                    </Grid.Col>
                </Grid>

                {!isMobile && (
                    <Box pos="absolute" bottom={40} right={20} style={{ zIndex: 4 }}>
                        <Stack align="flex-end" gap="md">
                            {ControlesYEstadisticas}
                        </Stack>
                    </Box>
                )}
            </Container>
        </Box>
    );
}