'use client';

import React from 'react';
import { 
    Container, Title, Paper, Table, Badge, Group, 
    Text, ScrollArea, ActionIcon, Tooltip, Loader, Center
} from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { IconDeviceMobileMessage, IconCheck, IconClock, IconRefresh } from '@tabler/icons-react';

export default function PagosRecibidosPage() {
    // Fetcheamos los pagos desde nuestra nueva API
    const { data: pagos, isLoading, refetch } = useQuery({
        queryKey: ['pagos-recibidos'],
        queryFn: async () => {
            const res = await fetch('/api/pagos-recibidos');
            if (!res.ok) throw new Error('Error al cargar');
            return res.json();
        },
        refetchInterval: 15000 // Se actualiza solo cada 15 segundos para ver los pagos caer en vivo
    });

    const formatoMoneda = (monto) => new Intl.NumberFormat('es-VE', { 
        style: 'currency', currency: 'VES' 
    }).format(monto);

    const formatoFecha = (fechaString) => {
        const fecha = new Date(fechaString);
        return fecha.toLocaleString('es-VE', { 
            day: '2-digit', month: '2-digit', year: 'numeric', 
            hour: '2-digit', minute: '2-digit', hour12: true 
        });
    };

    return (
        <Container size="xl" py="lg">
            <Group justify="space-between" mb="xl">
                <Group>
                    <IconDeviceMobileMessage size={32} color="#1971C2" />
                    <Title order={2} c="blue.9">Historial de Pagos Móviles</Title>
                </Group>
                <Tooltip label="Actualizar tabla">
                    <ActionIcon variant="light" color="blue" size="lg" radius="md" onClick={() => refetch()}>
                        <IconRefresh size={20} />
                    </ActionIcon>
                </Tooltip>
            </Group>

            <Paper withBorder radius="md" shadow="sm" p={0} style={{ overflow: 'hidden' }}>
                <ScrollArea h="70vh" offsetScrollbars>
                    {isLoading ? (
                        <Center h={300}>
                            <Loader size="lg" type="dots" />
                        </Center>
                    ) : (
                        <Table striped highlightOnHover verticalSpacing="sm" style={{ minWidth: 700 }}>
                            <Table.Thead bg="gray.1">
                                <Table.Tr>
                                    <Table.Th>Fecha y Hora</Table.Th>
                                    <Table.Th>Origen / Banco</Table.Th>
                                    <Table.Th>Referencia</Table.Th>
                                    <Table.Th style={{ textAlign: 'right' }}>Monto (Bs)</Table.Th>
                                    <Table.Th style={{ textAlign: 'center' }}>Estado</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {pagos?.length > 0 ? pagos.map((pago) => (
                                    <Table.Tr key={pago.id}>
                                        <Table.Td>
                                            <Text size="sm" fw={500}>{formatoFecha(pago.fechaHora)}</Text>
                                        </Table.Td>
                                        
                                        <Table.Td>
                                            <Text size="sm" fw={600} c="dark.3">{pago.telefonoEmisor || 'Desconocido'}</Text>
                                            <Text size="xs" c="dimmed">{pago.banco}</Text>
                                        </Table.Td>
                                        
                                        <Table.Td>
                                            <Badge color="gray" variant="light" size="lg" radius="sm">
                                                {pago.referencia}
                                            </Badge>
                                        </Table.Td>
                                        
                                        <Table.Td style={{ textAlign: 'right' }}>
                                            <Text size="md" fw={800} c="teal.7">
                                                {formatoMoneda(pago.monto)}
                                            </Text>
                                        </Table.Td>
                                        
                                        <Table.Td style={{ textAlign: 'center' }}>
                                            {pago.procesado ? (
                                                <Badge color="teal" variant="filled" leftSection={<IconCheck size={12} />}>
                                                    Conciliado
                                                </Badge>
                                            ) : (
                                                <Badge color="yellow.8" variant="light" leftSection={<IconClock size={12} />}>
                                                    Pendiente
                                                </Badge>
                                            )}
                                        </Table.Td>
                                    </Table.Tr>
                                )) : (
                                    <Table.Tr>
                                        <Table.Td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>
                                            <Text c="dimmed">No se han registrado pagos móviles aún.</Text>
                                        </Table.Td>
                                    </Table.Tr>
                                )}
                            </Table.Tbody>
                        </Table>
                    )}
                </ScrollArea>
            </Paper>
        </Container>
    );
}