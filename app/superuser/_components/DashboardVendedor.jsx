'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { Alert, Badge, Box, Button, Card, Collapse, Divider, Group, Modal, Paper, SimpleGrid, Skeleton, Stack, Table, Text, ThemeIcon, Title, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
    IconAlertTriangle, IconArchive, IconBuildingStore, IconCash, IconChevronDown, IconCircleCheck, IconClock,
    IconPackage, IconReceipt2, IconShoppingCart, IconTag, IconTruckDelivery,
} from '@tabler/icons-react';
import { useAuth } from '@/hooks/useAuth';
import { useTasaBcv } from '@/hooks/useTasaBcv';

const PosModal = dynamic(() => import('../../components/admin/PosModal'), { ssr: false });
const CompraModal = dynamic(() => import('../../components/admin/CompraModal'), { ssr: false });

const usd = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUsd = (v) => `$${usd.format(Number(v) || 0)}`;
const fmtFechaHora = (v) => (v ? new Date(v).toLocaleString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'short', timeStyle: 'short' }) : '—');

async function pedirJson(url, opciones) {
    const res = await fetch(url, opciones);
    let cuerpo = null;
    try { cuerpo = await res.json(); } catch { /* sin cuerpo */ }
    if (!res.ok) throw new Error(cuerpo?.error || 'No se pudo completar la solicitud');
    return cuerpo;
}

const COLOR_ESTADO = { Pendiente: 'blue', Empacado: 'violet', Parcial: 'orange' };

function Indicador({ icono: Icono, color, titulo, valor, detalle, cargando, onClick }) {
    return (
        <Card withBorder radius="lg" p="md" onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default', boxShadow: 'var(--mm-shadow-card)' }}>
            <Group wrap="nowrap" align="flex-start">
                <ThemeIcon size={44} radius="md" variant="light" color={color}><Icono size={24} /></ThemeIcon>
                <Box style={{ minWidth: 0 }}>
                    <Text size="xs" c="dimmed" fw={700} tt="uppercase">{titulo}</Text>
                    {cargando ? <Skeleton h={28} w={100} mt={4} /> : <Text fz={26} fw={800} lh={1.2} c="navy.9">{valor}</Text>}
                    {detalle && !cargando && <Text size="xs" c="dimmed">{detalle}</Text>}
                </Box>
            </Group>
        </Card>
    );
}

function Acceso({ icono: Icono, color, titulo, descripcion, onClick }) {
    return (
        <UnstyledButton onClick={onClick} style={{ display: 'block', width: '100%' }}>
            <Paper withBorder radius="lg" p="md" h="100%" style={{ boxShadow: 'var(--mm-shadow-card)', transition: 'transform .15s ease, box-shadow .15s ease' }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }} onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; }}>
                <Group wrap="nowrap">
                    <ThemeIcon size={46} radius="xl" variant="filled" color={color}><Icono size={24} /></ThemeIcon>
                    <Box style={{ minWidth: 0 }}>
                        <Text fw={800} c="navy.9" lh={1.2}>{titulo}</Text>
                        <Text size="xs" c="dimmed">{descripcion}</Text>
                    </Box>
                </Group>
            </Paper>
        </UnstyledButton>
    );
}

