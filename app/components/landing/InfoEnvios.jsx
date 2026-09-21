'use client';

import React from 'react';
import { Box, Group, Paper, SimpleGrid, Text, ThemeIcon } from '@mantine/core';
import { IconClockHour4, IconDeviceMobile, IconMotorbike, IconTruckDelivery } from '@tabler/icons-react';
import { ZONAS_DELIVERY } from '@/app/constants/zonasDelivery';

// Franja informativa bajo el encabezado de la tienda: cómo se entrega, cuándo se despacha y cómo se paga.
// Es lo primero que un cliente nuevo quiere saber antes de armar su carrito.
const DATOS = [
    { icono: IconMotorbike, color: 'brand', titulo: 'Delivery', texto: `${ZONAS_DELIVERY.slice(0, -1).join(', ')} y ${ZONAS_DELIVERY.at(-1)}` },
    { icono: IconTruckDelivery, color: 'indigo', titulo: 'Envío nacional', texto: 'Por Zoom, cobro a destino' },
    { icono: IconClockHour4, color: 'teal', titulo: 'Despachos', texto: 'Lun–Vie hasta 4:30 p. m. · Sáb hasta 12:30 p. m.' },
    { icono: IconDeviceMobile, color: 'orange', titulo: 'Pago Móvil', texto: 'Precios en dólares y bolívares a tasa BCV' },
];

export default function InfoEnvios() {
    return (
        <Box px={{ base: 'xs', sm: 'md' }} py={{ base: 6, sm: 'md' }} maw={1400} mx="auto">
            <SimpleGrid cols={{ base: 2, md: 4 }} spacing={{ base: 6, sm: 'sm' }}>
                {DATOS.map((d) => (
                    <Paper key={d.titulo} withBorder radius="lg" p={{ base: 6, sm: 'sm' }} bg="white" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
                        <Group wrap="nowrap" gap={6} align="center">
                            <ThemeIcon size={38} radius="md" variant="light" color={d.color} visibleFrom="sm"><d.icono size={22} /></ThemeIcon>
                            <ThemeIcon size={26} radius="md" variant="light" color={d.color} hiddenFrom="sm"><d.icono size={15} /></ThemeIcon>
                            <Box style={{ minWidth: 0 }}>
                                <Text fz={{ base: 11, sm: 14 }} fw={800} c="navy.9" lh={1.2}>{d.titulo}</Text>
                                <Text fz={{ base: 9.5, sm: 12 }} c="gray.7" lh={1.25} lineClamp={2}>{d.texto}</Text>
                            </Box>
                        </Group>
                    </Paper>
                ))}
            </SimpleGrid>
        </Box>
    );
}
