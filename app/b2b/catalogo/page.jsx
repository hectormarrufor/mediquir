'use client';

import React, { useEffect, useState } from 'react';
import { Alert, Badge, Box, Button, Card, Center, Group, Image, NumberInput, Pagination, SegmentedControl, Select, SimpleGrid, Skeleton, Stack, Text, TextInput, Title } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { IconAlertTriangle, IconCircleCheck, IconSearch, IconShoppingCartPlus } from '@tabler/icons-react';
import { useTasaBcv } from '@/hooks/useTasaBcv';
import { aBolivares, montoRenglon } from '@/app/constants/facturacion';
import { getMainImage, PLACEHOLDER_IMG } from '@/app/components/landing/productUtils';
import { presentacionesDe, useB2BCart } from '../_lib/B2BCartContext';
import { fmtBs, fmtPrecio, fmtUsd, pedirJson } from '../_lib/formato';

function TarjetaProducto({ producto, tasa }) {
    const { agregar, cantidadDe } = useB2BCart();
    const opciones = presentacionesDe(producto);
    const [clave, setClave] = useState('UNIDAD');
    const [cantidad, setCantidad] = useState(1);
    const pres = opciones.find((o) => o.clave === clave) || opciones[0];

    // Nunca se muestran cantidades en existencia ni se bloquea el pedido: verde = disponible, amarillo = pocas unidades o por confirmar.
    // Si se pide más de lo que hay, el pedido pasa por revisión de existencias (administración confirma si lo consigue).
    const unidadesPedidas = cantidadDe(producto.id) + (Math.floor(Number(cantidad)) || 1) * pres.unidades;
    const pocas = producto.disponible <= 10;
    const excede = unidadesPedidas > producto.disponible;
    const baseUnidades = opciones[0].plural; // unidades, pares, paquetes x2...
    const precioPresentacion = pres.unidades > 1 ? montoRenglon(producto.precio, pres.unidades) : null; // lo que cuesta UNA caja / bulto

    const elegir = (nueva) => { setClave(nueva); setCantidad(1); };
    const anadir = () => {
        const n = Math.floor(Number(cantidad) || 0);
        if (n < 1) return;
        agregar(producto, n, pres.clave);
        notifications.show({ color: 'teal', message: `${n} × ${pres.etiqueta} de ${producto.nombre} añadido a tu pedido`, autoClose: 2500 });
        setCantidad(1);
    };

    return (
        <Card withBorder radius="lg" p="sm" style={{ display: 'flex', flexDirection: 'column', boxShadow: 'var(--mm-shadow-card)' }}>
            <Card.Section bg="gray.0" p="xs">
                <Image src={getMainImage(producto)} h={140} fit="contain" fallbackSrc={PLACEHOLDER_IMG} alt={producto.nombre} />
            </Card.Section>

            <Stack gap={4} mt="sm" style={{ flex: 1 }}>
                <Group gap={6} justify="space-between" wrap="nowrap">
                    <Text size="xs" c="dimmed" truncate>{producto.marca?.nombre || producto.categoria?.nombre || ' '}</Text>
                    {producto.codigo && <Text size="xs" c="dimmed" ff="monospace">{producto.codigo}</Text>}
                </Group>
                <Text fw={700} size="sm" lh={1.3} lineClamp={2} c="navy.9" mih={38}>{producto.nombre}</Text>

                {opciones.length > 1
                    ? <SegmentedControl fullWidth size="xs" color="navy.9" value={pres.clave} onChange={elegir} data={opciones.map((o) => ({ value: o.clave, label: o.etiqueta }))} />
                    : <Text size="xs" c="dimmed">Se vende por {opciones[0].singular}</Text>}

                <Box mt={4}>
                    <Text fz={20} fw={800} c="brand.6" lh={1.1}>{precioPresentacion !== null ? fmtUsd(precioPresentacion) : fmtPrecio(producto.precio)}</Text>
                    {tasa && <Text size="xs" c="dimmed" fw={600}>{fmtBs(aBolivares(precioPresentacion !== null ? precioPresentacion : producto.precio, tasa))}</Text>}
                    <Text size="xs" c="dimmed">
                        {pres.unidades > 1 ? `por ${pres.singular} · ${fmtPrecio(producto.precio)} c/u` : `por ${pres.singular}`} · {producto.porcentajeIva > 0 ? `+ IVA ${producto.porcentajeIva}%` : 'Exento de IVA'}
                    </Text>
                </Box>

                <Badge color={producto.disponible > 10 ? 'teal' : 'orange'} variant="light" mt={4} w="fit-content" leftSection={producto.disponible > 10 ? <IconCircleCheck size={12} /> : <IconAlertTriangle size={12} />}>
                    {producto.disponible > 10 ? 'Disponible' : producto.disponible > 0 ? 'Pocas unidades' : 'Por confirmar'}
                </Badge>
            </Stack>

            <Stack gap={4} mt="sm">
                <Group gap={6} wrap="nowrap">
                    <NumberInput value={cantidad} onChange={setCantidad} min={1} max={9999} allowDecimal={false} allowNegative={false} clampBehavior="strict"
                        w={84} size="sm" aria-label={`Cantidad de ${pres.plural}`} />
                    <Button flex={1} size="sm" color="navy.9" tt="none" leftSection={<IconShoppingCartPlus size={16} />} onClick={anadir}>Agregar</Button>
                </Group>
                {pres.unidades > 1 && <Text size="xs" c="dimmed">{Number(cantidad) || 1} {(Number(cantidad) || 1) === 1 ? pres.singular : pres.plural} = <b>{(Number(cantidad) || 1) * pres.unidades} {baseUnidades}</b></Text>}
                {excede && <Text size="xs" c="yellow.8" fw={600}>Puede que no tengamos toda esta cantidad: tu pedido pasará por una breve revisión de existencias.</Text>}
            </Stack>
        </Card>
    );
}

