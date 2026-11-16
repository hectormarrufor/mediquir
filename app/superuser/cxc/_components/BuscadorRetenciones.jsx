'use client';

// Buscador de retenciones de IVA que hacen los clientes (en «Retenciones y seguimiento»): por N° de comprobante, factura, control, cliente o RIF.
// Si no aparece la retención, se crea una nueva: el sistema pregunta a qué factura se le hizo, calcula lo que esperaría retener (75 % del IVA a la tasa de la factura)
// y pide los datos del comprobante del cliente (número, fecha, monto, control de la factura). Si el monto no coincide con el calculado hay que confirmarlo.
// Al guardarse, la retención baja la deuda y entra al libro de ventas (la misma ruta que «El cliente ya pasó los datos»).
import React, { useState } from 'react';
import { Alert, Badge, Box, Button, Group, Loader, Paper, Stack, Text, TextInput } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { IconPlus, IconSearch } from '@tabler/icons-react';
import DatosRetencionModal from '../../ventas/_components/DatosRetencionModal';
import { bolivares, fmtFechaLarga, pedir } from './utilidades';

const ESTADOS = {
    REGISTRADA: { color: 'teal', texto: 'En el libro de ventas' },
    PENDIENTE: { color: 'orange', texto: 'Falta el comprobante' },
    POR_REVISAR: { color: 'blue', texto: 'Por confirmar' },
};

