'use client';

import React, { useState } from 'react';
import { Box, Title, Paper, Table, Badge, Group, Text, Button, ScrollArea, TextInput } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { IconCoins, IconSearch } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import PrecioVisual from '@/app/components/ui/PrecioVisual';

export default function CuentasPorCobrarPage() {
    const router = useRouter();
    const [search, setSearch] = useState('');

    const { data: cuentas, isLoading } = useQuery({
        queryKey: ['cuentas-por-cobrar'],
        queryFn: async () => {
            const res = await fetch('/api/finanzas/cxc');
            if (!res.ok) throw new Error('Error al cargar CxC');
            return res.json();
        }
    });

    const cuentasFiltradas = cuentas?.filter(c => 
        c.cliente?.nombre?.toLowerCase().includes(search.toLowerCase()) ||
        c.cliente?.identificacion?.toLowerCase().includes(search.toLowerCase()) ||
        c.venta?.numeroDocumento?.toLowerCase().includes(search.toLowerCase())
    ) || [];

    return (
        <Box p="md" maw={1400} mx="auto">
            <Group justify="space-between" mb="lg">
                <Group>
                    <IconCoins size={28} color="#2b8a3e" />
                    <Title order={2} c="green.9">Gestión de Cuentas por Cobrar (CxC)</Title>
                </Group>
                <Button variant="subtle" onClick={() => router.push('/superuser/finanzas')}>
                    Volver a Finanzas
                </Button>
            </Group>

            <Paper p="sm" mb="md" withBorder radius="md" bg="green.0">
                <TextInput 
                    placeholder="Buscar por cliente, RIF o Nro de documento..." 
                    w={350} size="sm"
                    leftSection={<IconSearch size={16}/>}
                    value={search}
                    onChange={(e) => setSearch(e.currentTarget.value)}
                />
            </Paper>

            <Paper withBorder radius="md" bg="white">
                <ScrollArea>
                    <Table striped highlightOnHover verticalSpacing="sm">
                        <Table.Thead bg="gray.0">
                            <Table.Tr>
                                <Table.Th>Cliente</Table.Th>
                                <Table.Th>Nro. Documento</Table.Th>
                                <Table.Th>Vencimiento</Table.Th>
                                <Table.Th>Monto Total</Table.Th>
                                <Table.Th>Saldo Pendiente</Table.Th>
                                <Table.Th ta="center">Estado</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {isLoading ? (
                                <Table.Tr><Table.Td colSpan={6} align="center" py="xl">Cargando cuentas por cobrar...</Table.Td></Table.Tr>
                            ) : cuentasFiltradas.length === 0 ? (
                                <Table.Tr><Table.Td colSpan={6} align="center" py="xl">No hay cuentas por cobrar pendientes.</Table.Td></Table.Tr>
                            ) : (
                                cuentasFiltradas.map((cxc) => (
                                    <Table.Tr key={cxc.id}>
                                        <Table.Td>
                                            <Text fw={600} size="sm">{cxc.cliente?.nombre}</Text>
                                            <Text size="xs" c="dimmed">RIF: {cxc.cliente?.identificacion} | Tel: {cxc.cliente?.telefono || 'N/A'}</Text>
                                        </Table.Td>
                                        <Table.Td fw={700}>{cxc.venta?.numeroDocumento}</Table.Td>
                                        <Table.Td>{cxc.fechaVencimiento}</Table.Td>
                                        <Table.Td><PrecioVisual valor={cxc.montoTotal} simbolo={cxc.moneda === 'BS' ? 'Bs' : '$'} size="sm" /></Table.Td>
                                        <Table.Td><PrecioVisual valor={cxc.saldoPendiente} simbolo={cxc.moneda === 'BS' ? 'Bs' : '$'} size="sm" fw={700} c="green.7" /></Table.Td>
                                        <Table.Td ta="center">
                                            <Badge color={cxc.estado === 'Pendiente' ? 'yellow' : cxc.estado === 'Vencido' ? 'red' : 'green'} variant="light">
                                                {cxc.estado}
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