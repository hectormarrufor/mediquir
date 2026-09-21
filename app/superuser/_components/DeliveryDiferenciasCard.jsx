'use client';

import React from 'react';
import { Badge, Box, Group, Paper, Skeleton, Text, ThemeIcon, Title } from '@mantine/core';
import { DonutChart } from '@mantine/charts';
import { useQuery } from '@tanstack/react-query';
import { IconMotorbike } from '@tabler/icons-react';

// Torta acumulada de las diferencias de delivery: ¿le cobramos a los clientes más (sobrevalorado) o menos (subvalorado) de lo que cobra la empresa de delivery?
export default function DeliveryDiferenciasCard() {
    const { data, isLoading } = useQuery({
        queryKey: ['delivery-diferencias'],
        queryFn: async () => {
            const res = await fetch('/api/finanzas/delivery');
            if (!res.ok) throw new Error('No se pudo cargar');
            return res.json();
        },
        refetchInterval: 300000,
    });

    const hayDatos = data && data.pedidos > 0;
    const trozos = hayDatos ? [
        { name: 'Cobrado de más', value: data.sobrante, color: 'teal.7' },
        { name: 'Cobrado de menos', value: data.faltante, color: 'red.7' },
    ].filter((t) => t.value > 0) : [];
    const sobrevalorado = hayDatos && data.neto > 0;
    const subvalorado = hayDatos && data.neto < 0;

    return (
        <Paper withBorder radius="lg" p={{ base: 'xs', sm: 'md' }} style={{ boxShadow: 'var(--mm-shadow-card)' }}>
            <Group gap="sm" wrap="nowrap" mb="xs">
                <ThemeIcon size={40} radius="xl" variant="light" color={subvalorado ? 'red' : 'teal'}><IconMotorbike size={22} /></ThemeIcon>
                <Box>
                    <Title order={5} c="navy.9" lh={1.2}>Delivery: ¿cobramos bien?</Title>
                    <Text size="xs" c="dimmed">Lo cobrado al cliente contra lo que cobró la empresa de delivery (acumulado)</Text>
                </Box>
            </Group>
            {isLoading ? <Skeleton h={160} /> : !hayDatos ? (
                <Text size="sm" c="dimmed">Todavía no hay despachos de la tienda con el monto real del delivery.</Text>
            ) : (
                <Group align="center" gap="xl" wrap="wrap">
                    {trozos.length > 0 ? (
                        <DonutChart data={trozos} size={140} thickness={26} withTooltip tooltipDataSource="segment" valueFormatter={(v) => `$${v.toFixed(2)}`} />
                    ) : (
                        <Badge size="lg" color="teal" variant="light">Todos los cálculos fueron exactos</Badge>
                    )}
                    <Box style={{ flex: 1, minWidth: 200 }}>
                        <Text size="sm">Pedidos con delivery: <b>{data.pedidos}</b> · exactos <b>{data.pedidosExactos}</b></Text>
                        <Text size="sm" c="teal.9">De más: <b>${data.sobrante.toFixed(2)}</b> ({data.pedidosDeMas} pedidos)</Text>
                        <Text size="sm" c="red.9">De menos: <b>${data.faltante.toFixed(2)}</b> ({data.pedidosDeMenos} pedidos)</Text>
                        <Badge mt="xs" size="lg" variant="light" color={sobrevalorado ? 'teal' : subvalorado ? 'red' : 'gray'} tt="none">
                            {sobrevalorado ? `Servicio sobrevalorado: +$${data.neto.toFixed(2)}` : subvalorado ? `Servicio subvalorado: -$${Math.abs(data.neto).toFixed(2)}` : 'Tarifa en equilibrio'}
                        </Badge>
                    </Box>
                </Group>
            )}
        </Paper>
    );
}
