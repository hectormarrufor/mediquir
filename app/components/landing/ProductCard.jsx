'use client';

import React, { useMemo, useState } from 'react';
import { Badge, Box, Button, Group, Text, ActionIcon } from '@mantine/core';
import { IconShoppingCartPlus, IconCheck } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useCart } from './CartContext';
import ImageCarousel from './ImageCarousel';
import ProductDetail from './ProductDetail';
import { getProductImages, getPricing, getPresentacionLabel, presentacionesTienda, formatearPrecio, formatearBs } from './productUtils';
import { aBolivares, montoRenglon } from '@/app/constants/facturacion';
import { useTasaBcv } from '@/hooks/useTasaBcv';
import classes from './landing.module.css';

export default function ProductCard({ product, isMobile }) {
    const [detailOpened, setDetailOpened] = useState(false);
    const [detailMounted, setDetailMounted] = useState(false); // monta el detalle solo la primera vez que se abre
    const { addToCart, unidadesEnCarrito } = useCart();

    const images = useMemo(() => getProductImages(product), [product]);
    const { stock, precioBase, porcentajeAhorro, hasDiscount, precioFinal, isOutOfStock, isLowStock } = getPricing(product);
    const { tasa } = useTasaBcv();
    const enCarrito = unidadesEnCarrito(product.id);
    const puedeAgregar = !isOutOfStock && enCarrito < stock;
    const caja = presentacionesTienda(product).find((p) => p.clave === 'CAJA') || null;
    const puedeCaja = Boolean(caja) && !isOutOfStock && enCarrito + caja.unidades <= stock;

    const openDetail = () => {
        setDetailMounted(true);
        setDetailOpened(true);
    };

    // Los botones internos (indicadores del carrusel, "+") no deben abrir el detalle
    const handleCardClick = (e) => {
        if (e.target.closest('button')) return;
        openDetail();
    };

    const handleQuickAdd = (e) => {
        e.stopPropagation();
        addToCart(product, 1, precioFinal);
        notifications.show({
            message: `${product.nombre} añadido al carrito`,
            color: 'teal',
            icon: <IconCheck size={16} />,
            autoClose: 2000,
        });
    };

    const handleQuickAddCaja = (e) => {
        e.stopPropagation();
        addToCart(product, 1, precioFinal, 'CAJA');
        notifications.show({ message: `1 ${caja.etiqueta} de ${product.nombre} añadida al carrito`, color: 'teal', icon: <IconCheck size={16} />, autoClose: 2200 });
    };

    return (
        <>
            <Box
                className={classes.card}
                role="button"
                tabIndex={0}
                aria-label={`Ver ${product.nombre}`}
                onClick={handleCardClick}
                onKeyDown={(e) => { if (e.key === 'Enter') openDetail(); }}
            >
                <Box className={classes.media}>
                    {hasDiscount && (
                        <Badge color="red.7" variant="filled" size="sm" pos="absolute" top={8} left={8} style={{ zIndex: 2 }}>
                            -{porcentajeAhorro}%
                        </Badge>
                    )}
                    {isOutOfStock ? (
                        <Badge color="gray.7" variant="filled" size="sm" pos="absolute" top={8} right={8} style={{ zIndex: 2 }}>
                            Agotado
                        </Badge>
                    ) : isLowStock && (
                        <Badge color="orange" variant="light" size="sm" pos="absolute" top={8} right={8} style={{ zIndex: 2 }}>
                            Últimas {stock}
                        </Badge>
                    )}

                    <Box style={{ opacity: isOutOfStock ? 0.45 : 1 }}>
                        <ImageCarousel
                            images={images}
                            alt={product.nombre}
                            height={isMobile ? 150 : 190}
                            // En móvil se desliza con el dedo; el autoplay solo corre en escritorio
                            autoplayDelay={isMobile ? 0 : 4000 + (product.id % 5) * 600}
                            withControls={!isMobile}
                            padding={isMobile ? 8 : 12}
                        />
                    </Box>
                </Box>

                <Box p={isMobile ? 10 : 14} style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 4 }}>
                    <Group justify="space-between" wrap="nowrap" gap={4}>
                        <Text fz={10} c="blue.9" tt="uppercase" fw={800} lts={0.8} lineClamp={1}>
                            {product.marca?.nombre || 'Genérico'}
                        </Text>
                        <Text fz={10} c="dimmed" fw={600} style={{ whiteSpace: 'nowrap' }}>
                            {getPresentacionLabel(product)}
                        </Text>
                    </Group>

                    <Text fw={700} fz={{ base: 13, sm: 15 }} lh={1.3} lineClamp={2} c="navy.9" mih={{ base: 34, sm: 39 }}>
                        {product.nombre}
                    </Text>

                    <Group justify="space-between" align="flex-end" wrap="nowrap" mt="auto" pt={6} gap={6}>
                        <Box>
                            {hasDiscount && (
                                <Text td="line-through" fz={11} c="dimmed" lh={1}>${formatearPrecio(precioBase)}</Text>
                            )}
                            <Text fw={800} fz={{ base: 16, sm: 20 }} lh={1.15} c={hasDiscount ? 'red.7' : 'brand.6'}>
                                Ref ${formatearPrecio(precioFinal)}
                            </Text>
                            {tasa && <Text fz={{ base: 11, sm: 12 }} fw={600} c="dimmed" lh={1.2}>Bs {formatearBs(aBolivares(precioFinal, tasa))}</Text>}
                        </Box>
                        <ActionIcon
                            size={isMobile ? 36 : 40}
                            radius="xl"
                            color="navy.9"
                            variant={puedeAgregar ? 'filled' : 'light'}
                            disabled={!puedeAgregar}
                            onClick={handleQuickAdd}
                            aria-label={`Añadir ${product.nombre} al carrito`}
                        >
                            <IconShoppingCartPlus size={isMobile ? 18 : 20} />
                        </ActionIcon>
                    </Group>
                    {caja && (
                        <Button size="compact-xs" variant="light" color="navy.9" fullWidth mt={4} disabled={!puedeCaja} onClick={handleQuickAddCaja}>
                            + {caja.etiqueta} · ${formatearPrecio(montoRenglon(precioFinal, caja.unidades))}
                        </Button>
                    )}
                </Box>
            </Box>

            {detailMounted && (
                <ProductDetail product={product} opened={detailOpened} onClose={() => setDetailOpened(false)} isMobile={isMobile} />
            )}
        </>
    );
}