export default function BuscadorRetenciones({ onCambio, onAbrirFactura }) {
    const [texto, setTexto] = useState('');
    const [modo, setModo] = useState('buscar'); // 'buscar' retenciones existentes | 'nueva' (elegir la factura a la que se le hizo)
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
        <Paper withBorder p="sm" radius="md" mb="sm">
            <Group gap="xs" align="flex-end" wrap="wrap">
                <TextInput
                    flex="1 1 280px" miw={0} leftSection={<IconSearch size={16} />} rightSection={isFetching ? <Loader size={14} /> : null}
                    label={nueva ? 'Factura a la que se le hizo la retención' : 'Buscar una retención'}
                    description={nueva ? 'Número de factura, de control, cliente o RIF' : 'N° de comprobante, factura, control, cliente o RIF'}
                    placeholder={nueva ? 'Ej. 00146225 o FARMAVIT' : 'Ej. 20261100001835 o FARMAVIT'}
                    value={texto} onChange={(e) => setTexto(e.currentTarget.value)}
                />
                {nueva
                    ? <Button variant="default" onClick={() => setModo('buscar')}>Volver a buscar retenciones</Button>
                    : <Button color="grape" variant="light" leftSection={<IconPlus size={16} />} onClick={() => setModo('nueva')}>Nueva retención</Button>}
            </Group>

            {error && <Alert color="red" mt="xs" p="xs">{error.message}</Alert>}

            {!nueva && retenciones.length > 0 && (
                <Stack gap={6} mt="sm">
                    {retenciones.map((r) => {
                        const e = ESTADOS[r.estado] || { color: 'gray', texto: r.estado };
                        return (
                            <Paper key={r.id} withBorder p="xs" radius="md">
                                <Group justify="space-between" wrap="nowrap" align="flex-start" gap="xs">
                                    <Box style={{ minWidth: 0 }}>
                                        <Text fw={800} size="sm">{r.documento} <Text span fw={500} c="dimmed">· {r.cliente}</Text></Text>
                                        <Text size="xs" c="dimmed">{r.rif}{r.numeroControl ? ` · control ${r.numeroControl}` : ''}</Text>
                                        <Text size="xs" mt={2}>
                                            {r.comprobante && r.comprobante !== 'PENDIENTE DE COMPROBANTE' ? <>Comprobante <b>{r.comprobante}</b> · </> : null}
                                            {r.pct} % del IVA · {fmtFechaLarga(r.fecha)}
                                        </Text>
                                    </Box>
                                    <Box ta="right" style={{ flexShrink: 0 }}>
                                        <Text fw={800} size="sm">{bolivares(r.ivaRetenidoBs)}</Text>
                                        <Badge size="xs" variant="light" color={e.color}>{e.texto}</Badge>
                                    </Box>
                                </Group>
                                <Group mt={6} gap="xs">
                                    {r.estado !== 'REGISTRADA' && <Button size="compact-xs" color="grape" onClick={() => setCompletando({ ...r })}>{r.estado === 'POR_REVISAR' ? 'Revisar y confirmar' : 'El cliente ya pasó los datos'}</Button>}
                                    <Button size="compact-xs" variant="light" onClick={() => onAbrirFactura(r.ventaId)}>Abrir la factura</Button>
                                </Group>
                            </Paper>
                        );
                    })}
                    <Group>
                        <Button size="compact-xs" variant="subtle" color="grape" leftSection={<IconPlus size={13} />} onClick={() => setModo('nueva')}>No es ninguna de estas: crear una nueva retención</Button>
                    </Group>
                </Stack>
            )}

            {!nueva && sinResultados && (
                <Alert color="orange" variant="light" mt="sm" p="xs" title={`No hay ninguna retención que coincida con «${q}»`}>
                    <Text size="xs" mb={6}>Si el cliente retuvo el IVA y su comprobante todavía no está en el sistema, créala: te pediremos la factura y los datos del comprobante.</Text>
                    <Button size="compact-sm" color="grape" leftSection={<IconPlus size={14} />} onClick={() => setModo('nueva')}>Crear nueva retención</Button>
                </Alert>
            )}

            {nueva && !activo && <Text size="xs" c="dimmed" mt="xs">Escribe el número de la factura (o el cliente) para ver las facturas con IVA que todavía no tienen retención.</Text>}
            {nueva && activo && !isFetching && !facturas.length && !error && (
                <Alert color="gray" variant="light" mt="sm" p="xs">No hay facturas con IVA y sin retención que coincidan con «{q}». Si la factura ya tiene una retención, búscala en «Buscar una retención».</Alert>
            )}
            {nueva && facturas.length > 0 && (
                <Stack gap={6} mt="sm">
                    {facturas.map((f) => (
                        <Paper key={f.ventaId} withBorder p="xs" radius="md">
                            <Group justify="space-between" wrap="nowrap" align="flex-start" gap="xs">
                                <Box style={{ minWidth: 0 }}>
                                    <Text fw={800} size="sm">{f.documento} <Text span fw={500} c="dimmed">· {f.cliente}</Text></Text>
                                    <Text size="xs" c="dimmed">{f.rif}{f.numeroControl ? ` · control ${f.numeroControl}` : ' · sin número de control'} · emitida {fmtFechaLarga(f.emision)}</Text>
                                    <Text size="xs" mt={2}>Total {bolivares(f.totalBs)} · IVA {bolivares(f.ivaBs)}</Text>
                                </Box>
                                <Box ta="right" style={{ flexShrink: 0 }}>
                                    <Text size="xs" c="dimmed">Retención 75 % calculada</Text>
                                    <Text fw={800} size="sm">{bolivares(f.retencionEsperadaBs)}</Text>
                                </Box>
                            </Group>
                            <Group mt={6} gap="xs">
                                <Button size="compact-xs" color="grape" onClick={() => setCompletando({ ventaId: f.ventaId, documento: f.documento, numeroControl: f.numeroControl, cliente: f.cliente, rif: f.rif, pct: 75, ivaRetenidoBs: f.retencionEsperadaBs, estado: 'NUEVA', nueva: true })}>Registrar la retención de esta factura</Button>
                                <Button size="compact-xs" variant="light" onClick={() => onAbrirFactura(f.ventaId)}>Abrir la factura</Button>
                            </Group>
                        </Paper>
                    ))}
                </Stack>
            )}

            <DatosRetencionModal
                opened={Boolean(completando)} onClose={() => setCompletando(null)} retencion={completando}
                onListo={() => { refetch(); onCambio?.(); }}
            />
        </Paper>
    );
}
