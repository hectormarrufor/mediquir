'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
    ActionIcon, Alert, Avatar, Badge, Box, Button, Card, Center, Group, Menu, Pagination, Paper, SegmentedControl, SimpleGrid, Skeleton, Stack,
    Table, Text, TextInput, ThemeIcon, Title,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
    IconAlertTriangle, IconBrandWhatsapp, IconCash, IconDotsVertical, IconEdit, IconEye, IconKey, IconPlus, IconSearch, IconUserCheck, IconUserOff, IconUsers,
} from '@tabler/icons-react';
import { useAuth } from '@/hooks/useAuth';
import ClienteDrawer from './_components/ClienteDrawer';
import AccesoModal, { telefonoWhatsapp } from './_components/AccesoModal';

const usd = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUsd = (v) => `$${usd.format(Number(v) || 0)}`;
const fmtFecha = (v) => (v ? new Date(v).toLocaleDateString('es-VE', { timeZone: 'America/Caracas' }) : '—');
const TAMANO = 12;

async function pedirJson(url) {
    const res = await fetch(url);
    const cuerpo = await res.json().catch(() => null);
    if (!res.ok) throw new Error(cuerpo?.error || 'No se pudo cargar');
    return cuerpo;
}

function Indicador({ icono: Icono, color, titulo, valor, detalle, cargando }) {
    return (
        <Card withBorder radius="lg" p="md" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
            <Group wrap="nowrap" align="flex-start">
                <ThemeIcon size={44} radius="md" variant="light" color={color}><Icono size={24} /></ThemeIcon>
                <Box style={{ minWidth: 0 }}>
                    <Text size="xs" c="dimmed" fw={700} tt="uppercase">{titulo}</Text>
                    {cargando ? <Skeleton h={28} w={90} mt={4} /> : <Text fz={26} fw={800} lh={1.2} c="navy.9">{valor}</Text>}
                    {detalle && !cargando && <Text size="xs" c="dimmed">{detalle}</Text>}
                </Box>
            </Group>
        </Card>
    );
}

