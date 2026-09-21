'use client';

import React, { useState } from 'react';
import { Modal, Drawer, Grid, Box, Stack, Group, Text, Badge, Button, ActionIcon, SegmentedControl } from '@mantine/core';
import { IconMinus, IconPlus, IconShoppingCartPlus, IconCheck } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import Link from 'next/link';
import ImageCarousel from './ImageCarousel';
import { rutaProducto } from '@/app/lib/seo';
import { useCart } from './CartContext';
import { getProductImages, getPricing, getPresentacionLabel, presentacionesTienda, formatearPrecio, formatearBs } from './productUtils';
import { aBolivares, montoRenglon } from '@/app/constants/facturacion';
import { useTasaBcv } from '@/hooks/useTasaBcv';


function DetailBody({ product, onClose, isMobile }) {
    const [quantity, setQuantity] = useState(1);
    const { addToCart, unidadesEnCarrito } = useCart();
    const opciones = presentacionesTienda(product);
    const [clave, setClave] = useState('UNIDAD');
    const pres = opciones.find((o) => o.clave === clave) || opciones[0];

    const { stock, precioBase, porcentajeAhorro, hasDiscount, precioFinal, isOutOfStock, isLowStock } = getPricing(product);
    const { tasa } = useTasaBcv();
    const porcentajeIva = Number(product?.porcentajeIva) || 0;
    const enCarrito = unidadesEnCarrito(product.id);
    // Cuántas de la presentación elegida caben todavía (el stock está en unidades)
    const disponible = Math.floor(Math.max(0, stock - enCarrito) / pres.unidades);
    const precioPres = pres.unidades > 1 ? montoRenglon(precioFinal, pres.unidades) : precioFinal;

    const handleAdd = () => {
        addToCart(product, quantity, precioFinal, pres.clave);
        notifications.show({
            message: `${quantity} × ${pres.unidades > 1 ? pres.etiqueta + ' de ' : ''}${product.nombre} añadido al carrito`,
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
                    {opciones.length > 1
                        ? (
                            <Stack gap={4}>
                                <Text c="dimmed" size="xs" fw={600}>¿Cómo la quieres?</Text>
                                <SegmentedControl fullWidth size="xs" color="navy.9" value={pres.clave} onChange={(v) => { setClave(v); setQuantity(1); }} data={opciones.map((o) => ({ value: o.clave, label: o.etiqueta }))} />
                            </Stack>
                        )
                        : <Text c="dimmed" size="sm">{getPresentacionLabel(product)}</Text>}

                    <Group align="flex-end" gap="xs">
                        <Text fw={900} fz={30} lh={1} c={hasDiscount ? 'red.7' : 'brand.6'}>
                            Ref ${formatearPrecio(precioPres)}
                        </Text>
                        {pres.unidades > 1 && <Text c="dimmed" size="sm">por {pres.singular} · Ref ${formatearPrecio(precioFinal)} c/u</Text>}
                        {hasDiscount && pres.unidades === 1 && (
                            <>
                                <Text td="line-through" c="dimmed" size="md">${formatearPrecio(precioBase)}</Text>
                                <Badge color="red.7" variant="filled">-{porcentajeAhorro}%</Badge>
                            </>
                        )}
                    </Group>

                    {tasa && (
                        <Text fw={700} size="lg" c="dimmed" lh={1.2}>Bs {formatearBs(aBolivares(precioPres, tasa))} <Text span size="xs" fw={500}>· tasa BCV {formatearBs(tasa)}</Text></Text>
                    )}
                    <Text size="xs" c="dimmed">
                        {porcentajeIva > 0 ? `Precio sin IVA. Se suma el IVA (${porcentajeIva}%) al pagar.` : 'Producto exento de IVA.'}
                    </Text>

                    {isOutOfStock ? (
                        <Text c="red.7" fw={700} mt="sm">Producto temporalmente agotado.</Text>
                    ) : disponible <= 0 ? (
                        <Text c="orange.8" fw={600} size="sm" mt="sm">
                            {enCarrito > 0 ? 'Ya tienes en tu carrito todo lo disponible.' : `Por ahora no tenemos suficiente para una ${pres.singular}.`}
                        </Text>
                    ) : (
                        <Stack gap="sm" mt="xs">
                            <Badge color={isLowStock ? 'orange' : 'teal'} variant="light" size="md" w="fit-content">{isLowStock ? 'Pocas unidades' : 'Disponible'}</Badge>
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
                                Agregar • ${formatearPrecio(montoRenglon(precioFinal, pres.unidades * quantity))}
                            </Button>
                            <Text ta="center" size="xs"><Link href={rutaProducto(product)} style={{ color: 'inherit' }}>Ver ficha completa del producto</Link></Text>
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
