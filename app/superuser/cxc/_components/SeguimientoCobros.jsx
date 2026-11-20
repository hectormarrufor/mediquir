'use client';

// Dos listas compactas para cobrar y completar datos fiscales:
// 1. Retenciones de IVA declaradas sin comprobante cargado (o por confirmar).
// 2. Facturas que el cliente dijo haber cerrado completas pero aún tienen saldo.
import React, { useMemo, useState } from 'react';
import {
    Accordion, ActionIcon, Alert, Badge, Box, Button, CloseButton, Group, Paper,
    SimpleGrid, Stack, Text, TextInput, ThemeIcon, Tooltip, UnstyledButton,
} from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    IconAlertTriangle, IconCircleCheck, IconExternalLink, IconReceiptTax, IconSearch, IconUserDollar, IconUserOff, IconUserQuestion,
} from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { EstadoVacio, Esqueleto } from './Piezas';
import { bolivares, dolares, fmtFecha, sinAcentos } from './utilidades';
import DatosRetencionModal from '../../ventas/_components/DatosRetencionModal';
import BuscadorRetenciones from './BuscadorRetenciones';

function FilaCompacta({
    titulo, cliente, subtitulo, cifra, colorCifra = 'navy.9',
    dias, badgeEstado, accionFactura, accionPrincipal,
}) {
    return (
        <Paper withBorder px="xs" py={6} radius="md" bg="white">
            <Group justify="space-between" wrap="wrap" align="center" gap={6}>
                <Group gap={8} wrap="nowrap" align="center" style={{ flex: '1 1 240px', minWidth: 0 }}>
                    <Badge
                        size="xs"
                        variant="light"
                        color={dias > 15 ? 'red' : dias > 7 ? 'orange' : 'gray'}
                        style={{ flexShrink: 0 }}
                    >
                        {dias}d
                    </Badge>
                    <Box style={{ minWidth: 0, flex: 1 }}>
                        <Group gap={6} wrap="nowrap">
                            <UnstyledButton onClick={accionFactura} style={{ flexShrink: 0 }} title="Abrir factura">
                                <Text fw={800} fz={13} c="navy.9" style={{ textDecoration: 'underline', textDecorationColor: 'rgba(11,27,61,0.25)' }}>
                                    {titulo}
                                </Text>
                            </UnstyledButton>
                            <Text fz={13} fw={600} c="dark.7" truncate="end" title={cliente}>
                                {cliente}
                            </Text>
                            {badgeEstado}
                        </Group>
                        <Text fz={11} c="dimmed" truncate="end">{subtitulo}</Text>
                    </Box>
                </Group>

                <Group gap={6} wrap="nowrap" ml="auto" align="center" style={{ flexShrink: 0 }}>
                    <Text fw={800} fz={13} c={colorCifra} style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                        {cifra}
                    </Text>
                    {accionPrincipal}
                    <Tooltip label="Abrir factura">
                        <ActionIcon size={26} variant="light" color="blue" onClick={accionFactura} aria-label={`Abrir factura ${titulo}`}>
                            <IconExternalLink size={14} />
                        </ActionIcon>
                    </Tooltip>
                </Group>
            </Group>
        </Paper>
    );
}

function claveVendedor(r) {
    return r.vendedorComisionId ? `v${r.vendedorComisionId}` : 'sin';
}

