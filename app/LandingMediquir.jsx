'use client';

import React, { useEffect, useState } from 'react';
import { Box, Drawer, Indicator, ActionIcon, Stack, Group, Text, Button, ScrollArea, Image, Badge } from '@mantine/core';
import { IconShoppingCart, IconTrash, IconMinus, IconPlus } from '@tabler/icons-react';

import HeroSection from './components/landing/HeroSection';
import CategorySection from './components/landing/CategorySection';
import BestSellersSection from './components/landing/BestSellersSection';
import FooterSection from './components/landing/FooterSection';
import { useCart } from './components/landing/CartContext';
import CheckoutProcess from './CheckoutProcess';
import { getMainImage, PLACEHOLDER_IMG, formatearPrecio, formatearBs } from './components/landing/productUtils';
import { aBolivares } from '@/app/constants/facturacion';

export default function LandingMediquir({ seo = null }) {
    const [bcv, setBcv] = useState(undefined);
    const [cartOpened, setCartOpened] = useState(false);
    // En LandingMediquir.jsx, añade este estado junto a los demás:
    const [showCheckout, setShowCheckout] = useState(false);
    const {
        cart,
        removeFromCart,
        updateQuantity,
        subtotal,
        totalItems,
        isLoaded,
        isVerifying,
        verifyStockBeforeCheckout,
        unidadesEnCarrito,
    } = useCart();

    // --- ESTADOS DE FILTRADO GLOBAL DE LA LANDING ---
    const [searchQuery, setSearchQuery] = useState('');

    // Enlaces desde Google o desde una ficha de producto: /?buscar=jeringa muestra esa búsqueda en la tienda
    useEffect(() => {
        const q = new URLSearchParams(window.location.search).get('buscar');
        if (q) setSearchQuery(q.slice(0, 100));
    }, []);
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

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [resBCV] = await Promise.all([
                    fetch('/api/bcv'),
                   
                ]);

                if (resBCV.ok) {
                    const dataBCV = await resBCV.json();
                    setBcv(dataBCV.precio);
                }

            
            } catch (error) {
                console.error("Error al cargar datos iniciales:", error);
            } finally {
                // setIsLoading(false); // No se está usando isLoading en este componente, así que se puede comentar o eliminar.
            }
        };

        fetchData();
    }, []);

    // Verificar si hay algún item sin stock en el carrito para bloquear la orden
    const hasInvalidItems = cart.some(item => {
        const stock = Number(item.product.stockAlmacen || 0);
        return stock <= 0 || unidadesEnCarrito(item.product.id) > stock;
    });

    const handleProceedToCheckout = async () => {
        const verification = await verifyStockBeforeCheckout();

        if (!verification.success) {
            if (verification.reason === 'STOCK_CHANGED') {
                alert("El inventario ha cambiado mientras navegabas. Hemos actualizado tu carrito con la disponibilidad real actual.");
            } else {
                alert("Ocurrió un error al verificar el inventario. Por favor intenta nuevamente.");
            }
            return;
        }

        // Si el stock está OK, abrimos la vista de checkout en el Drawer
        setShowCheckout(true);
    };

    return (
        <Box style={{ minHeight: '100vh', overflowX: 'clip', position: 'relative' }}>

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

            {seo}

            <FooterSection />

            {/* BOTÓN FLOTANTE DEL CARRITO */}
            {isLoaded && (
                <Box
                    pos="fixed"
                    style={{
                        zIndex: 100,
                        right: 'max(16px, env(safe-area-inset-right))',
                        bottom: 'max(16px, env(safe-area-inset-bottom))',
                    }}
                >
                    <Indicator label={totalItems} size={22} color="red" offset={5} disabled={totalItems === 0}>
                        <ActionIcon
                            radius="xl"
                            size={56}
                            aria-label="Abrir carrito"
                            color="navy.9"
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

            <Drawer
                opened={cartOpened}
                onClose={() => {
                    setCartOpened(false);
                    setShowCheckout(false); // Resetea al cerrar
                }}
                position="right"
                title={<Text fw={900} size="xl" c="navy.9">{showCheckout ? 'Finalizar Compra' : 'Tu Carrito'}</Text>}
                padding="md"
                size="md"
            >
                {showCheckout ? (
                    <CheckoutProcess
                        tasaBcv={bcv} // Pásale tu tasa BCV real actual o un estado/prop
                        onCancel={() => setShowCheckout(false)}
                        onSuccess={(data) => {
                            console.log("Orden creada:", data);
                            // Aquí puedes vaciar el carrito local si lo deseas
                        }}
                    />
                ) : (
                    <>
                        {/* Aquí va todo tu ScrollArea con los items del carrito que ya tenías */}
                        <ScrollArea h="calc(100vh - 220px)" type="auto">
                            {cart.length === 0 ? (
                                <Stack align="center" mt={50} c="dimmed">
                                    <IconShoppingCart size={50} opacity={0.4} />
                                    <Text fw={500}>Tu carrito está vacío.</Text>
                                </Stack>
                            ) : (
                                <Stack gap="md">
                                    {cart.map((item) => {
                                        const stockDisponible = Number(item.product.stockAlmacen || 0);
                                        const isOut = stockDisponible <= 0;
                                        const exceedsStock = unidadesEnCarrito(item.product.id) > stockDisponible && !isOut;
                                        const presClave = item.presentacion || 'UNIDAD';
                                        const porPres = item.unidadesPorPres || 1;

                                        return (
                                            <Group key={`${item.product.id}:${presClave}`} wrap="nowrap" align="flex-start" opacity={isOut ? 0.6 : 1}>
                                                <Image
                                                    src={getMainImage(item.product)}
                                                    w={65} h={65} radius="md" fit="contain" bg="gray.1" p={4}
                                                    fallbackSrc={PLACEHOLDER_IMG}
                                                />
                                                <Box flex={1}>
                                                    <Text size="sm" fw={700} lineClamp={2} c="navy.9">{item.product.nombre}</Text>
                                                    {presClave !== 'UNIDAD' && <Badge size="sm" color="grape" variant="filled" tt="none" mt={2}>{item.presentacionEtiqueta} · {item.quantity} en total</Badge>}
                                                    <Text size="xs" c="dimmed" fw={600}>Ref ${formatearPrecio(item.precioFinal)} c/u{bcv ? ` · Bs ${formatearBs(aBolivares(item.precioFinal, bcv))}` : ''}</Text>

                                                    {isOut && (
                                                        <Badge color="red" size="xs" variant="filled" mt={4}>
                                                            Agotado en almacén
                                                        </Badge>
                                                    )}

                                                    {exceedsStock && (
                                                        <Badge color="orange" size="xs" variant="filled" mt={4}>
                                                            Solo quedan {stockDisponible} disponibles
                                                        </Badge>
                                                    )}

                                                    {!isOut && (
                                                        <Group gap="xs" mt="xs">
                                                            <ActionIcon variant="light" size="sm" color="gray" onClick={() => updateQuantity(item.product.id, item.cantidadPres - 1, presClave)}>
                                                                <IconMinus size={14} />
                                                            </ActionIcon>
                                                            <Text size="sm" fw={700}>{item.cantidadPres}</Text>
                                                            <ActionIcon
                                                                variant="light"
                                                                size="sm"
                                                                color="gray"
                                                                disabled={unidadesEnCarrito(item.product.id) + porPres > stockDisponible}
                                                                onClick={() => updateQuantity(item.product.id, item.cantidadPres + 1, presClave)}
                                                            >
                                                                <IconPlus size={14} />
                                                            </ActionIcon>
                                                        </Group>
                                                    )}
                                                </Box>
                                                <ActionIcon color="red.7" variant="subtle" onClick={() => removeFromCart(item.product.id, presClave)}>
                                                    <IconTrash size={18} />
                                                </ActionIcon>
                                            </Group>
                                        );
                                    })}
                                </Stack>
                            )}
                        </ScrollArea>

                        <Box pos="absolute" bottom={0} left={0} right={0} p="md" bg="white" style={{ borderTop: '1px solid #E9ECEF' }}>
                            <Group justify="space-between" mb="md">
                                <Text fw={700} size="md" c="gray.7">Subtotal:</Text>
                                <Box ta="right">
                                    <Text fw={900} size="xl" c="brand.6" lh={1.1}>Ref ${subtotal.toFixed(2)}</Text>
                                    {bcv && <Text size="sm" fw={600} c="dimmed">Bs {formatearBs(aBolivares(subtotal, bcv))}</Text>}
                                </Box>
                            </Group>
                            <Text size="xs" c="dimmed" mb="sm">Subtotal sin IVA. El IVA (16%) de los productos que lo llevan se calcula al pagar.</Text>
                            <Button
                                fullWidth
                                size="lg"
                                color="navy.9"
                                radius="md"
                                loading={isVerifying}
                                disabled={cart.length === 0 || hasInvalidItems}
                                onClick={handleProceedToCheckout}
                            >
                                {hasInvalidItems ? 'Ajusta los productos sin stock' : 'Proceder al Pago'}
                            </Button>
                        </Box>
                    </>
                )}
            </Drawer>
        </Box>
    );
}