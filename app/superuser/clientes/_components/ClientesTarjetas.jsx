'use client';

// Lista de clientes para el TELÉFONO: una tarjeta por cliente (nombre, RIF, lo que debe y botones de llamar, WhatsApp y ficha), en vez de la hoja de cálculo ancha.
// Tocar la tarjeta abre la ficha del cliente.
import React from 'react';
import { ActionIcon, Badge, Box, Button, Card, Group, Menu, Stack, Text } from '@mantine/core';
import { IconBrandWhatsapp, IconDotsVertical, IconEye, IconKey, IconMapPin, IconPhone } from '@tabler/icons-react';
import { formatearFecha } from '@/app/constants/hora';
import EstadoCuentaAcciones from './EstadoCuentaAcciones';

const usd = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// 0414-1234567 -> 584141234567 (para wa.me)
export const aWhatsApp = (tel) => {
    const d = String(tel || '').replace(/\D/g, '');
    if (!d) return null;
    if (d.startsWith('58')) return d;
    return d.startsWith('0') ? `58${d.slice(1)}` : d;
};

export default function ClientesTarjetas({ filas, esVendedor, permisos, onFicha, onAcceso }) {
    return (
        <Stack gap="xs">
            {filas.map((f) => {
                const wa = aWhatsApp(f.telefono);
                const debe = !esVendedor && Number(f.saldo) > 0.005;
                return (
                    <Card key={f.id} withBorder radius="md" p="sm" onClick={() => onFicha(f.id)} style={{ cursor: 'pointer' }}>
                        <Group justify="space-between" wrap="nowrap" align="flex-start" gap="xs">
                            <Box style={{ minWidth: 0 }}>
                                <Text fw={700} size="sm" lineClamp={2} lh={1.25}>{f.nombre}</Text>
                                <Text size="xs" c="dimmed">{f.identificacion}</Text>
                            </Box>
                            <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
                                {debe && <Badge color="orange" variant="light" size="lg" tt="none">Debe ${usd.format(f.saldo)}</Badge>}
                                {permisos?.editar && (
                                    <Box onClick={(e) => e.stopPropagation()}>
                                        <Menu position="bottom-end" shadow="md" width={220}>
                                            <Menu.Target><ActionIcon variant="subtle" color="gray" aria-label="Más acciones"><IconDotsVertical size={18} /></ActionIcon></Menu.Target>
                                            <Menu.Dropdown>
                                                <Menu.Item leftSection={<IconEye size={14} />} onClick={() => onFicha(f.id)}>Ver ficha</Menu.Item>
                                                <Menu.Item leftSection={<IconKey size={14} />} onClick={() => onAcceso(f)}>{f.usuario ? 'Restablecer contraseña' : 'Crear acceso B2B'}</Menu.Item>
                                            </Menu.Dropdown>
                                        </Menu>
                                    </Box>
                                )}
                            </Group>
                        </Group>

                        <Group gap={6} mt={6}>
                            {f.usuario ? <Badge size="sm" color="teal" variant="light" tt="none">Portal B2B</Badge> : <Badge size="sm" color="gray" variant="light" tt="none">Sin portal</Badge>}
                            {!esVendedor && Number(f.pedidos) > 0 && <Badge size="sm" color="blue" variant="light" tt="none">{f.pedidos} pedido(s)</Badge>}
                            {!esVendedor && f.ultimaCompra && <Text size="xs" c="dimmed">Último: {formatearFecha(f.ultimaCompra)}</Text>}
                        </Group>

                        {f.direccion && (
                            <Group gap={4} mt={6} wrap="nowrap" align="flex-start">
                                <IconMapPin size={14} color="var(--mantine-color-gray-6)" style={{ flexShrink: 0, marginTop: 2 }} />
                                <Text size="xs" c="dimmed" lineClamp={2}>{f.direccion}</Text>
                            </Group>
                        )}

                        <Group gap="xs" mt="sm" grow wrap="nowrap" onClick={(e) => e.stopPropagation()}>
                            {f.telefono ? (
                                <Button component="a" href={`tel:${String(f.telefono).replace(/[^\d+]/g, '')}`} size="sm" variant="light" leftSection={<IconPhone size={16} />} style={{ minWidth: 0 }}>{f.telefono}</Button>
                            ) : <Button size="sm" variant="default" disabled leftSection={<IconPhone size={16} />}>Sin teléfono</Button>}
                            {!esVendedor && <EstadoCuentaAcciones clienteId={f.id} size="sm" />}
                            {wa && <Button component="a" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" size="sm" variant="light" color="green" leftSection={<IconBrandWhatsapp size={16} />} style={{ flex: '0 0 auto' }}>WhatsApp</Button>}
                        </Group>
                    </Card>
                );
            })}
        </Stack>
    );
}
