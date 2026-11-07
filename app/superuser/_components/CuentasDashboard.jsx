'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
    ActionIcon, Alert, Badge, Box, Button, CloseButton, Grid, Group, Pagination, Paper, SegmentedControl, SimpleGrid, Skeleton, Stack, Table, Text, TextInput,
    ThemeIcon, Title, Tooltip, UnstyledButton,
} from '@mantine/core';
import { useDebouncedValue, useMediaQuery } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { IconAlertTriangle, IconArrowRight, IconBrandWhatsapp, IconCash, IconClockExclamation, IconFileInvoice, IconFilter, IconSearch, IconUsers } from '@tabler/icons-react';
import { aBolivares } from '@/app/constants/facturacion';
import { telefonoWhatsapp } from '../clientes/_components/AccesoModal';

const usd = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUsd = (v) => `$${usd.format(Number(v) || 0)}`;
const fmtBs = (v) => `Bs ${new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0)}`;
const fmtFecha = (v) => (v ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : '—');
const TAMANO = 15;

// Tramos de antigüedad: de "al día" (bien) a "+90 días" (grave). Escala ordenada de un mismo sentido; cada tramo lleva su nombre (no solo color).
const TRAMOS = [
    { clave: 'alDia', corto: 'Al día', color: 'var(--mantine-color-teal-6)' },
    { clave: 'v1a30', corto: '1–30 días', color: 'var(--mantine-color-yellow-6)' },
    { clave: 'v31a60', corto: '31–60 días', color: 'var(--mantine-color-orange-6)' },
    { clave: 'v61a90', corto: '61–90 días', color: 'var(--mantine-color-red-6)' },
    { clave: 'vMas90', corto: 'Más de 90 días', color: 'var(--mantine-color-red-9)' },
];
const tramoDe = (c) => {
    const atraso = c.diasParaVencer !== null && c.diasParaVencer < 0 ? -c.diasParaVencer : 0;
    return !atraso ? 'alDia' : atraso <= 30 ? 'v1a30' : atraso <= 60 ? 'v31a60' : atraso <= 90 ? 'v61a90' : 'vMas90';
};
const ESTADO = {
    'vencida': { color: 'red', etiqueta: (c) => `Vencida hace ${-c.diasParaVencer} d` },
    'por-vencer': { color: 'orange', etiqueta: (c) => (c.diasParaVencer === 0 ? 'Vence hoy' : `Vence en ${c.diasParaVencer} d`) },
    'al-dia': { color: 'teal', etiqueta: (c) => `Vence en ${c.diasParaVencer} d` },
    'sin-fecha': { color: 'gray', etiqueta: () => 'Sin fecha de pago' },
};
const SUPERFICIE = { background: '#fff', color: '#1a1b1e', border: '1px solid #d5dbe5', borderRadius: 10 };

async function pedirJson(url) {
    const res = await fetch(url);
    const cuerpo = await res.json().catch(() => null);
    if (!res.ok) throw new Error(cuerpo?.error || 'No se pudo cargar');
    return cuerpo;
}

// Un número que se lee de un vistazo
function Indicador({ icono: Icono, color, titulo, valor, detalle, cargando, onClick, activo }) {
    return (
        <Box
            component={onClick ? 'button' : 'div'} type={onClick ? 'button' : undefined} onClick={onClick} aria-pressed={onClick ? Boolean(activo) : undefined}
            p={{ base: 8, sm: 10 }}
            style={{ ...SUPERFICIE, width: '100%', textAlign: 'left', font: 'inherit', cursor: onClick ? 'pointer' : undefined, borderColor: activo ? 'var(--mantine-color-navy-6)' : '#d5dbe5', boxShadow: activo ? '0 0 0 2px var(--mantine-color-navy-3)' : undefined }}
        >
            <Group wrap="nowrap" gap={10} align="flex-start">
                <ThemeIcon size={34} radius="md" variant="light" color={color} visibleFrom="sm" style={{ flexShrink: 0 }}><Icono size={20} /></ThemeIcon>
                <Box style={{ minWidth: 0 }}>
                    <Text fz={10.5} c="#5c6675" fw={700} tt="uppercase" lh={1.25}>{titulo}</Text>
                    {cargando ? <Skeleton h={24} w={110} mt={4} /> : <Text fz={{ base: 17, sm: 21 }} fw={800} lh={1.2} c="navy.9" style={{ whiteSpace: 'nowrap' }}>{valor}</Text>}
                    {detalle && !cargando && <Text fz={11.5} c="#5c6675" fw={600}>{detalle}</Text>}
                </Box>
            </Group>
        </Box>
    );
}

