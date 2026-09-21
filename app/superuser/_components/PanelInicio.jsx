'use client';

import React from 'react';
import Link from 'next/link';
import { ActionIcon, Badge, Box, Button, Card, Grid, Group, Paper, SimpleGrid, Skeleton, Stack, Text, ThemeIcon, Title, Tooltip, UnstyledButton } from '@mantine/core';
import { LineChart } from '@mantine/charts';
import { useMediaQuery } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import ErroresEmpaqueCard from './ErroresEmpaqueCard';
import DeliveryDiferenciasCard from './DeliveryDiferenciasCard';
import {
    IconAlertTriangle, IconArrowDownRight, IconArrowRight, IconArrowUpRight, IconBuildingStore, IconCash, IconCheck, IconClockExclamation, IconPackage,
    IconReceipt, IconReceiptTax, IconSettings, IconShoppingCart, IconTruckDelivery, IconWallet,
} from '@tabler/icons-react';

const usd = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUsd = (v) => `$${usd.format(Number(v) || 0)}`;
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const diaCorto = (iso) => DIAS[new Date(`${iso}T12:00:00Z`).getUTCDay()];

async function pedirJson(url) {
    const res = await fetch(url);
    const cuerpo = await res.json().catch(() => null);
    if (!res.ok) throw new Error(cuerpo?.error || 'No se pudo cargar');
    return cuerpo;
}

function Pulso({ icono: Icono, color, titulo, valor, detalle, cambio, href, cargando }) {
    const contenido = (
        <Card withBorder radius="lg" p={{ base: 'xs', sm: 'md' }} h="100%" style={{ boxShadow: 'var(--mm-shadow-card)', transition: 'transform .15s ease' }}
            onMouseEnter={href ? (e) => { e.currentTarget.style.transform = 'translateY(-2px)'; } : undefined} onMouseLeave={href ? (e) => { e.currentTarget.style.transform = 'none'; } : undefined}>
            <Group wrap="nowrap" align="flex-start" gap={{ base: 6, sm: 'md' }}>
                <ThemeIcon size={44} radius="md" variant="light" color={color} visibleFrom="sm"><Icono size={24} /></ThemeIcon>
                <ThemeIcon size={28} radius="md" variant="light" color={color} hiddenFrom="sm"><Icono size={16} /></ThemeIcon>
                <Box style={{ minWidth: 0 }}>
                    <Text fz={{ base: 9, sm: 12 }} c="dimmed" fw={700} tt="uppercase" lineClamp={1}>{titulo}</Text>
                    {cargando ? <Skeleton h={28} w={100} mt={4} /> : <Text fz={{ base: 17, sm: 24 }} fw={800} lh={1.2} c="navy.9">{valor}</Text>}
                    {!cargando && (
                        <Group gap={4} wrap="nowrap">
                            {cambio !== undefined && cambio !== null && (cambio >= 0 ? <IconArrowUpRight size={14} color="var(--mantine-color-teal-6)" /> : <IconArrowDownRight size={14} color="var(--mantine-color-red-6)" />)}
                            {cambio !== undefined && cambio !== null && <Text size="xs" fw={700} c={cambio >= 0 ? 'teal.7' : 'red.7'}>{cambio >= 0 ? '+' : ''}{cambio.toFixed(1)}%</Text>}
                            <Text fz={{ base: 10, sm: 12 }} c="dimmed" lineClamp={1}>{detalle}</Text>
                        </Group>
                    )}
                </Box>
            </Group>
        </Card>
    );
    return href ? <UnstyledButton component={Link} href={href} style={{ display: 'block', height: '100%' }}>{contenido}</UnstyledButton> : contenido;
}

