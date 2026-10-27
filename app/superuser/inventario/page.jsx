// app/superuser/inventario/page.jsx
'use client';

import { Box, Button, Card, Group, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { useRouter } from 'next/navigation';
import { IconArrowLeft, IconArrowUpRight, IconBarcode, IconPhotoCheck, IconReceipt2, IconSearch, IconTable } from '@tabler/icons-react';

// Módulo de inventario: accesos a cada pantalla. Las entradas de inventario son las compras (cada compra registrada suma stock),
// por eso ese botón lleva a Compras (antes llevaba a una página que no existía).
const OPCIONES = [
    { href: '/superuser/inventario/productos', titulo: 'Productos', detalle: 'Hoja de inventario: stock, costos, precios y creación de productos.', icono: IconTable, color: 'blue' },
    { href: '/superuser/inventario/consulta', titulo: 'Consultar existencias', detalle: 'Buscar un producto y ver cuánto hay y su precio.', icono: IconSearch, color: 'teal' },
    { href: '/superuser/compras', titulo: 'Entradas (compras)', detalle: 'Cada compra registrada suma stock y actualiza el costo.', icono: IconReceipt2, color: 'grape' },
    { href: '/superuser/inventario/salidas', titulo: 'Salidas de inventario', detalle: 'Lo que salió por ventas y pedidos, con su estado.', icono: IconArrowUpRight, color: 'red' },
    { href: '/superuser/inventario/auditar', titulo: 'Auditar fichas', detalle: 'Fotos, precios, presentación, caja y bulto de cada producto.', icono: IconPhotoCheck, color: 'orange' },
    { href: '/superuser/inventario/codigos', titulo: 'Códigos de barras', detalle: 'Escanear y guardar el código de cada empaque desde el teléfono.', icono: IconBarcode, color: 'cyan' },
];

export default function InventarioDashboardPage() {
    const router = useRouter();

    return (
        <Box maw={960} mx="auto" px="md" py="md">
            <Group mb="md" gap="sm">
                <Button variant="subtle" color="gray.3" leftSection={<IconArrowLeft size={16} />} onClick={() => router.push('/superuser')}>Panel</Button>
                <Title order={2} c="white">Inventario</Title>
            </Group>
            <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
                {OPCIONES.map((o) => (
                    <Card key={o.href} withBorder radius="lg" p="md" style={{ cursor: 'pointer', boxShadow: 'var(--mm-shadow-card)' }} onClick={() => router.push(o.href)}>
                        <Stack gap={6}>
                            <ThemeIcon size={42} radius="md" variant="light" color={o.color}><o.icono size={24} /></ThemeIcon>
                            <Text fw={800} c="navy.9">{o.titulo}</Text>
                            <Text size="sm" c="dimmed">{o.detalle}</Text>
                        </Stack>
                    </Card>
                ))}
            </SimpleGrid>
        </Box>
    );
}