// Una fila de barra horizontal (antigüedad o quién debe más): nombre, monto y su parte del total. Tocarla filtra la lista.
function FilaBarra({ color, etiqueta, monto, parte, detalle, activa, onClick }) {
    return (
        <UnstyledButton onClick={onClick} aria-pressed={activa} px={8} py={6} style={{ display: 'block', width: '100%', borderRadius: 8, color: '#1a1b1e', background: activa ? '#eef3fb' : undefined, boxShadow: activa ? 'inset 0 0 0 1px #93a7d1' : undefined }}>
            <Group justify="space-between" wrap="nowrap" gap={8} mb={4}>
                <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                    <Box w={10} h={10} style={{ borderRadius: 3, background: color, flexShrink: 0 }} aria-hidden="true" />
                    <Text fz={13} fw={600} truncate="end">{etiqueta}</Text>
                    {detalle && <Text fz={11.5} c="#5c6675" style={{ whiteSpace: 'nowrap' }}>{detalle}</Text>}
                </Group>
                <Group gap={8} wrap="nowrap" style={{ flexShrink: 0 }}>
                    <Text fz={13} fw={800} style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtUsd(monto)}</Text>
                    <Text fz={11.5} c="#5c6675" w={38} ta="right">{Math.round(parte * 100)} %</Text>
                </Group>
            </Group>
            <Box h={8} style={{ position: 'relative', borderRadius: 999, background: '#edf1f7', overflow: 'hidden' }}>
                <Box style={{ position: 'absolute', inset: '0 auto 0 0', width: `${Math.max(parte > 0 ? 1.5 : 0, parte * 100)}%`, background: color, borderRadius: 999 }} />
            </Box>
        </UnstyledButton>
    );
}