// Retenciones agrupadas: acordeón por vendedor a comisión (y «Sin vendedor a comisión») y, dentro, un acordeón por cliente
function RetencionesAgrupadas({ lista, abrir, onCompletar }) {
    const vendedores = useMemo(() => {
        const m = new Map();
        for (const r of lista) {
            const k = claveVendedor(r);
            if (!m.has(k)) m.set(k, { k, nombre: r.vendedorComision || 'Sin vendedor a comisión', clientes: new Map(), total: 0, cantidad: 0 });
            const v = m.get(k);
            const kc = r.clienteId ?? `n${r.cliente}`;
            if (!v.clientes.has(kc)) v.clientes.set(kc, { k: String(kc), nombre: r.cliente || 'Sin cliente', rif: r.rif, items: [], total: 0 });
            const c = v.clientes.get(kc);
            c.items.push(r);
            c.total += Number(r.ivaRetenidoBs) || 0;
            v.total += Number(r.ivaRetenidoBs) || 0;
            v.cantidad += 1;
        }
        // los vendedores con nombre primero (A-Z) y «Sin vendedor» al final
        return [...m.values()]
            .map((v) => ({ ...v, clientes: [...v.clientes.values()].sort((a, b) => a.nombre.localeCompare(b.nombre)) }))
            .sort((a, b) => (a.k === 'sin') - (b.k === 'sin') || a.nombre.localeCompare(b.nombre));
    }, [lista]);

    return (
        <Accordion multiple variant="separated" radius="md" defaultValue={vendedores.map((v) => v.k)} chevronPosition="left">
            {vendedores.map((v) => (
                <Accordion.Item key={v.k} value={v.k}>
                    <Accordion.Control>
                        <Group justify="space-between" wrap="nowrap" gap="xs" pr={4}>
                            <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                                <ThemeIcon size={24} radius="md" variant="light" color={v.k === 'sin' ? 'gray' : 'teal'}>
                                    {v.k === 'sin' ? <IconUserOff size={14} /> : <IconUserDollar size={14} />}
                                </ThemeIcon>
                                <Text fw={800} fz={13} truncate="end">{v.nombre}</Text>
                                <Badge size="xs" variant="light" color="gray" style={{ flexShrink: 0 }}>{v.cantidad}</Badge>
                            </Group>
                            <Text fw={800} fz={12.5} c="grape.9" style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{bolivares(v.total)}</Text>
                        </Group>
                    </Accordion.Control>
                    <Accordion.Panel>
                        <Accordion multiple variant="contained" radius="md" chevronPosition="left" defaultValue={v.clientes.length <= 3 ? v.clientes.map((c) => c.k) : []}>
                            {v.clientes.map((c) => (
                                <Accordion.Item key={c.k} value={c.k}>
                                    <Accordion.Control>
                                        <Group justify="space-between" wrap="nowrap" gap="xs" pr={4}>
                                            <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                                                <Text fw={700} fz={12.5} truncate="end">{c.nombre}</Text>
                                                {c.rif && <Text fz={11} c="dimmed" visibleFrom="sm" style={{ whiteSpace: 'nowrap' }}>{c.rif}</Text>}
                                                <Badge size="xs" variant="light" color="gray" style={{ flexShrink: 0 }}>{c.items.length}</Badge>
                                            </Group>
                                            <Text fw={700} fz={12} c="grape.9" style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{bolivares(c.total)}</Text>
                                        </Group>
                                    </Accordion.Control>
                                    <Accordion.Panel>
                                        <Stack gap={5}>
                                            {c.items.map((r) => (
                                                <FilaCompacta
                                                    key={r.id}
                                                    titulo={r.documento}
                                                    cliente=""
                                                    subtitulo={[r.telefono, `${r.pct}% IVA`, `Decl. ${fmtFecha(r.fecha)}`].filter(Boolean).join(' · ')}
                                                    cifra={bolivares(r.ivaRetenidoBs)}
                                                    colorCifra="grape.9"
                                                    dias={r.dias}
                                                    badgeEstado={r.estado === 'POR_REVISAR' ? <Badge size="xs" color="yellow" variant="filled">Por revisar</Badge> : null}
                                                    accionFactura={() => abrir(r.ventaId)}
                                                    accionPrincipal={
                                                        <Button size="compact-xs" color="grape" variant={r.estado === 'POR_REVISAR' ? 'filled' : 'light'} onClick={() => onCompletar(r)}>
                                                            {r.estado === 'POR_REVISAR' ? 'Confirmar' : 'Cargar comprobante'}
                                                        </Button>
                                                    }
                                                />
                                            ))}
                                        </Stack>
                                    </Accordion.Panel>
                                </Accordion.Item>
                            ))}
                        </Accordion>
                    </Accordion.Panel>
                </Accordion.Item>
            ))}
        </Accordion>
    );
}

