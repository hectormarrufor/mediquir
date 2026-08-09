'use client';

import React, { useRef, useEffect, useState } from 'react';
import {
    Title, Text, Button, Container, Paper, Box, Stack,
    Group, Anchor, SimpleGrid, Card, Badge, List, Divider,
    Flex, ThemeIcon, Grid
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
    IconMail, IconAnchor, IconShip, IconCompass,
    IconMapPin, IconCheck, IconRipple, IconTool, 
    IconShieldCheck, IconEngine
} from '@tabler/icons-react';
import Image from 'next/image';
import Link from 'next/link';
import { tenant } from '@/config/tenant';

// --- COLORES CORPORATIVOS FORSUMACA (Naval) ---
const COLORS = {
    navy: '#0A192F', // Azul Marino Profundo
    ocean: '#00509E', // Azul Océano
    cyan: '#00B4D8', // Cyan Náutico (Acento)
    lightBg: '#F0F4F8', // Gris azulado muy claro para fondos
    textDark: '#1A202C',
};

// --- COMPONENTE DE ANIMACIÓN (Fade In Up) ---
const FadeInSection = ({ children, delay = 0 }) => {
    const [isVisible, setVisible] = useState(false);
    // FIX: Obligatorio inicializar en null para React 19
    const domRef = useRef(null);

    useEffect(() => {
        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    setVisible(true);
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1 });

        const currentElement = domRef.current;
        if (currentElement) observer.observe(currentElement);

        return () => {
            if (currentElement) observer.unobserve(currentElement);
        };
    }, []);

    return (
        <div
            ref={domRef}
            style={{
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? 'translateY(0)' : 'translateY(50px)',
                transition: `opacity 0.8s ease-out ${delay}s, transform 0.8s ease-out ${delay}s`,
                willChange: 'opacity, transform',
                width: '100%'
            }}
        >
            {children}
        </div>
    );
};

// --- CARRUSEL NATIVO SIN DEPENDENCIAS ---
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
        <Box pos="absolute" inset={0} style={{ zIndex: 0, backgroundColor: '#000' }}>
            {images.map((img, index) => (
                <Box
                    key={index}
                    pos="absolute"
                    inset={0}
                    style={{
                        opacity: index === currentIndex ? 1 : 0,
                        transition: 'opacity 2s ease-in-out', 
                        zIndex: index === currentIndex ? 1 : 0
                    }}
                >
                    <Image
                        src={`${img}?v=${process.env.NEXT_PUBLIC_APP_VERSION || '1'}`}
                        alt={`Slide Naval ${index}`}
                        fill
                        priority={index === 0}
                        sizes="100vw"
                        style={{
                            objectFit: 'cover',
                            filter: 'brightness(0.6)' 
                        }}
                    />
                </Box>
            ))}
        </Box>
    );
};

// --- DATOS NAVALES ---
const serviciosPrincipales = [
    {
        title: "Transporte Marítimo",
        img: tenant.assets.heroImages?.flota || "/tenants/forsumaca/flota.jpg",
        desc: "Movilización de personal y equipos hacia plataformas y locaciones offshore con embarcaciones de alto rendimiento.",
        icon: IconShip
    },
    {
        title: "Soporte Offshore",
        img: tenant.assets.fondoGlobal || "/tenants/forsumaca/fondo.jpg",
        desc: "Asistencia logística integral en el mar, garantizando la continuidad de las operaciones petroleras y navales.",
        icon: IconAnchor
    },
    {
        title: "Mantenimiento Naval",
        img: tenant.assets.heroImages?.personal || "/tenants/forsumaca/personal.jpg",
        desc: "Servicios preventivos y correctivos para motores marinos, cascos y sistemas de navegación con personal certificado.",
        icon: IconEngine
    },
];

const valores = [
    "Seguridad Marítima",
    "Respuesta Inmediata",
    "Confiabilidad Técnica",
    "Preservación Ambiental",
    "Innovación Logística"
];

