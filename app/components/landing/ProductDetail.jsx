'use client';

import React, { useState } from 'react';
import { Modal, Drawer, Grid, Box, Stack, Group, Text, Badge, Button, ActionIcon } from '@mantine/core';
import { IconMinus, IconPlus, IconShoppingCartPlus, IconCheck } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import ImageCarousel from './ImageCarousel';
import { useCart } from './CartContext';
import { getProductImages, getPricing, getPresentacionLabel, formatearPrecio, formatearBs } from './productUtils';
import { aBolivares } from '@/app/constants/facturacion';
import { useTasaBcv } from '@/hooks/useTasaBcv';


function DetailBody({ product, onClose, isMobile }) {
    const [quantity, setQuantity] = useState(1);
    const { addToCart, cart } = useCart();

    const { stock, precioBase, porcentajeAhorro, hasDiscount, precioFinal, isOutOfStock, isLowStock } = getPricing(product);
    const { tasa } = useTasaBcv();
    const porcentajeIva = Number(product?.porcentajeIva) || 0;
    const enCarrito = cart.find((item) => item.product.id === product.id)?.quantity || 0;
    const disponible = Math.max(0, stock - enCarrito);

    const handleAdd = () => {
        addToCart(product, quantity, precioFinal);
        notifications.show({
            message: `${quantity} × ${product.nombre} añadido al carrito`,
            color: 'teal',
            icon: <IconCheck size={16} />,
            autoClose: 2500,
        });
        onClose();
    };

    return (
        <Grid gutter={isMobile ? 'md' : 'xl'}>
            <Grid.Col span={{ base: 12, md: 6 }}>
                <Box bg="#F4F7FB" style={{ borderRadius: 16, overflow: 'hidden' }}>
                    <ImageCarousel
                        images={getProductImages(product)}
                        alt={product.nombre}
                        height={isMobile ? 240 : 320}
                        withControls={!isMobile}
                        padding={16}
                    />
                </Box>
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 6 }}>
                <Stack gap="sm" h="100%" justify="center">
                    <Group gap="xs">
                        <Badge color="blue.9" variant="light" radius="sm">{product.marca?.nombre || 'Genérico'}</Badge>
                        {product.categoria?.nombre && (
                            <Badge color="gray" variant="light" radius="sm">{product.categoria.nombre}</Badge>
                        )}
                    </Group>

                    <Text fw={800} fz={{ base: 20, md: 24 }} lh={1.2} c="navy.9">{product.nombre}</Text>
                    <Text c="dimmed" size="sm">{getPresentacionLabel(product)}</Text>

                    <Group align="flex-end" gap="xs">
                        <Text fw={900} fz={30} lh={1} c={hasDiscount ? 'red.7' : 'brand.6'}>
                            Ref ${formatearPrecio(precioFinal)}
                        </Text>
                        {hasDiscount && (
                            <>
                                <Text td="line-through" c="dimmed" size="md">${formatearPrecio(precioBase)}</Text>
                                <Badge color="red.7" variant="filled">-{porcentajeAhorro}%</Badge>
                            </>
                        )}
                    </Group>

                    {tasa && (
                        <Text fw={700} size="lg" c="dimmed" lh={1.2}>Bs {formatearBs(aBolivares(precioFinal, tasa))} <Text span size="xs" fw={500}>· tasa BCV {formatearBs(tasa)}</Text></Text>
                    )}
                    <Text size="xs" c="dimmed">
                        {porcentajeIva > 0 ? `Precio sin IVA. Se añade IVA ${porcentajeIva}% al facturar.` : 'Producto exento de IVA.'}
                    </Text>

                    {isOutOfStock ? (
                        <Text c="red.7" fw={700} mt="sm">Producto temporalmente agotado.</Text>
                    ) : disponible <= 0 ? (
                        <Text c="orange.8" fw={600} size="sm" mt="sm">
                            Ya tienes en tu carrito todo el stock disponible ({stock}).
                        </Text>
                    ) : (
                        <Stack gap="sm" mt="xs">
                            {isLowStock && <Text c="orange.8" fw={700} size="sm">¡Últimas {stock} unidades!</Text>}
                            <Group justify="space-between" wrap="nowrap">
                                <Text size="sm" fw={600}>Cantidad</Text>
                                <Group gap="xs" wrap="nowrap">
                                    <ActionIcon
                                        variant="light" color="gray" size={40} radius="xl" aria-label="Menos"
                                        disabled={quantity <= 1}
                                        onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                                    >
                                        <IconMinus size={16} />
                                    </ActionIcon>
                                    <Text fw={800} w={36} ta="center">{quantity}</Text>
                                    <ActionIcon
                                        variant="light" color="gray" size={40} radius="xl" aria-label="Más"
                                        disabled={quantity >= disponible}
                                        onClick={() => setQuantity((q) => Math.min(disponible, q + 1))}
                                    >
                                        <IconPlus size={16} />
                                    </ActionIcon>
                                </Group>
                            </Group>

                            <Button
                                fullWidth size="lg" color="navy.9" tt="none"
                                leftSection={<IconShoppingCartPlus size={20} />}
                                onClick={handleAdd}
                            >
                                Agregar • ${formatearPrecio(precioFinal * quantity)}
                            </Button>
                        </Stack>
                    )}
                </Stack>
            </Grid.Col>
        </Grid>
    );
}

export default function ProductDetail({ product, opened, onClose, isMobile }) {
    const body = <DetailBody product={product} onClose={onClose} isMobile={isMobile} />;

    if (isMobile) {
        return (
            <Drawer
                opened={opened}
                onClose={onClose}
                position="bottom"
                size="88%"
                padding="md"
                title={<Text fw={800} c="navy.9" size="sm">Detalle del producto</Text>}
                styles={{ content: { borderRadius: '20px 20px 0 0' } }}
            >
                {body}
            </Drawer>
        );
    }

    return (
        <Modal opened={opened} onClose={onClose} size="xl" centered padding="xl" title="Detalle del producto">
            {body}
        </Modal>
    );
}
