'use client';

// Buscador compacto de retenciones de IVA o de facturas para registrar una nueva retención.
import React, { useState } from 'react';
import { ActionIcon, Alert, Badge, Box, Button, Group, Loader, Paper, Stack, Text, TextInput, Tooltip } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { IconExternalLink, IconPlus, IconSearch } from '@tabler/icons-react';
import DatosRetencionModal from '../../ventas/_components/DatosRetencionModal';
import { bolivares, fmtFecha, pedir } from './utilidades';

const ESTADOS = {
    REGISTRADA: { color: 'teal', texto: 'En libro' },
    PENDIENTE: { color: 'orange', texto: 'Falta comprobante' },
    POR_REVISAR: { color: 'yellow', texto: 'Por confirmar' },
};

export default function BuscadorRetenciones({ onCambio, onAbrirFactura }) {
    const [texto, setTexto] = useState('');
    const [modo, setModo] = useState('buscar'); // 'buscar' | 'nueva'
    const [q] = useDebouncedValue(texto.trim(), 300);
    const [completando, setCompletando] = useState(null);
    const activo = q.length >= 2;
    const { data, isFetching, error, refetch } = useQuery({
        queryKey: ['cxc-buscar-retenciones', q, modo],
        queryFn: () => pedir(`/api/finanzas/cxc/retenciones?q=${encodeURIComponent(q)}${modo === 'nueva' ? '&soloFacturas=1' : ''}`),
        enabled: activo,
        placeholderData: (anterior) => anterior,
    });
    const retenciones = activo ? data?.retenciones || [] : [];
    const facturas = activo ? data?.facturas || [] : [];
    const nueva = modo === 'nueva';
    const sinResultados = activo && !isFetching && !error && !retenciones.length;

    return (
        <Paper withBorder p="sm" radius="lg" bg="white">
            <Group gap="xs" align="flex-end" wrap="wrap">
                <TextInput
                    flex="1 1 260px"
                    miw={0}
                    size="xs"
                    leftSection={<IconSearch size={15} />}
                    rightSection={isFetching ? <Loader size={14} /> : null}
                    label={nueva ? 'Factura a la que se le aplicará retención' : 'Buscar retención existente'}
                    placeholder={nueva ? 'N° factura, control, cliente o RIF…' : 'N° comprobante, factura, control, cliente o RIF…'}
                    value={texto}
                    onChange={(e) => setTexto(e.currentTarget.value)}
                />
                {nueva ? (
                    <Button size="xs" variant="default" onClick={() => setModo('buscar')}>Volver a buscar</Button>
                ) : (
                    <Button size="xs" color="grape" variant="light" leftSection={<IconPlus size={15} />} onClick={() => setModo('nueva')}>
                        Registrar retención
                    </Button>
                )}
            </Group>

            {error && <Alert color="red" mt="xs" p="xs">{error.message}</Alert>}

            {!nueva && retenciones.length > 0 && (
                <Stack gap={5} mt="sm">
                    {retenciones.map((r) => {
                        const e = ESTADOS[r.estado] || { color: 'gray', texto: r.estado };
                        return (
                            <Paper key={r.id} withBorder px="xs" py={6} radius="md">
                                <Group justify="space-between" wrap="wrap" align="center" gap={6}>
                                    <Box style={{ flex: '1 1 220px', minWidth: 0 }}>
                                        <Group gap={6} wrap="nowrap">
                                            <Text fw={800} fz={13} style={{ flexShrink: 0 }}>{r.documento}</Text>
                                            <Text fz={13} fw={600} c="dark.7" truncate="end">{r.cliente}</Text>
                                            <Badge size="xs" variant="light" color={e.color} style={{ flexShrink: 0 }}>{e.texto}</Badge>
                                        </Group>
                                        <Text fz={11} c="dimmed" truncate="end">
                                            {[
                                                r.rif,
                                                r.numeroControl ? `Ctrl ${r.numeroControl}` : null,
                                                r.comprobante && r.comprobante !== 'PENDIENTE DE COMPROBANTE' ? `Comp. ${r.comprobante}` : null,
                                                `${r.pct}%`,
                                                fmtFecha(r.fecha),
                                            ].filter(Boolean).join(' · ')}
                                        </Text>
                                    </Box>
                                    <Group gap={6} wrap="nowrap" ml="auto" align="center" style={{ flexShrink: 0 }}>
                                        <Text fw={800} fz={13} c="grape.9" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                            {bolivares(r.ivaRetenidoBs)}
                                        </Text>
                                        {r.estado !== 'REGISTRADA' && (
                                            <Button
                                                size="compact-xs"
                                                color="grape"
                                                variant={r.estado === 'POR_REVISAR' ? 'filled' : 'light'}
                                                onClick={() => setCompletando({ ...r })}
                                            >
                                                {r.estado === 'POR_REVISAR' ? 'Confirmar' : 'Cargar comprobante'}
                                            </Button>
                                        )}
                                        <Tooltip label="Abrir factura">
                                            <ActionIcon size={26} variant="light" color="blue" onClick={() => onAbrirFactura(r.ventaId)} aria-label={`Abrir factura ${r.documento}`}>
                                                <IconExternalLink size={14} />
                                            </ActionIcon>
                                        </Tooltip>
                                    </Group>
                                </Group>
                            </Paper>
                        );
                    })}
                    <Group>
                        <Button size="compact-xs" variant="subtle" color="grape" leftSection={<IconPlus size={13} />} onClick={() => setModo('nueva')}>
                            ¿No aparece? Registrar retención a otra factura
                        </Button>
                    </Group>
                </Stack>
            )}

            {!nueva && sinResultados && (
                <Alert color="orange" variant="light" mt="xs" p="xs" title={`Sin coincidencias para «${q}»`}>
                    <Group justify="space-between" wrap="wrap" gap="xs">
                        <Text size="xs">Si aún no se ha registrado la retención de esa factura, puedes crearla ahora.</Text>
                        <Button size="compact-xs" color="grape" leftSection={<IconPlus size={13} />} onClick={() => setModo('nueva')}>
                            Registrar retención
                        </Button>
                    </Group>
                </Alert>
            )}

            {nueva && !activo && (
                <Text size="xs" c="dimmed" mt="xs">
                    Escribe al menos 2 caracteres (número de factura o cliente) para buscar facturas con IVA sin retención.
                </Text>
            )}
            {nueva && activo && !isFetching && !facturas.length && !error && (
                <Alert color="gray" variant="light" mt="xs" p="xs">
                    No hay facturas con IVA y sin retención que coincidan con «{q}».
                </Alert>
            )}
            {nueva && facturas.length > 0 && (
                <Stack gap={5} mt="sm">
                    {facturas.map((f) => (
                        <Paper key={f.ventaId} withBorder px="xs" py={6} radius="md">
                            <Group justify="space-between" wrap="wrap" align="center" gap={6}>
                                <Box style={{ flex: '1 1 220px', minWidth: 0 }}>
                                    <Group gap={6} wrap="nowrap">
                                        <Text fw={800} fz={13} style={{ flexShrink: 0 }}>{f.documento}</Text>
                                        <Text fz={13} fw={600} c="dark.7" truncate="end">{f.cliente}</Text>
                                    </Group>
                                    <Text fz={11} c="dimmed" truncate="end">
                                        {[f.rif, f.numeroControl ? `Ctrl ${f.numeroControl}` : 'Sin control', fmtFecha(f.emision), `IVA ${bolivares(f.ivaBs)}`].filter(Boolean).join(' · ')}
                                    </Text>
                                </Box>
                                <Group gap={6} wrap="nowrap" ml="auto" align="center" style={{ flexShrink: 0 }}>
                                    <Text fw={800} fz={13} c="grape.9" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                        Ret. {bolivares(f.retencionEsperadaBs)}
                                    </Text>
                                    <Button
                                        size="compact-xs"
                                        color="grape"
                                        onClick={() => setCompletando({
                                            ventaId: f.ventaId,
                                            documento: f.documento,
                                            numeroControl: f.numeroControl,
                                            cliente: f.cliente,
                                            rif: f.rif,
                                            pct: 75,
                                            ivaRetenidoBs: f.retencionEsperadaBs,
                                            estado: 'NUEVA',
                                            nueva: true,
                                        })}
                                    >
                                        Aplicar retención
                                    </Button>
                                    <Tooltip label="Abrir factura">
                                        <ActionIcon size={26} variant="light" color="blue" onClick={() => onAbrirFactura(f.ventaId)} aria-label={`Abrir factura ${f.documento}`}>
                                            <IconExternalLink size={14} />
                                        </ActionIcon>
                                    </Tooltip>
                                </Group>
                            </Group>
                        </Paper>
                    ))}
                </Stack>
            )}

            <DatosRetencionModal
                opened={Boolean(completando)}
                onClose={() => setCompletando(null)}
                retencion={completando}
                onListo={() => {
                    refetch();
                    onCambio?.();
                }}
            />
        </Paper>
    );
}
