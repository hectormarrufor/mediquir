'use client';

// Lista de clientes de un vendedor a comisión. Es la que usa el sistema para saber, en cada factura o nota de entrega futura, de quién es el cliente
// y a quién generarle la comisión (Clientes.vendedorComisionId). Aquí se agregan y se quitan clientes del vendedor.
import React, { useMemo, useState } from 'react';
import { ActionIcon, Alert, Badge, Box, Button, Group, Select, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { IconInfoCircle, IconUserMinus, IconUserPlus } from '@tabler/icons-react';
import { Dialogo } from './Piezas';

async function pedir(url, opciones) {
    const res = await fetch(url, opciones);
    const cuerpo = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(cuerpo.error || 'No se pudo completar');
    return cuerpo;
}

export default function DialogoClientesVendedor({ abierto, vendedor, vendedores = [], onCerrar }) {
    const queryClient = useQueryClient();
    const { data: clientes, isLoading } = useQuery({ queryKey: ['clientes-de-vendedores'], enabled: abierto, queryFn: () => pedir('/api/clientes') });
    // Auditoría: sus clientes con facturas, última factura, líneas de su hoja y deuda; y los nombres de su hoja que no están vinculados
    const { data: audit } = useQuery({ queryKey: ['clientes-auditoria', vendedor?.id], enabled: abierto && Boolean(vendedor), queryFn: () => pedir('/api/comisiones/clientes?vendedorId=' + vendedor.id) });
    const [busca, setBusca] = useState('');
    const auditoria = new Map((audit?.clientes || []).map((c) => [c.id, c]));
    const fmt = (f) => (f ? String(f).slice(0, 10).split('-').reverse().join('/') : '—');
    const [elegido, setElegido] = useState(null);
    const [trabajando, setTrabajando] = useState(false);

    const nombreDe = (id) => vendedores.find((v) => Number(v.id) === Number(id))?.nombre || 'otro vendedor';
    const suyos = useMemo(() => (clientes || []).filter((c) => Number(c.vendedorComisionId) === Number(vendedor?.id)).sort((a, b) => a.nombre.localeCompare(b.nombre)), [clientes, vendedor]);
    // Para agregar: los que no son de nadie primero; los de otro vendedor también salen (se pasan a este), marcados
    const opciones = useMemo(() => (clientes || [])
        .filter((c) => Number(c.vendedorComisionId) !== Number(vendedor?.id))
        .map((c) => ({ value: String(c.id), label: `${c.nombre}${c.vendedorComisionId ? ` · hoy de ${nombreDe(c.vendedorComisionId)}` : ''}`, sin: !c.vendedorComisionId }))
        .sort((a, b) => Number(b.sin) - Number(a.sin) || a.label.localeCompare(b.label)), [clientes, vendedor]); // eslint-disable-line react-hooks/exhaustive-deps

    const guardar = async (clienteId, vendedorComisionId, mensaje) => {
        setTrabajando(true);
        try {
            const r = await pedir(`/api/clientes/${clienteId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vendedorComisionId }) });
            const a = r.comisionesAsociadas;
            notifications.show({ color: 'teal', message: a?.facturas ? `${mensaje}. Se asociaron ${a.facturas} cuenta(s) por cobrar a su hoja: comisión de $${Number(a.comisionUsd).toFixed(2)} que irá cobrando a medida que el cliente pague.` : mensaje, autoClose: a?.facturas ? 10000 : 4000 });
            queryClient.invalidateQueries({ queryKey: ['comisiones'] });
            ['clientes-de-vendedores', 'clientes-auditoria', 'clientes-pos', 'clientes'].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
            setElegido(null);
        } catch (e) { notifications.show({ color: 'red', title: 'No se guardó', message: e.message }); } finally { setTrabajando(false); }
    };

    const agregar = () => {
        const c = clientes.find((x) => String(x.id) === elegido);
        if (!c) return;
        if (c.vendedorComisionId && !window.confirm(`${c.nombre} hoy es cliente de ${nombreDe(c.vendedorComisionId)}. ¿Pasarlo a ${vendedor.nombre}? Sus cuentas por cobrar pendientes y las facturas nuevas le generarán comisión a ${vendedor.nombre}.`)) return;
        guardar(c.id, vendedor.id, `${c.nombre} ahora es cliente de ${vendedor.nombre}`);
    };
    const quitar = (c) => {
        if (!window.confirm(`¿Quitar a ${c.nombre} de la lista de ${vendedor.nombre}? Sus facturas nuevas dejarán de generarle comisión. Las ya hechas no cambian.`)) return;
        guardar(c.id, null, `${c.nombre} ya no es cliente de ${vendedor.nombre}`);
    };

    return (
        <Dialogo abierto={abierto} onCerrar={onCerrar} titulo={`Clientes de ${vendedor?.nombre || ''}`} ancho="md">
            <Stack gap="sm">
                <Alert color="blue" variant="light" p="xs" icon={<IconInfoCircle size={18} />}>
                    Al agregar un cliente, sus cuentas por cobrar pendientes entran a la hoja de {vendedor?.nombre} y le generan comisión a medida que el cliente paga (lo que ya había pagado antes no comisiona). Las facturas nuevas le generan comisión solas. En el POS aparece un aviso con su nombre.
                </Alert>
                <Group gap="xs" align="flex-end" wrap="nowrap">
                    <Select style={{ flex: 1 }} label="Agregar un cliente" placeholder={isLoading ? 'Cargando clientes…' : 'Busca por nombre'} searchable searchValue={busca} onSearchChange={setBusca} data={opciones} value={elegido} onChange={setElegido} nothingFoundMessage="No hay coincidencias" />
                    <Button leftSection={<IconUserPlus size={16} />} disabled={!elegido} loading={trabajando} onClick={agregar}>Agregar</Button>
                </Group>
                <Group justify="space-between"><Text fz={13} fw={700}>Sus clientes</Text><Badge variant="light">{suyos.length}</Badge></Group>
                {suyos.length === 0 ? <Text fz={13} c="dimmed">Todavía no tiene clientes asignados.</Text> : (
                    <Stack gap={4} style={{ maxHeight: 360, overflowY: 'auto' }}>
                        {suyos.map((c) => (
                            <Group key={c.id} justify="space-between" wrap="nowrap" p={6} style={{ border: '1px solid #e6e9ef', borderRadius: 8 }}>
                                <Box style={{ minWidth: 0 }}>
                                    <Text fz={13} fw={600} truncate="end">{c.nombre}</Text>
                                    <Text fz={11} c="dimmed">{c.identificacion}{auditoria.get(c.id) ? ' · ' + auditoria.get(c.id).facturas + ' factura(s) · última ' + fmt(auditoria.get(c.id).ultimaFactura) + ' · ' + auditoria.get(c.id).lineas + ' en su hoja' : ''}</Text>
                                    {auditoria.get(c.id)?.debeUsd > 0.005 && <Text fz={11} c="red.8">Debe ${auditoria.get(c.id).debeUsd.toFixed(2)}</Text>}
                                </Box>
                                <ActionIcon variant="subtle" color="red" aria-label={`Quitar a ${c.nombre}`} title="Quitar de este vendedor" onClick={() => quitar(c)}><IconUserMinus size={17} /></ActionIcon>
                            </Group>
                        ))}
                    </Stack>
                )}
                {(audit?.historicos || []).length > 0 && (
                    <>
                        <Group justify="space-between"><Text fz={13} fw={700}>Aparecen en su hoja pero no están vinculados</Text><Badge variant="light" color="orange">{audit.historicos.length}</Badge></Group>
                        <Text fz={11.5} c="dimmed">Para revisar: si de verdad son clientes suyos, tócalo para buscarlo arriba y agrégalo; así las facturas futuras le generan comisión solas.</Text>
                        <Stack gap={4} style={{ maxHeight: 220, overflowY: 'auto' }}>
                            {audit.historicos.map((h) => (
                                <Group key={h.nombre} justify="space-between" wrap="nowrap" p={6} style={{ border: '1px dashed #f0c36d', borderRadius: 8, cursor: 'pointer' }} onClick={() => setBusca(h.nombre)}>
                                    <Box style={{ minWidth: 0 }}>
                                        <Text fz={12.5} fw={600} truncate="end">{h.nombre}</Text>
                                        <Text fz={11} c="dimmed">{h.lineas} línea(s) · última {fmt(h.ultima)}{h.sinFactura ? ' · ' + h.sinFactura + ' sin factura enlazada' : ''}</Text>
                                    </Box>
                                    {h.clienteIdProbable && <Badge size="xs" variant="light" color="teal" tt="none">Posible coincidencia</Badge>}
                                </Group>
                            ))}
                        </Stack>
                    </>
                )}
                <Group justify="flex-end"><Button variant="default" onClick={onCerrar}>Cerrar</Button></Group>
            </Stack>
        </Dialogo>
    );
}
