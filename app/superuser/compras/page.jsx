'use client';

import React, { useState } from 'react';
import { 
    Box, Title, Paper, Table, Badge, Group, Text, 
    TextInput, Select, ScrollArea, Button, Stack 
} from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { IconSearch, IconReceipt2, IconArrowRight, IconCalendarEvent, IconBuildingStore } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import PrecioVisual from '@/app/components/ui/PrecioVisual';
import dayjs from 'dayjs';

export default function ComprasDashboardPage() {
    const router = useRouter();
    const getTodayYMD = () => new Date().toISOString().split('T')[0];

    const [fechaInicio, setFechaInicio] = useState(getTodayYMD());
    const [fechaFin, setFechaFin] = useState(getTodayYMD());
    const [search, setSearch] = useState('');

    const { data: compras, isLoading } = useQuery({
        queryKey: ['historial-compras', fechaInicio, fechaFin],
        queryFn: async () => {
            const res = await fetch(`/api/compras?fechaInicio=${fechaInicio}&fechaFin=${fechaFin}`);
            if (!res.ok) throw new Error('Error al cargar compras');
            return res.json();
        }
    });

    const comprasFiltradas = compras?.filter(c => 
        c.numeroDocumento?.toLowerCase().includes(search.toLowerCase()) ||
        c.proveedor?.nombre?.toLowerCase().includes(search.toLowerCase()) ||
        c.proveedor?.identificacion?.toLowerCase().includes(search.toLowerCase())
    ) || [];

    const formatearFechaHora = (fechaStr) => {
        if (!fechaStr) return '';
        return new Date(fechaStr).toLocaleString('es-VE', {
            timeZone: 'America/Caracas',
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: true
        });
    };

    return (
        <Box p="md" maw={1400} mx="auto">
            <Group justify="space-between" mb="lg">
                <Group>
                    <IconReceipt2 size={28} color="#1971C2" />
                    <Title order={2} c="blue.9">Historial de Facturas de Compra</Title>
                </Group>
                <Button color="blue" onClick={() => router.push('/superuser')}>
                    Volver al Dashboard
                </Button>
            </Group>

            {/* FILTROS DE FECHA */}
            <Paper p="sm" mb="md" withBorder radius="md" bg="blue.0">
                <Group justify="space-between" wrap="wrap">
                    <Group gap="sm" align="center">
                        <IconCalendarEvent size={20} color="#1971C2" />
                        <TextInput 
                            placeholder="Buscar por Nro o Proveedor..." 
                            w={250} size="sm"
                            leftSection={<IconSearch size={16}/>}
                            value={search}
                            onChange={(e) => setSearch(e.currentTarget.value)}
                        />
                    </Group>
                    <Group gap="xs">
                        <TextInput 
                            type="date" size="sm" label="Desde:" 
                            labelProps={{ style: { display: 'inline', marginRight: 8 } }}
                            value={fechaInicio} onChange={(e) => setFechaInicio(e.currentTarget.value)} 
                        />
                        <TextInput 
                            type="date" size="sm" label="Hasta:" 
                            labelProps={{ style: { display: 'inline', marginRight: 8 } }}
                            value={fechaFin} onChange={(e) => setFechaFin(e.currentTarget.value)} 
                        />
                    </Group>
                </Group>
            </Paper>

            {/* TABLA DE COMPRAS */}
            <Paper withBorder radius="md" bg="white">
                <ScrollArea>
                    <Table striped highlightOnHover verticalSpacing="sm">
                        <Table.Thead bg="gray.0">
                            <Table.Tr>
                                <Table.Th>Fecha Registro</Table.Th>
                                <Table.Th>Documento</Table.Th>
                                <Table.Th>Proveedor</Table.Th>
                                <Table.Th>Registrado Por</Table.Th>
                                <Table.Th>Condición</Table.Th>
                                <Table.Th>Total</Table.Th>
                                <Table.Th ta="center">Acción</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {isLoading ? (
                                <Table.Tr><Table.Td colSpan={7} align="center" py="xl">Cargando facturas de compra...</Table.Td></Table.Tr>
                            ) : comprasFiltradas.length === 0 ? (
                                <Table.Tr><Table.Td colSpan={7} align="center" py="xl">No hay compras registradas en este periodo.</Table.Td></Table.Tr>
                            ) : (
                                comprasFiltradas.map((compra) => {
                                    const registradorNombre = compra.registrador?.empleado 
                                        ? `${compra.registrador.empleado.nombre} ${compra.registrador.empleado.apellido}` 
                                        : compra.registrador?.user || 'Sistema';

                                    return (
                                        <Table.Tr key={compra.id}>
                                            <Table.Td>{formatearFechaHora(compra.createdAt)}</Table.Td>
                                            <Table.Td fw={700}>
                                                {compra.tipoDocumento === 'FACTURA' ? 'Factura: ' : 'Nota: '} 
                                                {compra.numeroDocumento}
                                            </Table.Td>
                                            <Table.Td>
                                                <Text fw={600} size="sm">{compra.proveedor?.nombre}</Text>
                                                <Text size="xs" c="dimmed">RIF: {compra.proveedor?.identificacion}</Text>
                                            </Table.Td>
                                            <Table.Td>
                                                <Badge variant="outline" color="cyan">{registradorNombre}</Badge>
                                            </Table.Td>
                                            <Table.Td>
                                                <Badge color={compra.condicionPago === 'Contado' ? 'green' : 'orange'} variant="light">
                                                    {compra.condicionPago} {compra.condicionPago === 'Credito' ? `(${compra.diasCredito}d)` : ''}
                                                </Badge>
                                            </Table.Td>
                                            <Table.Td>
                                                <PrecioVisual valor={compra.totalFinal} simbolo={compra.moneda === 'BS' ? 'Bs' : '$'} size="sm" fw={700} />
                                            </Table.Td>
                                            <Table.Td ta="center">
                                                <Button 
                                                    size="xs" variant="light" color="blue" 
                                                    rightSection={<IconArrowRight size={14} />}
                                                    onClick={() => router.push(`/superuser/compras/${compra.id}`)}
                                                >
                                                    Ver Detalle
                                                </Button>
                                            </Table.Td>
                                        </Table.Tr>
                                    );
                                })
                            )}
                        </Table.Tbody>
                    </Table>
                </ScrollArea>
            </Paper>
        </Box>
    );
}