// Panel de inicio del personal: cabecera, pulso del negocio, alertas, módulos y tareas
export default function PanelInicio({ nombre, tasa, onPos, onCompra, onAjustes, modulos, tareas }) {
    const { isAdmin } = useAuth();
    const movil = useMediaQuery('(max-width: 48em)');
    const { data, isLoading } = useQuery({ queryKey: ['dashboard', 'resumen'], queryFn: () => pedirJson('/api/dashboard/resumen'), refetchInterval: 120000, refetchOnWindowFocus: true });
    const d = data;

    const atencion = [];
    if (d?.porCobrar.vencidas > 0) atencion.push({ color: 'red', icono: IconClockExclamation, texto: `${d.porCobrar.vencidas} cuenta(s) por cobrar vencida(s)`, detalle: fmtUsd(d.porCobrar.montoVencido), href: '/superuser/cxc' });
    if (d?.porPagar.vencidas > 0) atencion.push({ color: 'red', icono: IconClockExclamation, texto: `${d.porPagar.vencidas} cuenta(s) por pagar vencida(s)`, detalle: 'Revisa tus proveedores', href: '/superuser/cxp' });
    if (d?.porPagar.porVencer > 0) atencion.push({ color: 'orange', icono: IconWallet, texto: `${d.porPagar.porVencer} pago(s) a proveedor vencen esta semana`, detalle: 'Próximos 7 días', href: '/superuser/cxp' });
    if (d?.pedidos.sinAsignar > 0) atencion.push({ color: 'blue', icono: IconPackage, texto: `${d.pedidos.sinAsignar} pedido(s) sin empacador asignado`, detalle: 'Asigna quién empaca y etiqueta', href: '/superuser/ventas' });
    if (d?.alertas?.porVerificar > 0) atencion.unshift({ color: 'red', icono: IconAlertTriangle, texto: `${d.alertas.porVerificar} compra(s) de la tienda con pago por verificar`, detalle: 'Confírmalo en el banco o recházalo', href: '/superuser/ventas' });
    if (d?.alertas?.intentosFallidos > 0) atencion.push({ color: 'orange', icono: IconAlertTriangle, texto: `${d.alertas.intentosFallidos} intento(s) de pago sin coincidencia en 24 h`, detalle: 'Referencias que no existen o montos distintos', href: '/superuser/pagos-recibidos' });
    if (d?.alertas?.enRevision > 0) atencion.push({ color: 'violet', icono: IconPackage, texto: `${d.alertas.enRevision} pedido(s) B2B en revisión de existencias`, detalle: 'Confirma o ajusta las cantidades', href: '/superuser/ventas' });
    if (d?.alertas?.retencionesPorRevisar > 0) atencion.push({ color: 'orange', icono: IconReceiptTax, texto: `${d.alertas.retencionesPorRevisar} comprobante(s) de retención por confirmar`, detalle: 'El cliente ya lo subió', href: '/superuser/ventas' });
    if (d?.alertas?.retencionesPendientes > 0) atencion.push({ color: 'yellow', icono: IconReceiptTax, texto: `${d.alertas.retencionesPendientes} retención(es) de IVA esperan el comprobante del cliente`, detalle: 'Aún no entran al libro de ventas', href: '/superuser/ventas' });
    if (d?.stockBajo.total > 0) atencion.push({ color: 'orange', icono: IconAlertTriangle, texto: `${d.stockBajo.total} producto(s) por debajo del stock mínimo`, detalle: d.stockBajo.top.slice(0, 2).map((p) => p.nombre).join(' · '), href: '/superuser/inventario/productos' });

    return (
        <Box maw={1500} mx="auto" px={{ base: 6, sm: 'md' }} py={{ base: 6, sm: 'md' }}>
            <Stack gap={{ base: 'xs', sm: 'lg' }}>
                {/* Cabecera con degradado de marca */}
                <Paper radius="xl" p={{ base: 'sm', sm: 'xl' }} style={{ background: 'var(--mm-gradient-brand, linear-gradient(90deg,#0B1B3D,#005AAA))', border: '1px solid rgba(255,255,255,.12)', boxShadow: '0 18px 50px rgba(0,0,0,.35)', position: 'relative', overflow: 'hidden' }}>
                    <Box style={{ position: 'absolute', inset: 0, background: 'radial-gradient(600px 220px at 85% -20%, rgba(249,50,0,.35), transparent 70%)', pointerEvents: 'none' }} />
                    <Group justify="space-between" align="center" wrap="wrap" style={{ position: 'relative' }} gap={{ base: 'xs', sm: 'lg' }}>
                        <Box>
                            <Text fz={{ base: 11, sm: 14 }} c="gray.3" tt="capitalize">{new Date().toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Caracas' })}</Text>
                            <Title order={1} c="white" fz={{ base: 20, sm: 34 }} lh={1.15}>Hola, {nombre || 'equipo'} 👋</Title>
                            <Group gap="xs" mt="xs">
                                <Badge component={Link} href="/superuser/bcv" size="lg" variant="white" color="teal" leftSection={<IconCash size={14} />} tt="none" style={{ cursor: 'pointer' }}>
                                    BCV Oficial: {tasa ? `${tasa} Bs.` : 'Cargando…'}
                                </Badge>
                                {onAjustes && <Tooltip label="Control de accesos"><ActionIcon variant="white" color="gray" radius="xl" onClick={onAjustes}><IconSettings size={18} /></ActionIcon></Tooltip>}
                            </Group>
                        </Box>
                        <Group gap="xs" w={{ base: '100%', sm: 'auto' }} wrap="nowrap">
                            <Button size="sm" radius="xl" variant="white" color="navy.9" leftSection={<IconReceipt size={18} />} onClick={onCompra} style={{ flex: '1 1 auto' }}>Registrar compra</Button>
                            <Button size="sm" radius="xl" color="accent.6" leftSection={<IconBuildingStore size={18} />} onClick={onPos} style={{ flex: '1 1 auto' }}>Nueva venta (POS)</Button>
                        </Group>
                    </Group>
                </Paper>

                {/* Pulso del negocio */}
                <SimpleGrid cols={{ base: 2, lg: 4 }} spacing={{ base: 6, sm: 'md' }}>
                    <Pulso icono={IconCash} color="teal" titulo="Ventas de hoy" cargando={isLoading} valor={fmtUsd(d?.ventas.hoyTotal)} cambio={d?.ventas.cambioVsAyer} detalle={`${d?.ventas.hoyVentas ?? 0} venta(s) · vs ayer`} href="/superuser/ventas" />
                    <Pulso icono={IconReceipt} color="blue" titulo="Ventas del mes" cargando={isLoading} valor={fmtUsd(d?.ventas.mesTotal)} detalle={`${d?.ventas.mesVentas ?? 0} venta(s)`} href="/superuser/ventas" />
                    <Pulso icono={IconWallet} color="orange" titulo="Por cobrar" cargando={isLoading} valor={fmtUsd(d?.porCobrar.total)} detalle={d?.porCobrar.vencidas ? `${d.porCobrar.vencidas} vencida(s)` : 'Sin vencidas'} href="/superuser/cxc" />
                    <Pulso icono={IconWallet} color="red" titulo="Por pagar" cargando={isLoading} valor={fmtUsd(d?.porPagar.total)} detalle={d?.porPagar.vencidas ? `${d.porPagar.vencidas} vencida(s)` : 'Sin vencidas'} href="/superuser/cxp" />
                    <Pulso icono={IconTruckDelivery} color="violet" titulo="Por despachar" cargando={isLoading} valor={d?.pedidos.porDespachar ?? 0} detalle={`${d?.pedidos.sinAsignar ?? 0} sin asignar`} href="/superuser/ventas" />
                    <Pulso icono={IconShoppingCart} color="cyan" titulo="Tienda online hoy" cargando={isLoading} valor={fmtUsd(d?.tienda?.hoyTotal)} detalle={`${d?.tienda?.hoyCompras ?? 0} compra(s) · ${d?.tienda?.recibosMes ?? 0} recibo(s) sin factura en el mes`} href="/superuser/ventas" />
                    <Pulso icono={IconReceiptTax} color="grape" titulo="IVA facturado del mes" cargando={isLoading} valor={fmtUsd(d?.ivaMes)} detalle="Solo facturas, por fecha de emisión" href="/superuser/finanzas" />
                    <Pulso icono={IconAlertTriangle} color="yellow" titulo="Stock bajo" cargando={isLoading} valor={d?.stockBajo.total ?? 0} detalle={`${d?.stockBajo.agotados ?? 0} agotado(s)`} href="/superuser/inventario/productos" />
                </SimpleGrid>

                <Grid gutter={{ base: 6, lg: 'lg' }}>
                    <Grid.Col span={{ base: 12, lg: 7 }}>
                        <Paper withBorder radius="lg" p={{ base: 'xs', sm: 'md' }} h="100%" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
                            <Group justify="space-between" mb="xs"><Title order={5} c="navy.9">Ventas de los últimos 7 días (USD)</Title>
                                <Button component={Link} href="/superuser/finanzas" variant="subtle" size="xs" rightSection={<IconArrowRight size={14} />}>Balance</Button></Group>
                            {isLoading ? <Skeleton h={movil ? 140 : 210} /> : (
                                <LineChart h={movil ? 140 : 210} data={(d?.serie || []).map((s) => ({ dia: diaCorto(s.dia), Ventas: Number(s.total.toFixed(2)) }))} dataKey="dia" series={[{ name: 'Ventas', color: 'brand.6' }]}
                                    curveType="monotone" withDots valueFormatter={(v) => fmtUsd(v)} tickLine="none" gridAxis="xy" />
                            )}
                        </Paper>
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, lg: 5 }}>
                        <Paper withBorder radius="lg" p={{ base: 'xs', sm: 'md' }} h="100%" style={{ boxShadow: 'var(--mm-shadow-card)' }}>
                            <Title order={5} c="navy.9" mb="xs">Necesita tu atención</Title>
                            {isLoading ? <Skeleton h={190} /> : !atencion.length ? (
                                <Group gap="xs" py="lg" justify="center"><IconCheck color="var(--mantine-color-teal-6)" /><Text c="dimmed" size="sm">Todo en orden por ahora.</Text></Group>
                            ) : (
                                <Stack gap={8}>
                                    {atencion.map((a) => (
                                        <UnstyledButton key={a.texto} component={Link} href={a.href}>
                                            <Paper withBorder radius="md" p="xs" style={{ borderLeft: `4px solid var(--mantine-color-${a.color}-6)` }}>
                                                <Group wrap="nowrap" gap="sm">
                                                    <ThemeIcon variant="light" color={a.color} size={30} radius="md"><a.icono size={16} /></ThemeIcon>
                                                    <Box style={{ minWidth: 0, flex: 1 }}><Text size="sm" fw={700} lineClamp={1}>{a.texto}</Text><Text size="xs" c="dimmed" lineClamp={1}>{a.detalle}</Text></Box>
                                                    <IconArrowRight size={16} color="var(--mantine-color-gray-5)" />
                                                </Group>
                                            </Paper>
                                        </UnstyledButton>
                                    ))}
                                </Stack>
                            )}
                        </Paper>
                    </Grid.Col>
                </Grid>

                {/* Quién se equivoca más al empacar (solo administradores) */}
                {isAdmin && <ErroresEmpaqueCard />}

                {/* Diferencias acumuladas entre el delivery cobrado y el real (solo administradores) */}
                {isAdmin && <DeliveryDiferenciasCard />}

                {/* Módulos */}
                <Box>
                    <Title order={6} mb="xs" c="gray.5" tt="uppercase" fz={11} lts={1.5}>Módulos</Title>
                    <SimpleGrid cols={{ base: 2, md: 3, xl: 4 }} spacing={{ base: 6, sm: 'md' }}>
                        {modulos.map((m) => (
                            <UnstyledButton key={m.href} component={Link} href={m.href} style={{ display: 'block', height: '100%' }}>
                                <Card withBorder radius="lg" p={{ base: 'xs', sm: 'md' }} h="100%" style={{ boxShadow: 'var(--mm-shadow-card)', transition: 'transform .15s ease, box-shadow .15s ease' }}
                                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-3px)'; }} onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; }}>
                                    <Group wrap="nowrap" align="center">
                                        <ThemeIcon size={48} radius="xl" variant="light" color={m.color} visibleFrom="sm"><m.icon size={26} stroke={1.5} /></ThemeIcon>
                                        <ThemeIcon size={30} radius="xl" variant="light" color={m.color} hiddenFrom="sm"><m.icon size={17} stroke={1.5} /></ThemeIcon>
                                        <Box style={{ minWidth: 0, flex: 1 }}>
                                            <Text fw={800} c="navy.9" lh={1.2} lineClamp={2} fz={{ base: 12, sm: 16 }}>{m.title}</Text>
                                            <Text size="xs" c="dimmed" lineClamp={2} visibleFrom="sm">{m.description}</Text>
                                        </Box>
                                        <IconArrowRight size={18} color="var(--mantine-color-gray-5)" style={{ display: movil ? 'none' : undefined }} />
                                    </Group>
                                </Card>
                            </UnstyledButton>
                        ))}
                    </SimpleGrid>
                </Box>

                {tareas && (
                    <Box>
                        <Title order={6} mb="xs" c="gray.6" tt="uppercase" fz={11} lts={1.5}>Centro de tareas</Title>
                        <Paper radius="lg" bg="white" style={{ boxShadow: 'var(--mm-shadow-card)' }}>{tareas}</Paper>
                    </Box>
                )}
            </Stack>
        </Box>
    );
}