export default function LandingForsumaca() {
    const isMobile = useMediaQuery('(max-width: 768px)');
    const heroHeight = '90vh';

    const glassStyle = {
        backgroundColor: 'rgba(10, 25, 47, 0.75)',
        backdropFilter: 'blur(10px)',
        border: `1px solid rgba(0, 180, 216, 0.3)`,
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
    };

    return (
        <Box style={{ overflowX: 'hidden', width: '100%', fontFamily: 'system-ui, sans-serif', backgroundColor: COLORS.lightBg }}>

            {/* =========================================
                SECCIÓN 1: HERO (Diseño Full Screen con Glassmorphism)
               ========================================= */}
            <Box pos="relative" w="100%" h={heroHeight} bg={COLORS.navy} mb={60}>
                
                {/* Carrusel Nativo */}
                <HeroSlider images={tenant.assets.carousel || []} />
                
                {/* Overlay Degradado Radial */}
                <Box pos="absolute" inset={0} style={{ zIndex: 1, background: 'radial-gradient(circle at center, rgba(10,25,47,0.3) 0%, rgba(10,25,47,0.8) 100%)' }} />

                <Container size="xl" h="100%" pos="relative" style={{ zIndex: 2 }}>
                    <Flex h="100%" align="center" justify={isMobile ? "center" : "flex-start"} pb={isMobile ? 0 : 50}>
                        <FadeInSection>
                            {/* Panel flotante que diferencia el diseño de Dadica */}
                            <Paper p={{ base: 'xl', md: 50 }} radius="lg" style={glassStyle} maw={650}>
                                <Stack align="flex-start" gap="md">
                                    <Badge color={COLORS.cyan} variant="light" size="lg" radius="sm">Logística Naval Especializada</Badge>
                                    <Title order={1} c="white" fz={{ base: 36, sm: 48, md: 52 }} fw={900} lh={1.1}>
                                        Dominamos el mar para <Text span c={COLORS.cyan} inherit>impulsar su industria.</Text>
                                    </Title>
                                    <Text c="gray.3" size="lg" mt="sm">
                                        Servicios marítimos integrales, transporte offshore y mantenimiento de embarcaciones con máxima eficiencia y seguridad.
                                    </Text>
                                    <Button
                                        size="lg"
                                        color="cyan"
                                        c={COLORS.navy}
                                        radius="xl"
                                        component="a"
                                        href="https://wa.me/584120000000" // Cambiar por numero de Forza
                                        target="_blank"
                                        rightSection={<IconRipple size={22} />}
                                        mt="md"
                                        style={{ transition: 'all 0.3s', fontWeight: 700 }}
                                    >
                                        Coordinar Zarpe
                                    </Button>
                                </Stack>
                            </Paper>
                        </FadeInSection>
                    </Flex>
                </Container>
            </Box>

            {/* =========================================
                SECCIÓN 2: NOSOTROS (Layout Invertido y Limpio)
               ========================================= */}
            <Container size="xl" py={80}>
                <Grid gutter={60} align="center">
                    <Grid.Col span={{ base: 12, md: 6 }}>
                        <FadeInSection delay={0.2}>
                            <Box pos="relative" h={400}>
                                <Image 
                                    src={tenant.assets.logo} 
                                    alt="Watermark Forsumaca" 
                                    fill
                                    sizes="(max-width: 768px) 100vw, 50vw"
                                    style={{ 
                                        objectFit: 'contain', 
                                        opacity: 0.1,
                                        zIndex: 0
                                    }} 
                                />
                                <Stack h="100%" justify="center" p="xl" pos="relative" style={{ zIndex: 1 }}>
                                    <Title order={4} mb="md" c={COLORS.ocean}>Nuestra Brújula</Title>
                                    <SimpleGrid cols={1} spacing="md">
                                        {valores.map((val, i) => (
                                            <Group key={i} gap="md" align="center">
                                                <ThemeIcon size="md" color="cyan" radius="xl" variant="light"><IconCompass size={16} /></ThemeIcon>
                                                <Text size="md" fw={500} c={COLORS.textDark}>{val}</Text>
                                            </Group>
                                        ))}
                                    </SimpleGrid>
                                </Stack>
                            </Box>
                        </FadeInSection>
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, md: 6 }}>
                        <FadeInSection>
                            <Stack gap="lg">
                                <Title order={2} size="h1" lh={1.2} c={COLORS.navy}>
                                    Trayectoria firme en aguas desafiantes
                                </Title>
                                <Text c="dimmed" size="lg" ta="justify">
                                    <Text span fw={700} c={COLORS.ocean}>{tenant.name}</Text> provee soluciones marítimas de primer nivel. Nos especializamos en el transporte de personal, equipos y soporte directo a operaciones lacustres y offshore.
                                </Text>

                                <Group mt="md" grow>
                                    <Paper p="md" bg="white" radius="md" shadow="sm" style={{ borderTop: `3px solid ${COLORS.cyan}` }}>
                                        <Text fw={800} c={COLORS.navy} size="xl">24/7</Text>
                                        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Operaciones</Text>
                                    </Paper>
                                    <Paper p="md" bg="white" radius="md" shadow="sm" style={{ borderTop: `3px solid ${COLORS.ocean}` }}>
                                        <Text fw={800} c={COLORS.navy} size="xl">100%</Text>
                                        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Efectividad</Text>
                                    </Paper>
                                </Group>
                            </Stack>
                        </FadeInSection>
                    </Grid.Col>
                </Grid>
            </Container>

            {/* =========================================
                SECCIÓN 3: SERVICIOS NAVALES (Grid Moderno sin bordes)
               ========================================= */}
            <Box py={100} bg="white">
                <Container size="xl">
                    <Stack align="center" mb={60}>
                        <Title order={2} c={COLORS.navy} tt="uppercase" lts={1}>Nuestra Especialidad</Title>
                        <Divider size="sm" w={60} color={COLORS.cyan} />
                    </Stack>

                    <SimpleGrid cols={{ base: 1, md: 3 }} spacing={40}>
                        {serviciosPrincipales.map((srv, index) => (
                            <FadeInSection key={index} delay={index * 0.15}>
                                <Card padding="xl" radius="lg" bg={COLORS.lightBg} style={{ border: 'none', transition: 'transform 0.3s ease', cursor: 'pointer' }} className="hover:shadow-lg hover:-translate-y-2">
                                    <ThemeIcon size={60} radius="md" color="ocean" variant="light" mb="lg">
                                        <srv.icon size={32} />
                                    </ThemeIcon>
                                    <Title order={4} mb="sm" c={COLORS.navy}>{srv.title}</Title>
                                    <Text size="sm" c="dimmed" lh={1.6}>{srv.desc}</Text>
                                </Card>
                            </FadeInSection>
                        ))}
                    </SimpleGrid>
                </Container>
            </Box>

            {/* =========================================
                SECCIÓN 4: FLOTA NAVAL
            ========================================= */}
            <Box bg={COLORS.navy} c="white" py={100} pos="relative">
                <Container size="xl">
                    <Grid align="center" gutter={60}>
                        <Grid.Col span={{ base: 12, md: 6 }} order={{ base: 2, md: 1 }}>
                            <FadeInSection delay={0.2}>
                                <Box pos="relative" h={450} w="100%">
                                    <Image 
                                        src={tenant.assets.heroImages?.flota || "/flota.jpg"} 
                                        alt="Flota Naval Forza"
                                        fill
                                        sizes="(max-width: 768px) 100vw, 50vw"
                                        style={{ 
                                            objectFit: 'cover', 
                                            borderRadius: '100px 20px 100px 20px' 
                                        }} 
                                    />
                                </Box>
                            </FadeInSection>
                        </Grid.Col>
                        <Grid.Col span={{ base: 12, md: 6 }} order={{ base: 1, md: 2 }}>
                            <FadeInSection>
                                <Title order={2} c="white" mb="md" tt="uppercase">Flota Operativa</Title>
                                <Text c="cyan.2" mb="xl" size="lg">
                                    Embarcaciones de última generación, dotadas con tecnología de navegación avanzada y avaladas por los entes rectores marítimos.
                                </Text>

                                <List spacing="md" size="md" icon={<ThemeIcon color="cyan" size={24} radius="xl" variant="light"><IconCheck size={14} /></ThemeIcon>}>
                                    <List.Item>Lanchas rápidas de transporte de personal (Crew Boats)</List.Item>
                                    <List.Item>Embarcaciones de soporte logístico</List.Item>
                                    <List.Item>Remolcadores</List.Item>
                                    <List.Item>Equipos de contingencia y salvamento</List.Item>
                                </List>
                            </FadeInSection>
                        </Grid.Col>
                    </Grid>
                </Container>
            </Box>

            {/* =========================================
                SECCIÓN 5: CERTIFICACIONES Y SEGURIDAD
               ========================================= */}
            <Container size="xl" py={100}>
                <Title order={2} ta="center" c={COLORS.navy} mb={50}>Cumplimiento Marítimo</Title>
                <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="xl">
                    {[
                        { title: "INEA", desc: "Permisología y Zarpe Vigente", icon: IconShieldCheck },
                        { title: "Mantenimiento", desc: "Varaderos y diques certificados", icon: IconTool },
                        { title: "Trazabilidad", desc: "Monitoreo de rutas y navegación", icon: IconMapPin }
                    ].map((item, i) => (
                        <FadeInSection key={i} delay={i * 0.1}>
                            <Stack align="center" ta="center">
                                <ThemeIcon size={70} radius="100%" variant="outline" color="cyan" style={{ borderWidth: 2 }}>
                                    <item.icon size={30} />
                                </ThemeIcon>
                                <Title order={5} c={COLORS.navy} mt="sm">{item.title}</Title>
                                <Text size="sm" c="dimmed">{item.desc}</Text>
                            </Stack>
                        </FadeInSection>
                    ))}
                </SimpleGrid>
            </Container>

            {/* =========================================
                SECCIÓN 6: CTA FINAL
               ========================================= */}
            <Box py={80} bg={COLORS.ocean} c="white">
                <Container size="md">
                    <FadeInSection>
                        <Stack align="center" gap="lg">
                            <Title order={2} ta="center" fz={{ base: 28, md: 40 }}>¿Requiere asistencia logística en el agua?</Title>
                            <Text size="lg" c="gray.2" ta="center" maw={600}>
                                Nuestro equipo en muelle está listo para recibir su solicitud de zarpe o mantenimiento naval.
                            </Text>
                            <Group mt="md">
                                <Button size="lg" variant="white" color={COLORS.navy} component="a" href="mailto:operaciones@forsumaca.com" leftSection={<IconMail />}>
                                    Contacto Comercial
                                </Button>
                            </Group>
                        </Stack>
                    </FadeInSection>
                </Container>
            </Box>

            {/* =========================================
                FOOTER
               ========================================= */}
            <Box bg={COLORS.navy} c="gray.5" py={60} style={{ borderTop: `4px solid ${COLORS.cyan}` }}>
                <Container size="lg">
                    <Flex direction={isMobile ? 'column' : 'row'} justify="space-between" align="center" gap="xl">
                        <Stack gap={5} align={isMobile ? 'center' : 'flex-start'}>
                            <Box pos="relative" h={60} w={220} mb={10}>
                                <Image 
                                    src={tenant.assets.logo} 
                                    alt={`Logo ${tenant.name}`} 
                                    fill
                                    sizes="220px"
                                    style={{ 
                                        objectFit: 'contain', 
                                        objectPosition: isMobile ? 'center' : 'left'
                                    }} 
                                />
                            </Box>
                            <Text size="sm">Rif: J-XXXXXXXX-X</Text>
                            <Text size="xs">Operaciones Lacustres y Marítimas</Text>
                        </Stack>
                        <Group gap="xl">
                            <Anchor component={Link} c="gray.4" size="sm" href="/">Inicio</Anchor>
                            <Anchor component={Link} c="gray.4" size="sm" href="/flota">Flota Naval</Anchor>
                            <Anchor component={Link} c="gray.4" size="sm" href="/servicios">Servicios</Anchor>
                        </Group>
                        <Text size="sm">© {new Date().getFullYear()} {tenant.name}</Text>
                    </Flex>
                </Container>
            </Box>
        </Box>
    );
}