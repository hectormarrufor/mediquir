'use client';

import React, { useState, useEffect } from 'react';
import {
    Title, Text, Button, Container, Box, Stack,
    Group, Anchor, Center, Grid, SimpleGrid, Card, Badge, 
    Avatar, Divider, Indicator, Paper, TextInput
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
    IconPill, IconFirstAidKit, IconHeartRateMonitor, IconBabyCarriage,
    IconStethoscope, IconPlus, IconTruck, IconSearch
} from '@tabler/icons-react';
import Image from 'next/image';

// --- COLORES CORPORATIVOS ---
const COLORS = {
    primary: '#005AAA', 
    secondary: '#E3F2FD', 
    accent: '#FFC107', 
    bgLight: 'rgba(137, 136, 177, 0.6)',
    textDark: '#333333',
    price: '#D32F2F' 
};

// --- MOCK DATA ---
const MOCK_BANNERS = [
    'https://images.unsplash.com/photo-1576602976047-174e57a47881?auto=format&fit=crop&q=80&w=1200&h=400',
    'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?auto=format&fit=crop&q=80&w=1200&h=400'
];

const MOCK_CATEGORIES = [
    { id: 1, name: 'Medicamentos', icon: IconPill },
    { id: 2, name: 'Primeros Auxilios', icon: IconFirstAidKit },
    { id: 3, name: 'Equipos Médicos', icon: IconHeartRateMonitor },
    { id: 4, name: 'Cuidado del Bebé', icon: IconBabyCarriage },
    { id: 5, name: 'Cuidado Personal', icon: IconStethoscope },
];

const HeroSlider = ({ images }) => {
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        if (!images || images.length === 0) return;
        const interval = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % images.length);
        }, 5000);
        return () => clearInterval(interval);
    }, [images]);

    return (
        <Box p={0} m={0} pos="relative" w="100%" h={{ base: 100, md: 200 }} style={{ overflow: 'hidden', borderRadius: '12px' }}>
            {images.map((img, index) => (
                <Box
                    key={index}
                    pos="absolute"
                    inset={0}
                    style={{
                        opacity: index === currentIndex ? 1 : 0,
                        transition: 'opacity 1s ease-in-out',
                        zIndex: index === currentIndex ? 1 : 0
                    }}
                >
                    <Image
                        src={img}
                        alt={`Banner ${index}`}
                        fill
                        priority={index === 0}
                        style={{ objectFit: 'cover' }}
                    />
                    <Box pos="absolute" inset={0} style={{ background: 'linear-gradient(90deg, rgba(0,90,170,0.8) 0%, rgba(0,0,0,0) 100%)' }} />
                </Box>
            ))}
            <Box pos="absolute" bottom={20} left={0} right={0} style={{ zIndex: 2 }}>
                <Group justify="center" gap="xs">
                    {images.map((_, idx) => (
                        <Box 
                            key={idx} 
                            w={idx === currentIndex ? 24 : 8} 
                            h={8} 
                            bg={idx === currentIndex ? COLORS.primary : 'rgba(255,255,255,0.5)'} 
                            style={{ borderRadius: 4, transition: 'width 0.3s' }} 
                        />
                    ))}
                </Group>
            </Box>
        </Box>
    );
};

