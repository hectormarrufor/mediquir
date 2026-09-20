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
        <Box px={{ base: 'sm', sm: 'md' }} py="md" maw={1400} mx="auto">
            <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} spacing="sm">
                {DATOS.map((d) => (
                    <Paper key={d.titulo} withBorder radius="lg" p="sm" bg="white" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
                        <Group wrap="nowrap" gap="sm" align="center">
                            <ThemeIcon size={38} radius="md" variant="light" color={d.color}><d.icono size={22} /></ThemeIcon>
                            <Box style={{ minWidth: 0 }}>
                                <Text size="sm" fw={800} c="navy.9" lh={1.2}>{d.titulo}</Text>
                                <Text size="xs" c="gray.7" lh={1.3}>{d.texto}</Text>
                            </Box>
                        </Group>
                    </Paper>
                ))}
            </SimpleGrid>
        </Box>
    );
}