// Cuentas por cobrar (tipo="cobrar") o por pagar (tipo="pagar"): mismos indicadores, antigüedad, quién debe más y la lista.
// `embebido`: dentro de la pantalla de cuentas por cobrar (que ya trae su título y su margen).
export default function CuentasDashboard({ tipo, embebido = false }) {
    const router = useRouter();
    const cobrar = tipo === 'cobrar';
    const tarjetas = useMediaQuery('(max-width: 61.99em)'); // en el teléfono y la tableta: tarjetas, no tabla con desplazamiento lateral
    const { data, isLoading, error } = useQuery({ queryKey: ['cuentas', tipo], queryFn: () => pedirJson(`/api/finanzas/cuentas?tipo=${tipo}`), refetchOnWindowFocus: true });

    const [busqueda, setBusqueda] = useState('');
    const [q] = useDebouncedValue(busqueda.trim().toLowerCase(), 250);
    const [filtro, setFiltro] = useState('todas');
    const [tramo, setTramo] = useState(null);
    const [deudor, setDeudor] = useState(null); // { id, nombre }
    const [pagina, setPagina] = useState(1);
    useEffect(() => { setPagina(1); }, [q, filtro, tipo, tramo, deudor]);

    const cuentas = data?.cuentas || [];
    const filtradas = useMemo(() => cuentas.filter((c) => {
        if (filtro === 'vencidas' && c.estado !== 'vencida') return false;
        if (filtro === 'por-vencer' && c.estado !== 'por-vencer') return false;
        if (filtro === 'al-dia' && !['al-dia', 'sin-fecha'].includes(c.estado)) return false;
        if (tramo && tramoDe(c) !== tramo) return false;
        if (deudor && c.contraparte.id !== deudor.id) return false;
        return !q || [c.contraparte.nombre, c.contraparte.identificacion, c.documento].some((x) => String(x || '').toLowerCase().includes(q));
    }), [cuentas, q, filtro, tramo, deudor]);
    const paginas = Math.max(1, Math.ceil(filtradas.length / TAMANO));
    const visibles = filtradas.slice((pagina - 1) * TAMANO, pagina * TAMANO);
    const saldoFiltrado = useMemo(() => filtradas.reduce((t, c) => t + c.saldo, 0), [filtradas]);

    const r = data?.resumen;
    const tasa = data?.tasa;
    const total = Number(r?.total) || 0;
    const cubetas = (data?.cubetas || []).map((c) => ({ ...c, ...(TRAMOS.find((t) => t.clave === c.clave) || {}) }));
    const top = data?.top || [];
    const maxTop = Math.max(0, ...top.map((t) => t.saldo));
    const pctVencido = total > 0 ? Math.round(((Number(r?.vencido) || 0) / total) * 100) : 0;

    const recordatorio = (c) => {
        const wa = telefonoWhatsapp(c.contraparte.telefono);
        if (!wa) return null;
        const texto = `Hola ${c.contraparte.nombre || ''}, te escribimos de Mediquir. Tienes un saldo pendiente de ${fmtUsd(c.saldo)} del documento ${c.documento || ''}${c.vence ? ` (vencimiento ${fmtFecha(c.vence)})` : ''}. ¿Nos confirmas el pago? ¡Gracias!`;
        return `https://wa.me/${wa}?text=${encodeURIComponent(texto)}`;
    };
    const irAlDocumento = (c) => router.push(cobrar ? `/superuser/ventas/${c.docId}` : `/superuser/compras/${c.docId}`);
    const nombreDe = (c) => c.contraparte.nombre || c.contraparte.identificacion;

    // Lo que se puede hacer con una cuenta: recordar por WhatsApp y abrir su documento (las manuales se editan en el Libro de cobranza)
    const acciones = (c, grande = false) => {
        const wa = cobrar ? recordatorio(c) : null;
        return (
            <Group gap={4} wrap="nowrap" justify="flex-end">
                {wa && <Tooltip label="Recordar por WhatsApp"><ActionIcon variant="light" color="green" size={grande ? 36 : 28} component="a" href={wa} target="_blank" rel="noopener noreferrer" aria-label={`Recordar por WhatsApp a ${nombreDe(c)}`}><IconBrandWhatsapp size={grande ? 20 : 17} /></ActionIcon></Tooltip>}
                {c.origen === 'manual'
                    ? <Tooltip label="Cuenta manual: se edita en el Libro de cobranza"><Badge size="sm" variant="light" color="grape">Manual</Badge></Tooltip>
                    : (
                        <Tooltip label={cobrar ? 'Ver documento y registrar abono' : 'Ver compra y registrar pago'}>
                            <ActionIcon variant="light" color="navy.9" size={grande ? 36 : 28} aria-label={cobrar ? `Ver el documento ${c.documento || ''}` : `Ver la compra ${c.documento || ''}`} onClick={() => irAlDocumento(c)}><IconArrowRight size={grande ? 20 : 16} /></ActionIcon>
                        </Tooltip>
                    )}
            </Group>
        );
    };

    return (
        <Box px={embebido ? 0 : { base: 8, sm: 12, lg: 16 }} py={embebido ? 0 : { base: 8, sm: 10 }}>
            <Stack gap={8}>
                {!embebido && (
                    <Group justify="space-between" align="center" wrap="wrap" gap="sm">
                        <Box>
                            <Title order={3} c="white" fz={{ base: 19, sm: 22 }} style={{ paddingBottom: 0 }}>{cobrar ? 'Cuentas por cobrar' : 'Cuentas por pagar'}</Title>
                            <Text size="xs" c="gray.4">{cobrar ? 'Lo que tus clientes te deben, ordenado por vencimiento.' : 'Lo que le debes a tus proveedores, ordenado por vencimiento.'}{tasa ? ` · BCV ${tasa} Bs/$` : ''}</Text>
                        </Box>
                        <SegmentedControl color="navy.9" value={tipo} onChange={(v) => router.push(v === 'cobrar' ? '/superuser/cxc' : '/superuser/cxp')} styles={{ root: { background: '#fff', border: '1px solid #ced4da' } }}
                            data={[{ value: 'cobrar', label: 'Por cobrar' }, { value: 'pagar', label: 'Por pagar' }]} />
                    </Group>
                )}

                {error && <Alert color="red" icon={<IconAlertTriangle size={18} />}>{error.message}</Alert>}

                <SimpleGrid cols={{ base: 2, lg: 4 }} spacing={8}>
                    <Indicador icono={IconCash} color="blue" titulo="Total pendiente" cargando={isLoading} valor={fmtUsd(r?.total)} detalle={tasa ? fmtBs(aBolivares(r?.total || 0, tasa)) : `${r?.documentos ?? 0} documento(s)`} />
                    <Indicador
                        icono={IconClockExclamation} color="red" titulo="Vencido" cargando={isLoading} valor={fmtUsd(r?.vencido)} detalle={`${r?.vencidos ?? 0} documento(s) · ${pctVencido} %`}
                        onClick={() => setFiltro(filtro === 'vencidas' ? 'todas' : 'vencidas')} activo={filtro === 'vencidas'}
                    />
                    <Indicador icono={IconClockExclamation} color="orange" titulo="Vence en 7 días" cargando={isLoading} valor={fmtUsd(r?.porVencer)} onClick={() => setFiltro(filtro === 'por-vencer' ? 'todas' : 'por-vencer')} activo={filtro === 'por-vencer'} />
                    <Indicador icono={cobrar ? IconUsers : IconFileInvoice} color="grape" titulo={cobrar ? 'Clientes con saldo' : 'Proveedores con saldo'} cargando={isLoading} valor={r?.contrapartes ?? 0} detalle={`${r?.documentos ?? 0} documento(s)`} />
                </SimpleGrid>

                <Grid gutter={8}>
                    <Grid.Col span={{ base: 12, lg: 7 }}>
                        <Box p="sm" h="100%" style={SUPERFICIE}>
                            <Group justify="space-between" mb={6} wrap="wrap" gap={4}>
                                <Text fw={800} c="navy.9">Antigüedad de la deuda</Text>
                                {!isLoading && total > 0 && <Text fz={12} c="#5c6675">{pctVencido} % de lo pendiente está vencido · toca un tramo para ver sus documentos</Text>}
                            </Group>
                            {isLoading ? <Stack gap={8}>{TRAMOS.map((t) => <Skeleton key={t.clave} h={34} />)}</Stack> : !total ? <Text c="#5c6675" size="sm" py="lg" ta="center">No hay saldos pendientes.</Text> : (
                                <Stack gap={0}>
                                    {cubetas.map((c) => (
                                        <FilaBarra key={c.clave} color={c.color} etiqueta={c.clave === 'alDia' ? 'Al día / sin vencer' : `Vencido ${c.corto}`} monto={c.monto} parte={total > 0 ? c.monto / total : 0}
                                            activa={tramo === c.clave} onClick={() => setTramo(tramo === c.clave ? null : c.clave)} />
                                    ))}
                                </Stack>
                            )}
                        </Box>
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, lg: 5 }}>
                        <Box p="sm" h="100%" style={SUPERFICIE}>
                            <Group justify="space-between" mb={6} wrap="wrap" gap={4}>
                                <Text fw={800} c="navy.9">{cobrar ? 'Quién más te debe' : 'A quién más le debes'}</Text>
                                {!isLoading && top.length > 0 && <Text fz={12} c="#5c6675">toca uno para ver sus documentos</Text>}
                            </Group>
                            {isLoading ? <Stack gap={8}>{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} h={34} />)}</Stack> : !top.length ? <Text c="#5c6675" size="sm" py="lg" ta="center">Sin datos.</Text> : (
                                <Stack gap={0}>
                                    {top.map((t) => (
                                        <FilaBarra key={t.id} color="var(--mantine-color-brand-6)" etiqueta={t.nombre} detalle={`${t.documentos} doc.`} monto={t.saldo} parte={maxTop > 0 ? t.saldo / maxTop : 0}
                                            activa={deudor?.id === t.id} onClick={() => setDeudor(deudor?.id === t.id ? null : { id: t.id, nombre: t.nombre })} />
                                    ))}
                                </Stack>
                            )}
                        </Box>
                    </Grid.Col>
                </Grid>

                <Paper p="sm" radius={10} variant="plano" style={{ ...SUPERFICIE }}>
                    <Group gap={8} mb={8} wrap="wrap" align="center">
                        <SegmentedControl size="xs" color="navy.9" fullWidth={Boolean(tarjetas)} value={filtro} onChange={setFiltro} styles={{ root: { background: '#f1f3f5' } }}
                            data={[{ value: 'todas', label: 'Todas' }, { value: 'vencidas', label: 'Vencidas' }, { value: 'por-vencer', label: 'Por vencer' }, { value: 'al-dia', label: 'Al día' }]} />
                        <TextInput
                            size="xs" flex="1 1 220px" miw={0} aria-label="Buscar" placeholder={cobrar ? 'Buscar cliente, RIF o documento…' : 'Buscar proveedor, RIF o factura…'} leftSection={<IconSearch size={15} />}
                            value={busqueda} onChange={(e) => setBusqueda(e.currentTarget.value)} rightSection={busqueda ? <CloseButton size="sm" aria-label="Borrar búsqueda" onClick={() => setBusqueda('')} /> : null}
                        />
                    </Group>
                    {(tramo || deudor) && (
                        <Group gap={6} mb={8} wrap="wrap">
                            <IconFilter size={14} color="#5c6675" />
                            {tramo && <Button size="compact-xs" variant="light" rightSection={<Text span fz={14} lh={1}>×</Text>} onClick={() => setTramo(null)} aria-label="Quitar filtro de antigüedad">Antigüedad: {TRAMOS.find((t) => t.clave === tramo)?.corto}</Button>}
                            {deudor && <Button size="compact-xs" variant="light" rightSection={<Text span fz={14} lh={1}>×</Text>} onClick={() => setDeudor(null)} aria-label="Quitar filtro de cliente">{deudor.nombre}</Button>}
                        </Group>
                    )}

                    {isLoading || tarjetas === undefined ? <Stack gap={6}>{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} h={44} />)}</Stack>
                        : !visibles.length ? <Text c="#5c6675" ta="center" py={40}>No hay cuentas con esos filtros.</Text>
                            : tarjetas ? (
                                <Stack gap={8}>
                                    {visibles.map((c) => (
                                        <Box key={`${c.origen}-${c.id}`} p={10} style={{ border: '1px solid #d5dbe5', borderRadius: 12, boxShadow: `inset 4px 0 0 var(--mantine-color-${ESTADO[c.estado]?.color || 'gray'}-6)`, background: c.estado === 'vencida' ? '#fff6f6' : '#fff' }}>
                                            <Group justify="space-between" wrap="nowrap" align="flex-start" gap={8} pl={4}>
                                                <Box style={{ minWidth: 0 }}>
                                                    <Text fw={800} fz={14} lineClamp={2}>{nombreDe(c)}</Text>
                                                    <Text fz={12} c="#5c6675">{c.documento || '—'}{c.origen === 'pedido' ? ' · pedido sin pagar' : ''} · emitido {fmtFecha(c.emision)}</Text>
                                                    <Badge mt={4} size="sm" variant={c.estado === 'vencida' ? 'filled' : 'light'} color={ESTADO[c.estado]?.color || 'gray'}>{ESTADO[c.estado]?.etiqueta(c) || c.estado}</Badge>
                                                </Box>
                                                <Box ta="right" style={{ flexShrink: 0 }}>
                                                    <Text fz={10.5} c="#5c6675" fw={700} tt="uppercase">Saldo</Text>
                                                    <Text fw={800} fz={18} c={c.estado === 'vencida' ? 'red.8' : 'navy.9'}>{fmtUsd(c.saldo)}</Text>
                                                    {tasa && <Text fz={11.5} c="#5c6675">{fmtBs(aBolivares(c.saldo, tasa))}</Text>}
                                                    <Text fz={11.5} c="#5c6675">de {fmtUsd(c.total)}</Text>
                                                </Box>
                                            </Group>
                                            <Group justify="flex-end" mt={6}>{acciones(c, true)}</Group>
                                        </Box>
                                    ))}
                                </Stack>
                            ) : (
                                <Table verticalSpacing={6} horizontalSpacing={8} highlightOnHover stickyHeader style={{ '--table-sticky-header-offset': 'var(--app-shell-header-offset, 0px)', color: '#1a1b1e', fontVariantNumeric: 'tabular-nums' }}>
                                    <Table.Thead style={{ background: '#e8edf5' }}><Table.Tr>
                                        <Table.Th>{cobrar ? 'Cliente' : 'Proveedor'}</Table.Th><Table.Th>Documento</Table.Th><Table.Th w={100}>Emisión</Table.Th><Table.Th w={190}>Vencimiento</Table.Th>
                                        <Table.Th ta="right" w={120}>Total</Table.Th><Table.Th ta="right" w={150}>Saldo</Table.Th><Table.Th w={80} />
                                    </Table.Tr></Table.Thead>
                                    <Table.Tbody>
                                        {visibles.map((c) => (
                                            <Table.Tr key={`${c.origen}-${c.id}`} style={{ background: c.estado === 'vencida' ? '#fff6f6' : undefined }}>
                                                <Table.Td><Text fw={700} size="sm" lineClamp={1}>{nombreDe(c)}</Text><Text fz={11.5} c="#5c6675">{c.contraparte.identificacion}</Text></Table.Td>
                                                <Table.Td><Text size="sm" fw={600} style={{ whiteSpace: 'nowrap' }}>{c.documento || '—'}</Text>{c.origen === 'pedido' && <Badge size="xs" variant="light" color="gray">Pedido sin pagar</Badge>}</Table.Td>
                                                <Table.Td><Text size="sm">{fmtFecha(c.emision)}</Text></Table.Td>
                                                <Table.Td><Group gap={6} wrap="nowrap"><Text size="sm">{fmtFecha(c.vence)}</Text><Badge size="sm" variant={c.estado === 'vencida' ? 'filled' : 'light'} color={ESTADO[c.estado]?.color || 'gray'}>{ESTADO[c.estado]?.etiqueta(c) || c.estado}</Badge></Group></Table.Td>
                                                <Table.Td ta="right"><Text size="sm">{fmtUsd(c.total)}</Text></Table.Td>
                                                <Table.Td ta="right"><Text size="sm" fw={800} c={c.estado === 'vencida' ? 'red.8' : 'navy.9'}>{fmtUsd(c.saldo)}</Text>{tasa && <Text fz={11.5} c="#5c6675">{fmtBs(aBolivares(c.saldo, tasa))}</Text>}</Table.Td>
                                                <Table.Td>{acciones(c)}</Table.Td>
                                            </Table.Tr>
                                        ))}
                                    </Table.Tbody>
                                </Table>
                            )}

                    <Group justify="space-between" mt="sm" wrap="wrap" gap="xs">
                        <Text size="sm" c="#5c6675">{filtradas.length} {filtradas.length === 1 ? 'documento' : 'documentos'} · {fmtUsd(saldoFiltrado)}</Text>
                        {paginas > 1 && <Pagination total={paginas} value={pagina} onChange={setPagina} color="navy.9" size="sm" siblings={tarjetas ? 0 : 1} />}
                    </Group>
                </Paper>
            </Stack>
        </Box>
    );
}