const ProductCard = ({ product }) => {
    const getSemaforoProps = (status) => {
        switch(status) {
            case 'green': return { color: 'green', text: 'Disponible', disabled: false };
            case 'yellow': return { color: 'yellow', text: 'Pocas unidades', disabled: false };
            case 'red': return { color: 'red', text: 'Agotado', disabled: true };
            default: return { color: 'gray', text: 'Consultar', disabled: false };
        }
    };

    const statusProps = getSemaforoProps(product.stockStatus);

    return (
        <Card shadow="sm" padding="lg" radius="md" withBorder className="hover:shadow-lg transition-shadow duration-300" h="100%">
            <Card.Section pos="relative">
                {product.badge && (
                    <Badge color="blue" variant="filled" pos="absolute" top={10} left={10} style={{ zIndex: 1 }}>
                        {product.badge}
                    </Badge>
                )}
                
                <Box pos="absolute" top={10} right={10} style={{ zIndex: 1 }}>
                    <Indicator inline size={16} offset={4} position="middle-center" color={statusProps.color} withBorder>
                        <Box w={16} h={16} /> 
                    </Indicator>
                </Box>

                <Box h={180} pos="relative" bg="white" style={{ opacity: statusProps.disabled ? 0.5 : 1 }}>
                    <Image
                        src={product.image}
                        alt={product.name}
                        fill
                        sizes="(max-width: 768px) 100vw, 25vw"
                        style={{ objectFit: 'contain', padding: '10px' }}
                    />
                </Box>
            </Card.Section>

            <Stack justify="space-between" mt="md" flex={1} gap="xs">
                <Box>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={600}>{product.brand}</Text>
                    <Text fw={700} size="sm" lineClamp={2} style={{ minHeight: '40px' }}>
                        {product.name}
                    </Text>
                </Box>

                <Box mt="sm">
                    {product.requiresPrescription && (
                        <Text size="xs" c="red" fw={600} mb={4}>* Requiere Récipe Médico</Text>
                    )}
                    
                    <Group justify="space-between" align="flex-end">
                        <Box>
                            {product.oldPrice && (
                                <Text td="line-through" size="xs" c="dimmed">
                                    Ref {product.oldPrice.toFixed(2)}
                                </Text>
                            )}
                            <Text fw={900} size="xl" c={COLORS.price}>
                                Ref {product.price.toFixed(2)}
                            </Text>
                        </Box>
                        
                        <Text size="xs" c={`${statusProps.color}.7`} fw={600}>
                            {statusProps.text}
                        </Text>
                    </Group>
                </Box>

                <Button 
                    variant={statusProps.disabled ? "subtle" : "light"} 
                    color={statusProps.disabled ? "gray" : COLORS.primary} 
                    fullWidth 
                    mt="md" 
                    radius="md"
                    disabled={statusProps.disabled}
                    leftSection={!statusProps.disabled && <IconPlus size={16} />}
                >
                    {statusProps.disabled ? 'Sin Stock' : 'Agregar'}
                </Button>
            </Stack>
        </Card>
    );
};

