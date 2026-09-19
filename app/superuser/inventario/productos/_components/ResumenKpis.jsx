'use client';

import React from 'react';
import { Box, Group, Paper, SimpleGrid, Skeleton, Text, ThemeIcon, UnstyledButton } from '@mantine/core';
import { IconAlertTriangle, IconBox, IconCoin, IconPackageOff, IconSitemap, IconTag } from '@tabler/icons-react';

// Indicadores globales del inventario. Los que representan un filtro son botones: un clic filtra la hoja.
export default function ResumenKpis({ resumen, params, setParams, cargando }) {
    const tarjetas = [
        { key: 'total', label: 'Productos', valor: resumen?.total, icono: IconBox, color: 'blue', activo: false },
        { key: 'valor', label: 'Valor del inventario', valor: resumen && `$${resumen.valor.toLocaleString('es-VE', { maximumFractionDigits: 0 })}`, icono: IconCoin, color: 'teal', activo: false },
        { key: 'agotados', label: 'Agotados (grupos o sueltos)', valor: resumen?.agotados, icono: IconPackageOff, color: 'red', activo: params.stock === 'agotado', filtro: { stock: params.stock === 'agotado' ? '' : 'agotado' } },
        { key: 'bajos', label: 'Bajo el mínimo', valor: resumen?.bajos, icono: IconAlertTriangle, color: 'orange', activo: params.stock === 'bajo', filtro: { stock: params.stock === 'bajo' ? '' : 'bajo' } },
        { key: 'grupos', label: 'Grupos de equivalencia', valor: resumen?.grupos, icono: IconSitemap, color: 'grape', activo: false },
        { key: 'ofertas', label: 'En oferta', valor: resumen?.ofertas, icono: IconTag, color: 'pink', activo: params.oferta === 'con', filtro: { oferta: params.oferta === 'con' ? '' : 'con' } },
    ];

    return (
        <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }} spacing="xs" mb="sm">
            {tarjetas.map(({ key, label, valor, icono: Icono, color, activo, filtro }) => (
                <Paper
                    key={key} withBorder radius="md" p="xs" bg="white"
                    component={filtro ? UnstyledButton : 'div'}
                    onClick={filtro ? () => setParams(filtro) : undefined}
                    style={{ borderColor: activo ? `var(--mantine-color-${color}-6)` : undefined, boxShadow: activo ? `0 0 0 2px var(--mantine-color-${color}-2)` : undefined, cursor: filtro ? 'pointer' : 'default' }}
                    aria-pressed={filtro ? activo : undefined}
                >
                    <Group gap="xs" wrap="nowrap">
                        <ThemeIcon variant="light" color={color} size="lg" radius="md"><Icono size={18} /></ThemeIcon>
                        <Box style={{ minWidth: 0 }}>
                            <Text fz={10} fw={800} c="dimmed" tt="uppercase" lts={0.5} truncate>{label}</Text>
                            {valor === undefined || valor === null
                                ? <Skeleton h={18} w={50} mt={2} visible={cargando} />
                                : <Text fw={900} fz="lg" lh={1.1}>{typeof valor === 'number' ? valor.toLocaleString('es-VE') : valor}</Text>}
                        </Box>
                    </Group>
                </Paper>
            ))}
        </SimpleGrid>
    );
}
