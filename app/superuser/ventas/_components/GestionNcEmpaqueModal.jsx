'use client';

import React, { useEffect, useState } from 'react';
import {
    Alert, Badge, Box, Button, Checkbox, Group, Loader, Modal, Paper, Radio, Stack, Table, Text, Textarea,
} from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconCheck, IconPackageOff, IconRefresh } from '@tabler/icons-react';
import { PANTALLA_COMPLETA_MOVIL } from '@/app/components/ui/modalMovil';
import { useAuth } from '@/hooks/useAuth';

export default function GestionNcEmpaqueModal({
    opened,
    onClose,
    ventaId,
    numeroDocumento,
    cliente,
    agencia,
    ncAfectacion = null,
    onResuelto,
}) {
    const queryClient = useQueryClient();
    const { esVendedor } = useAuth();

    const { data: cargado, isLoading } = useQuery({
        queryKey: ['empaque-resolver-nc', ventaId],
        enabled: opened && Boolean(ventaId) && !ncAfectacion,
        gcTime: 0,
        queryFn: async () => {
            const res = await fetch(`/api/ventas/${ventaId}/empaque/resolver-nc`);
            const c = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(c.error || 'No se pudo cargar el detalle de notas de crédito');
            return c;
        },
    });

    const analisis = ncAfectacion || cargado?.analisis || null;
    const docNumero = numeroDocumento || cargado?.venta?.numeroDocumento || 'Pedido';
    const esTotal = Boolean(analisis && (analisis.esAnulacionTotal || analisis.totalRestante <= 0));

    const [accion, setAccion] = useState('AJUSTAR_CAJA');
    const [reintegrar, setReintegrar] = useState(false);
    const [mantenerEmpacador, setMantenerEmpacador] = useState(true);
    const [observacion, setObservacion] = useState('');
    const [enviando, setEnviando] = useState(false);

    useEffect(() => {
        if (!opened || !analisis) return;
        setAccion(esTotal ? 'DESARMAR_CAJA' : 'AJUSTAR_CAJA');
        setReintegrar(false);
        setMantenerEmpacador(true);
        setObservacion('');
    }, [opened, esTotal, ventaId]);

    const requiereObs = accion === 'DESPACHAR_SIN_CAMBIOS';
    const bloqueado = !analisis || enviando || (requiereObs && observacion.trim().length < 5);

    const confirmar = async () => {
        if (!ventaId) return;
        setEnviando(true);
        try {
            const res = await fetch(`/api/ventas/${ventaId}/empaque/resolver-nc`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accion,
                    observacion: observacion.trim(),
                    reintegrarInventario: Boolean(reintegrar),
                    mantenerEmpacador: Boolean(mantenerEmpacador),
                }),
            });
            const cuerpo = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(cuerpo.error || 'No se pudo resolver el ajuste');

            notifications.show({
                color: 'teal',
                title: 'Ajuste registrado',
                message: accion === 'DESARMAR_CAJA'
                    ? `${docNumero} quedó desarmado y salió de despachos.`
                    : accion === 'REEMPACAR'
                        ? `${docNumero} volvió a Pendientes por Empacar.`
                        : `${docNumero} quedó listo para despachar.`,
            });

            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['ventas', 'despachos-pendientes'] }),
                queryClient.invalidateQueries({ queryKey: ['pedido-detalle', ventaId] }),
                queryClient.invalidateQueries({ queryKey: ['empaque', ventaId] }),
                queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
                queryClient.invalidateQueries({ queryKey: ['vendedor'] }),
                queryClient.invalidateQueries({ queryKey: ['ventas'] }),
            ]);
            onResuelto?.(cuerpo);
            onClose();
        } catch (e) {
            notifications.show({ color: 'red', title: 'Error', message: e.message });
        } finally {
            setEnviando(false);
        }
    };

    const accionBadge = (c) => {
        if (c.accion === 'RETIRAR_TODO') return <Badge color="red" variant="filled" size="sm">Sacar todo ({c.sacar})</Badge>;
        if (c.accion === 'REDUCIR') return <Badge color="orange" variant="filled" size="sm">Sacar {c.sacar}</Badge>;
        return <Badge color="gray" variant="light" size="sm">Sin cambios</Badge>;
    };

    return (
        <Modal
            {...PANTALLA_COMPLETA_MOVIL}
            opened={opened}
            onClose={() => { if (!enviando) onClose(); }}
            size="lg"
            centered
            title={
                <Group gap="xs">
                    <IconAlertTriangle size={20} color="var(--mantine-color-red-6)" />
                    <Text fw={800}>Ajuste de caja por Nota de Crédito · {docNumero}</Text>
                </Group>
            }
        >
            {isLoading || !analisis ? (
                <Group justify="center" py="xl"><Loader /></Group>
            ) : (
                <Stack gap="sm">
                    <Group gap={6} wrap="wrap">
                        <Badge color={esTotal ? 'red' : 'orange'} variant="filled" size="md">
                            {esTotal ? 'NC Total — Anulada' : 'NC Parcial · afecta CxC'}
                        </Badge>
                        {cliente && <Badge color="navy" variant="light">{cliente}</Badge>}
                        {agencia && <Badge color="grape" variant="outline">{agencia}</Badge>}
                    </Group>

                    <Paper withBorder radius="md" p="xs" bg="gray.0">
                        <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={4}>Notas de crédito aplicadas</Text>
                        <Stack gap={4}>
                            {(analisis.notas || []).map((n) => (
                                <Group key={n.id} justify="space-between" wrap="wrap" gap="xs">
                                    <Text size="xs">
                                        <b>{n.numero}</b> · {n.motivo}
                                    </Text>
                                    <Group gap={4}>
                                        <Badge size="xs" color={n.afectaCxc ? 'orange' : 'gray'} variant="light">
                                            {n.afectaCxc ? 'Afecta CxC' : 'Sin afectar CxC'}
                                        </Badge>
                                        <Badge size="xs" color={n.devuelveInventario ? 'teal' : 'yellow'} variant="light">
                                            {n.devuelveInventario ? '✓ Stock ya reintegrado por la NC' : 'Sin reintegro de stock en la NC'}
                                        </Badge>
                                    </Group>
                                </Group>
                            ))}
                        </Stack>
                    </Paper>

                    <Paper withBorder radius="md" p="xs">
                        <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={6}>Qué cambia en la caja</Text>
                        <Table.ScrollContainer minWidth={480}>
                            <Table fz="xs" verticalSpacing={4}>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>Producto</Table.Th>
                                        <Table.Th ta="right">Empacado</Table.Th>
                                        <Table.Th ta="right">Acreditado</Table.Th>
                                        <Table.Th ta="right">Queda</Table.Th>
                                        <Table.Th ta="right">Acción física</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {(analisis.cambios || []).map((c) => (
                                        <Table.Tr key={c.detalleId}>
                                            <Table.Td>
                                                <Text size="xs" fw={600} lineClamp={2}>{c.nombre}</Text>
                                                {c.codigo && <Text fz={10} c="dimmed">{c.codigo}</Text>}
                                            </Table.Td>
                                            <Table.Td ta="right">{c.original}</Table.Td>
                                            <Table.Td ta="right" c={c.sacar > 0 ? 'red.7' : 'dimmed'} fw={c.sacar > 0 ? 700 : 400}>
                                                {c.sacar > 0 ? `-${c.sacar}` : '0'}
                                            </Table.Td>
                                            <Table.Td ta="right" fw={800} c={c.restante === 0 ? 'red.7' : 'teal.8'}>
                                                {c.restante}
                                            </Table.Td>
                                            <Table.Td ta="right">{accionBadge(c)}</Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>
                        </Table.ScrollContainer>
                    </Paper>

                    <Radio.Group label="¿Cómo vas a resolver este paquete?" withAsterisk value={accion} onChange={setAccion}>
                        <Stack gap={8} mt={6}>
                            {esTotal ? (
                                <Paper withBorder radius="md" p="xs" style={{ borderColor: accion === 'DESARMAR_CAJA' ? 'var(--mantine-color-red-5)' : undefined }}>
                                    <Radio
                                        value="DESARMAR_CAJA"
                                        color="red"
                                        label={<Text size="sm" fw={700}>Desarmar caja y retirar de despacho (recomendado)</Text>}
                                        description="La mercancía regresa a los estantes del almacén y este pedido sale de la cola de envíos."
                                    />
                                </Paper>
                            ) : (
                                <>
                                    <Paper withBorder radius="md" p="xs" style={{ borderColor: accion === 'AJUSTAR_CAJA' ? 'var(--mantine-color-teal-5)' : undefined }}>
                                        <Radio
                                            value="AJUSTAR_CAJA"
                                            color="teal"
                                            label={<Text size="sm" fw={700}>Ajuste rápido de caja (ya saqué los productos acreditados)</Text>}
                                            description="Abres la caja, retiras solo lo acreditado por la nota de crédito y sellas de nuevo; queda listo para despachar."
                                        />
                                    </Paper>
                                    <Paper withBorder radius="md" p="xs" style={{ borderColor: accion === 'REEMPACAR' ? 'var(--mantine-color-blue-5)' : undefined }}>
                                        <Radio
                                            value="REEMPACAR"
                                            color="blue"
                                            label={<Text size="sm" fw={700}>Devolver a Pendientes por Empacar (re-empacar paso a paso)</Text>}
                                            description="Deshace el empaque actual y envía el pedido a la lista de empaque para escanear todo de nuevo y tomar fotos nuevas."
                                        />
                                    </Paper>
                                </>
                            )}
                            {!esVendedor && (
                                <Paper withBorder radius="md" p="xs" style={{ borderColor: accion === 'DESPACHAR_SIN_CAMBIOS' ? 'var(--mantine-color-orange-5)' : undefined }}>
                                    <Radio
                                        value="DESPACHAR_SIN_CAMBIOS"
                                        color="orange"
                                        label={<Text size="sm" fw={700}>{esTotal ? 'Despachar tal cual (solo ajuste fiscal)' : 'Despachar sin modificar la caja'}</Text>}
                                        description="Autoriza entregar la caja exactamente como estaba empacada porque la NC fue solo un ajuste administrativo/fiscal."
                                    />
                                </Paper>
                            )}
                        </Stack>
                    </Radio.Group>

                    {accion === 'REEMPACAR' && (
                        <Checkbox
                            color="blue"
                            checked={mantenerEmpacador}
                            onChange={(e) => setMantenerEmpacador(e.currentTarget.checked)}
                            label="Mantener el mismo empacador asignado"
                            description="Si lo desmarcas, el pedido queda libre para que cualquier compañero lo tome."
                        />
                    )}

                    {(accion === 'DESARMAR_CAJA' || accion === 'AJUSTAR_CAJA') && analisis.devuelveInventarioPendienteTotal > 0 && (
                        <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={18} />}>
                            <Checkbox
                                color="orange"
                                checked={reintegrar}
                                onChange={(e) => setReintegrar(e.currentTarget.checked)}
                                label={`Reintegrar al inventario ${analisis.devuelveInventarioPendienteTotal} unidad(es) cuya NC no devolvió stock`}
                                description="Marca esta opción si los productos vuelven físicamente al almacén y la NC se emitió sin devolver inventario."
                            />
                        </Alert>
                    )}

                    <Textarea
                        label={requiereObs ? 'Motivo (obligatorio)' : 'Observación (opcional)'}
                        placeholder={requiereObs ? 'Explica por qué la mercancía sí sale a pesar de la nota de crédito…' : 'Ej: Se retiraron las unidades acreditadas y se selló la caja'}
                        withAsterisk={requiereObs}
                        minRows={2}
                        autosize
                        value={observacion}
                        onChange={(e) => setObservacion(e.currentTarget.value)}
                    />

                    <Group justify="flex-end" mt="xs">
                        <Button variant="default" disabled={enviando} onClick={onClose}>Cancelar</Button>
                        <Button
                            color={accion === 'DESARMAR_CAJA' ? 'red' : accion === 'REEMPACAR' ? 'blue' : accion === 'DESPACHAR_SIN_CAMBIOS' ? 'orange' : 'teal'}
                            loading={enviando}
                            disabled={bloqueado}
                            leftSection={accion === 'DESARMAR_CAJA' ? <IconPackageOff size={17} /> : accion === 'REEMPACAR' ? <IconRefresh size={17} /> : <IconCheck size={17} />}
                            onClick={confirmar}
                        >
                            Confirmar resolución
                        </Button>
                    </Group>
                </Stack>
            )}
        </Modal>
    );
}