export default function EcommerceLanding() {
    const isMobile = useMediaQuery('(max-width: 768px)');
    const [productos, setProductos] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchProductos = async () => {
            try {
                setIsLoading(true);
                await new Promise(resolve => setTimeout(resolve, 1500)); 
                
                const mockDataDeLaApi = [
                    {
                        id: 1, name: 'Vitamina C 1000mg + Zinc', brand: 'HealthPlus', price: 4.50, oldPrice: 6.00,
                        image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&q=80&w=400',
                        badge: 'Oferta', stockStatus: 'green', requiresPrescription: false
                    },
                    {
                        id: 2, name: 'Termómetro Digital Infrarrojo', brand: 'MediTech', price: 15.99,
                        image: 'https://images.unsplash.com/photo-1584017911766-d451b3d0e843?auto=format&fit=crop&q=80&w=400',
                        stockStatus: 'yellow', requiresPrescription: false
                    },
                    {
                        id: 3, name: 'Antibiótico Amoxicilina 500mg', brand: 'PharmaLab', price: 8.00,
                        image: 'https://images.unsplash.com/photo-1586942368476-00e70bb4e357?auto=format&fit=crop&q=80&w=400',
                        stockStatus: 'green', requiresPrescription: true 
                    },
                    {
                        id: 4, name: 'Suero Fisiológico 0.9% 500ml', brand: 'PharmaLab', price: 1.50,
                        image: 'https://images.unsplash.com/photo-1628771065518-0d82f1938462?auto=format&fit=crop&q=80&w=400',
                        stockStatus: 'red', requiresPrescription: false
                    }
                ];
                setProductos(mockDataDeLaApi);
            } catch (err) {
                console.error("Error fetching data: ", err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchProductos();
    }, []);

    return (
        <Box bg={COLORS.bgLight} style={{ minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>
            <Container size="xl" py="sm">

                {/* =========================================
                    BUSCADOR INICIAL (Paper)
                   ========================================= */}
                <Paper shadow="sm" p={10} radius="md" mb={10} style={{ border: `1px solid ${COLORS.secondary}` }}>
                    <TextInput
                        placeholder="Buscar medicamentos, principios activos, productos de belleza..."
                        size="lg"
                        radius="md"
                        leftSection={<IconSearch size={22} color={COLORS.primary} />}
                        styles={{ input: { backgroundColor: '#f8f9fa', border: 'none', fontWeight: 500 } }}
                    />
                </Paper>
                
                {/* =========================================
                    CARRUSEL PRINCIPAL
                   ========================================= */}
                <HeroSlider images={MOCK_BANNERS} />

                {/* =========================================
                    CATEGORÍAS (Estilo Farmatodo)
                   ========================================= */}
                <Box mt={40} mb={50}>
                    <Title order={4} mb="md" c={COLORS.textDark}>Comprar por Categorías</Title>
                    <Group justify={isMobile ? "center" : "space-between"} gap="xl">
                        {MOCK_CATEGORIES.map((cat) => (
                            <Stack key={cat.id} align="center" gap="xs" style={{ cursor: 'pointer' }} className="hover:scale-105 transition-transform">
                                <Avatar size={isMobile ? 60 : 80} radius="100%" bg="white" style={{ border: `2px solid ${COLORS.secondary}`, boxShadow: '0 4px 10px rgba(0,0,0,0.05)' }}>
                                    <cat.icon size={isMobile ? 30 : 40} color={COLORS.primary} stroke={1.5} />
                                </Avatar>
                                <Text size="sm" fw={600} ta="center" maw={90} lh={1.1}>{cat.name}</Text>
                            </Stack>
                        ))}
                    </Group>
                </Box>

                {/* =========================================
                    SECCIÓN: CATÁLOGO DE PRODUCTOS
                   ========================================= */}
                <Box mt={50}>
                    <Group justify="space-between" mb="md">
                        <Title order={3} c={COLORS.textDark}>Catálogo de Productos 💊</Title>
                    </Group>
                    
                    {isLoading ? (
                        <Center py={50}>
                            <Text c="dimmed">Cargando inventario...</Text>
                        </Center>
                    ) : (
                        <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="lg">
                            {productos.map((product) => (
                                <ProductCard key={product.id} product={product} />
                            ))}
                        </SimpleGrid>
                    )}
                </Box>

                {/* =========================================
                    BANNER PROMOCIONAL SECUNDARIO
                   ========================================= */}
                <Box mt={60} p="xl" bg={COLORS.secondary} style={{ borderRadius: '12px' }}>
                    <Grid align="center">
                        <Grid.Col span={{ base: 12, md: 8 }}>
                            <Title order={2} c={COLORS.primary}>Servicio de Delivery 24/7</Title>
                            <Text c="dimmed" mt="sm">Recibe tus medicamentos y productos de cuidado personal en la puerta de tu casa, rápido y seguro.</Text>
                        </Grid.Col>
                        <Grid.Col span={{ base: 12, md: 4 }}>
                            <Center>
                                <IconTruck size={80} color={COLORS.primary} opacity={0.5} />
                            </Center>
                        </Grid.Col>
                    </Grid>
                </Box>

            </Container>

            {/* =========================================
                FOOTER E-COMMERCE
               ========================================= */}
            <Box bg="#2C2E33" c="white" py={50} mt={60}>
                <Container size="xl">
                    <Grid>
                        <Grid.Col span={{ base: 12, md: 4 }}>
                            <Title order={3} mb="md">Mediquir</Title>
                            <Text size="sm" c="gray.4">Tu farmacia de confianza en línea. Salud y bienestar a un clic de distancia.</Text>
                        </Grid.Col>
                        <Grid.Col span={{ base: 12, md: 4 }}>
                            <Title order={5} mb="md" c="gray.3">Atención al Cliente</Title>
                            <Stack gap="xs">
                                <Anchor c="gray.4" size="sm">Preguntas Frecuentes</Anchor>
                                <Anchor c="gray.4" size="sm">Políticas de Envío</Anchor>
                                <Anchor c="gray.4" size="sm">Términos y Condiciones</Anchor>
                            </Stack>
                        </Grid.Col>
                        <Grid.Col span={{ base: 12, md: 4 }}>
                            <Title order={5} mb="md" c="gray.3">Contáctanos</Title>
                            <Text size="sm" c="gray.4">Soporte: +58 412 000 0000</Text>
                            <Text size="sm" c="gray.4">Email: contacto@mediquir.com</Text>
                        </Grid.Col>
                    </Grid>
                    <Divider my="xl" color="gray.7" />
                    <Text ta="center" size="sm" c="gray.5">© {new Date().getFullYear()} Mediquir C.A. Todos los derechos reservados.</Text>
                </Container>
            </Box>
        </Box>
    );
}   