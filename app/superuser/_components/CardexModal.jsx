'use client';

import React, { useState } from 'react';
import {
    Alert, Avatar, Badge, Box, Button, Card, Center, CloseButton, Collapse, Group, Loader, Modal,
    Paper, SimpleGrid, Stack, Table, Text, TextInput, UnstyledButton,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
    IconArrowDownLeft, IconArrowUpRight, IconChevronDown, IconChevronUp,
    IconClipboardList, IconReceiptRefund, IconSearch,
} from '@tabler/icons-react';
import { useAuth } from '@/hooks/useAuth';
import { useEsTelefono } from '@/app/components/ui/modalMovil';
import { getProductImages, PLACEHOLDER_IMG } from '@/app/components/landing/productUtils';

const usd = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nfInt = new Intl.NumberFormat('es-VE', { maximumFractionDigits: 0 });
const fmtFecha = (v) => (v ? new Date(v).toLocaleDateString('es-VE', { timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');
const fmtFechaCorta = (iso) => {
    if (!iso) return 'Sin registro';
    const [y, m, d] = String(iso).slice(0, 10).split('-');
    return d && m && y ? `${d}/${m}/${y}` : iso;
};

function Metrica({ etiqueta, valor, detalle, color = 'navy.9', bg = 'var(--mantine-color-gray-0)' }) {
    return (
        <Box p={8} style={{ borderRadius: 8, background: bg, minWidth: 0 }}>
            <Text fz={10} c="dimmed" fw={800} tt="uppercase" lh={1.2} lineClamp={1}>{etiqueta}</Text>
            <Text fw={900} size="md" c={color} lh={1.25} mt={1} style={{ fontVariantNumeric: 'tabular-nums' }}>{valor}</Text>
            {detalle && <Text fz={10} c="dimmed" lh={1.2} mt={1} lineClamp={1}>{detalle}</Text>}
        </Box>
    );
}

const BADGE_MOV = {
    VENTA: { color: 'blue', etiqueta: 'Salida · Venta', icono: IconArrowUpRight },
    COMPRA: { color: 'teal', etiqueta: 'Entrada · Compra', icono: IconArrowDownLeft },
    DEVOLUCION: { color: 'orange', etiqueta: 'Entrada · Nota Créd.', icono: IconReceiptRefund },
};

function HistorialMovimientos({ productoId, esVendedor, telefono, onNavegar }) {
    const { data, isLoading, error } = useQuery({
        queryKey: ['cardex-movimientos', productoId],
        queryFn: async () => {
            const r = await fetch(`/api/inventario/cardex?productoId=${productoId}`);
            const c = await r.json().catch(() => null);
            if (!r.ok) throw new Error(c?.error || 'No se pudo cargar los movimientos');
            return c;
        },
    });

    if (isLoading) return <Center py="md"><Loader size="sm" /></Center>;
    if (error) return <Alert color="red" py="xs">{error.message}</Alert>;
    const movs = data?.movimientos || [];
    if (!movs.length) return <Text size="xs" c="dimmed" ta="center" py="xs">Este producto aún no registra movimientos de ventas ni entradas.</Text>;

    if (telefono) {
        return (
            <Stack gap={6} mt="xs">
                {movs.map((m) => {
                    const conf = BADGE_MOV[m.tipo] || BADGE_MOV.VENTA;
                    return (
                        <Paper
                            key={m.key}
                            withBorder
                            radius="sm"
                            p={8}
                            bg="white"
                            onClick={m.url ? () => onNavegar(m.url) : undefined}
                            style={{ cursor: m.url ? 'pointer' : 'default' }}
                        >
                            <Group justify="space-between" wrap="nowrap" gap="xs">
                                <Box style={{ minWidth: 0, flex: 1 }}>
                                    <Group gap={6} wrap="wrap">
                                        <Badge size="xs" variant="light" color={conf.color}>{conf.etiqueta}</Badge>
                                        <Text size="xs" fw={800} c="navy.9">{m.numero}</Text>
                                        <Text fz={11} c="dimmed">{fmtFecha(m.fecha)}</Text>
                                    </Group>
                                    <Text size="xs" c="dark.6" lineClamp={1} mt={2}>{m.tercero}</Text>
                                </Box>
                                <Box ta="right" style={{ flexShrink: 0 }}>
                                    <Text size="sm" fw={900} c={m.cantidad < 0 ? 'blue.7' : 'teal.7'} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                        {m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad} uds.
                                    </Text>
                                    {!esVendedor && m.precioUsd > 0 && (
                                        <Text fz={10.5} c="dimmed" style={{ fontVariantNumeric: 'tabular-nums' }}>${usd.format(m.precioUsd)} c/u</Text>
                                    )}
                                </Box>
                            </Group>
                        </Paper>
                    );
                })}
            </Stack>
        );
    }

    return (
        <Paper withBorder radius="sm" mt="xs" style={{ overflow: 'hidden' }}>
            <Table.ScrollContainer minWidth={520}>
                <Table verticalSpacing={6} horizontalSpacing="xs" highlightOnHover fz="xs">
                    <Table.Thead bg="gray.1">
                        <Table.Tr>
                            <Table.Th>Fecha</Table.Th>
                            <Table.Th>Movimiento</Table.Th>
                            <Table.Th>Documento</Table.Th>
                            <Table.Th>Cliente / Proveedor</Table.Th>
                            <Table.Th ta="right">Cantidad</Table.Th>
                            {!esVendedor && <Table.Th ta="right">Precio / Costo</Table.Th>}
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {movs.map((m) => {
                            const conf = BADGE_MOV[m.tipo] || BADGE_MOV.VENTA;
                            return (
                                <Table.Tr
                                    key={m.key}
                                    onClick={m.url ? () => onNavegar(m.url) : undefined}
                                    style={{ cursor: m.url ? 'pointer' : 'default' }}
                                >
                                    <Table.Td style={{ whiteSpace: 'nowrap' }}>{fmtFecha(m.fecha)}</Table.Td>
                                    <Table.Td><Badge size="xs" variant="light" color={conf.color}>{conf.etiqueta}</Badge></Table.Td>
                                    <Table.Td fw={700} style={{ whiteSpace: 'nowrap' }}>{m.numero}</Table.Td>
                                    <Table.Td><Text size="xs" lineClamp={1} maw={230}>{m.tercero}</Text></Table.Td>
                                    <Table.Td ta="right" fw={800} c={m.cantidad < 0 ? 'blue.7' : 'teal.7'} style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                                        {m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad} uds.
                                    </Table.Td>
                                    {!esVendedor && (
                                        <Table.Td ta="right" c="dimmed" style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                                            {m.precioUsd > 0 ? `$${usd.format(m.precioUsd)}` : '—'}
                                        </Table.Td>
                                    )}
                                </Table.Tr>
                            );
                        })}
                    </Table.Tbody>
                </Table>
            </Table.ScrollContainer>
        </Paper>
    );
}

export default function CardexModal({ opened, onClose }) {
    const router = useRouter();
    const [busqueda, setBusqueda] = useState('');
    const [q] = useDebouncedValue(busqueda.trim(), 300);
    const { esVendedor } = useAuth();
    const telefono = useEsTelefono();
    const [abiertoId, setAbiertoId] = useState(null);

    const { data, isLoading, isFetching, error } = useQuery({
        queryKey: ['cardex-productos', q],
        enabled: opened,
        placeholderData: keepPreviousData,
        staleTime: 30_000,
        queryFn: async () => {
            const res = await fetch(`/api/inventario/cardex?q=${encodeURIComponent(q)}`);
            const cuerpo = await res.json().catch(() => null);
            if (!res.ok) throw new Error(cuerpo?.error || 'No se pudo consultar el cardex');
            return cuerpo;
        },
    });

    const irADocumento = (url) => {
        onClose();
        router.push(url);
    };

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            fullScreen={telefono}
            size="xl"
            centered
            title={
                <Group gap={8}>
                    <IconClipboardList size={20} color="var(--mantine-color-indigo-6)" />
                    <Text fw={800}>Cardex de productos · Ventas y movimientos</Text>
                </Group>
            }
        >
            <Stack gap="sm">
                <TextInput
                    data-autofocus
                    size="md"
                    placeholder="Busca un producto por nombre o código para ver cuántas ventas tiene…"
                    leftSection={<IconSearch size={18} />}
                    rightSection={
                        isFetching ? <Loader size={16} /> : busqueda ? <CloseButton size="sm" onClick={() => setBusqueda('')} aria-label="Limpiar búsqueda" /> : null
                    }
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.currentTarget.value)}
                />

                {!q && (
                    <Text size="xs" c="dimmed">
                        Mostrando los productos con más unidades vendidas. Escribe en el buscador para consultar cualquier producto y desplegar su historial de entradas y salidas.
                    </Text>
                )}

                {error && <Alert color="red">{error.message}</Alert>}

                {isLoading ? (
                    <Center py="xl"><Loader /></Center>
                ) : !data?.productos?.length ? (
                    <Center py="xl"><Text c="dimmed">No se encontraron productos con esa búsqueda.</Text></Center>
                ) : (
                    <Stack gap="xs">
                        {data.productos.map((p) => {
                            const abierto = abiertoId === p.id;
                            const imgSrc = getProductImages({ imagen: p.imagen, grupoEquivalencia: p.grupoEquivalencia, marca: { imagen: p.marcaImagen } })[0]?.src || PLACEHOLDER_IMG;
                            return (
                                <Card key={p.id} withBorder radius="md" p="sm">
                                    <Group justify="space-between" wrap="nowrap" align="flex-start" mb={8} gap="xs">
                                        <Group gap="sm" wrap="nowrap" align="flex-start" style={{ minWidth: 0, flex: 1 }}>
                                            <Avatar
                                                src={imgSrc}
                                                size={48}
                                                radius="md"
                                                bg="gray.0"
                                                style={{ flexShrink: 0 }}
                                                imageProps={{ style: { objectFit: 'contain' }, loading: 'lazy' }}
                                            />
                                            <Box style={{ minWidth: 0 }}>
                                                <Text fw={800} size="sm" lineClamp={2} lh={1.25}>{p.nombre}</Text>
                                                <Text size="xs" c="dimmed" mt={2}>
                                                    {[p.codigo, p.marca, p.presentacion].filter(Boolean).join(' · ')}
                                                </Text>
                                            </Box>
                                        </Group>
                                        <Stack gap={4} align="flex-end" style={{ flexShrink: 0 }}>
                                            {p.stock <= 0 ? (
                                                <Badge color="red" variant="light">Agotado (0)</Badge>
                                            ) : (
                                                <Badge color={p.bajo ? 'orange' : 'teal'} variant="light">
                                                    Stock: {nfInt.format(p.stock)}{p.bajo ? ' · bajo' : ''}
                                                </Badge>
                                            )}
                                        </Stack>
                                    </Group>

                                    <SimpleGrid cols={{ base: 2, sm: esVendedor ? 3 : 4 }} spacing={6}>
                                        <Metrica
                                            etiqueta="Cantidad de ventas"
                                            valor={`${nfInt.format(p.ventasCount)} ${p.ventasCount === 1 ? 'venta' : 'ventas'}`}
                                            detalle={`Última: ${fmtFechaCorta(p.ultimaVenta)}`}
                                            color="indigo.8"
                                            bg="var(--mantine-color-indigo-0)"
                                        />
                                        <Metrica
                                            etiqueta="Unidades vendidas"
                                            valor={`${nfInt.format(p.netoVendido)} uds.`}
                                            detalle={p.unidadesDevueltas > 0 ? `${nfInt.format(p.unidadesVendidas)} vend. − ${nfInt.format(p.unidadesDevueltas)} dev.` : 'Netas entregadas'}
                                            color="blue.8"
                                            bg="var(--mantine-color-blue-0)"
                                        />
                                        <Metrica
                                            etiqueta="Entradas (compras)"
                                            valor={`${nfInt.format(p.unidadesCompradas)} uds.`}
                                            detalle={`${nfInt.format(p.comprasCount)} ${p.comprasCount === 1 ? 'compra' : 'compras'} · Últ: ${fmtFechaCorta(p.ultimaCompra)}`}
                                            color="teal.8"
                                        />
                                        {!esVendedor && (
                                            <Metrica
                                                etiqueta="Total vendido (USD)"
                                                valor={`$${usd.format(p.totalUsd || 0)}`}
                                                detalle="Acumulado sin IVA"
                                                color="navy.9"
                                            />
                                        )}
                                    </SimpleGrid>

                                    <Group justify="flex-end" mt={8}>
                                        <UnstyledButton
                                            onClick={() => setAbiertoId(abierto ? null : p.id)}
                                            style={{ fontSize: 12, fontWeight: 700, color: 'var(--mantine-color-indigo-7)' }}
                                        >
                                            <Group gap={4} wrap="nowrap">
                                                <span>{abierto ? 'Ocultar historial de movimientos' : 'Ver historial de ventas y compras (Kardex)'}</span>
                                                {abierto ? <IconChevronUp size={15} /> : <IconChevronDown size={15} />}
                                            </Group>
                                        </UnstyledButton>
                                    </Group>

                                    <Collapse in={abierto}>
                                        {abierto && (
                                            <HistorialMovimientos
                                                productoId={p.id}
                                                esVendedor={esVendedor}
                                                telefono={telefono}
                                                onNavegar={irADocumento}
                                            />
                                        )}
                                    </Collapse>
                                </Card>
                            );
                        })}
                        {data.hayMas && (
                            <Text size="xs" c="dimmed" ta="center">
                                Se muestran los primeros 30 resultados: escribe más del nombre o código para afinar.
                            </Text>
                        )}
                    </Stack>
                )}
            </Stack>
        </Modal>
    );
}
