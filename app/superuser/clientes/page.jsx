'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert, Box, Button, Card, Center, Group, Pagination, Paper, SegmentedControl, SimpleGrid, Skeleton, Stack,
    Text, TextInput, ThemeIcon, Title,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
    IconAlertTriangle, IconCash, IconPlus, IconSearch, IconUserCheck, IconUserOff, IconUsers,
} from '@tabler/icons-react';
import { useAuth } from '@/hooks/useAuth';
import ClienteDrawer from './_components/ClienteDrawer';
import AccesoModal from './_components/AccesoModal';
import ClientesGrid from './_components/ClientesGrid';
import { COLUMNAS, comparar } from './_components/columnasClientes';

const usd = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUsd = (v) => `$${usd.format(Number(v) || 0)}`;
const TAMANO = 40;

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
    const [orden, setOrden] = useState({ sort: '', dir: '' });
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

    // Clic en un encabezado: ascendente -> descendente -> orden por defecto (los más nuevos primero)
    const onOrden = (clave) => {
        if (orden.sort !== clave) setOrden({ sort: clave, dir: 'asc' });
        else if (orden.dir === 'asc') setOrden({ sort: clave, dir: 'desc' });
        else setOrden({ sort: '', dir: '' });
    };
    const ordenados = useMemo(() => {
        if (!orden.sort) return filtrados;
        const lista = [...filtrados].sort((a, b) => comparar(a, b, orden.sort));
        return orden.dir === 'desc' ? lista.reverse() : lista;
    }, [filtrados, orden]);

    const columnas = useMemo(() => COLUMNAS.filter((c) => !(esVendedor && c.dinero)), [esVendedor]);
    const permisos = data?.permisos || { editar: false, editarCredito: false };

    const paginas = Math.max(1, Math.ceil(ordenados.length / TAMANO));
    const visibles = ordenados.slice((pagina - 1) * TAMANO, pagina * TAMANO);

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

                    {permisos.editar && (
                        <Text size="xs" c="dimmed" mb="xs">
                            Haz clic en una celda y pulsa Enter (o escribe) para editarla: se guarda al instante. Tab / flechas para moverte, Esc cancela, Ctrl+Z deshace.
                            {!permisos.editarCredito && ' Los días y el cupo de crédito solo los cambia un administrador.'}
                        </Text>
                    )}
                    {isLoading ? <Stack gap="xs">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} h={52} />)}</Stack>
                        : !visibles.length ? <Center py={50}><Text c="dimmed">No hay clientes con esos filtros.</Text></Center> : (
                            <ClientesGrid
                                filas={visibles} columnas={columnas} permisos={permisos} orden={orden} onOrden={onOrden}
                                onFicha={(id) => router.push(`/superuser/clientes/${id}`)} onAcceso={(cliente) => setAcceso({ cliente })}
                            />
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
