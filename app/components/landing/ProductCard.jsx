'use client';

import React, { useState, useEffect } from 'react';
import { Card, Text, Badge, Button, Group, Stack, Box, Indicator, ActionIcon, Modal, Image, Grid, TextInput } from '@mantine/core';
import { IconShoppingCartPlus, IconChevronLeft, IconChevronRight, IconMaximize, IconMinus, IconPlus } from '@tabler/icons-react';
import { useCart } from './CartContext';
export default function ProductCard({ product }) {
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    
    // Estados para Modales
    const [imageModalOpened, setImageModalOpened] = useState(false);
    const [detailModalOpened, setDetailModalOpened] = useState(false);
    const [quantity, setQuantity] = useState(1);

    const { addToCart } = useCart();

    // --- LÓGICA DE FINANZAS Y STOCK ---
    const isOutOfStock = Number(product.stockAlmacen) <= 0;
    const precioBase = Number(product.precio7) > 0 ? Number(product.precio7) : Number(product.costoUsd) * 1.5;
    
    const porcentajeAhorro = Number(product.porcentajeDescuento) || 0;
    const hasDiscount = porcentajeAhorro > 0;
    
    const precioFinal = hasDiscount 
        ? precioBase - (precioBase * (porcentajeAhorro / 100)) 
        : precioBase;

    // --- LÓGICA DE IMÁGENES ---
    const carouselImages = [];
    const baseUrl = process.env.NEXT_PUBLIC_BLOB_BASE_URL;

    if (product.imagen) carouselImages.push(`${baseUrl}/${product.imagen}`);
    else if (product.grupoEquivalencia?.imagen) carouselImages.push(`${baseUrl}/${product.grupoEquivalencia.imagen}`);
    
    if (product.marca?.imagen) carouselImages.push(`${baseUrl}/${product.marca.imagen}`);
    if (carouselImages.length === 0) carouselImages.push('/placeholder-med.png'); 

    // Auto-play
    useEffect(() => {
        if (carouselImages.length <= 1 || imageModalOpened) return; // Pausar si el modal está abierto
        const timer = setInterval(() => {
            setCurrentImageIndex((prev) => (prev + 1) % carouselImages.length);
        }, 3000 + ((product.id % 5) * 500));
        return () => clearInterval(timer);
    }, [carouselImages.length, product.id, imageModalOpened]);

    const nextImage = (e) => {
        if(e) e.stopPropagation();
        setCurrentImageIndex((prev) => (prev + 1) % carouselImages.length);
    };

    const prevImage = (e) => {
        if(e) e.stopPropagation();
        setCurrentImageIndex((prev) => (prev - 1 + carouselImages.length) % carouselImages.length);
    };

    const handleAddToCart = () => {
        addToCart(product, quantity, precioFinal);
        setDetailModalOpened(false);
        setQuantity(1); // Reset
    };

    return (
        <>
            {/* --- TARJETA PRINCIPAL --- */}
            <Card 
                shadow="sm" padding="lg" radius="md" bg="white"
                onClick={() => setDetailModalOpened(true)} // Click general abre el modal de producto
                style={{ 
                    height: '100%', display: 'flex', flexDirection: 'column', 
                    cursor: 'pointer', border: '1px solid #E9ECEF',
                    transition: 'transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), box-shadow 0.3s', 
                    '&:hover': { transform: 'translateY(-10px)', boxShadow: '0 20px 40px rgba(0,0,0,0.08)' } 
                }}
            >
                <Card.Section pos="relative" p="md">
                    {hasDiscount && (
                        <Badge color="red.7" variant="filled" pos="absolute" top={15} left={15} style={{ zIndex: 2 }}>
                            -{porcentajeAhorro}%
                        </Badge>
                    )}
                    
                    <Box pos="absolute" top={15} right={15} style={{ zIndex: 2 }}>
                        <Indicator inline size={12} offset={4} position="middle-center" color={isOutOfStock ? 'red' : 'teal'} withBorder />
                    </Box>

                    {/* Contenedor de Imagen */}
                    <Box 
                        h={200} pos="relative" 
                        style={{ opacity: isOutOfStock ? 0.5 : 1, overflow: 'hidden', borderRadius: '8px', backgroundColor: '#F8F9FA' }}
                    >
                        {/* Botón para expandir imagen sin abrir detalles */}
                        <ActionIcon 
                            pos="absolute" bottom={10} right={10} size="md" radius="xl" variant="white" color="gray"
                            style={{ zIndex: 3, boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}
                            onClick={(e) => { e.stopPropagation(); setImageModalOpened(true); }}
                        >
                            <IconMaximize size={16} />
                        </ActionIcon>

                        <Box style={{ display: 'flex', width: '100%', height: '100%', transform: `translateX(-${currentImageIndex * 100}%)`, transition: 'transform 0.5s ease-in-out' }}>
                            {carouselImages.map((src, index) => (
                                <Box key={index} style={{ flexShrink: 0, width: '100%', height: '100%', padding: '10px' }}>
                                    <Image src={src} alt={product.nombre} fit="contain" h="100%" />
                                </Box>
                            ))}
                        </Box>
                    </Box>
                </Card.Section>

                <Stack justify="space-between" mt="md" flex={1} gap="xs">
                    <Box>
                        <Group justify="space-between" align="flex-start" wrap="nowrap" mb={8}>
                            <Text size="xs" c="blue.9" tt="uppercase" fw={800} lineClamp={1} lts={1}>
                                {product.marca?.nombre || 'GENÉRICO'}
                            </Text>
                            <Text size="xs" c="gray.5" fw={600}>{product.presentacion}</Text>
                        </Group>
                        <Text fw={700} size="md" lineClamp={2} c="#0B1B3D" style={{ minHeight: '44px', lineHeight: 1.3 }}>
                            {product.nombre}
                        </Text>
                    </Box>

                    <Box mt="auto">
                        {hasDiscount && (
                            <Text td="line-through" size="sm" c="dimmed" lh={1}>
                                Ref ${precioBase.toFixed(2)}
                            </Text>
                        )}
                        <Group justify="space-between" align="flex-end">
                            <Text fw={900} size="xl" c={hasDiscount ? "red.7" : "#005AAA"}>
                                Ref ${precioFinal.toFixed(2)}
                            </Text>
                            <Text size="xs" c={isOutOfStock ? "red.7" : "teal.7"} fw={700} tt="uppercase">
                                {isOutOfStock ? 'Agotado' : 'Disponible'}
                            </Text>
                        </Group>
                    </Box>

                    <Button 
                        variant={isOutOfStock ? "light" : "filled"} 
                        color={isOutOfStock ? "gray" : "#0B1B3D"} 
                        fullWidth mt="sm" radius="md" size="md"
                        disabled={isOutOfStock}
                        onClick={(e) => { e.stopPropagation(); setDetailModalOpened(true); }} // También abre el modal
                        leftSection={!isOutOfStock && <IconShoppingCartPlus size={18} />}
                    >
                        {isOutOfStock ? 'Agotado' : 'Añadir'}
                    </Button>
                </Stack>
            </Card>

            {/* --- MODAL 1: VISOR DE IMÁGENES TIPO LIGHTBOX --- */}
            <Modal 
                opened={imageModalOpened} 
                onClose={() => setImageModalOpened(false)} 
                fullScreen 
                transitionProps={{ transition: 'fade', duration: 200 }}
                styles={{ content: { backgroundColor: 'rgba(0,0,0,0.95)' }, header: { backgroundColor: 'transparent' }, close: { color: 'white' } }}
            >
                <Box h="85vh" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                    {carouselImages.length > 1 && (
                        <ActionIcon pos="absolute" left={20} size={50} radius="xl" variant="light" color="gray" onClick={prevImage} style={{ zIndex: 10 }}>
                            <IconChevronLeft size={30} />
                        </ActionIcon>
                    )}
                    
                    <Image src={carouselImages[currentImageIndex]} alt={product.nombre} fit="contain" h="100%" maw="90vw" />
                    
                    {carouselImages.length > 1 && (
                        <ActionIcon pos="absolute" right={20} size={50} radius="xl" variant="light" color="gray" onClick={nextImage} style={{ zIndex: 10 }}>
                            <IconChevronRight size={30} />
                        </ActionIcon>
                    )}
                </Box>
            </Modal>

            {/* --- MODAL 2: DETALLES DEL PRODUCTO Y AÑADIR AL CARRITO --- */}
            <Modal 
                opened={detailModalOpened} 
                onClose={() => setDetailModalOpened(false)}
                size="lg"
                centered
                radius="md"
                padding="xl"
            >
                <Grid gutter="xl">
                    <Grid.Col span={{ base: 12, md: 6 }}>
                        <Box bg="gray.1" style={{ borderRadius: '8px', padding: '20px' }}>
                            <Image src={carouselImages[0]} alt={product.nombre} fit="contain" h={300} />
                        </Box>
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, md: 6 }}>
                        <Stack justify="center" h="100%">
                            <Box>
                                <Badge color="blue.9" mb="sm">{product.marca?.nombre || 'Genérico'}</Badge>
                                <Text fw={900} size="xl" lh={1.2} mb="xs" c="#0B1B3D">{product.nombre}</Text>
                                <Text c="dimmed" size="sm">{product.presentacion}</Text>
                            </Box>

                            <Group align="flex-end" gap="xs">
                                <Text fw={900} size="32px" c={hasDiscount ? "red.7" : "#005AAA"}>
                                    ${precioFinal.toFixed(2)}
                                </Text>
                                {hasDiscount && <Text td="line-through" c="dimmed" size="lg" mb={4}>${precioBase.toFixed(2)}</Text>}
                            </Group>

                            {!isOutOfStock ? (
                                <Box mt="md">
                                    <Text size="sm" fw={600} mb="xs">Cantidad:</Text>
                                    <Group wrap="nowrap" mb="xl">
                                        <Group gap={0} style={{ border: '1px solid #E9ECEF', borderRadius: '8px', overflow: 'hidden' }}>
                                            <ActionIcon size={42} variant="transparent" c="black" onClick={() => setQuantity(q => Math.max(1, q - 1))}>
                                                <IconMinus size={16} />
                                            </ActionIcon>
                                            <TextInput 
                                                variant="unstyled" value={quantity} readOnly
                                                styles={{ input: { width: 50, textAlign: 'center', fontWeight: 'bold' } }}
                                            />
                                            <ActionIcon size={42} variant="transparent" c="black" onClick={() => setQuantity(q => q + 1)}>
                                                <IconPlus size={16} />
                                            </ActionIcon>
                                        </Group>
                                    </Group>

                                    <Button fullWidth size="lg" radius="md" color="#0B1B3D" onClick={handleAddToCart}>
                                        Agregar al Carrito • ${(precioFinal * quantity).toFixed(2)}
                                    </Button>
                                </Box>
                            ) : (
                                <Text c="red.7" fw={700} size="lg" mt="xl">Producto temporalmente agotado.</Text>
                            )}
                        </Stack>
                    </Grid.Col>
                </Grid>
            </Modal>
        </>
    );
}