// Una tarea de logística (empacar o etiquetar) con su lista de productos y el botón para firmarla
function TarjetaTarea({ tarea, tipo, onFirmar }) {
    const router = useRouter();
    const [abierto, { toggle }] = useDisclosure(false);
    const esEmpaque = tipo === 'empaque';
    const esperando = !esEmpaque && !tarea.empacado; // no se puede etiquetar lo que aún no está empacado

    return (
        <Paper withBorder radius="lg" p="md" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
            <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Box style={{ minWidth: 0 }}>
                    <Group gap={8}>
                        <Text fw={800} c="navy.9">{tarea.numero}</Text>
                        <Badge variant="light" color={tarea.tipoEntrega === 'pickup' ? 'grape' : 'cyan'} size="sm">{tarea.tipoEntrega === 'pickup' ? 'Retiro' : 'Envío'}</Badge>
                    </Group>
                    <Text size="sm" c="dimmed" truncate>{tarea.cliente} · {tarea.articulos} artículos · {fmtFechaHora(tarea.fecha)}</Text>
                </Box>
                <Button size="xs" variant="subtle" color="gray" onClick={toggle} rightSection={<IconChevronDown size={14} style={{ transform: abierto ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />}>
                    {abierto ? 'Ocultar' : 'Ver productos'}
                </Button>
            </Group>

            <Collapse in={abierto}>
                <Divider my="sm" />
                <Stack gap={6}>
                    {tarea.detalles.map((d) => (
                        <Group key={d.id} justify="space-between" wrap="nowrap">
                            <Box style={{ minWidth: 0 }}>
                                <Text size="sm" fw={600} lineClamp={2}>{d.nombre}</Text>
                                <Text size="xs" c="dimmed">{[d.codigo, d.marca].filter(Boolean).join(' · ')}</Text>
                            </Box>
                            <Badge size="lg" variant="outline" color="navy.9" style={{ flexShrink: 0 }} tt="none">{d.pedido ? `${d.pedido} (${d.cantidad} und)` : `× ${d.cantidad}`}</Badge>
                        </Group>
                    ))}
                </Stack>
            </Collapse>

            <Group justify="space-between" mt="md" wrap="wrap">
                {esperando
                    ? <Badge color="gray" variant="light" leftSection={<IconClock size={12} />}>Esperando que se firme el empaque</Badge>
                    : <Text size="xs" c="dimmed">{esEmpaque ? (tarea.iniciado ? `Llevas ${tarea.verificados} de ${tarea.renglones} productos verificados.` : 'Verificas cada producto y tomas fotos de la caja; al confirmar quedas como responsable.') : 'Firma cuando las cajas estén etiquetadas.'}</Text>}
                {esEmpaque ? (
                    <Button size="sm" color="brand.6" leftSection={<IconPackage size={16} />} onClick={() => router.push(`/superuser/ventas/${tarea.id}/empacar`)}>
                        {tarea.iniciado ? 'Continuar empaque' : 'Empacar paso a paso'}
                    </Button>
                ) : (
                    <Button size="sm" color="accent.6" disabled={esperando} leftSection={<IconCircleCheck size={16} />} onClick={() => onFirmar(tarea, tipo)}>Firmar etiquetado</Button>
                )}
            </Group>
        </Paper>
    );
}

export default function DashboardVendedor() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { nombre } = useAuth();
    const { tasa } = useTasaBcv();

    const [posAbierto, setPosAbierto] = useState(false);
    const [compraAbierta, setCompraAbierta] = useState(false);
    const [porFirmar, setPorFirmar] = useState(null); // { tarea, tipo }
    const [firmando, setFirmando] = useState(false);

    const { data, isLoading, error } = useQuery({
        queryKey: ['vendedor', 'resumen'],
        queryFn: () => pedirJson('/api/vendedor/resumen'),
        refetchInterval: 60000,
        refetchOnWindowFocus: true,
    });

    const firmar = async () => {
        if (!porFirmar) return;
        setFirmando(true);
        try {
            await pedirJson(`/api/ventas/${porFirmar.tarea.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accion: porFirmar.tipo === 'empaque' ? 'FIRMAR_EMPAQUE' : 'FIRMAR_ETIQUETADO' }),
            });
            notifications.show({ color: 'teal', title: 'Firmado', message: `${porFirmar.tipo === 'empaque' ? 'Empaque' : 'Etiquetado'} del pedido ${porFirmar.tarea.numero} registrado.` });
            setPorFirmar(null);
            queryClient.invalidateQueries({ queryKey: ['vendedor'] });
        } catch (e) {
            notifications.show({ color: 'red', title: 'No se pudo firmar', message: e.message });
        } finally {
            setFirmando(false);
        }
    };

    const nEmpacar = data?.porEmpacar?.length ?? 0;
    const nEtiquetar = data?.porEtiquetar?.length ?? 0;

    return (
        <Box maw={1400} mx="auto" px="md" py="md">
            <Stack gap="lg">
                <Group justify="space-between" align="flex-end" wrap="wrap">
                    <Box>
                        <Text size="sm" c="gray.4">{new Date().toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Caracas' })}</Text>
                        <Title order={2} c="white">Hola, {nombre || 'vendedor'} 👋</Title>
                    </Box>
                    {tasa && <Badge size="lg" radius="sm" variant="filled" color="teal.6" leftSection={<IconCash size={14} />} tt="none">BCV Oficial: {tasa} Bs.</Badge>}
                </Group>

                {error && <Alert color="red" icon={<IconAlertTriangle size={18} />}>{error.message}</Alert>}

                <SimpleGrid cols={{ base: 1, xs: 2, lg: 4 }} spacing="md">
                    <Acceso icono={IconShoppingCart} color="navy.9" titulo="Nueva venta o pedido" descripcion="Al detal o pedido al mayor" onClick={() => setPosAbierto(true)} />
                    <Acceso icono={IconReceipt2} color="orange.6" titulo="Registrar compra" descripcion="Factura de un proveedor" onClick={() => setCompraAbierta(true)} />
                    <Acceso icono={IconArchive} color="brand.6" titulo="Inventario" descripcion="Existencia y precios" onClick={() => router.push('/superuser/inventario/consulta')} />
                    <Acceso icono={IconTruckDelivery} color="grape.6" titulo="Mis ventas y pedidos" descripcion="Historial y seguimiento" onClick={() => router.push('/superuser/ventas')} />
                </SimpleGrid>

                <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
                    <Indicador icono={IconPackage} color="blue" titulo="Por empacar" cargando={isLoading} valor={nEmpacar} detalle={nEmpacar ? 'Pedidos que te asignaron' : 'Nada pendiente'} />
                    <Indicador icono={IconTag} color="violet" titulo="Por etiquetar" cargando={isLoading} valor={nEtiquetar} detalle={nEtiquetar ? 'Pedidos que te asignaron' : 'Nada pendiente'} />
                    <Indicador icono={IconCash} color="teal" titulo="Vendido hoy" cargando={isLoading} valor={fmtUsd(data?.hoy?.totalUsd)} detalle={`${data?.hoy?.ventas ?? 0} ventas · ${data?.hoy?.detal ?? 0} al detal`} />
                </SimpleGrid>

                <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" style={{ alignItems: 'start' }}>
                    <Stack gap="sm">
                        <Group gap={8}><IconPackage size={20} color="var(--mantine-color-brand-6)" /><Title order={4} c="white">Mis tareas de empaque</Title></Group>
                        {isLoading ? <Skeleton h={120} radius="lg" />
                            : nEmpacar === 0 ? <Paper withBorder radius="lg" p="lg"><Group gap="xs"><IconCircleCheck color="var(--mantine-color-teal-6)" /><Text c="dimmed">No tienes pedidos por empacar.</Text></Group></Paper>
                                : data.porEmpacar.map((t) => <TarjetaTarea key={t.id} tarea={t} tipo="empaque" onFirmar={(tarea, tipo) => setPorFirmar({ tarea, tipo })} />)}
                    </Stack>
                    <Stack gap="sm">
                        <Group gap={8}><IconTag size={20} color="var(--mantine-color-accent-6)" /><Title order={4} c="white">Mis tareas de etiquetado</Title></Group>
                        {isLoading ? <Skeleton h={120} radius="lg" />
                            : nEtiquetar === 0 ? <Paper withBorder radius="lg" p="lg"><Group gap="xs"><IconCircleCheck color="var(--mantine-color-teal-6)" /><Text c="dimmed">No tienes pedidos por etiquetar.</Text></Group></Paper>
                                : data.porEtiquetar.map((t) => <TarjetaTarea key={t.id} tarea={t} tipo="etiquetado" onFirmar={(tarea, tipo) => setPorFirmar({ tarea, tipo })} />)}
                    </Stack>
                </SimpleGrid>

                <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" style={{ alignItems: 'start' }}>
                    <Paper withBorder radius="lg" p="md" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
                        <Group justify="space-between" mb="sm"><Title order={4} c="navy.9">Mis pedidos en curso</Title>
                            <Button variant="subtle" size="xs" onClick={() => router.push('/superuser/ventas')}>Ver todos</Button></Group>
                        {isLoading ? <Skeleton h={100} /> : !data?.pedidosEnCurso?.length ? <Text c="dimmed" size="sm">No tienes pedidos al mayor en curso.</Text> : (
                            <Table.ScrollContainer minWidth={380}>
                                <Table verticalSpacing="xs" highlightOnHover>
                                    <Table.Tbody>
                                        {data.pedidosEnCurso.map((p) => (
                                            <Table.Tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/superuser/ventas/${p.id}`)}>
                                                <Table.Td><Text fw={700} size="sm">{p.numero}</Text><Text size="xs" c="dimmed" truncate maw={160}>{p.cliente}</Text></Table.Td>
                                                <Table.Td><Badge variant="light" color={COLOR_ESTADO[p.estado] || 'gray'}>{p.estado}</Badge></Table.Td>
                                                <Table.Td ta="right"><Text size="sm" fw={700}>{fmtUsd(p.total)}</Text></Table.Td>
                                            </Table.Tr>
                                        ))}
                                    </Table.Tbody>
                                </Table>
                            </Table.ScrollContainer>
                        )}
                    </Paper>

                    <Paper withBorder radius="lg" p="md" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
                        <Title order={4} c="navy.9" mb="sm">Firmado recientemente</Title>
                        {isLoading ? <Skeleton h={100} /> : !data?.firmadas?.length ? <Text c="dimmed" size="sm">Aún no has firmado tareas.</Text> : (
                            <Stack gap={8}>
                                {data.firmadas.map((f) => (
                                    <Group key={f.id} justify="space-between" wrap="nowrap" style={{ cursor: 'pointer' }} onClick={() => router.push(`/superuser/ventas/${f.id}`)}>
                                        <Box style={{ minWidth: 0 }}><Text size="sm" fw={700}>{f.numero}</Text><Text size="xs" c="dimmed" truncate>{f.cliente}</Text></Box>
                                        <Stack gap={2} align="flex-end">
                                            {f.empaque && <Badge size="sm" variant="light" color="blue">Empaque · {fmtFechaHora(f.empaque)}</Badge>}
                                            {f.etiquetado && <Badge size="sm" variant="light" color="violet">Etiquetado · {fmtFechaHora(f.etiquetado)}</Badge>}
                                        </Stack>
                                    </Group>
                                ))}
                            </Stack>
                        )}
                    </Paper>
                </SimpleGrid>
            </Stack>

            <Modal opened={Boolean(porFirmar)} onClose={() => setPorFirmar(null)} centered title={<Text fw={800}>Confirmar firma</Text>}>
                <Stack gap="md">
                    <Text size="sm">
                        Vas a firmar el <b>{porFirmar?.tipo === 'empaque' ? 'empaque' : 'etiquetado'}</b> del pedido <b>{porFirmar?.tarea?.numero}</b>. Quedará registrado a tu nombre con fecha y hora.
                        {porFirmar?.tipo === 'empaque' && ' Se descontará la mercancía del inventario.'}
                    </Text>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={() => setPorFirmar(null)}>Volver</Button>
                        <Button color="navy.9" loading={firmando} onClick={firmar} leftSection={<IconCircleCheck size={16} />}>Sí, firmar</Button>
                    </Group>
                </Stack>
            </Modal>

            {posAbierto && <PosModal opened={posAbierto} onClose={() => { setPosAbierto(false); queryClient.invalidateQueries({ queryKey: ['vendedor'] }); }} tasaBcv={tasa || 0} />}
            {compraAbierta && <CompraModal opened={compraAbierta} onClose={() => setCompraAbierta(false)} tasaBcv={tasa || 0} />}
        </Box>
    );
}
