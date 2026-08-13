'use client';

import React, { useState, useEffect } from 'react';
import { Card, Text, Badge, Button, Group, Stack, Box, Indicator, ActionIcon } from '@mantine/core';
import { IconShoppingCartPlus, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';

export default function ProductCard({ product }) {
    const [currentImageIndex, setCurrentImageIndex] = useState(0);

    // --- LÓGICA DE FINANZAS Y STOCK ---
    const isOutOfStock = Number(product.stockAlmacen) <= 0;
    const precioBase = Number(product.precio6) || Number(product.costoUsd) * 1.5;
    const precioDescuento = Number(product.precioDescuento);
    const hasDiscount = precioDescuento > 0;
    const precioFinal = hasDiscount ? precioDescuento : precioBase;
    const porcentajeAhorro = hasDiscount ? Math.round(((precioBase - precioDescuento) / precioBase) * 100) : 0;

    // --- LÓGICA DE PRIORIDAD DE IMÁGENES ---
    const carouselImages = [];
    const baseUrl = process.env.NEXT_PUBLIC_BLOB_BASE_URL;

    if (product.imagen) {
        carouselImages.push(`${baseUrl}/${product.imagen}`);
    } else if (product.grupoEquivalencia?.imagen) {
        carouselImages.push(`${baseUrl}/${product.grupoEquivalencia.imagen}`);
    }

    if (product.marca?.imagen) {
        carouselImages.push(`${baseUrl}/${product.marca.imagen}`);
    }

    if (carouselImages.length === 0) {
        carouselImages.push('/placeholder-med.png'); 
    }

    // --- MAGIA DE AUTOPLAY ASÍNCRONO ---
    useEffect(() => {
        if (carouselImages.length <= 1) return;

        const tiempoBase = 3000;
        const tiempoDesfase = (product.id % 5) * 500; 
        const intervaloUnico = tiempoBase + tiempoDesfase;

        const timer = setInterval(() => {
            setCurrentImageIndex((prev) => (prev + 1) % carouselImages.length);
        }, intervaloUnico);

        return () => clearInterval(timer);
    }, [carouselImages.length, product.id]);


    // --- FUNCIONES MANUALES DEL CARRUSEL ---
    const nextImage = (e) => {
        e.stopPropagation();
        setCurrentImageIndex((prev) => (prev + 1) % carouselImages.length);
    };

    const prevImage = (e) => {
        e.stopPropagation();
        setCurrentImageIndex((prev) => (prev - 1 + carouselImages.length) % carouselImages.length);
    };

    return (
        <Card shadow="sm" padding="lg" radius="md" withBorder style={{ height: '100%', display: 'flex', flexDirection: 'column', transition: 'transform 0.2s', '&:hover': { transform: 'translateY(-5px)', boxShadow: '0 10px 20px rgba(0,0,0,0.1)' } }}>
            <Card.Section pos="relative" p="md" bg="white">
                {/* Badges de Oferta */}
                {hasDiscount && (
                    <Badge color="red" variant="filled" pos="absolute" top={10} left={10} style={{ zIndex: 2 }}>
                        -{porcentajeAhorro}% OFF
                    </Badge>
                )}
                
                {/* Indicador de Stock */}
                <Box pos="absolute" top={10} right={10} style={{ zIndex: 2 }}>
                    <Indicator inline size={12} offset={4} position="middle-center" color={isOutOfStock ? 'red' : 'green'} withBorder />
                </Box>

                {/* 🔥 NUEVO VISOR DEL CARRUSEL (Efecto Slide) 🔥 */}
                <Box h={180} pos="relative" style={{ opacity: isOutOfStock ? 0.5 : 1, overflow: 'hidden' }}>
                    
                    {/* Contenedor Flex que se desliza horizontalmente */}
                    <Box 
                        style={{
                            display: 'flex',
                            width: '100%',
                            height: '100%',
                            transform: `translateX(-${currentImageIndex * 100}%)`,
                            transition: 'transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)' // Transición más suave y natural
                        }}
                    >
                        {carouselImages.map((src, index) => (
                            <Box key={index} style={{ flexShrink: 0, width: '100%', height: '100%' }}>
                                <img 
                                    src={src} 
                                    alt={`${product.nombre} - Vista ${index + 1}`} 
                                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                />
                            </Box>
                        ))}
                    </Box>

                    {/* Controles del Carrusel (Flechas y Puntos) */}
                    {carouselImages.length > 1 && (
                        <>
                            <ActionIcon 
                                variant="default" radius="xl" size="sm" 
                                pos="absolute" left={0} top="50%" style={{ transform: 'translateY(-50%)', zIndex: 2, opacity: 0.8 }}
                                onClick={prevImage}
                            >
                                <IconChevronLeft size={16} />
                            </ActionIcon>
                            <ActionIcon 
                                variant="default" radius="xl" size="sm" 
                                pos="absolute" right={0} top="50%" style={{ transform: 'translateY(-50%)', zIndex: 2, opacity: 0.8 }}
                                onClick={nextImage}
                            >
                                <IconChevronRight size={16} />
                            </ActionIcon>

                            <Group gap={4} justify="center" pos="absolute" bottom={-10} left={0} right={0}>
                                {carouselImages.map((_, idx) => (
                                    <Box 
                                        key={idx} 
                                        w={idx === currentImageIndex ? 12 : 6} 
                                        h={6} 
                                        bg={idx === currentImageIndex ? 'blue.6' : 'gray.3'} 
                                        style={{ borderRadius: 10, transition: 'width 0.3s ease, background-color 0.3s ease' }} 
                                    />
                                ))}
                            </Group>
                        </>
                    )}
                </Box>
            </Card.Section>

            <Stack justify="space-between" mt="md" flex={1} gap="xs">
                <Box>
                    <Group justify="space-between" align="flex-start" wrap="nowrap" mb={4}>
                        <Text size="xs" c="dimmed" tt="uppercase" fw={700} lineClamp={1}>
                            {product.marca?.nombre || 'Genérico'}
                        </Text>
                        <Text size="xs" c="gray.5">{product.presentacion}</Text>
                    </Group>
                    
                    <Text fw={700} size="sm" lineClamp={2} style={{ minHeight: '40px', lineHeight: 1.2 }}>
                        {product.nombre}
                    </Text>
                </Box>

                <Box mt="sm">
                    <Group justify="space-between" align="flex-end">
                        <Box>
                            {hasDiscount && (
                                <Text td="line-through" size="xs" c="dimmed">
                                    Ref ${precioBase.toFixed(2)}
                                </Text>
                            )}
                            <Text fw={900} size="xl" c={hasDiscount ? "red.7" : "blue.9"}>
                                Ref ${precioFinal.toFixed(2)}
                            </Text>
                        </Box>
                        
                        <Text size="xs" c={isOutOfStock ? "red.7" : "green.7"} fw={600}>
                            {isOutOfStock ? 'Agotado' : 'Disponible'}
                        </Text>
                    </Group>
                </Box>

                <Button 
                    variant={isOutOfStock ? "subtle" : "light"} 
                    color={isOutOfStock ? "gray" : "blue.9"} 
                    fullWidth 
                    mt="md" 
                    radius="md"
                    disabled={isOutOfStock}
                    leftSection={!isOutOfStock && <IconShoppingCartPlus size={18} />}
                >
                    {isOutOfStock ? 'Sin Stock' : 'Agregar'}
                </Button>
            </Stack>
        </Card>
    );
}