export default function B2BCatalogo() {
    const { tasa } = useTasaBcv();
    const [busqueda, setBusqueda] = useState('');
    const [q] = useDebouncedValue(busqueda.trim(), 350);
    const [categoriaId, setCategoriaId] = useState(null);
    const [marcaId, setMarcaId] = useState(null);
    const [pagina, setPagina] = useState(1);

    useEffect(() => { setPagina(1); }, [q, categoriaId, marcaId]);

    const params = new URLSearchParams({ page: String(pagina) });
    if (q) params.set('q', q);
    if (categoriaId) params.set('categoriaId', categoriaId);
    if (marcaId) params.set('marcaId', marcaId);

    const { data, isLoading, isFetching, error } = useQuery({
        queryKey: ['b2b', 'catalogo', q, categoriaId, marcaId, pagina],
        queryFn: () => pedirJson(`/api/b2b/catalogo?${params}`),
        placeholderData: keepPreviousData,
    });

    // Los filtros vienen solo con la página 1; se guardan para no perderlos al paginar
    const [filtros, setFiltros] = useState({ categorias: [], marcas: [] });
    useEffect(() => { if (data?.filtros) setFiltros(data.filtros); }, [data?.filtros]);

    return (
        <Stack gap="md">
            <Group justify="space-between" align="flex-end">
                <Box>
                    <Title order={2} c="navy.9">Catálogo</Title>
                    <Text size="sm" c="dimmed">Precios al mayor en USD{tasa ? ` · tasa BCV ${tasa} Bs/$` : ''}. Los montos se calculan de nuevo al confirmar tu pedido.</Text>
                </Box>
                {data && <Text size="sm" c="dimmed">{data.total} productos</Text>}
            </Group>

            <Group gap="sm" align="flex-end" wrap="wrap">
                <TextInput flex="1 1 260px" placeholder="Buscar por nombre o código…" leftSection={<IconSearch size={16} />} value={busqueda} onChange={(e) => setBusqueda(e.currentTarget.value)} />
                <Select placeholder="Categoría" clearable searchable data={filtros.categorias.map((c) => ({ value: String(c.id), label: c.nombre }))} value={categoriaId} onChange={setCategoriaId} w={{ base: '100%', sm: 200 }} />
                <Select placeholder="Marca" clearable searchable data={filtros.marcas.map((m) => ({ value: String(m.id), label: m.nombre }))} value={marcaId} onChange={setMarcaId} w={{ base: '100%', sm: 200 }} />
            </Group>

            {error && <Alert color="red" icon={<IconAlertTriangle size={18} />}>{error.message}</Alert>}

            {isLoading ? (
                <SimpleGrid cols={{ base: 1, xs: 2, md: 3, lg: 4 }}>{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} h={330} radius="lg" />)}</SimpleGrid>
            ) : !data?.productos?.length ? (
                <Center py={60}><Text c="dimmed">No encontramos productos con esos filtros.</Text></Center>
            ) : (
                <Box style={{ opacity: isFetching ? 0.6 : 1, transition: 'opacity .15s' }}>
                    <SimpleGrid cols={{ base: 1, xs: 2, md: 3, lg: 4 }} spacing="md">
                        {data.productos.map((p) => <TarjetaProducto key={p.id} producto={p} tasa={tasa} />)}
                    </SimpleGrid>
                </Box>
            )}

            {data?.paginas > 1 && (
                <Center mt="sm"><Pagination total={data.paginas} value={pagina} onChange={(p) => { setPagina(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }} color="navy.9" /></Center>
            )}
        </Stack>
    );
}
