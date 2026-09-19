'use client';

import React from 'react';
import Link from 'next/link';
import { Badge, Box, Group, Paper, Skeleton, Stack, Table, Text, ThemeIcon, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { IconArrowRight, IconTargetArrow } from '@tabler/icons-react';

// Errores de empaque por empleado en los últimos 30 días (solo administradores). El detalle está en /superuser/empaque/errores.
export default function ErroresEmpaqueCard() {
    const { data, isLoading } = useQuery({
        queryKey: ['empaque-errores', 'dashboard'],
        queryFn: async () => {
            const res = await fetch('/api/empaque/errores');
            if (!res.ok) throw new Error('No se pudo cargar');
            return res.json();
        },
        refetchInterval: 300000,
    });

    const filas = (data?.empleados || []).filter((e) => e.verificados > 0 || e.errores > 0).slice(0, 6);
    const totalErrores = (data?.empleados || []).reduce((a, e) => a + e.errores, 0);

    return (
        <Paper withBorder radius="lg" p="md" component={Link} href="/superuser/empaque/errores" style={{ boxShadow: 'var(--mm-shadow-card)', display: 'block', textDecoration: 'none', color: 'inherit' }}>
            <Group justify="space-between" mb="xs" wrap="nowrap">
                <Group gap="sm" wrap="nowrap">
                    <ThemeIcon size={40} radius="xl" variant="light" color={totalErrores > 0 ? 'orange' : 'teal'}><IconTargetArrow size={22} /></ThemeIcon>
                    <Box>
                        <Title order={5} c="navy.9" lh={1.2}>Errores de empaque</Title>
                        <Text size="xs" c="dimmed">Últimos 30 días, por empleado</Text>
                    </Box>
                </Group>
                <Group gap={4} wrap="nowrap"><Text size="xs" c="dimmed">Ver detalle</Text><IconArrowRight size={14} color="var(--mantine-color-gray-6)" /></Group>
            </Group>
            {isLoading ? <Skeleton h={80} /> : !filas.length ? (
                <Text size="sm" c="dimmed">Todavía no hay empaques verificados en este período.</Text>
            ) : (
                <Stack gap={0}>
                    <Table verticalSpacing={4} fz="sm">
                        <Table.Thead><Table.Tr><Table.Th>Empleado</Table.Th><Table.Th ta="right">Verificados</Table.Th><Table.Th ta="right">Errores</Table.Th><Table.Th ta="right">Por cada 100</Table.Th></Table.Tr></Table.Thead>
                        <Table.Tbody>
                            {filas.map((e) => (
                                <Table.Tr key={e.id}>
                                    <Table.Td fw={600}>{e.nombre}</Table.Td>
                                    <Table.Td ta="right">{e.verificados}</Table.Td>
                                    <Table.Td ta="right"><Badge variant="light" color={e.errores === 0 ? 'teal' : e.errores > 5 ? 'red' : 'orange'}>{e.errores}</Badge></Table.Td>
                                    <Table.Td ta="right">{e.por100 === null ? '—' : e.por100}</Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                </Stack>
            )}
        </Paper>
    );
}
