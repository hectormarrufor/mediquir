'use client';

import React from 'react';
import { Badge, Box, Button, Container, Group, ScrollArea } from '@mantine/core';
import { usePathname, useRouter } from 'next/navigation';
import { IconBuildingStore, IconLayoutDashboard, IconReceipt, IconShoppingCart, IconWallet } from '@tabler/icons-react';
import { B2BCartProvider, useB2BCart } from './_lib/B2BCartContext';

const SECCIONES = [
    { href: '/b2b', etiqueta: 'Inicio', icono: IconLayoutDashboard, exacto: true },
    { href: '/b2b/catalogo', etiqueta: 'Catálogo', icono: IconBuildingStore },
    { href: '/b2b/pedidos', etiqueta: 'Mis pedidos', icono: IconReceipt },
    { href: '/b2b/cuentas', etiqueta: 'Cuentas por pagar', icono: IconWallet },
];

function Navegacion() {
    const pathname = usePathname();
    const router = useRouter();
    const { totalArticulos } = useB2BCart();
    const activa = (s) => (s.exacto ? pathname === s.href : pathname.startsWith(s.href));

    return (
        <Box bg="white" style={{ borderBottom: '1px solid var(--mantine-color-gray-2)', position: 'sticky', top: 0, zIndex: 5 }}>
            <Container size="xl">
                <ScrollArea type="never">
                    <Group gap={4} py={8} wrap="nowrap" justify="space-between">
                        <Group gap={4} wrap="nowrap">
                            {SECCIONES.map((s) => (
                                <Button key={s.href} size="sm" radius="xl" tt="none" leftSection={<s.icono size={16} />}
                                    variant={activa(s) ? 'filled' : 'subtle'} color={activa(s) ? 'navy.9' : 'gray.7'}
                                    onClick={() => router.push(s.href)} style={{ flexShrink: 0 }}>
                                    {s.etiqueta}
                                </Button>
                            ))}
                        </Group>
                        <Button size="sm" radius="xl" tt="none" color="accent.6" variant={pathname.startsWith('/b2b/carrito') ? 'filled' : 'light'}
                            leftSection={<IconShoppingCart size={16} />} onClick={() => router.push('/b2b/carrito')} style={{ flexShrink: 0 }}
                            rightSection={totalArticulos > 0 ? <Badge size="sm" circle color="accent.6" variant="filled">{totalArticulos}</Badge> : null}>
                            Mi pedido
                        </Button>
                    </Group>
                </ScrollArea>
            </Container>
        </Box>
    );
}

export default function B2BLayout({ children }) {
    return (
        <B2BCartProvider>
            <Navegacion />
            <Container size="xl" py="lg">{children}</Container>
        </B2BCartProvider>
    );
}
