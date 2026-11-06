'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
    ActionIcon, Alert, Badge, Box, Button, Card, Center, Group, Pagination, Paper, SegmentedControl, SimpleGrid, Skeleton, Stack,
    Table, Text, TextInput, ThemeIcon, Title, Tooltip,
} from '@mantine/core';
import { useDebouncedValue, useMediaQuery } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { IconAlertTriangle, IconBuildingWarehouse, IconCash, IconEdit, IconEye, IconPackageOff, IconPlus, IconSearch } from '@tabler/icons-react';
import { formatearFecha } from '@/app/constants/hora';
import { normRif } from '@/app/constants/rif';
import { esSinRif } from '@/app/constants/identificacion';
import ProveedorDrawer from './_components/ProveedorDrawer';

const dos = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
                    {cargando ? <Skeleton h={28} w={90} mt={4} /> : <Text fz={24} fw={800} lh={1.2} c="navy.9">{valor}</Text>}
                    {detalle && !cargando && <Text size="xs" c="dimmed">{detalle}</Text>}
                </Box>
            </Group>
        </Card>
    );
}

// Lo que se le debe, en su moneda (dólares y bolívares por separado: no se convierten)
const textoDeuda = (p) => [p.deudaUsd > 0.005 ? `$${dos.format(p.deudaUsd)}` : null, p.deudaBs > 0.005 ? `Bs ${dos.format(p.deudaBs)}` : null].filter(Boolean).join(' · ');
const debe = (p) => p.deudaUsd > 0.005 || p.deudaBs > 0.005;

