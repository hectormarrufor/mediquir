'use client';

import React, { useState, useEffect } from 'react';
import { 
    Container, Title, Text, Button, Group, 
    TextInput, Badge, Box, ThemeIcon, ActionIcon,
    Paper, Stack, Loader 
} from '@mantine/core';
import { 
    IconSearch, IconTruckDelivery, IconShieldCheck, 
    IconHeadset, IconStethoscope, IconChevronLeft, IconChevronRight,
    IconHeartHandshake
} from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';

// Array con las rutas de las imágenes de tu carpeta public
const HERO_IMAGES = [
    '/tenants/mediquir/hero-1.jpg',
    '/tenants/mediquir/hero-2.jpg',
    '/tenants/mediquir/hero-3.jpg',
    '/tenants/mediquir/hero-4.jpg',
    '/tenants/mediquir/hero-5.jpg'
];

export default function HeroSection() {
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState('');
    const [currentSlide, setCurrentSlide] = useState(0);

    // 🔥 1. FETCH DINÁMICO DEL INVENTARIO 🔥
    const { data: productos } = useQuery({
        queryKey: ['productos-count'],
        queryFn: async () => {
            const res = await fetch('/api/productos');
            if (!res.ok) return [];
            return res.json();
        }
    });
    
    // Calculamos la cantidad real. Si apenas tienes 5, dirá "5 Insumos". 
    // Si tienes 1500, dirá "+1500 Insumos"
    const totalProductos = productos?.length || 0;
    const prefijoConteo = totalProductos > 100 ? '+' : '';

    // Búsqueda inteligente
    const handleSearch = (e) => {
        e.preventDefault();
        if (searchQuery.trim().length > 0) {
            router.push(`/tienda?q=${encodeURIComponent(searchQuery)}`);
        }
    };

    // Autoplay del carrusel
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentSlide((prev) => (prev + 1) % HERO_IMAGES.length);
        }, 6000); // Lo subí a 6 segundos para que el usuario pueda leer con calma
        return () => clearInterval(timer);
    }, []);

    const nextSlide = () => setCurrentSlide((prev) => (prev + 1) % HERO_IMAGES.length);
    const prevSlide = () => setCurrentSlide((prev) => (prev - 1 + HERO_IMAGES.length) % HERO_IMAGES.length);

    return (
        <Box pos="relative" h={{ base: 650, md: 700 }} style={{ overflow: 'hidden' }}>
            
            {/* =========================================
                CARRUSEL DE FONDO (FULL SCREEN)
               ========================================= */}
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

            {/* 🔥 GRADIENTE DE PROTECCIÓN PARA LECTURA 🔥 */}
            {/* Oscuro a la izquierda (donde va el texto) y transparente a la derecha */}
            <Box 
                pos="absolute" 
                inset={0} 
                bg="linear-gradient(90deg, rgba(0, 15, 36, 0.9) 0%, rgba(0, 26, 60, 0.7) 40%, rgba(0, 0, 0, 0.1) 100%)" 
                style={{ zIndex: 1 }} 
            />

            {/* =========================================
                CONTENIDO DEL HERO (TEXTOS Y BUSCADOR)
               ========================================= */}
            <Container size="xl" h="100%" pos="relative" style={{ zIndex: 2 }}>
                <Group h="100%" align="center">
                    <Box maw={650} py={{ base: 40, md: 0 }}>
                        
                        <Badge 
                            variant="filled" color="teal.6" size="lg" radius="xl" 
                            leftSection={<IconHeartHandshake size={14} />} mb="lg"
                            style={{ boxShadow: '0 4px 15px rgba(0,0,0,0.3)' }}
                        >
                            Para clínicas, consultorios y tu hogar
                        </Badge>
                        
                        {/* TEXTOS CON SOMBRA (Text Shadow) */}
                        <Title 
                            order={1} c="white" fz={{ base: 36, md: 54 }} fw={900} lh={1.1} mb="md"
                            style={{ textShadow: '2px 4px 12px rgba(0,0,0,0.6)' }}
                        >
                            Salud y bienestar a tu alcance, de forma <Text component="span" c="teal.4" inherit>rápida y segura.</Text>
                        </Title>
                        
                        <Text 
                            c="gray.3" fz={{ base: 'md', md: 'xl' }} mb="xl" maw={550} fw={500}
                            style={{ textShadow: '1px 2px 6px rgba(0,0,0,0.8)' }}
                        >
                            Ya sea que busques abastecer tu inventario médico al mayor o necesites insumos al detal, aquí encuentras calidad y los mejores precios.
                        </Text>

                        {/* BUSCADOR */}
                        <Paper withBorder={false} p="xs" radius="md" shadow="xl" mb="xl" maw={500} bg="rgba(255, 255, 255, 0.95)">
                            <form onSubmit={handleSearch}>
                                <Group wrap="nowrap" gap="xs">
                                    <TextInput 
                                        placeholder="Ej: Inyectadoras, Tensiómetro, Vitamina C..." 
                                        size="md" radius="md" variant="unstyled"
                                        style={{ flex: 1, paddingLeft: 8 }}
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.currentTarget.value)}
                                    />
                                    <Button type="submit" color="blue.9" size="md" radius="md" leftSection={<IconSearch size={16} />}>
                                        Buscar
                                    </Button>
                                </Group>
                            </form>
                        </Paper>

                        {/* INDICADORES DE CONFIANZA */}
                        <Group gap="lg">
                            <Group gap="xs">
                                <ThemeIcon color="teal.5" variant="filled" size="md" radius="xl"><IconTruckDelivery size={18} /></ThemeIcon>
                                <Text size="sm" fw={600} c="white" style={{ textShadow: '1px 1px 4px rgba(0,0,0,0.8)' }}>Envíos a todo el país</Text>
                            </Group>
                            <Group gap="xs">
                                <ThemeIcon color="teal.5" variant="filled" size="md" radius="xl"><IconShieldCheck size={18} /></ThemeIcon>
                                <Text size="sm" fw={600} c="white" style={{ textShadow: '1px 1px 4px rgba(0,0,0,0.8)' }}>Compras Seguras</Text>
                            </Group>
                            <Group gap="xs">
                                <ThemeIcon color="teal.5" variant="filled" size="md" radius="xl"><IconHeadset size={18} /></ThemeIcon>
                                <Text size="sm" fw={600} c="white" style={{ textShadow: '1px 1px 4px rgba(0,0,0,0.8)' }}>Ventas Mayor y Detal</Text>
                            </Group>
                        </Group>
                    </Box>
                </Group>

                {/* =========================================
                    CARD FLOTANTE (ESTADÍSTICA REAL) 
                    Y CONTROLES DEL CARRUSEL
                   ========================================= */}
                <Box pos="absolute" bottom={40} right={20} style={{ zIndex: 3 }}>
                    <Stack align="flex-end" gap="xl">
                        
                        {/* Controles Glassmorphism */}
                        <Group gap="sm" mr="sm">
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

                        {/* La Card del Conteo Dinámico */}
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

                    </Stack>
                </Box>

            </Container>
        </Box>
    );
}