// app/superuser/inventario/page.jsx
'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { Box, Button, Card, Group, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { useRouter } from 'next/navigation';
import {
    IconArrowLeft, IconArrowUpRight, IconBarcode, IconCategory, IconChartBar,
    IconClipboardList, IconLink, IconPhotoCheck, IconReceipt2, IconSearch, IconTable, IconTags,
} from '@tabler/icons-react';
import { useAuth } from '@/hooks/useAuth';
import { useVolver } from '@/app/helpers/useVolver';
import { useEsTelefono } from '@/app/components/ui/modalMovil';

const ConsultorPrecios = dynamic(() => import('../_components/ConsultorPrecios'), { ssr: false });
const CardexModal = dynamic(() => import('../_components/CardexModal'), { ssr: false });

// Módulo de inventario: accesos a cada pantalla. Las entradas de inventario son las compras (cada compra registrada suma stock),
// por eso ese botón lleva a Compras (antes llevaba a una página que no existía).
// Marcas, categorías y grupos va justo después de Productos: es con lo que se ordenan los productos.
const OPCIONES = [
    { href: '/superuser/inventario/productos', titulo: 'Productos', detalle: 'Hoja de inventario: stock, costos, precios y creación de productos.', icono: IconTable, color: 'blue' },
    { accion: 'cardex', titulo: 'Cardex de producto', detalle: 'Busca cualquier producto y consulta cuántas ventas, unidades y entradas ha tenido.', icono: IconClipboardList, color: 'indigo' },
    { accion: 'precios', titulo: 'Consultor de precios', detalle: 'Existencia y todos los precios al instante en USD y Bs.', icono: IconTags, color: 'teal' },
    { href: '/superuser/inventario/clasificacion', titulo: 'Marcas, categorías y grupos', detalle: 'Crear, cambiar y borrar las marcas, categorías y grupos de equivalencia.', icono: IconCategory, color: 'violet' },
    { href: '/superuser/inventario/consulta', titulo: 'Consultar existencias', detalle: 'Buscar un producto y ver cuánto hay y su precio.', icono: IconSearch, color: 'cyan' },
    { href: '/superuser/compras', titulo: 'Entradas (compras)', detalle: 'Cada compra registrada suma stock y actualiza el costo.', icono: IconReceipt2, color: 'grape' },
    { href: '/superuser/inventario/salidas', titulo: 'Salidas de inventario', detalle: 'Lo que salió por ventas y pedidos, con su estado.', icono: IconArrowUpRight, color: 'red' },
    { href: '/superuser/inventario/auditar', titulo: 'Auditar fichas', detalle: 'Fotos, precios, presentación, caja y bulto de cada producto.', icono: IconPhotoCheck, color: 'orange' },
    { href: '/superuser/inventario/codigos', titulo: 'Códigos de barras', detalle: 'Escanear y guardar el código de cada empaque desde el teléfono.', icono: IconBarcode, color: 'blue' },
    // Con montos de venta: solo administración
    { href: '/superuser/inventario/ventas-por-producto', titulo: 'Ventas por producto', detalle: 'Unidades y dólares vendidos de cada producto en el periodo que elijas.', icono: IconChartBar, color: 'green', soloAdmin: true },
    { href: '/superuser/inventario/sin-producto', titulo: 'Ventas sin producto', detalle: 'Renglones escritos a mano: enlázalos a su producto para que cuenten en lo vendido.', icono: IconLink, color: 'yellow', soloAdmin: true },
];

export default function InventarioDashboardPage() {
    const router = useRouter();
    const volver = useVolver('/superuser');
    const { isAdmin } = useAuth();
    const telefono = useEsTelefono();
    const [cardexAbierto, setCardexAbierto] = useState(false);
    const [consultorAbierto, setConsultorAbierto] = useState(false);

    const abrirOpcion = (o) => {
        if (o.accion === 'cardex') return setCardexAbierto(true);
        if (o.accion === 'precios') return setConsultorAbierto(true);
        if (o.href) router.push(o.href);
    };

    return (
        <Box maw={1040} mx="auto" px={{ base: 'xs', sm: 'md' }} py={{ base: 'xs', sm: 'md' }}>
            <Group justify="space-between" align="center" mb={{ base: 'xs', sm: 'md' }} gap="xs" wrap="wrap">
                <Group gap="xs">
                    <Button variant="subtle" color="gray.3" size={telefono ? 'compact-sm' : 'sm'} leftSection={<IconArrowLeft size={16} />} onClick={volver}>Panel</Button>
                    <Title order={telefono ? 3 : 2} c="white">Inventario</Title>
                </Group>
                <Group gap={6}>
                    <Button size="xs" radius="xl" variant="white" color="indigo.8" leftSection={<IconClipboardList size={15} />} onClick={() => setCardexAbierto(true)}>
                        Cardex
                    </Button>
                    <Button size="xs" radius="xl" variant="white" color="teal.8" leftSection={<IconTags size={15} />} onClick={() => setConsultorAbierto(true)}>
                        Precios
                    </Button>
                </Group>
            </Group>

            <SimpleGrid cols={{ base: 2, sm: 2, md: 3 }} spacing={{ base: 8, sm: 'md' }}>
                {OPCIONES.filter((o) => !o.soloAdmin || isAdmin).map((o) => (
                    <Card
                        key={o.href || o.accion}
                        withBorder
                        radius={telefono ? 'md' : 'lg'}
                        p={{ base: 'xs', sm: 'md' }}
                        style={{ cursor: 'pointer', boxShadow: 'var(--mm-shadow-card)' }}
                        onClick={() => abrirOpcion(o)}
                    >
                        <Stack gap={telefono ? 4 : 6}>
                            <Group gap={8} wrap="nowrap" align="center">
                                <ThemeIcon size={telefono ? 32 : 42} radius="md" variant="light" color={o.color} style={{ flexShrink: 0 }}>
                                    <o.icono size={telefono ? 18 : 24} />
                                </ThemeIcon>
                                {telefono && <Text fw={800} size="xs" c="navy.9" lh={1.2} lineClamp={2}>{o.titulo}</Text>}
                            </Group>
                            {!telefono && <Text fw={800} c="navy.9" lh={1.25}>{o.titulo}</Text>}
                            <Text fz={telefono ? 11 : 'sm'} c="dimmed" lh={1.3} lineClamp={telefono ? 2 : 3}>{o.detalle}</Text>
                        </Stack>
                    </Card>
                ))}
            </SimpleGrid>

            {cardexAbierto && <CardexModal opened={cardexAbierto} onClose={() => setCardexAbierto(false)} />}
            {consultorAbierto && <ConsultorPrecios opened={consultorAbierto} onClose={() => setConsultorAbierto(false)} />}
        </Box>
    );
}