// Proveedores: como la pantalla de clientes. Registrar, ver sus compras y lo que se les debe, cambiar su retención de IVA o desactivarlos.
export default function ProveedoresPage() {
    const isMobile = useMediaQuery('(max-width: 48em)');
    const { data, isLoading, error } = useQuery({ queryKey: ['proveedores', 'resumen'], queryFn: () => pedirJson('/api/proveedores/resumen') });

    const [busqueda, setBusqueda] = useState('');
    const [q] = useDebouncedValue(busqueda.trim().toLowerCase(), 250);
    const [filtro, setFiltro] = useState('activos');
    const [pagina, setPagina] = useState(1);
    const [drawer, setDrawer] = useState(null); // { proveedor|null }

    useEffect(() => { setPagina(1); }, [q, filtro]);

    const proveedores = data?.proveedores || [];
    const permisos = data?.permisos || { editar: false, verDeuda: false };
    const sinRif = useMemo(() => proveedores.filter((p) => p.activo !== false && esSinRif(p.identificacion)), [proveedores]);
    const kpi = useMemo(() => {
        const activos = proveedores.filter((p) => p.activo !== false);
        return {
            activos: activos.length,
            inactivos: proveedores.length - activos.length,
            conDeuda: proveedores.filter(debe).length,
            usd: proveedores.reduce((a, p) => a + (p.deudaUsd || 0), 0),
            bs: proveedores.reduce((a, p) => a + (p.deudaBs || 0), 0),
            sinCompras: activos.filter((p) => !p.nCompras).length,
        };
    }, [proveedores]);

    const filtrados = useMemo(() => proveedores.filter((p) => {
        if (filtro === 'activos' && p.activo === false) return false;
        if (filtro === 'inactivos' && p.activo !== false) return false;
        if (filtro === 'deuda' && !debe(p)) return false;
        if (!q) return true;
        const rifQ = normRif(q);
        return [p.nombre, p.telefono, p.email].some((x) => String(x || '').toLowerCase().includes(q)) || (rifQ && normRif(p.identificacion).includes(rifQ));
    }), [proveedores, q, filtro]);

    const paginas = Math.max(1, Math.ceil(filtrados.length / TAMANO));
    const visibles = filtrados.slice((pagina - 1) * TAMANO, pagina * TAMANO);
    const deudaTotal = [kpi.usd > 0.005 ? `$${dos.format(kpi.usd)}` : null, kpi.bs > 0.005 ? `Bs ${dos.format(kpi.bs)}` : null].filter(Boolean).join(' · ') || '$0,00';

    return (
        <Box maw={1400} mx="auto" px="md" py="md">
            <Stack gap="lg">
                <Group justify="space-between" align="flex-end" wrap="wrap">
                    <Box>
                        <Title order={2} c="white">Proveedores</Title>
                        <Text size="sm" c="gray.4">Registra proveedores, revisa sus compras y lo que se les debe, y su porcentaje de retención de IVA.</Text>
                    </Box>
                    <Button size="md" color="accent.6" leftSection={<IconPlus size={18} />} onClick={() => setDrawer({ proveedor: null })}>Registrar proveedor</Button>
                </Group>

                {error && <Alert color="red" icon={<IconAlertTriangle size={18} />}>{error.message}</Alert>}

                {sinRif.length > 0 && (
                    <Alert color="yellow" variant="light" radius="md" icon={<IconAlertTriangle size={20} />}
                        title={`${sinRif.length} proveedor${sinRif.length === 1 ? '' : 'es'} sin RIF: hay que conseguirlo`}>
                        <Text size="sm" mb={6}>
                            Sus facturas de compra ya están registradas, pero el libro de compras no traía su RIF y quedaron con uno provisional.
                            Consíguelo con cada proveedor y complétalo en su ficha; mientras tanto no se les puede emitir comprobante de retención de IVA.
                        </Text>
                        <Group gap="xs">
                            {sinRif.map((p) => (
                                <Button key={p.id} size="compact-xs" variant="white" color="yellow.9" onClick={() => setDrawer({ proveedor: p })}>{p.nombre}</Button>
                            ))}
                        </Group>
                    </Alert>
                )}

                <SimpleGrid cols={{ base: 1, xs: 2, lg: permisos.verDeuda ? 3 : 2 }} spacing="md">
                    <Indicador icono={IconBuildingWarehouse} color="blue" titulo="Proveedores activos" cargando={isLoading} valor={kpi.activos} detalle={kpi.inactivos ? `${kpi.inactivos} inactivo(s)` : null} />
                    {permisos.verDeuda && <Indicador icono={IconCash} color="red" titulo="Por pagar" cargando={isLoading} valor={deudaTotal} detalle={`${kpi.conDeuda} proveedor(es) con saldo`} />}
                    <Indicador icono={IconPackageOff} color="gray" titulo="Sin compras" cargando={isLoading} valor={kpi.sinCompras} detalle="Activos sin compras registradas" />
                </SimpleGrid>

                <Paper withBorder radius="lg" p="md" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
                    <Group gap="sm" mb="md" wrap="wrap" align="flex-end">
                        <SegmentedControl color="navy.9" value={filtro} onChange={setFiltro} fullWidth={isMobile}
                            data={[{ value: 'activos', label: 'Activos' }, ...(permisos.verDeuda ? [{ value: 'deuda', label: 'Con saldo' }] : []), { value: 'inactivos', label: 'Inactivos' }, { value: 'todos', label: 'Todos' }]} />
                        <TextInput flex="1 1 240px" placeholder="Buscar por nombre, RIF, teléfono o correo…" leftSection={<IconSearch size={16} />} value={busqueda} onChange={(e) => setBusqueda(e.currentTarget.value)} />
                    </Group>

                    {isLoading ? <Stack gap="xs">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} h={48} />)}</Stack>
                        : !visibles.length ? <Center py={50}><Text c="dimmed">No hay proveedores con esos filtros.</Text></Center> : (
                            <Table.ScrollContainer minWidth={permisos.verDeuda ? 980 : 820}>
                                <Table striped highlightOnHover verticalSpacing="sm">
                                    <Table.Thead bg="gray.0">
                                        <Table.Tr>
                                            <Table.Th>Proveedor</Table.Th>
                                            <Table.Th>Teléfono</Table.Th>
                                            <Table.Th ta="center">Retención IVA</Table.Th>
                                            <Table.Th ta="center">Especial</Table.Th>
                                            <Table.Th ta="center">Compras</Table.Th>
                                            <Table.Th>Última compra</Table.Th>
                                            {permisos.verDeuda && <Table.Th ta="right">Por pagar</Table.Th>}
                                            <Table.Th w={50} />
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {visibles.map((p) => (
                                            <Table.Tr key={p.id} style={{ cursor: 'pointer', opacity: p.activo === false ? 0.6 : 1 }} onClick={() => setDrawer({ proveedor: p })}>
                                                <Table.Td>
                                                    <Text fw={700} size="sm">{p.nombre}{p.activo === false && <Badge ml={6} size="xs" color="gray" variant="light">Inactivo</Badge>}</Text>
                                                    <Text size="xs" c="dimmed">{p.identificacion}</Text>
                                                </Table.Td>
                                                <Table.Td><Text size="sm">{p.telefono || '—'}</Text></Table.Td>
                                                <Table.Td ta="center">
                                                    {[75, 100].includes(Number(p.retencionIvaPorDefecto))
                                                        ? <Badge variant="light" color={Number(p.retencionIvaPorDefecto) === 100 ? 'orange' : 'blue'}>{p.retencionIvaPorDefecto} %</Badge>
                                                        : <Badge variant="light" color="red">Sin elegir</Badge>}
                                                </Table.Td>
                                                <Table.Td ta="center"><Text size="sm">{p.esContribuyenteEspecial ? 'Sí' : 'No'}</Text></Table.Td>
                                                <Table.Td ta="center"><Text size="sm" fw={600} c={p.nCompras ? undefined : 'dimmed'}>{p.nCompras || '—'}</Text></Table.Td>
                                                <Table.Td><Text size="sm">{p.ultimaCompra ? formatearFecha(p.ultimaCompra) : '—'}</Text></Table.Td>
                                                {permisos.verDeuda && <Table.Td ta="right"><Text size="sm" fw={debe(p) ? 700 : 400} c={debe(p) ? 'red.7' : 'dimmed'}>{textoDeuda(p) || '—'}</Text></Table.Td>}
                                                <Table.Td>
                                                    <Tooltip label={permisos.editar ? 'Cambiar' : 'Ver'}>
                                                        <ActionIcon variant="light" color="blue" aria-label={permisos.editar ? 'Cambiar' : 'Ver'}>{permisos.editar ? <IconEdit size={16} /> : <IconEye size={16} />}</ActionIcon>
                                                    </Tooltip>
                                                </Table.Td>
                                            </Table.Tr>
                                        ))}
                                    </Table.Tbody>
                                </Table>
                            </Table.ScrollContainer>
                        )}

                    <Group justify="space-between" mt="md" wrap="wrap">
                        <Text size="sm" c="dimmed">{filtrados.length} {filtrados.length === 1 ? 'proveedor' : 'proveedores'}</Text>
                        {paginas > 1 && <Pagination total={paginas} value={pagina} onChange={setPagina} color="navy.9" size="sm" />}
                    </Group>
                </Paper>
            </Stack>

            <ProveedorDrawer opened={Boolean(drawer)} proveedor={drawer?.proveedor || null} puedeEditar={permisos.editar} onClose={() => setDrawer(null)} />
        </Box>
    );
}