export default function ClientesDashboard() {
    const router = useRouter();
    const { esVendedor } = useAuth();
    const { data, isLoading, error } = useQuery({ queryKey: ['clientes', 'resumen'], queryFn: () => pedirJson('/api/clientes/resumen') });

    const [busqueda, setBusqueda] = useState('');
    const [q] = useDebouncedValue(busqueda.trim().toLowerCase(), 250);
    const [filtro, setFiltro] = useState('todos');
    const [pagina, setPagina] = useState(1);
    const [drawer, setDrawer] = useState(false);
    const [acceso, setAcceso] = useState(null); // { cliente, credenciales }

    useEffect(() => { setPagina(1); }, [q, filtro]);

    const clientes = data?.clientes || [];
    const kpi = useMemo(() => {
        const mes = new Date(); mes.setDate(1); mes.setHours(0, 0, 0, 0);
        return {
            total: clientes.length,
            conAcceso: clientes.filter((c) => c.usuario).length,
            conSaldo: clientes.filter((c) => c.saldo > 0).length,
            deuda: clientes.reduce((a, c) => a + (c.saldo || 0), 0),
            nuevos: clientes.filter((c) => new Date(c.createdAt) >= mes).length,
        };
    }, [clientes]);

    const filtrados = useMemo(() => clientes.filter((c) => {
        if (filtro === 'acceso' && !c.usuario) return false;
        if (filtro === 'sin-acceso' && c.usuario) return false;
        if (filtro === 'saldo' && !(c.saldo > 0)) return false;
        if (!q) return true;
        return [c.nombre, c.identificacion, c.telefono, c.email, c.usuario].some((x) => String(x || '').toLowerCase().includes(q));
    }), [clientes, q, filtro]);

    const paginas = Math.max(1, Math.ceil(filtrados.length / TAMANO));
    const visibles = filtrados.slice((pagina - 1) * TAMANO, pagina * TAMANO);

    return (
        <Box maw={1500} mx="auto" px="md" py="md">
            <Stack gap="lg">
                <Group justify="space-between" align="flex-end" wrap="wrap">
                    <Box>
                        <Title order={2} c="white">Clientes</Title>
                        <Text size="sm" c="gray.4">Registra clientes, dales acceso al portal B2B y sigue sus compras y saldos.</Text>
                    </Box>
                    <Button size="md" color="accent.6" leftSection={<IconPlus size={18} />} onClick={() => setDrawer(true)}>Registrar cliente</Button>
                </Group>

                {error && <Alert color="red" icon={<IconAlertTriangle size={18} />}>{error.message}</Alert>}

                <SimpleGrid cols={{ base: 1, xs: 2, lg: esVendedor ? 3 : 4 }} spacing="md">
                    <Indicador icono={IconUsers} color="blue" titulo="Clientes" cargando={isLoading} valor={kpi.total} detalle={`${kpi.nuevos} nuevo(s) este mes`} />
                    <Indicador icono={IconUserCheck} color="teal" titulo="Con acceso B2B" cargando={isLoading} valor={kpi.conAcceso} detalle={`${kpi.total - kpi.conAcceso} sin acceso`} />
                    {!esVendedor && <Indicador icono={IconCash} color="orange" titulo="Por cobrar" cargando={isLoading} valor={fmtUsd(kpi.deuda)} detalle={`${kpi.conSaldo} cliente(s) con saldo`} />}
                    {!esVendedor && <Indicador icono={IconUserOff} color="gray" titulo="Sin compras" cargando={isLoading} valor={clientes.filter((c) => !c.pedidos).length} detalle="Aún no han comprado" />}
                    {esVendedor && <Indicador icono={IconUserOff} color="gray" titulo="Sin acceso B2B" cargando={isLoading} valor={kpi.total - kpi.conAcceso} />}
                </SimpleGrid>

                <Paper withBorder radius="lg" p="md" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
                    <Group gap="sm" mb="md" wrap="wrap" align="flex-end">
                        <SegmentedControl color="navy.9" value={filtro} onChange={setFiltro}
                            data={[{ value: 'todos', label: 'Todos' }, { value: 'acceso', label: 'Con acceso B2B' }, { value: 'sin-acceso', label: 'Sin acceso' }, ...(esVendedor ? [] : [{ value: 'saldo', label: 'Con saldo' }])]} />
                        <TextInput flex="1 1 240px" placeholder="Buscar por nombre, RIF, teléfono, correo o usuario…" leftSection={<IconSearch size={16} />} value={busqueda} onChange={(e) => setBusqueda(e.currentTarget.value)} />
                    </Group>

                    {isLoading ? <Stack gap="xs">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} h={52} />)}</Stack>
                        : !visibles.length ? <Center py={50}><Text c="dimmed">No hay clientes con esos filtros.</Text></Center> : (
                            <Table.ScrollContainer minWidth={esVendedor ? 640 : 900}>
                                <Table verticalSpacing="sm" highlightOnHover>
                                    <Table.Thead>
                                        <Table.Tr>
                                            <Table.Th>Cliente</Table.Th><Table.Th>Contacto</Table.Th>
                                            {!esVendedor && <><Table.Th ta="right">Compras</Table.Th><Table.Th ta="right">Saldo</Table.Th><Table.Th>Último pedido</Table.Th></>}
                                            <Table.Th>Portal B2B</Table.Th><Table.Th />
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {visibles.map((c) => (
                                            <Table.Tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/superuser/clientes/${c.id}`)}>
                                                <Table.Td>
                                                    <Group gap="sm" wrap="nowrap">
                                                        <Avatar radius="xl" color="brand" variant="light">{(c.nombre || c.identificacion || '?').charAt(0).toUpperCase()}</Avatar>
                                                        <Box style={{ minWidth: 0 }}>
                                                            <Text fw={700} size="sm" lineClamp={1} maw={230}>{c.nombre || 'Sin nombre'}</Text>
                                                            <Group gap={6}><Text size="xs" c="dimmed">{c.identificacion}</Text>{c.esContribuyenteEspecial && <Badge size="xs" variant="light" color="grape">Especial</Badge>}</Group>
                                                        </Box>
                                                    </Group>
                                                </Table.Td>
                                                <Table.Td><Text size="sm">{c.telefono || '—'}</Text><Text size="xs" c="dimmed" lineClamp={1} maw={190}>{c.email || ''}</Text></Table.Td>
                                                {!esVendedor && <>
                                                    <Table.Td ta="right"><Text size="sm" fw={600}>{fmtUsd(c.compras)}</Text><Text size="xs" c="dimmed">{c.pedidos} pedido(s)</Text></Table.Td>
                                                    <Table.Td ta="right">{c.saldo > 0 ? <Badge color="orange" variant="light" size="lg">{fmtUsd(c.saldo)}</Badge> : <Text size="sm" c="dimmed">—</Text>}</Table.Td>
                                                    <Table.Td><Text size="sm">{fmtFecha(c.ultimaCompra)}</Text></Table.Td>
                                                </>}
                                                <Table.Td>{c.usuario ? <Badge color="teal" variant="light" tt="none">{c.usuario}</Badge> : <Badge color="gray" variant="outline">Sin acceso</Badge>}</Table.Td>
                                                <Table.Td onClick={(e) => e.stopPropagation()}>
                                                    <Menu position="bottom-end" withinPortal shadow="md">
                                                        <Menu.Target><ActionIcon variant="subtle" color="gray"><IconDotsVertical size={18} /></ActionIcon></Menu.Target>
                                                        <Menu.Dropdown>
                                                            <Menu.Item leftSection={<IconEye size={16} />} onClick={() => router.push(`/superuser/clientes/${c.id}`)}>Ver ficha</Menu.Item>
                                                            {!esVendedor && <Menu.Item leftSection={<IconEdit size={16} />} onClick={() => router.push(`/superuser/clientes/${c.id}/editar`)}>Editar</Menu.Item>}
                                                            {!esVendedor && <Menu.Item leftSection={<IconKey size={16} />} onClick={() => setAcceso({ cliente: c })}>{c.usuario ? 'Restablecer contraseña' : 'Crear acceso B2B'}</Menu.Item>}
                                                            {telefonoWhatsapp(c.telefono) && <Menu.Item component="a" href={`https://wa.me/${telefonoWhatsapp(c.telefono)}`} target="_blank" leftSection={<IconBrandWhatsapp size={16} />}>WhatsApp</Menu.Item>}
                                                        </Menu.Dropdown>
                                                    </Menu>
                                                </Table.Td>
                                            </Table.Tr>
                                        ))}
                                    </Table.Tbody>
                                </Table>
                            </Table.ScrollContainer>
                        )}

                    <Group justify="space-between" mt="md" wrap="wrap">
                        <Text size="sm" c="dimmed">{filtrados.length} {filtrados.length === 1 ? 'cliente' : 'clientes'}</Text>
                        {paginas > 1 && <Pagination total={paginas} value={pagina} onChange={setPagina} color="navy.9" size="sm" />}
                    </Group>
                </Paper>
            </Stack>

            <ClienteDrawer opened={drawer} onClose={() => setDrawer(false)} onCreado={(cliente, credenciales) => { if (credenciales) setAcceso({ cliente, credenciales }); }} />
            <AccesoModal opened={Boolean(acceso)} cliente={acceso?.cliente} credencialesIniciales={acceso?.credenciales || null} onClose={() => setAcceso(null)} />
        </Box>
    );
}
