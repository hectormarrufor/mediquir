'use client';

import React, { useState } from 'react';
import { 
    Container, Title, Paper, Table, Badge, Group, 
    Text, ScrollArea, ActionIcon, Tooltip, Loader, Center, Button, Modal, Stack, Alert
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { IconDeviceMobileMessage, IconCheck, IconClock, IconRefresh, IconLink } from '@tabler/icons-react';

function VincularModal({ pago, onClose }) {
    const queryClient = useQueryClient();
    const [enviando, setEnviando] = useState(null);
    const [aviso, setAviso] = useState(null); // { ventaId, mensaje } cuando el monto no coincide y hay que confirmar

    const { data: ventas, isLoading } = useQuery({
        queryKey: ['pago-vincular', pago?.id],
        enabled: Boolean(pago),
        queryFn: async () => {
            const res = await fetch(`/api/pagos-recibidos/${pago.id}/vincular`);
            if (!res.ok) throw new Error('Error al cargar las ventas');
            return res.json();
        },
    });

    const vincular = async (venta, confirmarDiferencia = false) => {
        setEnviando(venta.id);
        try {
            const res = await fetch(`/api/pagos-recibidos/${pago.id}/vincular`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ventaId: venta.id, confirmarDiferencia }),
            });
            const data = await res.json();
            if (res.status === 409 && data.requiereConfirmacion) {
                setAviso({ venta, mensaje: data.error });
                return;
            }
            if (!res.ok) throw new Error(data.error || 'No se pudo vincular');
            notifications.show({ title: 'Pago vinculado', message: `Quedó asociado a la venta ${data.numeroDocumento}`, color: 'teal' });
            queryClient.invalidateQueries({ queryKey: ['pagos-recibidos'] });
            onClose();
        } catch (e) {
            notifications.show({ title: 'Error', message: e.message, color: 'red' });
        } finally {
            setEnviando(null);
        }
    };

    const fmt = (n) => new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'VES' }).format(n);

    return (
        <Modal opened={Boolean(pago)} onClose={onClose} title="Vincular pago con una venta" size="lg">
            {pago && (
                <Stack gap="sm">
                    <Text size="sm">
                        Pago de <b>{pago.telefonoEmisor || 'Desconocido'}</b> por <b>{fmt(pago.monto)}</b> (ref. {pago.referencia}).
                        Elige la venta pendiente de cobro a la que pertenece.
                    </Text>
                    {aviso && (
                        <Alert color="yellow" title="El monto no coincide">
                            <Text size="sm" mb="xs">{aviso.mensaje}</Text>
                            <Group>
                                <Button size="xs" color="yellow.8" loading={enviando === aviso.venta.id} onClick={() => vincular(aviso.venta, true)}>Vincular de todos modos</Button>
                                <Button size="xs" variant="default" onClick={() => setAviso(null)}>Cancelar</Button>
                            </Group>
                        </Alert>
                    )}
                    {isLoading ? <Center h={120}><Loader type="dots" /></Center> : (
                        <ScrollArea.Autosize mah={360}>
                            <Table verticalSpacing="xs">
                                <Table.Tbody>
                                    {ventas?.length ? ventas.map((v) => (
                                        <Table.Tr key={v.id}>
                                            <Table.Td>
                                                <Text size="sm" fw={600}>{v.numeroDocumento}</Text>
                                                <Text size="xs" c="dimmed">{v.cliente}</Text>
                                                {v.esCredito && <Badge size="xs" color="grape" variant="light">A crédito: se registra como abono</Badge>}
                                            </Table.Td>
                                            <Table.Td style={{ textAlign: 'right' }}>
                                                <Text size="sm" fw={700} c={v.coincide ? 'teal.7' : undefined}>{fmt(v.esperadoBs)}</Text>
                                                {v.coincide && <Badge size="xs" color="teal" variant="light">{v.esCredito ? 'Liquida el saldo' : 'Mismo monto'}</Badge>}
                                            </Table.Td>
                                            <Table.Td style={{ textAlign: 'right' }}>
                                                <Button size="xs" variant={v.coincide ? 'filled' : 'light'} loading={enviando === v.id} onClick={() => vincular(v)}>Vincular</Button>
                                            </Table.Td>
                                        </Table.Tr>
                                    )) : (
                                        <Table.Tr><Table.Td><Text c="dimmed" ta="center">No hay ventas pendientes de pago.</Text></Table.Td></Table.Tr>
                                    )}
                                </Table.Tbody>
                            </Table>
                        </ScrollArea.Autosize>
                    )}
                </Stack>
            )}
        </Modal>
    );
}

export default function PagosRecibidosPage() {
    const [pagoAVincular, setPagoAVincular] = useState(null);
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
                                            <Text size="md" fw={800} c="teal.9">
                                                {formatoMoneda(pago.monto)}
                                            </Text>
                                        </Table.Td>
                                        
                                        <Table.Td style={{ textAlign: 'center' }}>
                                            {pago.procesado ? (
                                                <Badge color="teal" variant="filled" leftSection={<IconCheck size={12} />}>
                                                    Conciliado
                                                </Badge>
                                            ) : (
                                                <Group gap="xs" justify="center" wrap="nowrap">
                                                    <Badge color="yellow" variant="light" leftSection={<IconClock size={12} />}>
                                                        Pendiente
                                                    </Badge>
                                                    <Tooltip label="Vincular a una venta">
                                                        <ActionIcon variant="light" color="blue" onClick={() => setPagoAVincular(pago)}>
                                                            <IconLink size={16} />
                                                        </ActionIcon>
                                                    </Tooltip>
                                                </Group>
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
            <VincularModal pago={pagoAVincular} onClose={() => setPagoAVincular(null)} />
        </Container>
    );
}