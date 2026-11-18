'use client';

import React, { useState } from 'react';
import { Alert, Badge, Box, Card, Center, Group, Loader, Modal, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { IconSearch } from '@tabler/icons-react';
import { aBolivares } from '@/app/constants/facturacion';
import { useTasaBcv } from '@/hooks/useTasaBcv';
import { useAuth } from '@/hooks/useAuth';
import { useEsTelefono } from '@/app/components/ui/modalMovil';

const usd = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const bs = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Precio({ etiqueta, detalle, valor, color }) {
    return (
        <Box p={6} style={{ borderRadius: 8, background: 'var(--mantine-color-gray-0)', minWidth: 0 }}>
            <Text fz={10} c="dimmed" fw={800} tt="uppercase" lh={1.2}>{etiqueta}</Text>
            <Text fw={800} size="md" c={valor === null ? 'dimmed' : color} lh={1.3}>{valor === null ? '—' : valor}</Text>
            {detalle && <Text fz={10} c="dimmed" lh={1.2}>{detalle}</Text>}
        </Box>
    );
}

// Consultor rápido de precios: escribes el producto y salen existencia y todos los precios (P7, P6 en dólares; P4, P5 en bolívares a la tasa del día)
export default function ConsultorPrecios({ opened, onClose }) {
    const [busqueda, setBusqueda] = useState('');
    const [q] = useDebouncedValue(busqueda.trim(), 300);
    const { tasa } = useTasaBcv();
    const { esVendedor } = useAuth();
    const telefono = useEsTelefono();
    const { data, isLoading, isFetching, error } = useQuery({
        queryKey: ['consultor-precios', q], enabled: opened, placeholderData: keepPreviousData, staleTime: 30_000,
        queryFn: async () => {
            const res = await fetch(`/api/precios/consulta?q=${encodeURIComponent(q)}`);
            const cuerpo = await res.json().catch(() => null);
            if (!res.ok) throw new Error(cuerpo?.error || 'No se pudo consultar');
            return cuerpo;
        },
    });
    const enBs = (v) => (v === null || v === undefined || !(tasa > 0) ? null : `Bs ${bs.format(aBolivares(Number(v), tasa))}`);
    const enUsd = (v) => (v === null || v === undefined ? null : `$${usd.format(v)}`);

    return (
        <Modal opened={opened} onClose={onClose} fullScreen={telefono} size="xl" centered title={<Text fw={800}>Consultor de precios{tasa ? ` · BCV ${tasa} Bs/$` : ''}</Text>}>
            <Stack gap="sm">
                <TextInput data-autofocus size="md" placeholder="Escribe el nombre o el código del producto…" leftSection={<IconSearch size={18} />} value={busqueda} onChange={(e) => setBusqueda(e.currentTarget.value)} rightSection={isFetching ? <Loader size={16} /> : null} />
                {error && <Alert color="red">{error.message}</Alert>}
                {isLoading ? <Center py="xl"><Loader /></Center> : !data?.productos?.length ? <Center py="xl"><Text c="dimmed">No hay productos con ese nombre.</Text></Center> : (
                    <Stack gap="xs">
                        {data.productos.map((p) => (
                            <Card key={p.id} withBorder radius="md" p="sm">
                                <Group justify="space-between" wrap="nowrap" align="flex-start" mb={6}>
                                    <Box style={{ minWidth: 0 }}>
                                        <Text fw={700} size="sm" lineClamp={2}>{p.nombre}</Text>
                                        <Text size="xs" c="dimmed">{[p.codigo, p.marca, p.presentacion].filter(Boolean).join(' · ')}</Text>
                                    </Box>
                                    {p.stock <= 0 ? <Badge color="red" variant="light">Agotado</Badge> : <Badge color={p.bajo ? 'orange' : 'teal'} variant="light" style={{ flexShrink: 0 }}>{p.stock}{p.bajo ? ' · bajo' : ''}</Badge>}
                                </Group>
                                <SimpleGrid cols={{ base: 2, sm: esVendedor ? 4 : 5 }} spacing={6}>
                                    <Precio etiqueta="P7 · Detal" detalle={p.descuento > 0 ? `oferta -${p.descuento}%` : 'dólares'} valor={enUsd(p.precio7)} color="navy.9" />
                                    <Precio etiqueta="P6 · Mayor" detalle="dólares" valor={enUsd(p.precio6)} color="navy.9" />
                                    <Precio etiqueta="P4 · Detal Bs" detalle="P7 en bolívares" valor={enBs(p.precio7)} color="teal.8" />
                                    <Precio etiqueta="P5 · Mayor Bs" detalle="P6 en bolívares" valor={enBs(p.precio6)} color="teal.8" />
                                    {!esVendedor && <Precio etiqueta="P1" detalle="35 % sobre costo, Bs" valor={enBs(p.precio1)} color="grape.8" />}
                                </SimpleGrid>
                            </Card>
                        ))}
                        {data.hayMas && <Text size="xs" c="dimmed" ta="center">Se muestran los primeros 30: escribe más del nombre para afinar.</Text>}
                    </Stack>
                )}
            </Stack>
        </Modal>
    );
}
