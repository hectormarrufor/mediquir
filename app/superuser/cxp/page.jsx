'use client';

import React, { useState } from 'react';
import { Box, Title, Paper, Table, Badge, Group, Text, Button, ScrollArea } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { IconCoins } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import PrecioVisual from '@/app/components/ui/PrecioVisual';

export default function CuentasPorPagarPage() {
    const router = useRouter();

    const { data: cuentas, isLoading } = useQuery({
        queryKey: ['cuentas-por-pagar'],
        queryFn: async () => {
            const res = await fetch('/api/finanzas/cxp');
            if (!res.ok) throw new Error('Error al cargar CxP');
            return res.json();
        }
    });

    return (
        <Box p="md" maw={1400} mx="auto">
            <Group justify="space-between" mb="lg">
                <Group>
                    <IconCoins size={28} color="#E03131" />
                    <Title order={2} c="red.9">Gestión de Cuentas por Pagar (CxP)</Title>
                </Group>
                <Button variant="subtle" onClick={() => router.push('/superuser/finanzas')}>
                    Volver a Finanzas
                </Button>
            </Group>

            <Paper withBorder radius="md" bg="white">
                <ScrollArea>
                    <Table striped highlightOnHover verticalSpacing="sm">
                        <Table.Thead bg="gray.0">
                            <Table.Tr>
                                <Table.Th>Proveedor</Table.Th>
                                <Table.Th>Nro. Documento</Table.Th>
                                <Table.Th>Vencimiento</Table.Th>
                                <Table.Th>Monto Total</Table.Th>
                                <Table.Th>Saldo Pendiente</Table.Th>
                                <Table.Th ta="center">Estado</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {isLoading ? (
                                <Table.Tr><Table.Td colSpan={6} align="center" py="xl">Cargando cuentas por pagar...</Table.Td></Table.Tr>
                            ) : cuentas?.length === 0 ? (
                                <Table.Tr><Table.Td colSpan={6} align="center" py="xl">No hay cuentas por pagar pendientes.</Table.Td></Table.Tr>
                            ) : (
                                cuentas?.map((cxp) => (
                                    <Table.Tr key={cxp.id}>
                                        <Table.Td>
                                            <Text fw={600} size="sm">{cxp.proveedor?.nombre}</Text>
                                            <Text size="xs" c="dimmed">RIF: {cxp.proveedor?.identificacion}</Text>
                                        </Table.Td>
                                        <Table.Td fw={700}>{cxp.facturaCompra?.numeroDocumento}</Table.Td>
                                        <Table.Td>{cxp.fechaVencimiento}</Table.Td>
                                        <Table.Td><PrecioVisual valor={cxp.montoTotal} simbolo={cxp.moneda === 'BS' ? 'Bs' : '$'} size="sm" /></Table.Td>
                                        <Table.Td><PrecioVisual valor={cxp.saldoPendiente} simbolo={cxp.moneda === 'BS' ? 'Bs' : '$'} size="sm" fw={700} c="red.7" /></Table.Td>
                                        <Table.Td ta="center">
                                            <Badge color={cxp.estado === 'Pendiente' ? 'yellow' : 'green'} variant="light">
                                                {cxp.estado}
                                            </Badge>
                                        </Table.Td>
                                    </Table.Tr>
                                ))
                            )}
                        </Table.Tbody>
                    </Table>
                </ScrollArea>
            </Paper>
        </Box>
    );
}