'use client';

// Dos listas compactas para cobrar y completar datos fiscales:
// 1. Retenciones de IVA declaradas sin comprobante cargado (o por confirmar).
// 2. Facturas que el cliente dijo haber cerrado completas pero aún tienen saldo.
import React, { useMemo, useState } from 'react';
import {
    ActionIcon, Alert, Badge, Box, Button, CloseButton, Group, Paper,
    SimpleGrid, Stack, Text, TextInput, Tooltip, UnstyledButton,
} from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    IconAlertTriangle, IconCircleCheck, IconExternalLink, IconReceiptTax, IconSearch, IconUserQuestion,
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
                        <Stack gap={5}>
                            {retFiltradas.map((r) => (
                                <FilaCompacta
                                    key={r.id}
                                    titulo={r.documento}
                                    cliente={r.cliente}
                                    subtitulo={[r.rif, r.telefono, `${r.pct}% IVA`, `Decl. ${fmtFecha(r.fecha)}`].filter(Boolean).join(' · ')}
                                    cifra={bolivares(r.ivaRetenidoBs)}
                                    colorCifra="grape.9"
                                    dias={r.dias}
                                    badgeEstado={r.estado === 'POR_REVISAR' ? <Badge size="xs" color="yellow" variant="filled">Por revisar</Badge> : null}
                                    accionFactura={() => abrir(r.ventaId)}
                                    accionPrincipal={
                                        <Button
                                            size="compact-xs"
                                            color="grape"
                                            variant={r.estado === 'POR_REVISAR' ? 'filled' : 'light'}
                                            onClick={() => setCompletando(r)}
                                        >
                                            {r.estado === 'POR_REVISAR' ? 'Confirmar' : 'Cargar comprobante'}
                                        </Button>
                                    }
                                />
                            ))}
                        </Stack>
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
