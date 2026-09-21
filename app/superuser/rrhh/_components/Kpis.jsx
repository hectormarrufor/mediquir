'use client';

import React from 'react';
import { Box, Group, Paper, SimpleGrid, Skeleton, Text, ThemeIcon, UnstyledButton } from '@mantine/core';

// Indicadores de RR. HH. Los que traen `filtro` son botones: un clic filtra la hoja (otro clic lo quita).
//   tarjetas: [{ key, label, valor, icono, color, activo?, onClick?, detalle? }]
export default function Kpis({ tarjetas, cargando, columnas = 6 }) {
    return (
        <SimpleGrid cols={{ base: 2, sm: 3, lg: columnas }} spacing="xs" mb="sm">
            {tarjetas.map(({ key, label, valor, icono: Icono, color, activo, onClick, detalle }) => (
                <Paper
                    key={key} withBorder radius="md" p="xs" bg="white"
                    component={onClick ? UnstyledButton : 'div'} onClick={onClick}
                    style={{ borderColor: activo ? `var(--mantine-color-${color}-6)` : undefined, boxShadow: activo ? `0 0 0 2px var(--mantine-color-${color}-2)` : undefined, cursor: onClick ? 'pointer' : 'default' }}
                    aria-pressed={onClick ? Boolean(activo) : undefined}
                >
                    <Group gap="xs" wrap="nowrap">
                        <ThemeIcon variant="light" color={color} size="lg" radius="md"><Icono size={18} /></ThemeIcon>
                        <Box style={{ minWidth: 0 }}>
                            <Text fz={10} fw={800} c="dimmed" tt="uppercase" lts={0.5} truncate>{label}</Text>
                            {cargando
                                ? <Skeleton h={18} w={50} mt={2} />
                                : <Text fw={900} fz="lg" lh={1.1}>{typeof valor === 'number' ? valor.toLocaleString('es-VE') : valor}</Text>}
                            {detalle && !cargando && <Text fz={10} c="dimmed" truncate>{detalle}</Text>}
                        </Box>
                    </Group>
                </Paper>
            ))}
        </SimpleGrid>
    );
}
