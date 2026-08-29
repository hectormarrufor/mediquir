'use client';

import React, { useState } from 'react';
import { Box, Drawer, Indicator, ActionIcon, Stack, Group, Text, Button, ScrollArea, Image } from '@mantine/core';
import { IconShoppingCart, IconTrash, IconMinus, IconPlus } from '@tabler/icons-react';

import HeroSection from './components/landing/HeroSection';
import CategorySection from './components/landing/CategorySection';
import BestSellersSection from './components/landing/BestSellersSection';
import FooterSection from './components/landing/FooterSection';
import { useCart } from './components/landing/CartContext';

export default function LandingMediquir() {
    const [cartOpened, setCartOpened] = useState(false);
    const { cart, removeFromCart, updateQuantity, subtotal, totalItems, isLoaded } = useCart();
    
    // --- ESTADOS DE FILTRADO GLOBAL DE LA LANDING ---
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState(null);

    const scrollToProducts = () => {
        const section = document.getElementById('productos-section');
        if (section) {
            section.scrollIntoView({ behavior: 'smooth' });
        }
    };

    const handleSearch = (query) => {
        setSearchQuery(query);
        setSelectedCategory(null); // Resetea categoría si se hace una búsqueda global
        scrollToProducts();
    };

    const handleSelectCategory = (category) => {
        setSelectedCategory(category);
        setSearchQuery(''); // Resetea la búsqueda textual si se elige una categoría
        scrollToProducts();
    };

    const handleClearFilters = () => {
        setSearchQuery('');
        setSelectedCategory(null);
    };

    const getProductImage = (product) => {
        const baseUrl = process.env.NEXT_PUBLIC_BLOB_BASE_URL || '';
        if (product?.imagen) return `${baseUrl}/${product.imagen}`;
        if (product?.grupoEquivalencia?.imagen) return `${baseUrl}/${product.grupoEquivalencia.imagen}`;
        if (product?.marca?.imagen) return `${baseUrl}/${product.marca.imagen}`;
        return '/placeholder-med.png';
    };

    return (
        <Box bg="#F8F9FA" style={{ minHeight: '100vh', overflow: 'hidden', position: 'relative' }}>
            
            <HeroSection 
                searchQuery={searchQuery}
                onSearch={handleSearch}
            />

            <CategorySection 
                selectedCategory={selectedCategory}
                onSelectCategory={handleSelectCategory}
            />
            
            <Box id="productos-section">
                <BestSellersSection 
                    searchQuery={searchQuery}
                    selectedCategory={selectedCategory}
                    onClearFilters={handleClearFilters}
                />
            </Box>
            
            <FooterSection />

            {/* BOTÓN FLOTANTE DEL CARRITO */}
            {isLoaded && (
                <Box pos="fixed" bottom={30} right={30} style={{ zIndex: 100 }}>
                    <Indicator label={totalItems} size={22} color="red" offset={5} disabled={totalItems === 0}>
                        <ActionIcon 
                            radius="xl" 
                            size={60} 
                            color="#0B1B3D" 
                            variant="filled"
                            onClick={() => setCartOpened(true)}
                            style={{ boxShadow: '0 8px 25px rgba(0,0,0,0.25)', transition: 'transform 0.2s' }}
                            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                        >
                            <IconShoppingCart size={28} />
                        </ActionIcon>
                    </Indicator>
                </Box>
            )}

            {/* DRAWER DEL CARRITO */}
            <Drawer 
                opened={cartOpened} 
                onClose={() => setCartOpened(false)} 
                position="right" 
                title={<Text fw={900} size="xl" c="#0B1B3D">Tu Carrito</Text>}
                padding="md"
                size="md"
            >
                <ScrollArea h="calc(100vh - 200px)" type="auto">
                    {cart.length === 0 ? (
                        <Stack align="center" mt={50} c="dimmed">
                            <IconShoppingCart size={50} opacity={0.4} />
                            <Text fw={500}>Tu carrito está vacío.</Text>
                        </Stack>
                    ) : (
                        <Stack gap="md">
                            {cart.map((item) => (
                                <Group key={item.product.id} wrap="nowrap" align="flex-start">
                                    <Image 
                                        src={getProductImage(item.product)} 
                                        w={65} h={65} radius="md" fit="contain" bg="gray.1" p={4}
                                        fallbackSrc="/placeholder-med.png"
                                    />
                                    <Box flex={1}>
                                        <Text size="sm" fw={700} lineClamp={2} c="#0B1B3D">{item.product.nombre}</Text>
                                        <Text size="xs" c="dimmed" fw={600}>Ref ${item.precioFinal.toFixed(2)}</Text>
                                        
                                        <Group gap="xs" mt="xs">
                                            <ActionIcon variant="light" size="sm" color="gray" onClick={() => updateQuantity(item.product.id, item.quantity - 1)}>
                                                <IconMinus size={14} />
                                            </ActionIcon>
                                            <Text size="sm" fw={700}>{item.quantity}</Text>
                                            <ActionIcon variant="light" size="sm" color="gray" onClick={() => updateQuantity(item.product.id, item.quantity + 1)}>
                                                <IconPlus size={14} />
                                            </ActionIcon>
                                        </Group>
                                    </Box>
                                    <ActionIcon color="red.7" variant="subtle" onClick={() => removeFromCart(item.product.id)}>
                                        <IconTrash size={18} />
                                    </ActionIcon>
                                </Group>
                            ))}
                        </Stack>
                    )}
                </ScrollArea>

                <Box pos="absolute" bottom={0} left={0} right={0} p="md" bg="white" style={{ borderTop: '1px solid #E9ECEF' }}>
                    <Group justify="space-between" mb="md">
                        <Text fw={700} size="md" c="gray.7">Subtotal (sin impuestos):</Text>
                        <Text fw={900} size="xl" c="#005AAA">Ref ${subtotal.toFixed(2)}</Text>
                    </Group>
                    <Button 
                        fullWidth 
                        size="lg" 
                        color="#0B1B3D" 
                        radius="md" 
                        disabled={cart.length === 0}
                        onClick={() => alert("Procesar checkout...")}
                    >
                        Proceder al Pago
                    </Button>
                </Box>
            </Drawer>
        </Box>
    );
}