export default function SeguimientoCobros() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [completando, setCompletando] = useState(null);
    const [filtro, setFiltro] = useState('');

    const { data, isLoading, error, refetch } = useQuery({
        queryKey: ['cxc-seguimiento'],
        queryFn: async () => {
            const r = await fetch('/api/finanzas/cxc/seguimiento');
            const j = await r.json();
            if (!r.ok) throw new Error(j.error || 'No se pudo cargar');
            return j;
        },
    });

    const retenciones = useMemo(() => data?.retencionSinComprobante || [], [data]);
    const dicenPagaron = useMemo(() => data?.dicenPagaron || [], [data]);

    const q = sinAcentos(filtro.trim());
    const retFiltradas = useMemo(() => (
        !q ? retenciones : retenciones.filter((r) => [r.documento, r.cliente, r.rif, r.numeroControl].some((x) => sinAcentos(x).includes(q)))
    ), [retenciones, q]);
    const dicenFiltradas = useMemo(() => (
        !q ? dicenPagaron : dicenPagaron.filter((c) => [c.documento, c.cliente, c.rif].some((x) => sinAcentos(x).includes(q)))
    ), [dicenPagaron, q]);

    if (isLoading) return <Esqueleto indicadores={2} filas={4} />;
    if (error) return <Alert color="red" icon={<IconAlertTriangle size={18} />}>{error.message}</Alert>;

    const abrir = (id) => router.push(`/superuser/ventas/${id}`);
    const totalRetBs = retFiltradas.reduce((a, r) => a + (Number(r.ivaRetenidoBs) || 0), 0);
    const totalDicenUsd = dicenFiltradas.reduce((a, c) => a + (Number(c.saldo) || 0), 0);
    const alActualizar = () => {
        refetch();
        queryClient.invalidateQueries({ queryKey: ['cxc-libro'] });
    };

    return (
        <Stack gap="sm">
            <BuscadorRetenciones onCambio={alActualizar} onAbrirFactura={abrir} />

            {(retenciones.length + dicenPagaron.length > 4) && (
                <Paper withBorder px="sm" py={6} radius="md" bg="white">
                    <TextInput
                        size="xs"
                        placeholder="Filtrar estas listas por factura, cliente o RIF…"
                        leftSection={<IconSearch size={14} />}
                        value={filtro}
                        onChange={(e) => setFiltro(e.currentTarget.value)}
                        rightSection={filtro ? <CloseButton size="xs" onClick={() => setFiltro('')} aria-label="Limpiar filtro" /> : null}
                    />
                </Paper>
            )}

            <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="sm" align="flex-start">
                <Paper withBorder p="sm" radius="lg" bg="white">
                    <Group justify="space-between" align="center" mb={4} wrap="wrap" gap="xs">
                        <Group gap={6} wrap="nowrap">
                            <IconReceiptTax size={18} color="var(--mantine-color-grape-7)" />
                            <Text fw={800} size="sm" c="navy.9">Retenciones pendientes de comprobante ({retFiltradas.length})</Text>
                        </Group>
                        {retFiltradas.length > 0 && (
                            <Badge size="sm" variant="light" color="grape">{bolivares(totalRetBs)}</Badge>
                        )}
                    </Group>
                    <Text size="xs" c="dimmed" mb="xs">
                        Retenciones aplicadas al saldo a la espera de número y fecha de comprobante (desde nov. 2026).
                    </Text>

                    {!retFiltradas.length ? (
                        <EstadoVacio
                            icono={IconCircleCheck}
                            titulo={q ? 'Sin coincidencias' : 'Todas las retenciones tienen comprobante'}
                            texto={q ? 'Prueba con otro criterio o borra el filtro.' : 'No hay comprobantes pendientes por cargar.'}
                        />
                    ) : (
                        <RetencionesAgrupadas key={q} lista={retFiltradas} abrir={abrir} onCompletar={setCompletando} />
                    )}
                </Paper>

                <Paper withBorder p="sm" radius="lg" bg="white">
                    <Group justify="space-between" align="center" mb={4} wrap="wrap" gap="xs">
                        <Group gap={6} wrap="nowrap">
                            <IconUserQuestion size={18} color="var(--mantine-color-orange-7)" />
                            <Text fw={800} size="sm" c="navy.9">Dicen que pagaron completo ({dicenFiltradas.length})</Text>
                        </Group>
                        {dicenFiltradas.length > 0 && (
                            <Badge size="sm" variant="light" color="red">{dolares(totalDicenUsd)}</Badge>
                        )}
                    </Group>
                    <Text size="xs" c="dimmed" mb="xs">
                        Facturas declaradas como cerradas en el último pago pero con diferencia o saldo pendiente.
                    </Text>

                    {!dicenFiltradas.length ? (
                        <EstadoVacio
                            icono={IconCircleCheck}
                            titulo={q ? 'Sin coincidencias' : 'Ninguna factura con diferencia'}
                            texto={q ? 'Prueba con otro criterio o borra el filtro.' : 'Todo lo declarado como cerrado quedó saldado.'}
                        />
                    ) : (
                        <Stack gap={5}>
                            {dicenFiltradas.map((c) => (
                                <FilaCompacta
                                    key={c.id}
                                    titulo={c.documento}
                                    cliente={c.cliente}
                                    subtitulo={[c.rif, c.telefono, `Declaró el ${fmtFecha(c.declarada)}`].filter(Boolean).join(' · ')}
                                    cifra={`Debe ${dolares(c.saldo)}`}
                                    colorCifra="red.8"
                                    dias={c.dias}
                                    accionFactura={() => abrir(c.ventaId)}
                                />
                            ))}
                        </Stack>
                    )}
                </Paper>
            </SimpleGrid>

            <DatosRetencionModal
                opened={Boolean(completando)}
                onClose={() => setCompletando(null)}
                retencion={completando && { ...completando, ivaRetenidoBs: completando.ivaRetenidoBs, pct: completando.pct }}
                onListo={alActualizar}
            />
        </Stack>
    );
}
