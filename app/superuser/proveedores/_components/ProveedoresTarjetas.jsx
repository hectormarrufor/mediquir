'use client';

// Lista de proveedores para el TELÉFONO: una tarjeta por proveedor con lo que se le debe, su retención y botones de llamar y WhatsApp. Tocar la tarjeta abre su ficha.
import React from 'react';
import { Badge, Box, Button, Card, Group, Stack, Text } from '@mantine/core';
import { IconBrandWhatsapp, IconPhone } from '@tabler/icons-react';
import { formatearFecha } from '@/app/constants/hora';

const aWhatsApp = (tel) => {
    const d = String(tel || '').replace(/\D/g, '');
    if (!d) return null;
    if (d.startsWith('58')) return d;
    return d.startsWith('0') ? `58${d.slice(1)}` : d;
};

export default function ProveedoresTarjetas({ filas, verDeuda, textoDeuda, debe, onAbrir }) {
    return (
        <Stack gap="xs">
            {filas.map((p) => {
                const wa = aWhatsApp(p.telefono);
                const retencion = [75, 100].includes(Number(p.retencionIvaPorDefecto));
                return (
                    <Card key={p.id} withBorder radius="md" p="sm" onClick={() => onAbrir(p)} style={{ cursor: 'pointer', opacity: p.activo === false ? 0.65 : 1 }}>
                        <Group justify="space-between" wrap="nowrap" align="flex-start" gap="xs">
                            <Box style={{ minWidth: 0 }}>
                                <Text fw={700} size="sm" lineClamp={2} lh={1.25}>{p.nombre}</Text>
                                <Text size="xs" c="dimmed">{p.identificacion}</Text>
                            </Box>
                            {verDeuda && debe(p) && <Badge color="red" variant="light" size="lg" tt="none" style={{ flexShrink: 0 }}>Debes {textoDeuda(p)}</Badge>}
                        </Group>

                        <Group gap={6} mt={6}>
                            {p.activo === false && <Badge size="sm" color="gray" variant="filled" tt="none">Inactivo</Badge>}
                            {retencion
                                ? <Badge size="sm" variant="light" color={Number(p.retencionIvaPorDefecto) === 100 ? 'orange' : 'blue'} tt="none">Retención {p.retencionIvaPorDefecto} %</Badge>
                                : <Badge size="sm" variant="light" color="red" tt="none">Retención sin elegir</Badge>}
                            {p.esContribuyenteEspecial && <Badge size="sm" variant="light" color="grape" tt="none">Especial</Badge>}
                        </Group>

                        <Text size="xs" c="dimmed" mt={6}>
                            {p.nCompras ? `${p.nCompras} compra(s)` : 'Sin compras'}{p.ultimaCompra ? ` · última ${formatearFecha(p.ultimaCompra)}` : ''}
                        </Text>

                        <Group gap="xs" mt="sm" grow wrap="nowrap" onClick={(e) => e.stopPropagation()}>
                            {p.telefono ? (
                                <Button component="a" href={`tel:${String(p.telefono).replace(/[^\d+]/g, '')}`} size="sm" variant="light" leftSection={<IconPhone size={16} />} style={{ minWidth: 0 }}>{p.telefono}</Button>
                            ) : <Button size="sm" variant="default" disabled leftSection={<IconPhone size={16} />}>Sin teléfono</Button>}
                            {wa && <Button component="a" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" size="sm" variant="light" color="green" leftSection={<IconBrandWhatsapp size={16} />} style={{ flex: '0 0 auto' }}>WhatsApp</Button>}
                        </Group>
                    </Card>
                );
            })}
        </Stack>
    );
}
