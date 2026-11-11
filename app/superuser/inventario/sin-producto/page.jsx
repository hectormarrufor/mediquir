'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    Alert, Autocomplete, Badge, Box, Button, Card, Group, Loader, Modal, Paper, Radio, SegmentedControl, Select, Stack, Table, Text, TextInput, Title,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft, IconLink, IconSearch } from '@tabler/icons-react';
import { PANTALLA_COMPLETA_MOVIL, useEsTelefono } from '@/app/components/ui/modalMovil';
import { buscarProductos, normalizar } from '@/app/helpers/busquedaProductos';

const nf = (v, d = 2) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: d, maximumFractionDigits: d }).format(Number(v) || 0);
const fecha = (f) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : '');
const etiqueta = (p) => `${p.codigo || ''} · ${p.nombre}${p.marca?.nombre ? ` · ${p.marca.nombre}` : ''}`;
const raiz = (codigo) => String(codigo || '').replace(/-\d+$/, '');

async function pedir(url, opciones) {
    const res = await fetch(url, opciones);
    const cuerpo = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(cuerpo.error || 'No se pudo completar');
    return cuerpo;
}

// Enlazar un nombre escrito a mano: a un producto que ya existe o a la variante nueva de otra marca
function EnlazarModal({ fila, productos, marcas, onClose, onListo }) {
    const sugeridos = useMemo(() => buscarProductos(productos, fila.nombre).slice(0, 6), [productos, fila.nombre]);
    const [elegido, setElegido] = useState(sugeridos[0] ? String(sugeridos[0].id) : null);
    const [modo, setModo] = useState('existente');
    const [marca, setMarca] = useState('');
    const [enviando, setEnviando] = useState(false);
    const opciones = useMemo(() => productos.map((p) => ({ value: String(p.id), label: etiqueta(p) })), [productos]);
    const filtro = ({ search, limit }) => (search.trim()
        ? buscarProductos(productos, search).slice(0, limit).map((p) => opciones.find((o) => o.value === String(p.id))).filter(Boolean)
        : opciones.slice(0, limit));
    const producto = productos.find((p) => String(p.id) === elegido);
    const familia = producto ? productos.filter((p) => raiz(p.codigo) === raiz(producto.codigo)) : [];
    const marcaRepetida = modo === 'variante' && familia.find((p) => (p.marca?.nombre || '').toUpperCase() === marca.trim().toUpperCase());

    const enlazar = async () => {
        setEnviando(true);
        try {
            const cuerpo = modo === 'variante' ? { nombre: fila.nombre, crear: { baseId: Number(elegido), marca } } : { nombre: fila.nombre, productoId: Number(elegido) };
            const r = await pedir('/api/inventario/ventas-sin-producto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
            notifications.show({ color: 'green', message: `${r.renglones} renglones de «${fila.nombre}» ahora cuentan para ${r.producto.codigo} ${r.producto.nombre}${r.creado ? ' (variante nueva)' : ''}.` });
            onListo(r);
        } catch (e) {
            notifications.show({ color: 'red', title: 'No se enlazó', message: e.message });
        } finally { setEnviando(false); }
    };

    return (
        <Modal {...PANTALLA_COMPLETA_MOVIL} size="lg" opened onClose={onClose} centered title={<Text fw={800}>Enlazar a un producto</Text>}>
            <Stack gap="sm">
                <Paper withBorder p="sm" radius="md" bg="gray.0">
                    <Text fw={700}>{fila.nombre}</Text>
                    <Text size="xs" c="dimmed">{fila.renglones} renglones · {nf(fila.unidades, 0)} unidades · ${nf(fila.usd)} sin IVA</Text>
                </Paper>
                <Text size="xs" c="dimmed">Todas las ventas con este nombre pasan a contar para el producto. Las facturas se siguen imprimiendo con su texto y el inventario no se mueve.</Text>

                {sugeridos.length > 0 && (
                    <Radio.Group label="Sugerencias" value={elegido} onChange={setElegido}>
                        <Stack gap={6} mt={4}>
                            {sugeridos.map((p) => <Radio key={p.id} value={String(p.id)} label={etiqueta(p)} />)}
                        </Stack>
                    </Radio.Group>
                )}
                <Select label="U otro producto" placeholder="Busca por nombre o código" searchable data={opciones} filter={filtro} limit={30} value={elegido} onChange={setElegido} nothingFoundMessage="Sin coincidencias" />

                <SegmentedControl fullWidth value={modo} onChange={setModo} data={[{ value: 'existente', label: 'Enlazar a ese producto' }, { value: 'variante', label: 'Crear la variante de otra marca' }]} />
                {modo === 'variante' && (
                    <Stack gap={6}>
                        <Autocomplete label="Marca de lo que se vendió" placeholder="TX MEDICAL" data={marcas.map((m) => m.nombre)} value={marca} onChange={setMarca} limit={20} />
                        {producto && marca.trim() && !marcaRepetida && (
                            <Text size="xs" c="dimmed">Se crea «{producto.nombre}» marca <b>{marca.trim().toUpperCase()}</b> con el código <b>{raiz(producto.codigo)}-NN</b> (el siguiente libre), con la ficha, el IVA y los precios del producto elegido, sin stock ni foto.</Text>
                        )}
                        {marcaRepetida && <Alert color="yellow" p="xs">Ya existe {marcaRepetida.codigo} de esa marca: elige ese producto y enlaza directamente.</Alert>}
                    </Stack>
                )}

                <Button leftSection={<IconLink size={16} />} loading={enviando} disabled={!elegido || (modo === 'variante' && (!marca.trim() || Boolean(marcaRepetida)))} onClick={enlazar}>
                    Enlazar {fila.renglones} renglones
                </Button>
            </Stack>
        </Modal>
    );
}

// Renglones de venta escritos a mano (sin producto del catálogo): cada nombre con lo vendido, para enlazarlo a su producto y que cuente
// en el total vendido de ese producto
export default function VentasSinProductoPage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const telefono = useEsTelefono();
    const [vista, setVista] = useState('pendientes');
    const [desde, setDesde] = useState('2026-01-01');
    const [busqueda, setBusqueda] = useState('');
    const [busquedaDiferida] = useDebouncedValue(busqueda, 200);
    const [enlazando, setEnlazando] = useState(null);
    const [limite, setLimite] = useState(150);

    const { data, isLoading, isFetching, error, refetch } = useQuery({
        queryKey: ['ventas-sin-producto', vista, desde],
        placeholderData: keepPreviousData,
        queryFn: () => pedir(`/api/inventario/ventas-sin-producto?vista=${vista}${desde ? `&desde=${desde}` : ''}`),
    });
    const { data: productos = [] } = useQuery({ queryKey: ['productos-sin-producto'], staleTime: 60_000, queryFn: () => pedir('/api/productos').catch(() => []) });
    const filas = useMemo(() => {
        const palabras = normalizar(busquedaDiferida).split(' ').filter(Boolean);
        return (data?.filas || []).filter((f) => !palabras.length || palabras.every((p) => normalizar(`${f.nombre} ${f.producto || ''} ${f.codigo || ''}`).includes(p)));
    }, [data, busquedaDiferida]);
    const total = filas.reduce((a, f) => a + (Number(f.usd) || 0), 0);

    const desenlazar = async (f) => {
        try {
            await pedir(`/api/inventario/ventas-sin-producto?nombre=${encodeURIComponent(f.nombre)}&productoId=${f.productoId}`, { method: 'DELETE' });
            notifications.show({ color: 'green', message: `«${f.nombre}» ya no cuenta para ${f.codigo}` });
            refetch();
        } catch (e) { notifications.show({ color: 'red', title: 'No se deshizo', message: e.message }); }
    };

    const accion = (f) => (vista === 'pendientes'
        ? <Button size="xs" variant="light" leftSection={<IconLink size={14} />} onClick={() => setEnlazando(f)}>Enlazar…</Button>
        : <Button size="xs" variant="subtle" color="red" onClick={() => desenlazar(f)}>Desenlazar</Button>);

    return (
        <Box maw={1300} mx="auto" px={{ base: 'xs', sm: 'md' }} py="md">
            <Stack gap="md">
                <Group gap="sm">
                    <Button variant="subtle" color="gray.3" leftSection={<IconArrowLeft size={16} />} onClick={() => router.push('/superuser/inventario')}>Inventario</Button>
                    <Box>
                        <Title order={telefono ? 3 : 2} c="white">Ventas sin producto</Title>
                        <Text size="sm" c="gray.4">Renglones escritos a mano en facturas y notas. Enlázalos a su producto para que cuenten en lo vendido; la factura se sigue imprimiendo igual.</Text>
                    </Box>
                </Group>

                <Paper withBorder radius="md" p="sm">
                    <Group grow wrap="wrap" align="flex-end">
                        <SegmentedControl value={vista} onChange={(v) => { setVista(v); setLimite(150); }} data={[{ value: 'pendientes', label: 'Por enlazar' }, { value: 'enlazados', label: 'Ya enlazados' }]} />
                        <Select label="Ventas desde" value={desde || 'todo'} allowDeselect={false} onChange={(v) => setDesde(v === 'todo' ? '' : v)}
                            data={[{ value: '2026-01-01', label: 'Enero 2026' }, { value: '2025-01-01', label: 'Enero 2025' }, { value: 'todo', label: 'Desde siempre' }]} />
                        <TextInput label="Buscar" placeholder="Nombre" leftSection={<IconSearch size={16} />} value={busqueda} onChange={(e) => setBusqueda(e.currentTarget.value)} />
                    </Group>
                </Paper>

                {isLoading ? <Group justify="center" py="xl"><Loader /></Group> : error ? <Alert color="red">{error.message}</Alert> : (
                    <>
                        <Text c="white" size="sm"><b>{filas.length}</b> nombres · <b>${nf(total)}</b> sin IVA {vista === 'pendientes' ? 'que todavía no cuentan para ningún producto' : 'ya contados en su producto'} {isFetching && <Loader size="xs" ml={6} />}</Text>
                        {telefono ? (
                            <Stack gap="xs">
                                {filas.slice(0, limite).map((f) => (
                                    <Card key={`${f.nombre}-${f.productoId || ''}`} withBorder radius="md" p="sm">
                                        <Text size="sm" fw={700} lh={1.25}>{f.nombre}</Text>
                                        {vista === 'enlazados' && <Text size="xs" c="blue.8">→ {f.codigo} {f.producto}{f.marca ? ` · ${f.marca}` : ''}</Text>}
                                        <Group justify="space-between" mt={4} wrap="nowrap">
                                            <Text size="xs" c="dimmed">{f.renglones} renglones · {nf(f.unidades, 0)} und. · ${nf(f.usd)}</Text>
                                            {accion(f)}
                                        </Group>
                                    </Card>
                                ))}
                            </Stack>
                        ) : (
                            <Paper withBorder radius="md">
                                <Table striped highlightOnHover stickyHeader fz="sm" verticalSpacing={6}>
                                    <Table.Thead>
                                        <Table.Tr>
                                            <Table.Th>Escrito en la venta</Table.Th>
                                            {vista === 'enlazados' && <Table.Th>Cuenta para</Table.Th>}
                                            <Table.Th ta="right">Renglones</Table.Th><Table.Th ta="right">Unidades</Table.Th><Table.Th ta="right">Vendido $</Table.Th><Table.Th>Última venta</Table.Th><Table.Th />
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {filas.slice(0, limite).map((f) => (
                                            <Table.Tr key={`${f.nombre}-${f.productoId || ''}`}>
                                                <Table.Td>
                                                    <Text size="sm" fw={600}>{f.nombre}</Text>
                                                    {f.documentos && <Text size="xs" c="dimmed">{f.documentos.join(', ')}{f.renglones > f.documentos.length ? '…' : ''}</Text>}
                                                </Table.Td>
                                                {vista === 'enlazados' && <Table.Td><Badge variant="light" size="sm">{f.codigo}</Badge> {f.producto}{f.marca ? <Text span size="xs" c="dimmed"> · {f.marca}</Text> : null}</Table.Td>}
                                                <Table.Td ta="right">{f.renglones}</Table.Td>
                                                <Table.Td ta="right">{nf(f.unidades, 0)}</Table.Td>
                                                <Table.Td ta="right" fw={700}>{nf(f.usd)}</Table.Td>
                                                <Table.Td>{fecha(f.ultima)}</Table.Td>
                                                <Table.Td ta="right">{accion(f)}</Table.Td>
                                            </Table.Tr>
                                        ))}
                                    </Table.Tbody>
                                </Table>
                            </Paper>
                        )}
                        {filas.length > limite && <Button variant="light" onClick={() => setLimite((l) => l + 300)}>Ver más ({filas.length - limite})</Button>}
                        {!filas.length && <Text c="gray.4" ta="center">{vista === 'pendientes' ? 'No quedan renglones sin producto en este periodo.' : 'Todavía no hay nombres enlazados.'}</Text>}
                    </>
                )}
            </Stack>

            {enlazando && (
                <EnlazarModal fila={enlazando} productos={productos} marcas={data?.marcas || []} onClose={() => setEnlazando(null)}
                    onListo={(r) => { setEnlazando(null); refetch(); if (r?.creado) queryClient.invalidateQueries({ queryKey: ['productos-sin-producto'] }); }} />
            )}
        </Box>
    );
}
